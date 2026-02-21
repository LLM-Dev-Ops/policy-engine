/**
 * Constraint Solver Agent
 *
 * CLASSIFICATION: CONSTRAINT ENFORCEMENT
 *
 * PURPOSE:
 * Analyze and resolve conflicts between policy constraints. Produces
 * deterministic constraint resolution decisions.
 *
 * SCOPE:
 * - Evaluate constraints against execution context
 * - Detect conflicts between constraints
 * - Apply resolution strategies
 * - Emit enforceable constraint decisions
 *
 * DECISION_TYPE: "constraint_resolution"
 *
 * NON-RESPONSIBILITIES (MUST NOT):
 * - Intercept execution traffic directly
 * - Retry or recover execution
 * - Execute workflows
 * - Modify runtime configurations
 * - Apply optimizations
 * - Perform analytics or forecasting
 * - Connect directly to databases
 * - Execute SQL queries
 *
 * This agent follows the LLM-Policy-Engine Agent Infrastructure Constitution.
 */
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import {
  ConstraintSolverInput,
  ConstraintSolverOutput,
  ConstraintDecisionEvent,
  ConstraintDecisionOutcome,
  ConstraintConflict,
  ResolutionStrategy,
} from '../contracts/constraint-solver';
import { AppliedConstraint, AgentRegistration } from '../contracts/decision-event';
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
export const AGENT_ID = 'constraint-solver-agent';
export const AGENT_VERSION = '1.0.0';
export const DECISION_TYPE = 'constraint_resolution';

/**
 * Constraint Solver Agent
 *
 * Stateless agent that analyzes constraint conflicts and produces
 * ConstraintDecisionEvents.
 */
export class ConstraintSolverAgent {
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
   * PRIMARY ENTRY POINT: Resolve constraint conflicts
   *
   * This method:
   * 1. Evaluates all applicable constraints
   * 2. Detects conflicts between constraints
   * 3. Applies resolution strategies
   * 4. Calculates confidence
   * 5. Emits exactly ONE ConstraintDecisionEvent to ruvector-service
   * 6. Emits telemetry to Observatory
   * 7. Returns deterministic, machine-readable output
   */
  async resolve(input: ConstraintSolverInput): Promise<ConstraintDecisionEvent> {
    const startTime = performance.now();
    const eventId = uuidv4();
    const traceId = uuidv4();

    logger.info(
      { eventId, requestId: input.request_id, traceId },
      'Constraint Solver Agent: Starting resolution'
    );

    try {
      // Evaluate all policies to gather constraints
      const request = this.convertToInternalRequest(input);
      const response = await this.engine.evaluate(request);

      // Build constraint list from evaluation
      const constraints = this.buildConstraints(response);

      // Detect conflicts
      const conflicts = this.detectConflicts(constraints);

      // Resolve conflicts
      const strategy = this.selectResolutionStrategy(conflicts);
      const resolvedConflicts = this.resolveConflicts(conflicts, strategy);
      const effectiveConstraints = this.computeEffectiveConstraints(constraints, resolvedConflicts);

      // Determine outcome
      const decision = this.determineOutcome(constraints, resolvedConflicts);

      // Build output
      const output: ConstraintSolverOutput = {
        decision,
        constraints_evaluated: constraints,
        conflicts_detected: resolvedConflicts,
        conflicts_resolved: resolvedConflicts.filter(c => c.resolved).length,
        conflicts_unresolved: resolvedConflicts.filter(c => !c.resolved).length,
        resolution_strategy: strategy,
        effective_constraints: effectiveConstraints,
        evaluation_time_ms: performance.now() - startTime,
      };

      // Calculate confidence
      const confidence = this.calculateConfidence(constraints, resolvedConflicts, output);

      // Create inputs hash
      const inputsHash = this.hashInputs(input);

      // Build DecisionEvent
      const decisionEvent: ConstraintDecisionEvent = {
        event_id: eventId,
        agent_id: AGENT_ID,
        agent_version: AGENT_VERSION,
        decision_type: DECISION_TYPE,
        inputs_hash: inputsHash,
        outputs: output,
        confidence,
        constraints_applied: effectiveConstraints,
        execution_ref: {
          request_id: input.request_id,
          trace_id: traceId,
          span_id: uuidv4(),
          environment: this.environment,
          session_id: input.context.request?.id,
        },
        timestamp: new Date().toISOString(),
        metadata: {
          cached: false,
          engine_version: AGENT_VERSION,
          mode: input.dry_run ? 'dry-run' : 'real-time',
          source: 'constraint-solver-agent',
          total_constraints: constraints.length,
          total_conflicts: resolvedConflicts.length,
        },
      };

      // Persist DecisionEvent to ruvector-service (async, non-blocking)
      this.persistDecisionEvent(decisionEvent).catch((error) => {
        logger.error({ error, eventId }, 'Failed to persist ConstraintDecisionEvent');
      });

      // Emit telemetry to Observatory (async, non-blocking)
      this.emitTelemetry(decisionEvent, startTime).catch((error) => {
        logger.error({ error, eventId }, 'Failed to emit telemetry');
      });

      logger.info(
        {
          eventId,
          decision: output.decision,
          constraintsEvaluated: constraints.length,
          conflictsDetected: resolvedConflicts.length,
          conflictsResolved: output.conflicts_resolved,
          confidence,
          evaluationTimeMs: output.evaluation_time_ms,
        },
        'Constraint Solver Agent: Resolution completed'
      );

      return decisionEvent;
    } catch (error) {
      const errorEvent = this.createErrorDecisionEvent(eventId, input, error, startTime);

      this.persistDecisionEvent(errorEvent).catch((persistError) => {
        logger.error({ persistError, eventId }, 'Failed to persist error DecisionEvent');
      });

      throw error;
    }
  }

