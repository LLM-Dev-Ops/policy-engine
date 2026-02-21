/**
 * Constraint Solver Agent Contracts
 *
 * These schemas define the authoritative contract for ConstraintDecisionEvents
 * emitted by the Constraint Solver Agent.
 *
 * IMPORTANT: This follows the LLM-Policy-Engine Agent Infrastructure Constitution
 * - All agents MUST emit exactly ONE DecisionEvent per invocation
 * - DecisionEvents are persisted via ruvector-service (never direct SQL)
 * - Classification: CONSTRAINT ENFORCEMENT
 * - decision_type: "constraint_resolution"
 */

import { AgentRegistration, AppliedConstraint, ConstraintSeverity } from './decision-event';

/**
 * Decision types for constraint solver outcomes
 */
export type ConstraintDecisionOutcome =
  | 'constraints_satisfied'
  | 'constraints_violated'
  | 'constraints_resolved'
  | 'partial_resolution'
  | 'no_constraints';

/**
 * Conflict type between constraints
 */
export type ConflictType =
  | 'mutual_exclusion'
  | 'priority_conflict'
  | 'scope_overlap'
  | 'temporal_conflict'
  | 'resource_contention';

/**
 * Resolution strategy used by the solver
 */
export type ResolutionStrategy =
  | 'priority_based'
  | 'scope_narrowing'
  | 'temporal_ordering'
  | 'most_restrictive'
  | 'least_restrictive'
  | 'manual_required';

/**
 * A conflict detected between constraints
 */
export interface ConstraintConflict {
  conflict_id: string;
  conflict_type: ConflictType;
  constraint_a: string;
  constraint_b: string;
  description: string;
  severity: ConstraintSeverity;
  resolved: boolean;
  resolution_strategy?: ResolutionStrategy;
  resolution_detail?: string;
}

/**
 * Input for constraint solver requests
 */
export interface ConstraintSolverInput {
  request_id: string;
  context: {
    llm?: {
      provider: string;
      model: string;
      prompt?: string;
      max_tokens?: number;
      temperature?: number;
    };
    user?: {
      id: string;
      email?: string;
      roles?: string[];
      permissions?: string[];
    };
    team?: {
      id: string;
      name?: string;
      tier?: string;
    };
    project?: {
      id: string;
      name?: string;
      environment?: string;
    };
    request?: {
      id: string;
      timestamp: number;
      ip_address?: string;
      user_agent?: string;
    };
    metadata?: Record<string, unknown>;
  };
  constraint_ids?: string[];
  policy_ids?: string[];
  dry_run?: boolean;
  trace?: boolean;
}

/**
 * Output from constraint solver evaluation
 */
export interface ConstraintSolverOutput {
  decision: ConstraintDecisionOutcome;
  constraints_evaluated: AppliedConstraint[];
  conflicts_detected: ConstraintConflict[];
  conflicts_resolved: number;
  conflicts_unresolved: number;
  resolution_strategy: ResolutionStrategy;
  effective_constraints: AppliedConstraint[];
  evaluation_time_ms: number;
}

/**
 * ConstraintDecisionEvent - Core output contract for Constraint Solver Agent
 *
 * This schema MUST be emitted exactly ONCE per ConstraintSolverAgent invocation.
 * It is persisted to ruvector-service for audit, analytics, and governance.
 */
export interface ConstraintDecisionEvent {
  event_id: string;
  agent_id: string;
  agent_version: string;
  decision_type: 'constraint_resolution';
  inputs_hash: string;
  outputs: ConstraintSolverOutput;
  confidence: number;
  constraints_applied: AppliedConstraint[];
  execution_ref: {
    request_id: string;
    trace_id?: string;
    span_id?: string;
    environment: string;
    session_id?: string;
  };
  timestamp: string;
  metadata?: {
    cached?: boolean;
    engine_version?: string;
    mode?: 'real-time' | 'batch' | 'dry-run';
    source?: string;
    total_constraints?: number;
    total_conflicts?: number;
  };
}

/**
 * Constraint Solver Agent registration
 */
export type ConstraintSolverAgentRegistration = AgentRegistration;
