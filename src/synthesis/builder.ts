/**
 * Executive Synthesis Builder
 * Builds executive summaries for policy operations
 */

import {
  ExecutiveSummary,
  DeployReference,
  IterationMetrics,
  RiskLevel,
  Recommendation,
  BlockingIssue,
} from './types';
import { Policy, PolicyRule, DecisionType, PolicyStatus } from '../types/policy';

/**
 * Build an executive summary for policy operations
 */
export function buildExecutiveSummary(
  deployRef: Partial<DeployReference>,
  metrics: Partial<IterationMetrics>,
  stepsExecuted: string[],
): ExecutiveSummary {
  const deploy_reference: DeployReference = {
    environment: deployRef.environment || 'production',
    timestamp: deployRef.timestamp || new Date().toISOString(),
    version: deployRef.version,
    commit_sha: deployRef.commit_sha,
  };

  const iteration_metrics: IterationMetrics = {
    success_rate: metrics.success_rate ?? 1.0,
    failed_iterations: metrics.failed_iterations ?? 0,
    blocking_issues: metrics.blocking_issues ?? [],
    steps_executed: stepsExecuted,
  };

  const risk_level = calculateRiskLevel(iteration_metrics);
  const recommendation = determineRecommendation(iteration_metrics, risk_level);
  const rationale = buildRationale(iteration_metrics, risk_level, recommendation);

  return {
    deploy_reference,
    iteration_metrics,
    risk_level,
    recommendation,
    rationale,
  };
}

/**
 * Elevate risk level for production environments
 */
export function elevateRiskForProduction(summary: ExecutiveSummary): void {
  if (summary.deploy_reference.environment === 'production') {
    if (summary.risk_level === 'low') {
      summary.risk_level = 'medium';
    } else if (summary.risk_level === 'medium') {
      summary.risk_level = 'high';
    }
    summary.rationale = `[Production Environment] ${summary.rationale}`;
  }
}

/**
 * Elevate risk for security and compliance policy types
 */
export function elevateRiskForPolicyType(
  summary: ExecutiveSummary,
  policyType: string | undefined,
): void {
  if (policyType === 'security' || policyType === 'compliance') {
    if (summary.risk_level === 'low') {
      summary.risk_level = 'high';
    } else if (summary.risk_level === 'medium') {
      summary.risk_level = 'high';
    }
    summary.rationale = `[${policyType.charAt(0).toUpperCase() + policyType.slice(1)} Policy] ${summary.rationale}`;
  }
}

/**
 * Elevate risk when enabling a policy (vs creating draft)
 */
export function elevateRiskForEnabling(summary: ExecutiveSummary): void {
  if (summary.risk_level === 'low') {
    summary.risk_level = 'medium';
  } else if (summary.risk_level === 'medium') {
    summary.risk_level = 'high';
  }
  summary.rationale = `[Enabling Policy] ${summary.rationale}`;
}

/**
 * Extract blocking issues from policy validation
 */
export function extractBlockingIssues(policy: Policy, validationErrors: string[]): BlockingIssue[] {
  const issues: BlockingIssue[] = [];

  // Check for validation errors
  for (const error of validationErrors) {
    issues.push({
      type: 'validation_error',
      severity: 'high',
      description: error,
    });
  }

  // Check for deny actions on critical resources
  for (const rule of policy.rules) {
    if (rule.action.decision === DecisionType.DENY) {
      const isCritical = isCriticalResource(rule);
      if (isCritical) {
        issues.push({
          type: 'deny_action',
          severity: 'critical',
          description: `Deny action on critical resource in rule: ${rule.name}`,
          rule_id: rule.id,
        });
      }
    }
  }

  // Check for conflicting rule priorities
  const priorityConflicts = findPriorityConflicts(policy.rules);
  for (const conflict of priorityConflicts) {
    issues.push({
      type: 'conflicting_priorities',
      severity: 'high',
      description: conflict.description,
      rule_id: conflict.rule_ids.join(', '),
    });
  }

  // Check for missing required conditions
  for (const rule of policy.rules) {
    if (!hasRequiredConditions(rule)) {
      issues.push({
        type: 'missing_conditions',
        severity: 'medium',
        description: `Rule ${rule.name} is missing required conditions`,
        rule_id: rule.id,
      });
    }
  }

  return issues;
}

/**
 * Build synthesis for policy creation
 */
