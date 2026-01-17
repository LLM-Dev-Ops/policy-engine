/**
 * Policy Governance Module
 *
 * Enforces enterprise governance rules:
 * - Fail-closed validation
 * - Production safety checks
 * - Approval requirements for security/compliance policies
 */

import { Policy, PolicyRule, PolicyStatus, DecisionType, ConditionOperator } from '../types/policy';
import { PolicyValidationError } from '@utils/errors';
import logger from '@utils/logger';

/**
 * Governance violation types
 */
export type GovernanceViolationType =
  | 'MISSING_CONDITIONS'
  | 'CONFLICTING_RULES'
  | 'DENY_WITHOUT_SCOPE'
  | 'MISSING_ENVIRONMENT'
  | 'MISSING_APPROVAL'
  | 'INVALID_RULE_STRUCTURE'
  | 'CRITICAL_RESOURCE_DENY';

/**
 * Governance violation details
 */
export interface GovernanceViolation {
  type: GovernanceViolationType;
  severity: 'error' | 'critical';
  message: string;
  ruleId?: string;
  ruleName?: string;
  details?: Record<string, unknown>;
}

/**
 * Governance check result
 */
export interface GovernanceCheckResult {
  valid: boolean;
  violations: GovernanceViolation[];
  requiresApproval: boolean;
  approvalReason?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Policy type classification
 */
export type PolicyType = 'security' | 'compliance' | 'cost' | 'operational' | 'general';

/**
 * Detect policy type from tags and namespace
 */
export function detectPolicyType(policy: Policy): PolicyType {
  const tags = policy.metadata.tags?.map(t => t.toLowerCase()) || [];
  const namespace = policy.metadata.namespace.toLowerCase();
  const name = policy.metadata.name.toLowerCase();

  if (tags.includes('security') || namespace.includes('security') || name.includes('security')) {
    return 'security';
  }
  if (tags.includes('compliance') || namespace.includes('compliance') || name.includes('audit')) {
    return 'compliance';
  }
  if (tags.includes('cost') || namespace.includes('cost') || name.includes('budget')) {
    return 'cost';
  }
  if (tags.includes('operational') || namespace.includes('ops')) {
    return 'operational';
  }

  // Check rules for security indicators
  const hasDenyRules = policy.rules.some(r => r.action.decision === DecisionType.DENY);
  if (hasDenyRules) {
    return 'security';
  }

  return 'general';
}

/**
 * Check if policy targets production environment
 */
export function isProductionPolicy(policy: Policy): boolean {
  const namespace = policy.metadata.namespace.toLowerCase();
  const tags = policy.metadata.tags?.map(t => t.toLowerCase()) || [];

  // Explicit production indicators
  if (namespace.includes('prod') || tags.includes('production') || tags.includes('prod')) {
    return true;
  }

  // Policies without explicit environment are implicitly production
  const hasExplicitEnv = tags.some(t =>
    ['dev', 'development', 'staging', 'test', 'qa'].includes(t)
  ) || ['dev', 'development', 'staging', 'test', 'qa'].some(e =>
    namespace.includes(e)
  );

  return !hasExplicitEnv;
}

/**
 * Check if a rule targets critical resources
 */
function isCriticalResource(rule: PolicyRule): boolean {
  const criticalPatterns = [
    'admin', 'root', 'system', 'database', 'credentials',
    'secret', 'key', 'token', 'password', 'auth', 'pii',
    'financial', 'payment', 'ssn', 'health', 'hipaa',
  ];

  const ruleName = rule.name.toLowerCase();
  const ruleDesc = (rule.description || '').toLowerCase();
  const conditionField = rule.condition.field?.toLowerCase() || '';

  return criticalPatterns.some(pattern =>
    ruleName.includes(pattern) ||
    ruleDesc.includes(pattern) ||
    conditionField.includes(pattern)
  );
}

/**
 * Validate rule has proper conditions (fail-closed)
 */
function validateRuleConditions(rule: PolicyRule): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  // Rule must have a condition
  if (!rule.condition) {
    violations.push({
      type: 'MISSING_CONDITIONS',
      severity: 'critical',
      message: `Rule '${rule.name}' has no conditions - fail-closed requires explicit conditions`,
      ruleId: rule.id,
      ruleName: rule.name,
    });
    return violations;
  }

