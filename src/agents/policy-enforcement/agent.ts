/**
 * Policy Enforcement Agent
 *
 * CLASSIFICATION: POLICY EVALUATION / ENFORCEMENT
 *
 * PURPOSE:
 * Evaluate execution requests against defined policy rules and produce
 * authoritative allow, deny, or approval-required decisions.
 *
 * SCOPE:
 * - Evaluate policy rules against execution context
 * - Apply constraint logic
 * - Emit enforceable policy decisions
 *
 * DECISION_TYPE: "policy_enforcement_decision"
 *
 * NON-RESPONSIBILITIES (MUST NOT):
 * - Intercept execution traffic directly
 * - Retry or recover execution
 * - Execute workflows
 * - Modify runtime configurations
 * - Apply optimizations
 * - Perform analytics or forecasting
 * - Connect directly to databases
 *
 * This agent follows the LLM-Policy-Engine Agent Infrastructure Constitution.
 */
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  DecisionEvent,
  PolicyEnforcementInput,
  PolicyEnforcementOutput,
  AppliedConstraint,
  PolicyDecisionOutcome,
  AgentRegistration,
} from '../contracts/decision-event';
import {
  Policy,
  DecisionType,
  EvaluationContext,
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
} from '../../types/policy';
import { PolicyEngine } from '../../core/engine/policy-engine';
import { ruvectorServiceClient } from '../../integrations/ruvector-service';
import { observatoryClient, PolicyEvaluationEvent } from '../../integrations/observatory';
import logger from '@utils/logger';
import { config } from '@utils/config';

/**
 * Agent metadata constants
 */
export const AGENT_ID = 'policy-enforcement-agent';
export const AGENT_VERSION = '1.0.0';
export const DECISION_TYPE = 'policy_enforcement_decision';

/**
 * Policy Enforcement Agent
 *
 * Stateless agent that evaluates policy rules and produces DecisionEvents.
 * Designed for deployment as a Google Cloud Edge Function.
 */
export class PolicyEnforcementAgent {
  private engine: PolicyEngine;
  private environment: string;

  constructor(policies: Policy[] = []) {
    this.engine = new PolicyEngine(policies);
    this.environment = config.environment || 'development';
  }

  /**
   * Reload policies into the engine
   */
  loadPolicies(policies: Policy[]): void {
    for (const policy of policies) {
      this.engine.addPolicy(policy);
    }
  }

  /**
   * PRIMARY ENTRY POINT: Evaluate a policy enforcement request
   *
   * This method:
   * 1. Validates inputs
   * 2. Evaluates policies
   * 3. Calculates confidence
   * 4. Emits exactly ONE DecisionEvent to ruvector-service
   * 5. Emits telemetry to Observatory
   * 6. Returns deterministic, machine-readable output
   */
  async evaluate(input: PolicyEnforcementInput): Promise<DecisionEvent> {
    const startTime = performance.now();
    const eventId = uuidv4();
    const traceId = uuidv4();

    logger.info(
      { eventId, requestId: input.request_id, traceId },
      'Policy Enforcement Agent: Starting evaluation'
    );

    try {
      // Convert input to internal request format
      const request = this.convertToInternalRequest(input);

      // Evaluate policies
      const response = await this.engine.evaluate(request);

      // Convert to enforcement output
      const output = this.convertToEnforcementOutput(response);

      // Build list of applied constraints
      const constraintsApplied = this.buildAppliedConstraints(response);

      // Calculate confidence score
      const confidence = this.calculateConfidence(response, constraintsApplied);

      // Create inputs hash for deduplication
      const inputsHash = this.hashInputs(input);

      // Build DecisionEvent
      const decisionEvent: DecisionEvent = {
        event_id: eventId,
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        decision_type: DECISION_TYPE,
        inputs_hash: inputsHash,
        outputs: output,
        confidence,
        constraints_applied: constraintsApplied,
        execution_ref: {
          request_id: input.request_id,
          trace_id: traceId,
          span_id: uuidv4(),
          environment: this.environment,
          session_id: input.context.request?.id,
        },
        timestamp: new Date().toISOString(),
        metadata: {
          cached: response.cached || false,
          engine_version: AGENT_VERSION,
          mode: input.dry_run ? 'dry-run' : 'real-time',
          source: 'policy-enforcement-agent',
        },
      };

      // Persist DecisionEvent to ruvector-service (async, non-blocking)
      this.persistDecisionEvent(decisionEvent).catch((error) => {
        logger.error({ error, eventId }, 'Failed to persist DecisionEvent');
      });

      // Emit telemetry to Observatory (async, non-blocking)
      this.emitTelemetry(decisionEvent, startTime).catch((error) => {
        logger.error({ error, eventId }, 'Failed to emit telemetry');
      });

      logger.info(
        {
          eventId,
          decision: output.decision,
          allowed: output.allowed,
          confidence,
          evaluationTimeMs: output.evaluation_time_ms,
        },
        'Policy Enforcement Agent: Evaluation completed'
      );

      return decisionEvent;
    } catch (error) {
      // On failure, still emit a DecisionEvent with error state
      const errorEvent = this.createErrorDecisionEvent(eventId, input, error, startTime);

      // Attempt to persist error event
      this.persistDecisionEvent(errorEvent).catch((persistError) => {
        logger.error({ persistError, eventId }, 'Failed to persist error DecisionEvent');
      });

      throw error;
    }
  }