export function buildPolicyCreateSynthesis(
  policy: Policy,
  validationErrors: string[],
  success: boolean,
): ExecutiveSummary {
  const blockingIssues = extractBlockingIssues(policy, validationErrors);

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: success ? 1.0 : 0.0,
      failed_iterations: validationErrors.length,
      blocking_issues: blockingIssues,
    },
    ['policy validation', 'rule parsing', 'persistence'],
  );

  // Apply policy type risk elevation
  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  // Determine recommendation based on status and issues
  synthesis.recommendation = determinePolicyRecommendation(policy, blockingIssues);
  synthesis.rationale = buildPolicyRationale(policy, blockingIssues, synthesis.recommendation);

  return synthesis;
}

/**
 * Build synthesis for policy edit
 */
export function buildPolicyEditSynthesis(
  policy: Policy,
  validationErrors: string[],
  success: boolean,
): ExecutiveSummary {
  const blockingIssues = extractBlockingIssues(policy, validationErrors);

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: success ? 1.0 : 0.0,
      failed_iterations: validationErrors.length,
      blocking_issues: blockingIssues,
    },
    ['policy validation', 'rule parsing', 'update', 'persistence'],
  );

  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  synthesis.recommendation = determinePolicyRecommendation(policy, blockingIssues);
  synthesis.rationale = buildPolicyRationale(policy, blockingIssues, synthesis.recommendation);

  return synthesis;
}

/**
 * Build synthesis for policy status toggle
 */
export function buildPolicyToggleSynthesis(
  policy: Policy,
  previousStatus: PolicyStatus,
  newStatus: PolicyStatus,
): ExecutiveSummary {
  const isEnabling = newStatus === PolicyStatus.ACTIVE && previousStatus !== PolicyStatus.ACTIVE;
  const blockingIssues: BlockingIssue[] = [];

  const synthesis = buildExecutiveSummary(
    {
      environment: 'production',
      timestamp: new Date().toISOString(),
      version: policy.metadata.version,
      commit_sha: process.env['GIT_SHA'],
    },
    {
      success_rate: 1.0,
      failed_iterations: 0,
      blocking_issues: blockingIssues,
    },
    ['status validation', 'policy toggle', 'persistence'],
  );

  const policyType = getPolicyType(policy);
  elevateRiskForPolicyType(synthesis, policyType);

  // Enabling a policy has higher risk
  if (isEnabling) {
    elevateRiskForEnabling(synthesis);

    // Security policies require review when enabling
    if (policyType === 'security') {
      synthesis.recommendation = 'DEFER';
      synthesis.rationale = `Enabling security policy requires additional review. Policy: ${policy.metadata.name}`;
    } else {
      synthesis.recommendation = 'APPROVE';
      synthesis.rationale = `Policy ${policy.metadata.name} is being enabled. All rules validated.`;
    }
  } else {
    synthesis.recommendation = 'APPROVE';
    synthesis.rationale = `Policy status changed from ${previousStatus} to ${newStatus}`;
  }

  return synthesis;
}

/**
 * Calculate success rate based on validation results
 */
export function calculateSuccessRate(validationErrors: string[], totalRules: number): number {
  if (totalRules === 0) return 1.0;
  const invalidRules = validationErrors.length;
  return Math.max(0, (totalRules - invalidRules) / totalRules);
}

/**
 * Determine if this is a production target
 */
export function isProductionTarget(namespace: string | undefined): boolean {
  if (!namespace) return true;
  const prodIndicators = ['prod', 'production', 'live', 'main'];
  return prodIndicators.some(indicator =>
    namespace.toLowerCase().includes(indicator)
  );
}

// --- Private helper functions ---

function calculateRiskLevel(metrics: IterationMetrics): RiskLevel {
  const criticalIssues = metrics.blocking_issues.filter(i => i.severity === 'critical').length;
  const highIssues = metrics.blocking_issues.filter(i => i.severity === 'high').length;

  if (criticalIssues > 0) return 'critical';
  if (highIssues > 0 || metrics.success_rate < 0.5) return 'high';
  if (metrics.failed_iterations > 0 || metrics.success_rate < 0.8) return 'medium';
  return 'low';
}

function determineRecommendation(metrics: IterationMetrics, riskLevel: RiskLevel): Recommendation {
  if (riskLevel === 'critical') return 'REJECT';
  if (riskLevel === 'high') return 'DEFER';
  if (metrics.failed_iterations > 0) return 'DEFER';
  return 'APPROVE';
}

