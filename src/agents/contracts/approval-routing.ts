/**
 * Approval Routing Agent Contracts
 *
 * These schemas define the authoritative contract for ApprovalDecisionEvents
 * emitted by the Approval Routing Agent.
 *
 * IMPORTANT: This follows the LLM-Policy-Engine Agent Infrastructure Constitution
 * - All agents MUST emit exactly ONE DecisionEvent per invocation
 * - DecisionEvents are persisted via ruvector-service (never direct SQL)
 * - Classification: APPROVAL GATING
 * - decision_type: "approval_routing_decision"
 */

import { AgentRegistration } from './decision-event';

/**
 * Decision types for approval routing outcomes
 */
export type ApprovalDecisionOutcome =
  | 'approval_required'
  | 'auto_approved'
  | 'escalation_required'
  | 'approval_bypassed'
  | 'pending_approval';

/**
 * Priority levels for approval requests
 */
export type ApprovalPriority = 'low' | 'normal' | 'high' | 'critical' | 'emergency';

/**
 * Approval status
 */
export type ApprovalStatus =
  | 'pending'
  | 'in_review'
  | 'approved'
  | 'denied'
  | 'escalated'
  | 'expired'
  | 'cancelled';

/**
 * Approver information
 */
export interface Approver {
  id: string;
  name: string;
  role: string;
  email: string;
  type?: 'user' | 'group' | 'role' | 'system';
  level?: number;
  required?: boolean;
  available?: boolean;
  delegate_id?: string;
  decision?: 'approved' | 'denied' | 'pending';
  decision_at?: string;
  reason?: string;
}

/**
 * Escalation level configuration
 */
export interface EscalationLevel {
  level: number;
  approvers: Approver[];
  timeout_seconds: number;
  notify_all: boolean;
  message?: string;
  reached?: boolean;
  reached_at?: string;
}

/**
 * Escalation configuration for approval rules
 */
export interface EscalationConfig {
  enabled: boolean;
  levels: EscalationLevel[];
  max_escalations: number;
  final_action: 'deny' | 'auto_approve' | 'notify_admin';
}

/**
 * Condition for triggering approval rules
 */
export interface ApprovalCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'matches';
  value: unknown;
  logic?: 'and' | 'or';
}

/**
 * Conditions that allow automatic approval
 */
export interface AutoApproveConditions {
  max_value?: number;
  allowed_roles?: string[];
  allowed_resource_types?: string[];
  allowed_operations?: string[];
  time_restrictions?: {
    start_hour: number;
    end_hour: number;
    timezone: string;
    business_days_only: boolean;
  };
  custom_conditions?: ApprovalCondition[];
}

/**
 * Approval rule definition
 */
export interface ApprovalRule {
  rule_id: string;
  rule_name: string;
  description?: string;
  condition: {
    match: ApprovalCondition[];
    operator: 'all' | 'any';
  };
  required_approvers: number;
  approver_pool: Approver[];
  timeout_seconds: number;
  escalation_config: EscalationConfig;
  auto_approve_conditions?: AutoApproveConditions;
  priority: number;
  active?: boolean;
  tags?: string[];
}

/**
 * Step types for approval chain workflow
 */
export type ApprovalStepType = 'parallel' | 'sequential' | 'any_of';

/**
 * Single step in an approval workflow chain
 */
export interface ApprovalChainStep {
  step_id: string;
  step_order: number;
  step_type: ApprovalStepType;
  step_name?: string;
  approvers: Approver[];
  required_approvals: number;
  timeout_seconds: number;
  escalation_on_timeout: boolean;
  source_rule_id?: string;
  instructions?: string;
}

/**
 * Action context describing the action being requested
 */
export interface ActionContext {
  action_type: string;
  resource_id: string;
  resource_type: string;
  operation: string;
  details?: Record<string, unknown>;
}

/**
 * Requester information for approval routing
 */
export interface ApprovalRequester {
  id: string;
  email: string;
  roles: string[];
  department: string;
  manager_id?: string;
  cost_center?: string;
}

/**
 * Routing metadata providing details about the routing decision
 */
export interface RoutingMetadata {
  rules_evaluated: string[];
  rules_matched: string[];
  auto_approve_reason?: string;
  escalation_reason?: string;
  bypass_reason?: string;
  risk_score?: number;
  compliance_tags?: string[];
  audit_ref?: string;
}

/**
 * Input for approval routing requests
 */
export interface ApprovalRoutingInput {
  request_id: string;
  action_context: ActionContext;
  requester: ApprovalRequester;
  approval_rules?: string[];
  priority?: ApprovalPriority;
  metadata?: Record<string, unknown>;
  dry_run?: boolean;
  trace?: boolean;
}

/**
 * Output from approval routing evaluation
 */
export interface ApprovalRoutingOutput {
  decision: ApprovalDecisionOutcome;
  required_approvers: Approver[];
  approval_chain: ApprovalChainStep[];
  timeout_seconds: number;
  escalation_path: EscalationLevel[];
  justification_required: boolean;
  routing_metadata: RoutingMetadata;
  evaluation_time_ms: number;
}

/**
 * ApprovalDecisionEvent - Core output contract for Approval Routing Agent
 *
 * This schema MUST be emitted exactly ONCE per ApprovalRoutingAgent invocation.
 * It is persisted to ruvector-service for audit, analytics, and governance.
 */
export interface ApprovalDecisionEvent {
  event_id: string;
  agent_id: string;
  agent_version: string;
  decision_type: 'approval_routing_decision';
  inputs_hash: string;
  outputs: ApprovalRoutingOutput;
  confidence: number;
  rules_applied: ApprovalRule[];
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
    sla_tier?: string;
  };
}

/**
 * Status check response
 */
export interface ApprovalStatusResponse {
  approval_request_id: string;
  request_id?: string;
  status: ApprovalStatus;
  decision: ApprovalDecisionOutcome;
  approvers: Approver[];
  escalation_level?: number;
  time_remaining_seconds?: number;
  current_step?: number;
  total_steps?: number;
  approvals_received?: Array<{
    approver_id: string;
    approver_name: string;
    decision: string;
    timestamp: string;
    comments?: string;
  }>;
  updated_at: string;
  created_at: string;
}

/**
 * Approval Routing Agent registration
 */
export type ApprovalRoutingAgentRegistration = AgentRegistration;