  /**
   * RESOLVE: Resolve constraint conflicts for a given context
   */
  async resolve(input: PolicyEnforcementInput): Promise<DecisionEvent> {
    // Resolution uses the same evaluation logic but with trace enabled
    return this.evaluate({ ...input, trace: true });
  }

  /**
   * ROUTE: Route a decision to appropriate enforcement layers
   */
  async route(input: PolicyEnforcementInput): Promise<DecisionEvent> {
    // Routing evaluates and adds routing metadata
    const event = await this.evaluate(input);

    // Add routing information to metadata
    event.metadata = {
      ...event.metadata,
      routed: true,
      routing_targets: this.determineRoutingTargets(event),
    };

    return event;
  }

  /**
   * Convert external input to internal PolicyEvaluationRequest
   */
  private convertToInternalRequest(input: PolicyEnforcementInput): PolicyEvaluationRequest {
    const context: EvaluationContext = {
      llm: input.context.llm
        ? {
            provider: input.context.llm.provider,
            model: input.context.llm.model,
            prompt: input.context.llm.prompt,
            maxTokens: input.context.llm.max_tokens,
            temperature: input.context.llm.temperature,
          }
        : undefined,
      user: input.context.user
        ? {
            id: input.context.user.id,
            email: input.context.user.email,
            roles: input.context.user.roles,
            permissions: input.context.user.permissions,
          }
        : undefined,
      team: input.context.team
        ? {
            id: input.context.team.id,
            name: input.context.team.name,
            tier: input.context.team.tier,
          }
        : undefined,
      project: input.context.project
        ? {
            id: input.context.project.id,
            name: input.context.project.name,
            environment: input.context.project.environment,
          }
        : undefined,
      request: input.context.request
        ? {
            id: input.context.request.id,
            timestamp: input.context.request.timestamp,
            ipAddress: input.context.request.ip_address,
            userAgent: input.context.request.user_agent,
          }
        : undefined,
      metadata: input.context.metadata,
    };

    return {
      requestId: input.request_id,
      context,
      policies: input.policy_ids,
      dryRun: input.dry_run,
      trace: input.trace,
    };
  }