  // Non-composite conditions must have a field
  const isComposite = [ConditionOperator.AND, ConditionOperator.OR, ConditionOperator.NOT]
    .includes(rule.condition.operator);

  if (!isComposite && !rule.condition.field) {
    violations.push({
      type: 'MISSING_CONDITIONS',
      severity: 'critical',
      message: `Rule '${rule.name}' has no condition field - ambiguous evaluation`,
      ruleId: rule.id,
      ruleName: rule.name,
    });
  }

  // Composite conditions must have nested conditions
  if (isComposite && (!rule.condition.conditions || rule.condition.conditions.length === 0)) {
    violations.push({
      type: 'INVALID_RULE_STRUCTURE',
      severity: 'critical',
      message: `Rule '${rule.name}' has composite operator but no nested conditions`,
      ruleId: rule.id,
      ruleName: rule.name,
    });
  }

  return violations;
}

/**
 * Validate deny rules have proper scope
 */
function validateDenyRuleScope(rule: PolicyRule, policy: Policy): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  if (rule.action.decision !== DecisionType.DENY) {
    return violations;
  }

  // Deny rules on critical resources need explicit environment
  if (isCriticalResource(rule)) {
    const hasExplicitEnv = policy.metadata.tags?.some(t =>
      ['production', 'staging', 'development', 'test'].includes(t.toLowerCase())
    );

    if (!hasExplicitEnv) {
      violations.push({
        type: 'DENY_WITHOUT_SCOPE',
        severity: 'critical',
        message: `Deny rule '${rule.name}' on critical resource requires explicit environment tag`,
        ruleId: rule.id,
        ruleName: rule.name,
        details: { resource: 'critical' },
      });
    }

    // Check for explicit scope in condition
    const hasExplicitScope = rule.condition.field?.includes('scope') ||
      rule.condition.field?.includes('namespace') ||
      rule.condition.field?.includes('environment');

    if (!hasExplicitScope && !hasExplicitEnv) {
      violations.push({
        type: 'CRITICAL_RESOURCE_DENY',
        severity: 'critical',
        message: `Deny rule '${rule.name}' on critical resource requires explicit scope condition`,
        ruleId: rule.id,
        ruleName: rule.name,
      });
    }
  }

  return violations;
}

/**
 * Detect conflicting rules
 */
function detectConflictingRules(rules: PolicyRule[]): GovernanceViolation[] {
  const violations: GovernanceViolation[] = [];

  // Group rules by condition field
  const rulesByField = new Map<string, PolicyRule[]>();

  for (const rule of rules) {
    if (rule.enabled === false) continue;

    const field = rule.condition.field || 'composite';
    if (!rulesByField.has(field)) {
      rulesByField.set(field, []);
    }
    rulesByField.get(field)!.push(rule);
  }

  // Check for conflicting decisions on same field
  for (const [field, fieldRules] of rulesByField) {
    if (fieldRules.length < 2) continue;

    const allowRules = fieldRules.filter(r => r.action.decision === DecisionType.ALLOW);
    const denyRules = fieldRules.filter(r => r.action.decision === DecisionType.DENY);

    if (allowRules.length > 0 && denyRules.length > 0) {
      // Check if they have overlapping conditions (simplified check)
      for (const allow of allowRules) {
        for (const deny of denyRules) {
          if (allow.condition.value === deny.condition.value) {
            violations.push({
              type: 'CONFLICTING_RULES',
              severity: 'critical',
              message: `Rules '${allow.name}' and '${deny.name}' have conflicting ALLOW/DENY on same condition`,
              details: {
                field,
                allowRule: allow.id,
                denyRule: deny.id,
              },
            });
          }
        }
      }
    }
  }

  return violations;
}

/**
 * Check if policy requires approval
 */
