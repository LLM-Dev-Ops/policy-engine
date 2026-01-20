/**
 * Approval Routing Agent
 *
 * CLASSIFICATION: APPROVAL GATING
 *
 * PURPOSE:
 * Determine required approval paths for policy-gated actions. Routes
 * approval requests to appropriate approvers based on configured rules.
 *
 * SCOPE:
 * - Evaluate approval rules against action context
 * - Determine required approvers
 * - Build approval chains for multi-step workflows
 * - Handle escalation paths
 * - Check auto-approval conditions
 *
 * DECISION_TYPE: "approval_routing_decision"
 *
 * NON-RESPONSIBILITIES (MUST NOT):
 * - Execute approval workflows
 * - Send notifications directly
 * - Store approval state
 * - Modify approval rules at runtime
 * - Access user management systems directly
 * - Connect directly to databases
 * - Execute SQL queries
 * - Track approval progress
 *
 * This agent follows the LLM-Policy-Engine Agent Infrastructure Constitution.
 */
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  ApprovalRoutingInput,
  ApprovalRoutingOutput,
  ApprovalDecisionEvent,
  ApprovalDecisionOutcome,
  ApprovalRule,
  Approver,
  ApprovalChainStep,
  EscalationLevel,
  ApprovalStatusResponse,
} from '../contracts/approval-routing';
import { AgentRegistration } from '../contracts/decision-event';
import { ruvectorServiceClient } from '../../integrations/ruvector-service';
import { observatoryClient, PolicyEvaluationEvent } from '../../integrations/observatory';
import logger from '@utils/logger';
import { config } from '@utils/config';

/**
 * Agent metadata constants
 */
export const AGENT_ID = 'approval-routing-agent';
export const AGENT_VERSION = '1.0.0';
export const DECISION_TYPE = 'approval_routing_decision';

/**
 * Default approval rules (loaded from configuration in production)
 */
const DEFAULT_RULES: ApprovalRule[] = [
  {
    rule_id: 'high-value-model-access',
    rule_name: 'High-Value Model Access',
    description: 'Requires approval for access to premium LLM models',
    condition: {
      match: [
        { field: 'resource_type', operator: 'equals', value: 'model' },
        { field: 'details.tier', operator: 'equals', value: 'premium' },
      ],
      operator: 'all',
    },
    required_approvers: 1,
    approver_pool: [],
    timeout_seconds: 3600,
    escalation_config: {
      enabled: true,
      levels: [],
      max_escalations: 2,
      final_action: 'deny',
    },
    priority: 100,
    active: true,
  },
];

/**
 * Approval Routing Agent
 *
 * Stateless agent that evaluates approval requirements and produces
 * ApprovalDecisionEvents.
 */
export class ApprovalRoutingAgent {
  private rules: ApprovalRule[];
  private environment: string;

  constructor(rules: ApprovalRule[] = DEFAULT_RULES) {
    this.rules = rules;
    this.environment = config.environment || 'development';
  }

  /**
   * Load approval rules
   */
  loadRules(rules: ApprovalRule[]): void {
    this.rules = rules;
  }

  /**
   * Add a single rule
   */
  addRule(rule: ApprovalRule): void {
    this.rules.push(rule);
  }

