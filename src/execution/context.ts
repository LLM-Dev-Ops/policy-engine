/**
 * Agentics Execution System - Context Validation
 *
 * Validates and extracts execution context from incoming requests.
 * The Core MUST provide execution_id and parent_span_id on every call.
 */
import { Request } from 'express';
import { ExecutionContext } from './types';
import { ExecutionContextError } from './errors';

/**
 * Header names for execution context propagation.
 */
export const EXECUTION_ID_HEADER = 'x-execution-id';
export const PARENT_SPAN_ID_HEADER = 'x-parent-span-id';

/**
 * Validate that an execution context object has all required fields.
 *
 * @throws ExecutionContextError if context is missing or invalid
 */
export function validateExecutionContext(ctx: unknown): asserts ctx is ExecutionContext {
  if (!ctx || typeof ctx !== 'object') {
    throw new ExecutionContextError('Execution context is required');
  }

  const context = ctx as Record<string, unknown>;

  if (!context.execution_id || typeof context.execution_id !== 'string') {
    throw new ExecutionContextError(
      'execution_id is required and must be a non-empty string',
      { received: context.execution_id },
    );
  }

  if (!context.parent_span_id || typeof context.parent_span_id !== 'string') {
    throw new ExecutionContextError(
      'parent_span_id is required and must be a non-empty string',
      { received: context.parent_span_id },
    );
  }
}

/**
 * Extract execution context from Express request headers.
 *
 * @param req - Express request object
 * @returns Validated ExecutionContext
 * @throws ExecutionContextError if headers are missing or invalid
 */
export function extractExecutionContext(req: Request): ExecutionContext {
  const executionId = req.headers[EXECUTION_ID_HEADER]?.toString();
  const parentSpanId = req.headers[PARENT_SPAN_ID_HEADER]?.toString();

  const context = {
    execution_id: executionId,
    parent_span_id: parentSpanId,
  };

  validateExecutionContext(context);

  return context as ExecutionContext;
}
