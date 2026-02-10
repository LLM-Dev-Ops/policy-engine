/**
 * Agentics Execution System
 *
 * This module instruments the policy-engine repository as a Foundational
 * Execution Unit within the Agentics execution system. It provides:
 *
 * - Execution context validation and propagation
 * - Repo-level and agent-level span creation
 * - Artifact attachment to spans
 * - Express middleware for context enforcement
 * - Agent execution wrappers with span management
 * - Invariant enforcement (no silent execution)
 */

// Types
export {
  ExecutionContext,
  SpanStatus,
  ExecutionSpan,
  Artifact,
  ExecutionResult,
} from './types';

// Errors
export { ExecutionContextError, ExecutionInvariantError } from './errors';

// Span management
export {
  createRepoSpan,
  createAgentSpan,
  finalizeSpan,
  attachArtifact,
} from './spans';

// Context validation
export {
  validateExecutionContext,
  extractExecutionContext,
  EXECUTION_ID_HEADER,
  PARENT_SPAN_ID_HEADER,
} from './context';

// Middleware
export { executionContextMiddleware } from './middleware';

// Executor
export { executeAgent, buildExecutionResult } from './executor';
export type { AgentExecutionResult } from './executor';