  /**
   * PRIMARY ENTRY POINT: Evaluate approval requirements
   *
   * This method:
   * 1. Validates inputs
   * 2. Evaluates approval rules
   * 3. Determines required approvers
   * 4. Builds approval chain
   * 5. Calculates confidence
   * 6. Emits exactly ONE ApprovalDecisionEvent to ruvector-service
   * 7. Emits telemetry to Observatory
   * 8. Returns deterministic, machine-readable output
   */
  async evaluate(input: ApprovalRoutingInput): Promise<ApprovalDecisionEvent> {
    const startTime = performance.now();
    const eventId = uuidv4();
    const traceId = uuidv4();

    logger.info(
      { eventId, requestId: input.request_id, traceId },
      'Approval Routing Agent: Starting evaluation'
    );

    try {
      // Find matching rules
      const matchedRules = this.findMatchingRules(input);

      // Determine routing outcome
      const output = this.buildRoutingOutput(input, matchedRules, startTime);

      // Calculate confidence score
      const confidence = this.calculateConfidence(matchedRules, output);

      // Create inputs hash for deduplication
      const inputsHash = this.hashInputs(input);

      // Build DecisionEvent
      const decisionEvent: ApprovalDecisionEvent = {
        event_id: eventId,
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        decision_type: DECISION_TYPE,
        inputs_hash: inputsHash,
        outputs: output,
        confidence,
        rules_applied: matchedRules,
        execution_ref: {
          request_id: input.request_id,
          trace_id: traceId,
          span_id: uuidv4(),
          environment: this.environment,
        },
        timestamp: new Date().toISOString(),
        metadata: {
          cached: false,
          engine_version: AGENT_VERSION,
          mode: input.dry_run ? 'dry-run' : 'real-time',
          source: 'approval-routing-agent',
          sla_tier: input.priority || 'normal',
        },
      };

      // Persist DecisionEvent to ruvector-service (async, non-blocking)
      this.persistDecisionEvent(decisionEvent).catch((error) => {
        logger.error({ error, eventId }, 'Failed to persist ApprovalDecisionEvent');
      });

      // Emit telemetry to Observatory (async, non-blocking)
      this.emitTelemetry(decisionEvent, startTime).catch((error) => {
        logger.error({ error, eventId }, 'Failed to emit telemetry');
      });

      logger.info(
        {
          eventId,
          decision: output.decision,
          requiredApprovers: output.required_approvers.length,
          chainSteps: output.approval_chain.length,
          confidence,
          evaluationTimeMs: output.evaluation_time_ms,
        },
        'Approval Routing Agent: Evaluation completed'
      );

      return decisionEvent;
    } catch (error) {
      // On failure, still emit a DecisionEvent with error state
      const errorEvent = this.createErrorDecisionEvent(eventId, input, error, startTime);

      this.persistDecisionEvent(errorEvent).catch((persistError) => {
        logger.error({ persistError, eventId }, 'Failed to persist error DecisionEvent');
      });

      throw error;
    }
  }

  /**
   * ROUTE: Determine approval routing for an action
   */
  async route(input: ApprovalRoutingInput): Promise<ApprovalDecisionEvent> {
    return this.evaluate(input);
  }

  /**
   * RESOLVE: Resolve approval conflicts
   */
  async resolve(input: ApprovalRoutingInput): Promise<ApprovalDecisionEvent> {
    // Resolution uses the same evaluation logic but may add trace info
    return this.evaluate({ ...input, trace: true });
  }

  /**
   * Get approval status for a request
   * @param requestId - The approval request ID to look up
   */
  async getStatus(requestId: string): Promise<ApprovalStatusResponse | null> {
    // In production, this would query ruvector-service
    logger.info({ requestId }, 'Getting approval status');
    return null;
  }

