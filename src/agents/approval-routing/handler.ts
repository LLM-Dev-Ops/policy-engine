/**
 * Approval Routing Agent - Edge Function Handler
 *
 * This handler is designed for deployment as a Google Cloud Edge Function.
 * It provides the HTTP interface for the Approval Routing Agent.
 *
 * DEPLOYMENT:
 * - Stateless execution
 * - No local persistence
 * - Deterministic behavior
 *
 * EXECUTION SYSTEM:
 * - All POST endpoints require execution context (x-execution-id, x-parent-span-id)
 * - Emits repo-level and agent-level spans per the Agentics contract
 * - Returns ExecutionResult with full span hierarchy
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApprovalRoutingAgent, AGENT_ID, AGENT_VERSION } from './agent';
import {
  ApprovalRoutingInput,
  ApprovalDecisionEvent,
  ActionContext,
  ApprovalRequester,
  ApprovalPriority,
} from '../contracts/approval-routing';
import { executeAgent, buildExecutionResult } from '../../execution/executor';
import { ExecutionSpan } from '../../execution/types';
import logger from '@utils/logger';

/**
 * HTTP Request body for evaluate endpoint
 */
interface EvaluateRequest {
  action_context: ActionContext;
  requester: ApprovalRequester;
  approval_rules?: string[];
  priority?: ApprovalPriority;
  metadata?: Record<string, unknown>;
  dry_run?: boolean;
  trace?: boolean;
}

/**
 * Validate the request body for evaluate/route/resolve
 */
function validateRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const request = body as EvaluateRequest;

  if (!request.action_context || typeof request.action_context !== 'object') {
    return { valid: false, error: 'action_context is required and must be an object' };
  }

  const ctx = request.action_context;
  if (!ctx.action_type || !ctx.resource_id || !ctx.resource_type || !ctx.operation) {
    return {
      valid: false,
      error: 'action_context must include action_type, resource_id, resource_type, and operation',
    };
  }

  if (!request.requester || typeof request.requester !== 'object') {
    return { valid: false, error: 'requester is required and must be an object' };
  }

  const req = request.requester;
  if (!req.id || !req.email || !req.roles || !req.department) {
    return {
      valid: false,
      error: 'requester must include id, email, roles (array), and department',
    };
  }

  return { valid: true };
}

/**
 * Create Approval Routing Agent instance
 */
function createAgent(): ApprovalRoutingAgent {
  return new ApprovalRoutingAgent();
}

/**
 * Build ApprovalRoutingInput from request body
 */
function buildInput(requestId: string, body: EvaluateRequest): ApprovalRoutingInput {
  return {
    request_id: requestId,
    action_context: body.action_context,
    requester: body.requester,
    approval_rules: body.approval_rules,
    priority: body.priority,
    metadata: body.metadata,
    dry_run: body.dry_run,
    trace: body.trace,
  };
}

/**
 * Approval decision event artifact extractor for span attachment
 */
function extractApprovalArtifact(event: ApprovalDecisionEvent) {
  return {
    id: event.event_id,
    type: 'approval_decision_event',
    reference: event.event_id,
  };
}

/**
 * Edge Function Handler: POST /approval-routing/evaluate
 *
 * Evaluate approval requirements for an action.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleEvaluate(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/approval-routing/evaluate' }, 'Handling evaluate request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as EvaluateRequest;
    const input = buildInput(requestId, body);

    // Execute agent with span tracking
    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = createAgent();
        return agent.evaluate(input);
      },
      extractApprovalArtifact,
    );

    const result = buildExecutionResult(repoSpan, [agentSpan], decisionEvent);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ requestId, error }, 'Evaluate request failed');

    const result = buildExecutionResult(repoSpan, [], undefined, {
      code: 'EVALUATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
    res.status(500).json(result);
  }
}

/**
 * Edge Function Handler: POST /approval-routing/route
 *
 * Route an action to appropriate approval workflow.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleRoute(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/approval-routing/route' }, 'Handling route request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as EvaluateRequest;
    const input = buildInput(requestId, body);

    // Execute agent with span tracking
    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = createAgent();
        return agent.route(input);
      },
      extractApprovalArtifact,
    );

    const result = buildExecutionResult(repoSpan, [agentSpan], decisionEvent);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ requestId, error }, 'Route request failed');

    const result = buildExecutionResult(repoSpan, [], undefined, {
      code: 'ROUTING_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
    res.status(500).json(result);
  }
}

/**
 * Edge Function Handler: POST /approval-routing/resolve
 *
 * Resolve approval conflicts for an action.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleResolve(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/approval-routing/resolve' }, 'Handling resolve request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as EvaluateRequest;
    const input = buildInput(requestId, body);

    // Execute agent with span tracking
    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = createAgent();
        return agent.resolve(input);
      },
      extractApprovalArtifact,
    );

    const result = buildExecutionResult(repoSpan, [agentSpan], decisionEvent);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ requestId, error }, 'Resolve request failed');

    const result = buildExecutionResult(repoSpan, [], undefined, {
      code: 'RESOLUTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
    res.status(500).json(result);
  }
}

/**
 * Edge Function Handler: GET /approval-routing/status/:requestId
 *
 * Get status of an approval request.
 */
export async function handleStatus(req: Request, res: Response): Promise<void> {
  const approvalRequestId = req.params.requestId;
  const logRequestId = req.headers['x-request-id']?.toString() || uuidv4();

  logger.info(
    { requestId: logRequestId, approvalRequestId, path: '/approval-routing/status' },
    'Handling status request',
  );

  try {
    if (!approvalRequestId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request ID is required',
        },
      });
      return;
    }

    // Create agent and get status
    const agent = createAgent();
    const status = await agent.getStatus(approvalRequestId);

    if (!status) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Approval request not found: ${approvalRequestId}`,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error({ requestId: logRequestId, error }, 'Status request failed');

    res.status(500).json({
      success: false,
      error: {
        code: 'STATUS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
    });
  }
}

/**
 * Edge Function Handler: GET /approval-routing/info
 *
 * Get agent registration information.
 */
export async function handleInfo(_req: Request, res: Response): Promise<void> {
  try {
    const registration = ApprovalRoutingAgent.getRegistration();

    res.status(200).json({
      success: true,
      data: registration,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INFO_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

/**
 * Edge Function Handler: GET /approval-routing/health
 *
 * Agent health check endpoint.
 */
export async function handleHealth(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'healthy',
    agent_id: AGENT_ID,
    agent_version: AGENT_VERSION,
    timestamp: new Date().toISOString(),
  });
}
