/**
 * Policy Enforcement Agent - Edge Function Handler
 *
 * This handler is designed for deployment as a Google Cloud Edge Function.
 * It provides the HTTP interface for the Policy Enforcement Agent.
 *
 * DEPLOYMENT:
 * - Stateless execution
 * - No local persistence
 * - Deterministic behavior
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  PolicyEnforcementAgent,
  AGENT_ID,
  AGENT_VERSION,
} from './agent';
import { PolicyEnforcementInput, DecisionEvent } from '../contracts/decision-event';
import { PolicyRepository } from '../../db/models/policy-repository';
import logger from '@utils/logger';

/**
 * HTTP Request body for evaluate endpoint
 */
interface EvaluateRequest {
  context: PolicyEnforcementInput['context'];
  policy_ids?: string[];
  dry_run?: boolean;
  trace?: boolean;
}

/**
 * HTTP Response body
 */
interface AgentResponse {
  success: boolean;
  data?: DecisionEvent;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Validate the request body
 */
function validateRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const request = body as EvaluateRequest;

  if (!request.context || typeof request.context !== 'object') {
    return { valid: false, error: 'context is required and must be an object' };
  }

  return { valid: true };
}

/**
 * Create Policy Enforcement Agent instance with loaded policies
 */
async function createAgentWithPolicies(): Promise<PolicyEnforcementAgent> {
  const repository = new PolicyRepository();
  const policies = await repository.findActive();
  return new PolicyEnforcementAgent(policies);
}

/**
 * Edge Function Handler: POST /agent/evaluate
 *
 * Evaluate a request against policy rules.
 */
export async function handleEvaluate(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();

  logger.info({ requestId, path: '/agent/evaluate' }, 'Handling evaluate request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: validation.error,
        },
      } as AgentResponse);
      return;
    }

    const body = req.body as EvaluateRequest;

    // Build input
    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context: body.context,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: body.trace,
    };

    // Create agent and evaluate
    const agent = await createAgentWithPolicies();
    const decisionEvent = await agent.evaluate(input);

    res.status(200).json({
      success: true,
      data: decisionEvent,
    } as AgentResponse);
  } catch (error) {
    logger.error({ requestId, error }, 'Evaluate request failed');

    res.status(500).json({
      success: false,
      error: {
        code: 'EVALUATION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
    } as AgentResponse);
  }
}

/**
 * Edge Function Handler: POST /agent/resolve
 *
 * Resolve constraint conflicts for a given context.
 */
export async function handleResolve(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();

  logger.info({ requestId, path: '/agent/resolve' }, 'Handling resolve request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: validation.error,
        },
      } as AgentResponse);
      return;
    }

    const body = req.body as EvaluateRequest;

    // Build input with trace enabled for resolution
    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context: body.context,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: true, // Always enable trace for resolve
    };

    // Create agent and resolve
    const agent = await createAgentWithPolicies();
    const decisionEvent = await agent.resolve(input);

    res.status(200).json({
      success: true,
      data: decisionEvent,
    } as AgentResponse);
  } catch (error) {
    logger.error({ requestId, error }, 'Resolve request failed');

    res.status(500).json({
      success: false,
      error: {
        code: 'RESOLUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
    } as AgentResponse);
  }
}

/**
 * Edge Function Handler: POST /agent/route
 *
 * Route a decision to appropriate enforcement layers.
 */
export async function handleRoute(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();

  logger.info({ requestId, path: '/agent/route' }, 'Handling route request');

  try {
    // Validate request
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: validation.error,
        },
      } as AgentResponse);
      return;
    }

    const body = req.body as EvaluateRequest;

    // Build input
    const input: PolicyEnforcementInput = {
      request_id: requestId,
      context: body.context,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: body.trace,
    };

    // Create agent and route
    const agent = await createAgentWithPolicies();
    const decisionEvent = await agent.route(input);

    res.status(200).json({
      success: true,
      data: decisionEvent,
    } as AgentResponse);
  } catch (error) {
    logger.error({ requestId, error }, 'Route request failed');

    res.status(500).json({
      success: false,
      error: {
        code: 'ROUTING_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
    } as AgentResponse);
  }
}

/**
 * Edge Function Handler: GET /agent/info
 *
 * Get agent registration information.
 */
export async function handleInfo(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    data: PolicyEnforcementAgent.getRegistration(),
  });
}

/**
 * Edge Function Handler: GET /agent/health
 *
 * Health check endpoint.
 */
export async function handleHealth(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'healthy',
    agent_id: AGENT_ID,
    agent_version: AGENT_VERSION,
    timestamp: new Date().toISOString(),
  });
}
