/**
 * Agentics Execution System - Error Classes
 *
 * Execution-specific errors for context validation and invariant enforcement.
 */
import { PolicyEngineError } from '../utils/errors';

/**
 * Thrown when execution context is missing or invalid.
 * Maps to HTTP 400 — the caller (Core) must provide valid context.
 */
export class ExecutionContextError extends PolicyEngineError {
  constructor(message: string, details?: unknown) {
    super(message, 'EXECUTION_CONTEXT_ERROR', 400, details);
    this.name = 'ExecutionContextError';
  }
}

/**
 * Thrown when an execution invariant is violated.
 * Maps to HTTP 500 — indicates a bug in the execution layer.
 */
export class ExecutionInvariantError extends PolicyEngineError {
  constructor(message: string, details?: unknown) {
    super(message, 'EXECUTION_INVARIANT_ERROR', 500, details);
    this.name = 'ExecutionInvariantError';
  }
}
