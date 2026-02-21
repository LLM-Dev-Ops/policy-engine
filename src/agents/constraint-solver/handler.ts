/**
 * Constraint Solver Agent - Edge Function Handler
 *
 * This handler is designed for deployment as a Google Cloud Edge Function.
 * It provides the HTTP interface for the Constraint Solver Agent.
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
import {
  ConstraintSolverAgent,
  AGENT_ID,
  AGENT_VERSION,
} from './agent';
import { ConstraintSolverInput, ConstraintDecisionEvent } from '../contracts/constraint-solver';
import { PolicyRepository } from '../../db/models/policy-repository';
import { executeAgent, buildExecutionResult } from '../../execution/executor';
import { ExecutionSpan } from '../../execution/types';
import logger from '@utils/logger';

/**
 * HTTP Request body for resolve endpoint
 */
interface ResolveRequest {
  context: ConstraintSolverInput['context'];
  constraint_ids?: string[];
  policy_ids?: string[];
  dry_run?: boolean;
  trace?: boolean;
}

/**
 * Validate the request body
 */
function validateRequest(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const request = body as ResolveRequest;

  if (!request.context || typeof request.context !== 'object') {
    return { valid: false, error: 'context is required and must be an object' };
  }

  return { valid: true };
}

/**
 * Create Constraint Solver Agent instance with loaded policies
 */
async function createAgentWithPolicies(): Promise<ConstraintSolverAgent> {
  const repository = new PolicyRepository();
  const policies = await repository.findActive();
  return new ConstraintSolverAgent(policies);
}

/**
 * Decision event artifact extractor for span attachment
 */
function extractDecisionArtifact(event: ConstraintDecisionEvent) {
  return {
    id: event.event_id,
    type: 'constraint_decision_event',
    reference: event.event_id,
  };
}

/**
 * Edge Function Handler: POST /constraint-solver/resolve
 *
 * Resolve constraint conflicts for a given context.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleResolve(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/constraint-solver/resolve' }, 'Handling resolve request');

  try {
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as ResolveRequest;

    const input: ConstraintSolverInput = {
      request_id: requestId,
      context: body.context,
      constraint_ids: body.constraint_ids,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: body.trace,
    };

    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = await createAgentWithPolicies();
        return agent.resolve(input);
      },
      extractDecisionArtifact,
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
 * Edge Function Handler: POST /constraint-solver/analyze
 *
 * Analyze constraints without resolving.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleAnalyze(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/constraint-solver/analyze' }, 'Handling analyze request');

  try {
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as ResolveRequest;

    const input: ConstraintSolverInput = {
      request_id: requestId,
      context: body.context,
      constraint_ids: body.constraint_ids,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: body.trace,
    };

    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = await createAgentWithPolicies();
        return agent.analyze(input);
      },
      extractDecisionArtifact,
    );

    const result = buildExecutionResult(repoSpan, [agentSpan], decisionEvent);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ requestId, error }, 'Analyze request failed');

    const result = buildExecutionResult(repoSpan, [], undefined, {
      code: 'ANALYSIS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
    res.status(500).json(result);
  }
}

/**
 * Edge Function Handler: POST /constraint-solver/explain
 *
 * Explain constraint relationships and conflicts.
 * Requires execution context headers (enforced by middleware).
 */
export async function handleExplain(req: Request, res: Response): Promise<void> {
  const requestId = req.headers['x-request-id']?.toString() || uuidv4();
  const repoSpan: ExecutionSpan = res.locals.repoSpan;

  logger.info({ requestId, path: '/constraint-solver/explain' }, 'Handling explain request');

  try {
    const validation = validateRequest(req.body);
    if (!validation.valid) {
      const result = buildExecutionResult(repoSpan, [], undefined, {
        code: 'INVALID_REQUEST',
        message: validation.error!,
      });
      res.status(400).json(result);
      return;
    }

    const body = req.body as ResolveRequest;

    const input: ConstraintSolverInput = {
      request_id: requestId,
      context: body.context,
      constraint_ids: body.constraint_ids,
      policy_ids: body.policy_ids,
      dry_run: body.dry_run,
      trace: true,
    };

    const { data: decisionEvent, agentSpan } = await executeAgent(
      repoSpan,
      AGENT_ID,
      async () => {
        const agent = await createAgentWithPolicies();
        return agent.explain(input);
      },
      extractDecisionArtifact,
    );

    const result = buildExecutionResult(repoSpan, [agentSpan], decisionEvent);
    res.status(200).json(result);
  } catch (error) {
    logger.error({ requestId, error }, 'Explain request failed');

    const result = buildExecutionResult(repoSpan, [], undefined, {
      code: 'EXPLANATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: process.env.NODE_ENV === 'development' ? error : undefined,
    });
    res.status(500).json(result);
  }
}

/**
 * Edge Function Handler: GET /constraint-solver/info
 *
 * Get agent registration information.
 */
export async function handleInfo(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    success: true,
    data: ConstraintSolverAgent.getRegistration(),
  });
}

/**
 * Edge Function Handler: GET /constraint-solver/health
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
