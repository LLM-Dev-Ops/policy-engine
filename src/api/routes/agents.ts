/**
 * Agent API Routes
 *
 * REST API routes for the Policy Enforcement Agent.
 * These routes expose the agent as HTTP endpoints for deployment
 * as Google Cloud Edge Functions.
 */
import { Router } from 'express';
import {
  handleEvaluate,
  handleResolve,
  handleRoute,
  handleInfo,
  handleHealth,
} from '../../agents/policy-enforcement/handler';

const router = Router();

/**
 * POST /api/agent/evaluate
 *
 * Evaluate a request against policy rules.
 *
 * Request Body:
 * {
 *   "context": { ... },
 *   "policy_ids": ["policy-1", "policy-2"],
 *   "dry_run": false,
 *   "trace": false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { DecisionEvent }
 * }
 */
router.post('/evaluate', handleEvaluate);

/**
 * POST /api/agent/resolve
 *
 * Resolve constraint conflicts for a given context.
 * Always enables trace mode for detailed conflict resolution.
 *
 * Request Body:
 * {
 *   "context": { ... },
 *   "policy_ids": ["policy-1"],
 *   "dry_run": false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { DecisionEvent with trace }
 * }
 */
router.post('/resolve', handleResolve);

/**
 * POST /api/agent/route
 *
 * Route a decision to appropriate enforcement layers.
 * Returns decision with routing metadata.
 *
 * Request Body:
 * {
 *   "context": { ... },
 *   "policy_ids": ["policy-1"],
 *   "dry_run": false,
 *   "trace": false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { DecisionEvent with routing_targets }
 * }
 */
router.post('/route', handleRoute);

/**
 * GET /api/agent/info
 *
 * Get agent registration information.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { AgentRegistration }
 * }
 */
router.get('/info', handleInfo);

/**
 * GET /api/agent/health
 *
 * Agent health check endpoint.
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "agent_id": "policy-enforcement-agent",
 *   "agent_version": "1.0.0",
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 */
router.get('/health', handleHealth);

export default router;