function determinePolicyRecommendation(policy: Policy, blockingIssues: BlockingIssue[]): Recommendation {
  const criticalIssues = blockingIssues.filter(i => i.severity === 'critical');
  const highIssues = blockingIssues.filter(i => i.severity === 'high');

  // Invalid rules -> REJECT
  if (criticalIssues.length > 0) return 'REJECT';
  if (highIssues.length > 0) return 'REJECT';

  // Draft status with valid rules -> APPROVE
  if (policy.status === PolicyStatus.DRAFT) return 'APPROVE';

  // Enabling security policy -> DEFER
  const policyType = getPolicyType(policy);
  if (policyType === 'security' && policy.status === PolicyStatus.ACTIVE) {
    return 'DEFER';
  }

  return 'APPROVE';
}

function buildRationale(
  metrics: IterationMetrics,
  riskLevel: RiskLevel,
  _recommendation: Recommendation,
): string {
  const parts: string[] = [];

  parts.push(`Risk level: ${riskLevel}`);
  parts.push(`Success rate: ${(metrics.success_rate * 100).toFixed(1)}%`);

  if (metrics.blocking_issues.length > 0) {
    parts.push(`Blocking issues: ${metrics.blocking_issues.length}`);
  }

  parts.push(`Steps executed: ${metrics.steps_executed.join(', ')}`);

  return parts.join('. ');
}

function buildPolicyRationale(
  policy: Policy,
  blockingIssues: BlockingIssue[],
  recommendation: Recommendation,
): string {
  const parts: string[] = [];

  parts.push(`Policy: ${policy.metadata.name} (v${policy.metadata.version})`);
  parts.push(`Status: ${policy.status}`);
  parts.push(`Rules: ${policy.rules.length}`);

  if (blockingIssues.length > 0) {
    parts.push(`Issues: ${blockingIssues.length} (${blockingIssues.map(i => i.type).join(', ')})`);
  }

  parts.push(`Recommendation: ${recommendation}`);

  return parts.join('. ');
}

function getPolicyType(policy: Policy): string | undefined {
  // Check tags for policy type
  const tags = policy.metadata.tags || [];
  if (tags.includes('security')) return 'security';
  if (tags.includes('compliance')) return 'compliance';

  // Check namespace for type hints
  const namespace = policy.metadata.namespace.toLowerCase();
  if (namespace.includes('security') || namespace.includes('sec')) return 'security';
  if (namespace.includes('compliance') || namespace.includes('audit')) return 'compliance';

  // Check rule actions for security patterns
  const hasDenyRules = policy.rules.some(r => r.action.decision === DecisionType.DENY);
  if (hasDenyRules) return 'security';

  return undefined;
}

function isCriticalResource(rule: PolicyRule): boolean {
  const criticalPatterns = [
    'admin', 'root', 'system', 'database', 'credentials',
    'secret', 'key', 'token', 'password', 'auth',
  ];

  const ruleName = rule.name.toLowerCase();
  const ruleDesc = (rule.description || '').toLowerCase();

  return criticalPatterns.some(pattern =>
    ruleName.includes(pattern) || ruleDesc.includes(pattern)
  );
}

interface PriorityConflict {
  rule_ids: string[];
  description: string;
}

function findPriorityConflicts(rules: PolicyRule[]): PriorityConflict[] {
  const conflicts: PriorityConflict[] = [];

  // Group rules by their condition field (simplified conflict detection)
  const rulesByField = new Map<string, PolicyRule[]>();

  for (const rule of rules) {
    if (rule.condition.field) {
      const field = rule.condition.field;
      if (!rulesByField.has(field)) {
        rulesByField.set(field, []);
      }
      rulesByField.get(field)!.push(rule);
    }
  }

  // Check for conflicting decisions on same field
  for (const [field, fieldRules] of rulesByField) {
    if (fieldRules.length > 1) {
      const decisions = new Set(fieldRules.map(r => r.action.decision));
      if (decisions.has(DecisionType.ALLOW) && decisions.has(DecisionType.DENY)) {
        conflicts.push({
          rule_ids: fieldRules.map(r => r.id),
          description: `Conflicting ALLOW and DENY decisions on field: ${field}`,
        });
      }
    }
  }

  return conflicts;
}

function hasRequiredConditions(rule: PolicyRule): boolean {
  // A valid rule must have a condition with either a field or nested conditions
  if (!rule.condition) return false;
  if (rule.condition.field) return true;
  if (rule.condition.conditions && rule.condition.conditions.length > 0) return true;
  return false;
}
