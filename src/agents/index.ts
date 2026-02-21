/**
 * LLM-Policy-Engine Agents
 *
 * Exports all agents and contracts for the policy engine.
 */

// Export core contracts
export * from './contracts/decision-event';
export * from './contracts/constraint-solver';

// Export execution system types for consumers
export type {
  ExecutionContext,
  ExecutionSpan,
  ExecutionResult,
  Artifact,
} from '../execution/types';

// Export Policy Enforcement Agent
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

// Export Constraint Solver Agent
export {
  ConstraintSolverAgent,
  AGENT_ID as CONSTRAINT_SOLVER_AGENT_ID,
  AGENT_VERSION as CONSTRAINT_SOLVER_AGENT_VERSION,
  DECISION_TYPE as CONSTRAINT_SOLVER_DECISION_TYPE,
} from './constraint-solver/agent';

// Export Constraint Solver handlers
export {
  handleResolve as constraintSolverHandleResolve,
  handleAnalyze as constraintSolverHandleAnalyze,
  handleExplain as constraintSolverHandleExplain,
  handleInfo as constraintSolverHandleInfo,
  handleHealth as constraintSolverHandleHealth,
} from './constraint-solver/handler';
