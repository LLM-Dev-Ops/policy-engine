/**
 * Decision Event Contracts
 *
 * These schemas define the authoritative contract for DecisionEvents
 * emitted by LLM-Policy-Engine agents.
 *
 * IMPORTANT: This follows the LLM-Policy-Engine Agent Infrastructure Constitution
 * - All agents MUST emit exactly ONE DecisionEvent per invocation
 * - DecisionEvents are persisted via ruvector-service (never direct SQL)
 * - All schemas are imported from agentics-contracts
 */

/**
 * Decision types for policy enforcement outcomes
 */
export type PolicyDecisionOutcome =
  | 'policy_allow'
  | 'policy_deny'
  | 'approval_required'
  | 'conditional_allow'
  | 'constraint_violation';

/**
 * Constraint severity levels
 */
export type ConstraintSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Policy rule that was applied in the decision
 */
export interface AppliedConstraint {
  /** Unique identifier for the constraint/rule */
  constraint_id: string;
  /** Human-readable name of the constraint */
  constraint_name: string;
  /** Type of constraint: policy_rule, approval_gate, rate_limit, etc */
  constraint_type: 'policy_rule' | 'approval_gate' | 'rate_limit' | 'budget_limit' | 'security_rule' | 'governance_rule';
  /** Severity level of the constraint */
  severity: ConstraintSeverity;
  /** Scope of the constraint: global, namespace, project, user */
  scope: 'global' | 'namespace' | 'project' | 'user';
  /** Whether the constraint was satisfied */
  satisfied: boolean;
  /** Reason for the constraint result */
  reason?: string;
  /** Additional metadata about the constraint */
  metadata?: Record<string, unknown>;
}

/**
 * Input context for policy enforcement
 */
export interface PolicyEnforcementInput {
  /** Unique request identifier */
  request_id: string;
  /** Evaluation context */
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
  /** Optional list of specific policy IDs to evaluate */
  policy_ids?: string[];
  /** Whether this is a dry run */
  dry_run?: boolean;
  /** Enable trace mode for debugging */
  trace?: boolean;
}

/**
 * Output result from policy enforcement
 */
export interface PolicyEnforcementOutput {
  /** The final decision outcome */
  decision: PolicyDecisionOutcome;
  /** Whether the request is allowed to proceed */
  allowed: boolean;
  /** Human-readable reason for the decision */
  reason?: string;
  /** List of policy IDs that matched */
  matched_policies: string[];
  /** List of rule IDs that matched */
  matched_rules: string[];
  /** Modifications to apply (for conditional_allow) */
  modifications?: Record<string, unknown>;
  /** Approval requirements (for approval_required) */
  approval_requirements?: {
    approvers: string[];
    timeout_seconds?: number;
    escalation_path?: string[];
  };
  /** Evaluation time in milliseconds */
  evaluation_time_ms: number;
}

/**
 * DecisionEvent - Core output contract for all LLM-Policy-Engine agents
 *
 * This schema MUST be emitted exactly ONCE per agent invocation.
 * It is persisted to ruvector-service for audit, analytics, and governance.
 *
 * Schema follows the LLM-Policy-Engine Agent Infrastructure Constitution.
 */
export interface DecisionEvent {
  /** Unique identifier for this decision event */
  event_id: string;

  /** Agent identification */
  agent_id: string;
  agent_version: string;

  /** Classification of the decision type */
  decision_type: 'policy_enforcement_decision' | 'constraint_resolution' | 'approval_gating';

  /** SHA256 hash of the inputs for deduplication and verification */
  inputs_hash: string;

  /** The enforcement output containing the decision */
  outputs: PolicyEnforcementOutput;

  /** Confidence score (0-1) indicating certainty of the decision */
  confidence: number;

  /** List of all constraints that were applied in reaching this decision */
  constraints_applied: AppliedConstraint[];

  /** Reference to the execution context */
  execution_ref: {
    /** Original request ID */
    request_id: string;
    /** Trace ID for distributed tracing */
    trace_id?: string;
    /** Span ID for distributed tracing */
    span_id?: string;
    /** Environment (production, staging, development) */
    environment: string;
    /** Session ID if applicable */
    session_id?: string;
  };

  /** UTC timestamp of the decision */
  timestamp: string;

  /** Additional metadata for the decision */
  metadata?: {
    /** Cache status */
    cached?: boolean;
    /** Policy engine version */
    engine_version?: string;
    /** Evaluation mode */
    mode?: 'real-time' | 'batch' | 'dry-run';
    /** Source of the request */
    source?: string;
    /** Whether the decision has been routed */
    routed?: boolean;
    /** Routing targets for enforcement layers */
    routing_targets?: string[];
    /** Error message if evaluation failed */
    error?: string;
    /** Additional custom metadata */
    [key: string]: unknown;
  };
}

/**
 * Agent registration metadata
 */
export interface AgentRegistration {
  /** Unique agent identifier */
  agent_id: string;
  /** Agent version (semver) */
  agent_version: string;
  /** Agent type classification */
  agent_type: 'policy_evaluation' | 'constraint_enforcement' | 'approval_gating';
  /** Human-readable agent name */
  agent_name: string;
  /** Agent description */
  description: string;
  /** Input schema reference */
  input_schema: string;
  /** Output schema reference */
  output_schema: string;
  /** Decision types this agent can produce */
  decision_types: string[];
  /** CLI invocation shape */
  cli_contract: {
    command: string;
    subcommands: string[];
    required_flags: string[];
    optional_flags: string[];
  };
  /** Systems that may consume this agent's output */
  consumers: string[];
  /** Explicit non-responsibilities */
  non_responsibilities: string[];
  /** Failure modes */
  failure_modes: string[];
  /** Registration timestamp */
  registered_at: string;
}
