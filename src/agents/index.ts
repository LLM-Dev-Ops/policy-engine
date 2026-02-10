/**
 * LLM-Policy-Engine Agents
 *
 * Exports all agents and contracts for the policy engine.
 *
 * NOTE: Only the Policy Enforcement Agent is fully implemented.
 */

// Export core contracts
export * from './contracts/decision-event';

// Export execution system types for consumers
export type {
  ExecutionContext,
  ExecutionSpan,
  ExecutionResult,
  Artifact,
} from '../execution/types';

// Export Policy Enforcement Agent (fully implemented)
export {
  PolicyEnforcementAgent,
  AGENT_ID as POLICY_ENFORCEMENT_AGENT_ID,
  AGENT_VERSION as POLICY_ENFORCEMENT_AGENT_VERSION,
  DECISION_TYPE as POLICY_ENFORCEMENT_DECISION_TYPE,
} from './policy-enforcement/agent';

// Export Policy Enforcement handlers
export {
  handleEvaluate as policyEnforcementHandleEvaluate,
  handleResolve as policyEnforcementHandleResolve,
  handleRoute as policyEnforcementHandleRoute,
  handleInfo as policyEnforcementHandleInfo,
  handleHealth as policyEnforcementHandleHealth,
} from './policy-enforcement/handler';