  /**
   * Convert internal response to PolicyEnforcementOutput
   */
  private convertToEnforcementOutput(
    response: PolicyEvaluationResponse
  ): PolicyEnforcementOutput {
    const decision = response.decision;

    // Map internal DecisionType to PolicyDecisionOutcome
    let outcome: PolicyDecisionOutcome;
    switch (decision.decision) {
      case DecisionType.ALLOW:
        outcome = 'policy_allow';
        break;
      case DecisionType.DENY:
        outcome = 'policy_deny';
        break;
      case DecisionType.WARN:
        outcome = 'conditional_allow';
        break;
      case DecisionType.MODIFY:
        outcome = 'conditional_allow';
        break;
      default:
        outcome = 'policy_deny';
    }

    // Check if approval is required based on matched rules
    // This is a simplified check - in production would analyze specific approval rules
    const requiresApproval = decision.matchedRules.some(
      (rule) => rule.includes('approval') || rule.includes('review')
    );
    if (requiresApproval && decision.allowed) {
      outcome = 'approval_required';
    }

    return {
      decision: outcome,
      allowed: decision.allowed,
      reason: decision.reason,
      matched_policies: decision.matchedPolicies,
      matched_rules: decision.matchedRules,
      modifications: decision.modifications,
      approval_requirements: requiresApproval
        ? {
            approvers: ['admin', 'security-team'],
            timeout_seconds: 3600,
            escalation_path: ['security-lead', 'cto'],
          }
        : undefined,
      evaluation_time_ms: decision.evaluationTimeMs,
    };
  }

  /**
   * Build list of applied constraints from evaluation response
   */
  private buildAppliedConstraints(
    response: PolicyEvaluationResponse
  ): AppliedConstraint[] {
    const constraints: AppliedConstraint[] = [];

    // Add matched policies as constraints
    for (const policyId of response.decision.matchedPolicies) {
      constraints.push({
        constraint_id: policyId,
        constraint_name: policyId,
        constraint_type: 'policy_rule',
        severity: this.determineSeverity(response.decision.decision),
        scope: 'namespace',
        satisfied: response.decision.allowed,
        reason: response.decision.reason,
      });
    }

    // Add matched rules as constraints
    for (const ruleId of response.decision.matchedRules) {
      constraints.push({
        constraint_id: ruleId,
        constraint_name: ruleId,
        constraint_type: 'policy_rule',
        severity: this.determineSeverity(response.decision.decision),
        scope: 'project',
        satisfied: response.decision.allowed,
        reason: response.decision.reason,
      });
    }

    return constraints;
  }

