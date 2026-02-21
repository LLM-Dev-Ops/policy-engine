/**
 * Constraint Solver Agent API Routes
 *
 * REST API routes for the Constraint Solver Agent.
 * These routes expose the agent as HTTP endpoints for deployment
 * as Google Cloud Edge Functions.
 *
 * POST routes require execution context headers (x-execution-id,
 * x-parent-span-id) enforced by executionContextMiddleware.
 */
import { Router } from 'express';
import {
  handleResolve,
  handleAnalyze,
  handleExplain,
  handleInfo,
  handleHealth,
} from '../../agents/constraint-solver/handler';
import { executionContextMiddleware } from '../../execution/middleware';

const router = Router();

/**
 * POST /api/constraint-solver/resolve
 *
 * Resolve constraint conflicts for a given context.
 * Requires: x-execution-id, x-parent-span-id headers
 */
router.post('/resolve', executionContextMiddleware, handleResolve);

/**
 * POST /api/constraint-solver/analyze
 *
 * Analyze constraints without resolving (dry-run with trace).
 * Requires: x-execution-id, x-parent-span-id headers
 */
router.post('/analyze', executionContextMiddleware, handleAnalyze);

/**
 * POST /api/constraint-solver/explain
 *
 * Explain constraint relationships and conflicts.
 * Requires: x-execution-id, x-parent-span-id headers
 */
router.post('/explain', executionContextMiddleware, handleExplain);

/**
 * GET /api/constraint-solver/info
 *
 * Get agent registration information.
 */
router.get('/info', handleInfo);

/**
 * GET /api/constraint-solver/health
 *
 * Agent health check endpoint.
 */
router.get('/health', handleHealth);

export default router;