function checkApprovalRequirement(
  policy: Policy,
  policyType: PolicyType,
  isEnabling: boolean,
): { required: boolean; reason?: string } {
  // Security policies always require approval to enable
  if (policyType === 'security' && isEnabling) {
    return {
      required: true,
      reason: 'Security policies require approval before enabling',
    };
  }

  // Compliance policies always require approval to enable
  if (policyType === 'compliance' && isEnabling) {
    return {
      required: true,
      reason: 'Compliance policies require approval before enabling',
    };
  }

  // Production policies with deny rules require approval
  if (isProductionPolicy(policy) && isEnabling) {
    const hasDenyRules = policy.rules.some(r =>
      r.action.decision === DecisionType.DENY && r.enabled !== false
    );
    if (hasDenyRules) {
      return {
        required: true,
        reason: 'Production policies with deny rules require approval',
      };
    }
  }

  return { required: false };
}

/**
 * Main governance check function
 * Enforces fail-closed validation
 */
export function validatePolicyGovernance(
  policy: Policy,
  options: {
    isEnabling?: boolean;
    hasApproval?: boolean;
    approvedBy?: string;
  } = {},
): GovernanceCheckResult {
  const violations: GovernanceViolation[] = [];
  const policyType = detectPolicyType(policy);
  const isProduction = isProductionPolicy(policy);

  // 1. Validate all rules have proper conditions (fail-closed)
  for (const rule of policy.rules) {
    if (rule.enabled === false) continue;

    violations.push(...validateRuleConditions(rule));
    violations.push(...validateDenyRuleScope(rule, policy));
  }

  // 2. Detect conflicting rules
  violations.push(...detectConflictingRules(policy.rules));

  // 3. Check for production environment requirements
  if (isProduction && !policy.metadata.tags?.some(t => t.toLowerCase() === 'production')) {
    // Implicitly production - require explicit marking for clarity
    logger.warn({
      policyId: policy.metadata.id,
      namespace: policy.metadata.namespace,
    }, 'Policy implicitly affects production - consider adding explicit production tag');
  }

  // 4. Check approval requirements
  const approvalCheck = checkApprovalRequirement(policy, policyType, options.isEnabling || false);

  if (approvalCheck.required && !options.hasApproval) {
    violations.push({
      type: 'MISSING_APPROVAL',
      severity: 'critical',
      message: approvalCheck.reason || 'This policy change requires approval',
    });
  }

  // 5. Calculate risk level
  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const errorCount = violations.filter(v => v.severity === 'error').length;

  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (criticalCount > 0) {
    riskLevel = 'critical';
  } else if (errorCount > 0 || policyType === 'security') {
    riskLevel = 'high';
  } else if (isProduction || policyType === 'compliance') {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  const result: GovernanceCheckResult = {
    valid: violations.length === 0,
    violations,
    requiresApproval: approvalCheck.required,
    approvalReason: approvalCheck.reason,
    riskLevel,
  };

  if (!result.valid) {
    logger.warn({
      policyId: policy.metadata.id,
      policyName: policy.metadata.name,
      violationCount: violations.length,
      violations: violations.map(v => ({
        type: v.type,
        severity: v.severity,
        message: v.message,
      })),
    }, 'Policy governance validation failed');
  }

  return result;
}

/**
 * Enforce governance - throws if validation fails
 * Use this in mutation endpoints for fail-closed behavior
 */
export function enforceGovernance(
  policy: Policy,
  options: {
    isEnabling?: boolean;
    hasApproval?: boolean;
    approvedBy?: string;
  } = {},
): void {
  const result = validatePolicyGovernance(policy, options);

  if (!result.valid) {
    const criticalViolations = result.violations.filter(v => v.severity === 'critical');

    throw new PolicyValidationError(
      `Governance validation failed: ${criticalViolations.length} critical violation(s)`,
      {
        violations: result.violations,
        riskLevel: result.riskLevel,
        requiresApproval: result.requiresApproval,
      },
    );
  }
}

/**
 * Check if a status change requires approval
 */
export function requiresApprovalForStatusChange(
  policy: Policy,
  oldStatus: PolicyStatus,
  newStatus: PolicyStatus,
): boolean {
  // Enabling a policy (draft/deprecated -> active) requires approval for security/compliance
  const isEnabling = newStatus === PolicyStatus.ACTIVE && oldStatus !== PolicyStatus.ACTIVE;

  if (!isEnabling) {
    return false;
  }

  const policyType = detectPolicyType(policy);
  return policyType === 'security' || policyType === 'compliance';
}