  /**
   * Determine constraint severity from decision type
   */
  private determineSeverity(decision: DecisionType): 'info' | 'warning' | 'error' | 'critical' {
    switch (decision) {
      case DecisionType.ALLOW:
        return 'info';
      case DecisionType.WARN:
        return 'warning';
      case DecisionType.MODIFY:
        return 'warning';
      case DecisionType.DENY:
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Calculate confidence score based on evaluation results
   *
   * Confidence is based on:
   * - Number of policies evaluated
   * - Clarity of decision (all rules agree vs. mixed)
   * - Presence of ambiguous conditions
   */
  private calculateConfidence(
    response: PolicyEvaluationResponse,
    constraints: AppliedConstraint[]
  ): number {
    let confidence = 1.0;

    // Reduce confidence if no policies matched (default allow)
    if (response.decision.matchedPolicies.length === 0) {
      confidence *= 0.8;
    }

    // Reduce confidence if constraints had mixed results
    const satisfiedCount = constraints.filter((c) => c.satisfied).length;
    const totalCount = constraints.length;
    if (totalCount > 0 && satisfiedCount > 0 && satisfiedCount < totalCount) {
      confidence *= 0.9;
    }

    // Reduce confidence for MODIFY decisions (ambiguous outcome)
    if (response.decision.decision === DecisionType.MODIFY) {
      confidence *= 0.95;
    }

    // Reduce confidence for WARN decisions
    if (response.decision.decision === DecisionType.WARN) {
      confidence *= 0.9;
    }

    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Create SHA256 hash of inputs for deduplication
   */
  private hashInputs(input: PolicyEnforcementInput): string {
    const serialized = JSON.stringify({
      request_id: input.request_id,
      context: input.context,
      policy_ids: input.policy_ids,
    });

    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Persist DecisionEvent to ruvector-service
   */
  private async persistDecisionEvent(event: DecisionEvent): Promise<void> {
    const ack = await ruvectorServiceClient.persistDecisionEvent(event);

    if (!ack.accepted) {
      logger.warn(
        { event_id: event.event_id, error: ack.error },
        'DecisionEvent persistence was not accepted'
      );
    }
  }

  /**
   * Emit telemetry to Observatory
   */
  private async emitTelemetry(event: DecisionEvent, startTime: number): Promise<void> {
    const telemetryEvent: PolicyEvaluationEvent = {
      eventId: event.event_id,
      timestamp: event.timestamp,
      traceId: event.execution_ref.trace_id,
      spanId: event.execution_ref.span_id,
      policyId: event.outputs.matched_policies[0] || 'none',
      ruleId: event.outputs.matched_rules[0],
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
      },
    };

    await observatoryClient.emitEvaluationEvent(telemetryEvent);
  }

  /**
   * Map PolicyDecisionOutcome to Observatory DecisionOutcome
   */
  private mapDecisionToTelemetry(
    decision: PolicyDecisionOutcome
  ): 'allow' | 'deny' | 'warn' | 'modify' | 'error' {
    switch (decision) {
      case 'policy_allow':
        return 'allow';
      case 'policy_deny':
        return 'deny';
      case 'approval_required':
        return 'warn';
      case 'conditional_allow':
        return 'modify';
      case 'constraint_violation':
        return 'deny';
      default:
        return 'error';
    }
  }

  /**
   * Determine routing targets based on decision
   */
  private determineRoutingTargets(event: DecisionEvent): string[] {
    const targets: string[] = [];

    switch (event.outputs.decision) {
      case 'policy_deny':
        targets.push('llm-incident-manager');
        targets.push('governance-system');
        break;
      case 'approval_required':
        targets.push('llm-orchestrator');
        targets.push('approval-system');
        break;
      case 'conditional_allow':
        targets.push('llm-edge-agent');
        break;
      case 'policy_allow':
        targets.push('llm-edge-agent');
        break;
    }

    return targets;
  }

  /**
   * Create error DecisionEvent for failure cases
   */
  private createErrorDecisionEvent(
    eventId: string,
    input: PolicyEnforcementInput,
    error: unknown,
    startTime: number
  ): DecisionEvent {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      event_id: eventId,
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      decision_type: DECISION_TYPE,
      inputs_hash: this.hashInputs(input),
      outputs: {
        decision: 'policy_deny',
        allowed: false,
        reason: `Evaluation error: ${errorMessage}`,
        matched_policies: [],
        matched_rules: [],
        evaluation_time_ms: performance.now() - startTime,
      },
      confidence: 0,
      constraints_applied: [],
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
        source: 'policy-enforcement-agent',
        error: errorMessage,
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
      agent_type: 'policy_evaluation',
      agent_name: 'Policy Enforcement Agent',
      description:
        'Evaluate execution requests against defined policy rules and produce authoritative allow, deny, or approval-required decisions.',
      input_schema: 'PolicyEnforcementInput',
      output_schema: 'DecisionEvent',
      decision_types: [DECISION_TYPE],
      cli_contract: {
        command: 'agent',
        subcommands: ['evaluate', 'resolve', 'route'],
        required_flags: ['--context', '--request-id'],
        optional_flags: ['--policies', '--dry-run', '--trace', '--json'],
      },
      consumers: [
        'llm-edge-agent',
        'llm-orchestrator',
        'llm-incident-manager',
        'governance-systems',
      ],
      non_responsibilities: [
        'Intercept execution traffic directly',
        'Retry or recover execution',
        'Execute workflows',
        'Modify runtime configurations',
        'Apply optimizations',
        'Perform analytics or forecasting',
        'Connect directly to databases',
        'Execute SQL queries',
      ],
      failure_modes: [
        'Policy evaluation timeout',
        'Invalid context format',
        'Missing required fields',
        'Policy parsing error',
        'ruvector-service unavailable (graceful degradation)',
        'Observatory unavailable (graceful degradation)',
      ],
      registered_at: new Date().toISOString(),
    };
  }
}