  /**
   * ANALYZE: Analyze constraints without resolving
   */
  async analyze(input: ConstraintSolverInput): Promise<ConstraintDecisionEvent> {
    return this.resolve({ ...input, dry_run: true, trace: true });
  }

  /**
   * EXPLAIN: Explain constraint relationships and conflicts
   */
  async explain(input: ConstraintSolverInput): Promise<ConstraintDecisionEvent> {
    return this.resolve({ ...input, trace: true });
  }

  /**
   * Convert external input to internal PolicyEvaluationRequest
   */
  private convertToInternalRequest(input: ConstraintSolverInput): PolicyEvaluationRequest {
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
   * Build constraint list from evaluation response
   */
  private buildConstraints(response: PolicyEvaluationResponse): AppliedConstraint[] {
    const constraints: AppliedConstraint[] = [];

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
   * Detect conflicts between constraints
   */
  private detectConflicts(constraints: AppliedConstraint[]): ConstraintConflict[] {
    const conflicts: ConstraintConflict[] = [];

    for (let i = 0; i < constraints.length; i++) {
      for (let j = i + 1; j < constraints.length; j++) {
        const a = constraints[i];
        const b = constraints[j];

        // Detect satisfaction conflicts (one satisfied, one not)
        if (a.satisfied !== b.satisfied) {
          conflicts.push({
            conflict_id: uuidv4(),
            conflict_type: 'priority_conflict',
            constraint_a: a.constraint_id,
            constraint_b: b.constraint_id,
            description: `Constraint "${a.constraint_name}" (${a.satisfied ? 'satisfied' : 'violated'}) conflicts with "${b.constraint_name}" (${b.satisfied ? 'satisfied' : 'violated'})`,
            severity: a.severity === 'critical' || b.severity === 'critical' ? 'critical' : 'warning',
            resolved: false,
          });
        }

        // Detect scope overlap conflicts
        if (a.scope === b.scope && a.constraint_type === b.constraint_type && a.constraint_id !== b.constraint_id) {
          conflicts.push({
            conflict_id: uuidv4(),
            conflict_type: 'scope_overlap',
            constraint_a: a.constraint_id,
            constraint_b: b.constraint_id,
            description: `Constraints "${a.constraint_name}" and "${b.constraint_name}" have overlapping scope: ${a.scope}`,
            severity: 'info',
            resolved: false,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Select resolution strategy based on conflicts
   */
  private selectResolutionStrategy(conflicts: ConstraintConflict[]): ResolutionStrategy {
    if (conflicts.length === 0) return 'priority_based';

    const hasCritical = conflicts.some(c => c.severity === 'critical');
    if (hasCritical) return 'most_restrictive';

    const hasPriorityConflict = conflicts.some(c => c.conflict_type === 'priority_conflict');
    if (hasPriorityConflict) return 'priority_based';

    const hasScopeOverlap = conflicts.some(c => c.conflict_type === 'scope_overlap');
    if (hasScopeOverlap) return 'scope_narrowing';

    return 'priority_based';
  }

  /**
   * Resolve conflicts using the selected strategy
   */
  private resolveConflicts(
    conflicts: ConstraintConflict[],
    strategy: ResolutionStrategy,
  ): ConstraintConflict[] {
    return conflicts.map(conflict => {
      if (strategy === 'manual_required') {
        return conflict;
      }

      return {
        ...conflict,
        resolved: true,
        resolution_strategy: strategy,
        resolution_detail: `Resolved using ${strategy} strategy`,
      };
    });
  }

  /**
   * Compute effective constraints after resolution
   */
  private computeEffectiveConstraints(
    constraints: AppliedConstraint[],
    resolvedConflicts: ConstraintConflict[],
  ): AppliedConstraint[] {
    const unresolvedConstraintIds = new Set<string>();

    for (const conflict of resolvedConflicts) {
      if (!conflict.resolved) {
        unresolvedConstraintIds.add(conflict.constraint_a);
        unresolvedConstraintIds.add(conflict.constraint_b);
      }
    }

    return constraints.filter(c => !unresolvedConstraintIds.has(c.constraint_id));
  }

  /**
   * Determine outcome from constraints and conflicts
   */
  private determineOutcome(
    constraints: AppliedConstraint[],
    conflicts: ConstraintConflict[],
  ): ConstraintDecisionOutcome {
    if (constraints.length === 0) return 'no_constraints';

    const unresolvedCount = conflicts.filter(c => !c.resolved).length;
    if (unresolvedCount > 0) return 'partial_resolution';

    const allSatisfied = constraints.every(c => c.satisfied);
    if (allSatisfied && conflicts.length === 0) return 'constraints_satisfied';
    if (allSatisfied && conflicts.length > 0) return 'constraints_resolved';

    return 'constraints_violated';
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
   * Calculate confidence score
   */
  private calculateConfidence(
    constraints: AppliedConstraint[],
    conflicts: ConstraintConflict[],
    output: ConstraintSolverOutput,
  ): number {
    let confidence = 1.0;

    if (constraints.length === 0) {
      confidence *= 0.8;
    }

    if (conflicts.length > 0) {
      const resolutionRate = output.conflicts_resolved / conflicts.length;
      confidence *= 0.85 + (0.15 * resolutionRate);
    }

    if (output.conflicts_unresolved > 0) {
      confidence *= 0.7;
    }

    const satisfiedCount = constraints.filter(c => c.satisfied).length;
    if (constraints.length > 0 && satisfiedCount > 0 && satisfiedCount < constraints.length) {
      confidence *= 0.9;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Create SHA256 hash of inputs for deduplication
   */
  private hashInputs(input: ConstraintSolverInput): string {
    const serialized = JSON.stringify({
      request_id: input.request_id,
      context: input.context,
      constraint_ids: input.constraint_ids,
      policy_ids: input.policy_ids,
    });

    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Persist DecisionEvent to ruvector-service
   */
  private async persistDecisionEvent(event: ConstraintDecisionEvent): Promise<void> {
    const baseEvent = event as unknown as import('../contracts/decision-event').DecisionEvent;
    const ack = await ruvectorServiceClient.persistDecisionEvent(baseEvent);

    if (!ack.accepted) {
      logger.warn(
        { event_id: event.event_id, error: ack.error },
        'ConstraintDecisionEvent persistence was not accepted'
      );
    }
  }

  /**
   * Emit telemetry to Observatory
   */
  private async emitTelemetry(event: ConstraintDecisionEvent, startTime: number): Promise<void> {
    const telemetryEvent: PolicyEvaluationEvent = {
      eventId: event.event_id,
      timestamp: event.timestamp,
      traceId: event.execution_ref.trace_id,
      spanId: event.execution_ref.span_id,
      policyId: event.constraints_applied[0]?.constraint_id || 'none',
      ruleId: event.constraints_applied[0]?.constraint_id,
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
   * Map ConstraintDecisionOutcome to Observatory DecisionOutcome
   */
  private mapDecisionToTelemetry(
    decision: ConstraintDecisionOutcome,
  ): 'allow' | 'deny' | 'warn' | 'modify' | 'error' {
    switch (decision) {
      case 'constraints_satisfied':
      case 'no_constraints':
        return 'allow';
      case 'constraints_resolved':
        return 'modify';
      case 'partial_resolution':
        return 'warn';
      case 'constraints_violated':
        return 'deny';
      default:
        return 'error';
    }
  }

  /**
   * Create error DecisionEvent for failure cases
   */
  private createErrorDecisionEvent(
    eventId: string,
    input: ConstraintSolverInput,
    _error: unknown,
    startTime: number,
  ): ConstraintDecisionEvent {
    return {
      event_id: eventId,
      agent_id: AGENT_ID,
      agent_version: AGENT_VERSION,
      decision_type: DECISION_TYPE,
      inputs_hash: this.hashInputs(input),
      outputs: {
        decision: 'constraints_violated',
        constraints_evaluated: [],
        conflicts_detected: [],
        conflicts_resolved: 0,
        conflicts_unresolved: 0,
        resolution_strategy: 'most_restrictive',
        effective_constraints: [],
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
        source: 'constraint-solver-agent',
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
      agent_type: 'constraint_enforcement',
      agent_name: 'Constraint Solver Agent',
      description:
        'Analyze and resolve conflicts between policy constraints. Produces deterministic constraint resolution decisions.',
      input_schema: 'ConstraintSolverInput',
      output_schema: 'ConstraintDecisionEvent',
      decision_types: [DECISION_TYPE],
      cli_contract: {
        command: 'agent',
        subcommands: ['resolve', 'analyze', 'explain'],
        required_flags: ['--context', '--request-id'],
        optional_flags: ['--constraints', '--policies', '--dry-run', '--trace', '--json'],
      },
      consumers: [
        'policy-enforcement-agent',
        'llm-edge-agent',
        'llm-orchestrator',
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
        'Constraint evaluation timeout',
        'Invalid context format',
        'Missing required fields',
        'Constraint parsing error',
        'ruvector-service unavailable (graceful degradation)',
        'Observatory unavailable (graceful degradation)',
      ],
      registered_at: new Date().toISOString(),
    };
  }
}