  /**
   * Find rules that match the input
   */
  private findMatchingRules(input: ApprovalRoutingInput): ApprovalRule[] {
    const matched: ApprovalRule[] = [];

    for (const rule of this.rules) {
      if (!rule.active) continue;

      // Check if rule IDs filter is specified
      if (input.approval_rules && !input.approval_rules.includes(rule.rule_id)) {
        continue;
      }

      // Evaluate rule conditions
      if (this.evaluateRuleConditions(rule, input)) {
        matched.push(rule);
      }
    }

    // Sort by priority (higher priority first)
    return matched.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Evaluate rule conditions against input
   */
  private evaluateRuleConditions(rule: ApprovalRule, input: ApprovalRoutingInput): boolean {
    const { match, operator } = rule.condition;

    const results = match.map((condition) => {
      const value = this.getFieldValue(input, condition.field);
      return this.evaluateCondition(value, condition.operator, condition.value);
    });

    if (operator === 'all') {
      return results.every((r) => r);
    } else {
      return results.some((r) => r);
    }
  }

  /**
   * Get field value from input using dot notation
   */
  private getFieldValue(input: ApprovalRoutingInput, field: string): unknown {
    const parts = field.split('.');
    let value: unknown = input.action_context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(
    value: unknown,
    operator: string,
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return value === expected;
      case 'not_equals':
        return value !== expected;
      case 'contains':
        if (typeof value === 'string' && typeof expected === 'string') {
          return value.includes(expected);
        }
        if (Array.isArray(value)) {
          return value.includes(expected);
        }
        return false;
      case 'greater_than':
        return typeof value === 'number' && typeof expected === 'number' && value > expected;
      case 'less_than':
        return typeof value === 'number' && typeof expected === 'number' && value < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(value);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(value);
      case 'matches':
        if (typeof value === 'string' && typeof expected === 'string') {
          try {
            return new RegExp(expected).test(value);
          } catch {
            return false;
          }
        }
        return false;
      default:
        return false;
    }
  }

  /**
   * Build the routing output from matched rules
   */
  private buildRoutingOutput(
    input: ApprovalRoutingInput,
    matchedRules: ApprovalRule[],
    startTime: number
  ): ApprovalRoutingOutput {
    // Check for auto-approval first
    const autoApproveResult = this.checkAutoApproval(input, matchedRules);
    if (autoApproveResult) {
      return {
        decision: 'auto_approved',
        required_approvers: [],
        approval_chain: [],
        timeout_seconds: 0,
        escalation_path: [],
        justification_required: false,
        routing_metadata: {
          rules_evaluated: this.rules.map((r) => r.rule_id),
          rules_matched: matchedRules.map((r) => r.rule_id),
          auto_approve_reason: autoApproveResult,
        },
        evaluation_time_ms: performance.now() - startTime,
      };
    }

    // If no rules matched, approve by default (bypass)
    if (matchedRules.length === 0) {
      return {
        decision: 'approval_bypassed',
        required_approvers: [],
        approval_chain: [],
        timeout_seconds: 0,
        escalation_path: [],
        justification_required: false,
        routing_metadata: {
          rules_evaluated: this.rules.map((r) => r.rule_id),
          rules_matched: [],
          bypass_reason: 'No matching approval rules',
        },
        evaluation_time_ms: performance.now() - startTime,
      };
    }

    // Build approval chain from matched rules
    const approvalChain = this.buildApprovalChain(matchedRules);
    const requiredApprovers = this.collectRequiredApprovers(matchedRules);
    const escalationPath = this.buildEscalationPath(matchedRules);
    const totalTimeout = this.calculateTotalTimeout(matchedRules);

    // Determine decision based on priority
    const decision: ApprovalDecisionOutcome = this.isHighPriority(input)
      ? 'escalation_required'
      : 'approval_required';

    return {
      decision,
      required_approvers: requiredApprovers,
      approval_chain: approvalChain,
      timeout_seconds: totalTimeout,
      escalation_path: escalationPath,
      justification_required: this.requiresJustification(matchedRules),
      routing_metadata: {
        rules_evaluated: this.rules.map((r) => r.rule_id),
        rules_matched: matchedRules.map((r) => r.rule_id),
        risk_score: this.calculateRiskScore(input, matchedRules),
        compliance_tags: this.getComplianceTags(matchedRules),
      },
      evaluation_time_ms: performance.now() - startTime,
    };
  }

  /**
   * Check if auto-approval conditions are met
   */
  private checkAutoApproval(
    input: ApprovalRoutingInput,
    matchedRules: ApprovalRule[]
  ): string | null {
    for (const rule of matchedRules) {
      if (!rule.auto_approve_conditions) continue;

      const conditions = rule.auto_approve_conditions;

      // Check allowed roles
      if (conditions.allowed_roles && conditions.allowed_roles.length > 0) {
        const hasAllowedRole = input.requester.roles.some((role) =>
          conditions.allowed_roles!.includes(role)
        );
        if (hasAllowedRole) {
          return `Requester has auto-approve role: ${input.requester.roles.join(', ')}`;
        }
      }

      // Check allowed resource types
      if (conditions.allowed_resource_types && conditions.allowed_resource_types.length > 0) {
        if (conditions.allowed_resource_types.includes(input.action_context.resource_type)) {
          return `Resource type ${input.action_context.resource_type} is auto-approved`;
        }
      }

      // Check allowed operations
      if (conditions.allowed_operations && conditions.allowed_operations.length > 0) {
        if (conditions.allowed_operations.includes(input.action_context.operation)) {
          return `Operation ${input.action_context.operation} is auto-approved`;
        }
      }

      // Check max_value
      if (conditions.max_value !== undefined) {
        const value = this.getFieldValue(input, 'details.value');
        if (typeof value === 'number' && value <= conditions.max_value) {
          return `Value ${value} is within auto-approve threshold of ${conditions.max_value}`;
        }
      }

      // Check time restrictions
      if (conditions.time_restrictions) {
        const now = new Date();
        const hour = now.getHours();
        const { start_hour, end_hour, business_days_only } = conditions.time_restrictions;

        const isBusinessHours = hour >= start_hour && hour < end_hour;
        const isBusinessDay = now.getDay() !== 0 && now.getDay() !== 6;

        if (isBusinessHours && (!business_days_only || isBusinessDay)) {
          return `Auto-approved during business hours`;
        }
      }
    }

    return null;
  }

  /**
   * Build approval chain from rules
   */
  private buildApprovalChain(rules: ApprovalRule[]): ApprovalChainStep[] {
    const chain: ApprovalChainStep[] = [];
    let stepOrder = 1;

    for (const rule of rules) {
      if (rule.approver_pool.length === 0) continue;

      chain.push({
        step_id: uuidv4(),
        step_order: stepOrder++,
        step_type: rule.required_approvers > 1 ? 'parallel' : 'any_of',
        step_name: rule.rule_name,
        approvers: rule.approver_pool.filter((a) => a.available !== false),
        required_approvals: rule.required_approvers,
        timeout_seconds: rule.timeout_seconds,
        escalation_on_timeout: rule.escalation_config.enabled,
        source_rule_id: rule.rule_id,
        instructions: rule.description,
      });
    }

    return chain;
  }

  /**
   * Collect all required approvers from rules
   */
  private collectRequiredApprovers(rules: ApprovalRule[]): Approver[] {
    const approvers = new Map<string, Approver>();

    for (const rule of rules) {
      for (const approver of rule.approver_pool) {
        if (approver.available !== false && !approvers.has(approver.id)) {
          approvers.set(approver.id, approver);
        }
      }
    }

    return Array.from(approvers.values());
  }

  /**
   * Build escalation path from rules
   */
  private buildEscalationPath(rules: ApprovalRule[]): EscalationLevel[] {
    const levels = new Map<number, EscalationLevel>();

    for (const rule of rules) {
      if (!rule.escalation_config.enabled) continue;

      for (const level of rule.escalation_config.levels) {
        const existing = levels.get(level.level);
        if (!existing) {
          levels.set(level.level, { ...level });
        } else {
          // Merge approvers at the same level
          const existingIds = new Set(existing.approvers.map((a) => a.id));
          for (const approver of level.approvers) {
            if (!existingIds.has(approver.id)) {
              existing.approvers.push(approver);
            }
          }
          // Use shorter timeout
          existing.timeout_seconds = Math.min(existing.timeout_seconds, level.timeout_seconds);
        }
      }
    }

    return Array.from(levels.values()).sort((a, b) => a.level - b.level);
  }

  /**
   * Calculate total timeout from rules
   */
  private calculateTotalTimeout(rules: ApprovalRule[]): number {
    let total = 0;
    for (const rule of rules) {
      total += rule.timeout_seconds;
      // Add escalation timeouts
      if (rule.escalation_config.enabled) {
        for (const level of rule.escalation_config.levels) {
          total += level.timeout_seconds;
        }
      }
    }
    return total;
  }

  /**
   * Check if request is high priority
   */
  private isHighPriority(input: ApprovalRoutingInput): boolean {
    return input.priority === 'critical' || input.priority === 'high' || input.priority === 'emergency';
  }

  /**
   * Check if justification is required
   */
  private requiresJustification(rules: ApprovalRule[]): boolean {
    // Require justification for high-priority rules (priority >= 80)
    return rules.some((r) => r.priority >= 80);
  }

  /**
   * Calculate risk score based on action and rules
   */
  private calculateRiskScore(input: ApprovalRoutingInput, rules: ApprovalRule[]): number {
    let score = 0;

    // Base score from operation type
    const operation = input.action_context.operation;
    if (operation === 'delete') score += 30;
    else if (operation === 'update') score += 20;
    else if (operation === 'execute') score += 25;
    else if (operation === 'create') score += 15;

    // Add score based on matched rules
    score += rules.length * 10;

    // Add score based on rule priority
    for (const rule of rules) {
      score += Math.floor(rule.priority / 10);
    }

    // Cap at 100
    return Math.min(100, score);
  }

  /**
   * Get compliance tags from rules
   */
  private getComplianceTags(rules: ApprovalRule[]): string[] {
    const tags = new Set<string>();

    for (const rule of rules) {
      if (rule.tags) {
        for (const tag of rule.tags) {
          tags.add(tag);
        }
      }
    }

    return Array.from(tags);
  }

  /**
   * Calculate confidence score
   *
   * Confidence is based on:
   * - Number of rules evaluated
   * - Clarity of decision (single rule vs. multiple)
   * - Auto-approval certainty
   */
  private calculateConfidence(rules: ApprovalRule[], output: ApprovalRoutingOutput): number {
    let confidence = 1.0;

    // Reduce confidence if no rules matched (default bypass)
    if (rules.length === 0) {
      confidence *= 0.85;
    }

    // Reduce confidence for multiple conflicting rules
    if (rules.length > 3) {
      confidence *= 0.95;
    }

    // Reduce confidence for escalation decisions
    if (output.decision === 'escalation_required') {
      confidence *= 0.9;
    }

    // Increase confidence for auto-approval with clear reason
    if (output.decision === 'auto_approved' && output.routing_metadata.auto_approve_reason) {
      confidence = Math.min(confidence * 1.05, 0.98);
    }

    // Reduce confidence if approvers are unavailable
    const totalApprovers = rules.reduce((sum, r) => sum + r.approver_pool.length, 0);
    const availableApprovers = rules.reduce(
      (sum, r) => sum + r.approver_pool.filter((a) => a.available !== false).length,
      0
    );
    if (totalApprovers > 0 && availableApprovers < totalApprovers) {
      confidence *= availableApprovers / totalApprovers;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Create SHA256 hash of inputs for deduplication
   */
  private hashInputs(input: ApprovalRoutingInput): string {
    const serialized = JSON.stringify({
      request_id: input.request_id,
      action_context: input.action_context,
      requester: input.requester,
      approval_rules: input.approval_rules,
    });

    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Persist DecisionEvent to ruvector-service
   */
  private async persistDecisionEvent(event: ApprovalDecisionEvent): Promise<void> {
    // Cast to base DecisionEvent type for persistence
    const baseEvent = event as unknown as import('../contracts/decision-event').DecisionEvent;
    const ack = await ruvectorServiceClient.persistDecisionEvent(baseEvent);

    if (!ack.accepted) {
      logger.warn(
        { event_id: event.event_id, error: ack.error },
        'ApprovalDecisionEvent persistence was not accepted'
      );
    }
  }

  /**
   * Emit telemetry to Observatory
   */
  private async emitTelemetry(
    event: ApprovalDecisionEvent,
    startTime: number
  ): Promise<void> {
    const telemetryEvent: PolicyEvaluationEvent = {
      eventId: event.event_id,
      timestamp: event.timestamp,
      traceId: event.execution_ref.trace_id,
      spanId: event.execution_ref.span_id,
      policyId: event.rules_applied[0]?.rule_id || 'none',
      ruleId: event.rules_applied[0]?.rule_id,
      decision: this.mapDecisionToTelemetry(event.outputs.decision),
      durationMs: performance.now() - startTime,
      cached: event.metadata?.cached || false,
      context: {
        agent_id: event.agent_id,
        environment: event.execution_ref.environment,
      },
      labels: {
        agent_version: event.agent_version,
        decision_type: event.decision_type,
        priority: event.metadata?.sla_tier || 'normal',
      },
    };

    await observatoryClient.emitEvaluationEvent(telemetryEvent);
  }

  /**
   * Map ApprovalDecisionOutcome to Observatory DecisionOutcome
   */
  private mapDecisionToTelemetry(
    decision: ApprovalDecisionOutcome
  ): 'allow' | 'deny' | 'warn' | 'modify' | 'error' {
    switch (decision) {
      case 'auto_approved':
      case 'approval_bypassed':
        return 'allow';
      case 'approval_required':
      case 'pending_approval':
        return 'warn';
      case 'escalation_required':
        return 'modify';
      default:
        return 'warn';
    }
  }

  /**
   * Create error DecisionEvent for failure cases
   */
  private createErrorDecisionEvent(
    eventId: string,
    input: ApprovalRoutingInput,
    error: unknown,
    startTime: number
  ): ApprovalDecisionEvent {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      event_id: eventId,
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      decision_type: DECISION_TYPE,
      inputs_hash: this.hashInputs(input),
      outputs: {
        decision: 'pending_approval',
        required_approvers: [],
        approval_chain: [],
        timeout_seconds: 3600,
        escalation_path: [],
        justification_required: false,
        routing_metadata: {
          rules_evaluated: [],
          rules_matched: [],
          escalation_reason: `Evaluation error: ${errorMessage}`,
        },
        evaluation_time_ms: performance.now() - startTime,
      },
      confidence: 0,
      rules_applied: [],
      execution_ref: {
        request_id: input.request_id,
        trace_id: uuidv4(),
        environment: this.environment,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        cached: false,
        engine_version: AGENT_VERSION,
        mode: input.dry_run ? 'dry-run' : 'real-time',
        source: 'approval-routing-agent',
      },
    };
  }

  /**
   * Get agent registration metadata
   */
  static getRegistration(): AgentRegistration {
    return {
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      agent_type: 'approval_gating',
      agent_name: 'Approval Routing Agent',
      description:
        'Determine required approval paths for policy-gated actions. Routes approval requests to appropriate approvers based on configured rules.',
      input_schema: 'ApprovalRoutingInput',
      output_schema: 'ApprovalDecisionEvent',
      decision_types: [DECISION_TYPE],
      cli_contract: {
        command: 'agent',
        subcommands: ['evaluate', 'route', 'resolve'],
        required_flags: ['--action-context', '--requester', '--request-id'],
        optional_flags: ['--rules', '--priority', '--dry-run', '--trace', '--json'],
      },
      consumers: [
        'llm-orchestrator',
        'approval-workflow-service',
        'notification-service',
        'audit-service',
        'governance-systems',
      ],
      non_responsibilities: [
        'Execute approval workflows',
        'Send notifications directly',
        'Store approval state',
        'Modify approval rules at runtime',
        'Access user management systems directly',
        'Track approval progress',
        'Connect directly to databases',
        'Execute SQL queries',
      ],
      failure_modes: [
        'Rule evaluation timeout',
        'Invalid action context format',
        'Missing required fields',
        'Rule parsing error',
        'ruvector-service unavailable (graceful degradation)',
        'Observatory unavailable (graceful degradation)',
        'No approvers available',
      ],
      registered_at: new Date().toISOString(),
    };
  }
}
