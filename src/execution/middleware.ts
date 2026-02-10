/**
 * Agentics Execution System - Express Middleware
 *
 * Validates execution context on incoming requests, creates the
 * repo-level span, and attaches both to the request for downstream handlers.
 *
 * This middleware MUST be applied to all externally-invoked execution
 * endpoints (POST routes that trigger agent logic).
 */
import { Request, Response, NextFunction } from 'express';
import { extractExecutionContext } from './context';
import { createRepoSpan } from './spans';
import { ExecutionContextError } from './errors';
import logger from '../utils/logger';

/**
 * Express middleware that enforces execution context requirements.
 *
 * On success:
 * - Sets res.locals.executionContext (ExecutionContext)
 * - Sets res.locals.repoSpan (ExecutionSpan)
 *
 * On failure:
 * - Returns 400 with explicit error if parent_span_id is missing/invalid
 */
export function executionContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    const executionContext = extractExecutionContext(req);

    const repoSpan = createRepoSpan(executionContext.parent_span_id);

    res.locals.executionContext = executionContext;
    res.locals.repoSpan = repoSpan;

    logger.info(
      {
        execution_id: executionContext.execution_id,
        parent_span_id: executionContext.parent_span_id,
        repo_span_id: repoSpan.span_id,
      },
      'Execution context established',
    );

    next();
  } catch (error) {
    if (error instanceof ExecutionContextError) {
      res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }
    next(error);
  }
}
