/**
 * Approval Routing Agent API Routes
 *
 * REST API routes for the Approval Routing Agent.
 * These routes expose the agent as HTTP endpoints for deployment
 * as Google Cloud Edge Functions.
 *
 * POST routes require execution context headers (x-execution-id,
 * x-parent-span-id) enforced by executionContextMiddleware.
 */
import { Router } from 'express';
import {
  handleEvaluate,
  handleRoute,
  handleResolve,
  handleStatus,
  handleInfo,
  handleHealth,
} from '../../agents/approval-routing/handler';
import { executionContextMiddleware } from '../../execution/middleware';

const router = Router();

/**
 * POST /api/approval-routing/evaluate
 *
 * Evaluate approval requirements for an action.
 * Requires: x-execution-id, x-parent-span-id headers
 *
 * Request Body:
 * {
 *   "action_context": {
 *     "action_type": "model_deployment",
 *     "resource_id": "model-123",
 *     "resource_type": "model",
 *     "operation": "deploy",
 *     "details": { ... }
 *   },
 *   "requester": {
 *     "id": "user-1",
 *     "email": "user@example.com",
 *     "roles": ["developer"],
 *     "department": "engineering"
 *   },
 *   "approval_rules": ["rule-1"],
 *   "priority": "normal",
 *   "dry_run": false,
 *   "trace": false
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ApprovalDecisionEvent },
 *   "execution": { repo_span, agent_spans }
 * }
 */
router.post('/evaluate', executionContextMiddleware, handleEvaluate);

/**
 * POST /api/approval-routing/route
 *
 * Route an action to appropriate approval workflow.
 * Requires: x-execution-id, x-parent-span-id headers
 *
 * Request Body:
 * {
 *   "action_context": { ... },
 *   "requester": { ... },
 *   "approval_rules": ["rule-1"],
 *   "priority": "normal"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ApprovalDecisionEvent },
 *   "execution": { repo_span, agent_spans }
 * }
 */
router.post('/route', executionContextMiddleware, handleRoute);

/**
 * POST /api/approval-routing/resolve
 *
 * Resolve approval conflicts for an action.
 * Returns decision with conflict resolution details.
 * Requires: x-execution-id, x-parent-span-id headers
 *
 * Request Body:
 * {
 *   "action_context": { ... },
 *   "requester": { ... },
 *   "approval_rules": ["rule-1", "rule-2"]
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ApprovalDecisionEvent with resolution details },
 *   "execution": { repo_span, agent_spans }
 * }
 */
router.post('/resolve', executionContextMiddleware, handleResolve);

/**
 * GET /api/approval-routing/status/:requestId
 *
 * Get status of an approval request.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ApprovalStatusResponse }
 * }
 */
router.get('/status/:requestId', handleStatus);

/**
 * GET /api/approval-routing/info
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
 * GET /api/approval-routing/health
 *
 * Agent health check endpoint.
 *
 * Response:
 * {
 *   "status": "healthy",
 *   "agent_id": "approval-routing-agent",
 *   "agent_version": "1.0.0",
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 */
router.get('/health', handleHealth);

export default router;
