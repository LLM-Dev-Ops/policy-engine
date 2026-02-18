/**
 * Internal Evaluation Routes
 *
 * Unauthenticated endpoint for internal Cloud Run-to-Cloud Run calls.
 * Perimeter security is handled by Cloud Run IAM — these endpoints
 * MUST NOT be exposed to the public internet without IAM ingress controls.
 *
 * Mirrors the evaluation logic of /api/evaluate without Agentics identity
 * verification or scope checks.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { PolicyRepository } from '@db/models/policy-repository';
import { EvaluationRepository } from '@db/models/evaluation-repository';
import { PolicyEngine } from '@core/engine/policy-engine';
import { cacheManager } from '@cache/cache-manager';
import { asyncHandler } from '../middleware/error-handler';
import logger from '@utils/logger';
import { PolicyEvaluationRequest, PolicyEvaluationResponse } from '../../types/policy';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { recordEvaluation, recordDecision } from '../../security/metrics';

const router = Router();
const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();

/**
 * Add correlation ID to all internal requests
 */
function addCorrelationId(req: Request, _res: Response, next: NextFunction): void {
  (req as any).correlationId =
    req.get('x-correlation-id') || req.get('x-request-id') || `pe-internal-${uuidv4()}`;
  next();
}

router.use(addCorrelationId);

/**
 * POST /api/v1/internal/evaluate
 *
 * Internal policy evaluation — no auth required.
 * Cloud Run IAM handles perimeter security.
 */
router.post(
  '/evaluate',
  asyncHandler(async (req: Request, res: Response) => {
    const correlationId = (req as any).correlationId;
    const internalSource = req.get('x-internal-source') || 'unknown';

    logger.info(
      {
        correlationId,
        source: internalSource,
        path: req.originalUrl,
      },
      'Internal policy evaluation request',
    );

    const { context, policies, trace = false, dryRun = false, useCache = true } = req.body;

    if (!context) {
      res.status(400).json({
        error: 'MISSING_CONTEXT',
        message: 'Evaluation context is required',
        correlationId,
      });
      return;
    }

    const requestId = uuidv4();
    const startTime = Date.now();

    const request: PolicyEvaluationRequest = {
      requestId,
      context,
      policies,
      trace,
      dryRun,
    };

    let response: PolicyEvaluationResponse;
    let cached = false;

    if (useCache && !trace && !dryRun) {
      const cacheKey = generateCacheKey(context, policies);
      const cachedResult = await cacheManager.get<PolicyEvaluationResponse>(cacheKey);

      if (cachedResult) {
        logger.info(
          {
            correlationId,
            requestId,
            cached: true,
            source: internalSource,
          },
          'Returning cached internal evaluation',
        );

        res.json({
          ...cachedResult,
          requestId,
          cached: true,
          correlationId,
        });
        return;
      }

      const activePolicies = await policyRepository.findActive();
      const engine = new PolicyEngine(activePolicies);
      response = await engine.evaluate(request);
      cached = true;

      await cacheManager.set(cacheKey, response, 60);
    } else {
      const activePolicies = await policyRepository.findActive();
      const engine = new PolicyEngine(activePolicies);
      response = await engine.evaluate(request);
    }

    const evaluationTimeMs = Date.now() - startTime;

    if (!dryRun) {
      await evaluationRepository.log(request, response);
    }

    // Record metrics
    for (const policyId of response.decision.matchedPolicies || []) {
      recordEvaluation(
        policyId,
        response.decision.decision,
        'internal',
        evaluationTimeMs,
        cached,
      );
    }

    recordDecision(response.decision.decision, 'internal', 'evaluation');

    logger.info(
      {
        correlationId,
        requestId,
        decision: response.decision.decision,
        allowed: response.decision.allowed,
        evaluationTimeMs,
        matchedPolicies: response.decision.matchedPolicies?.length || 0,
        source: internalSource,
      },
      'Internal policy evaluation completed',
    );

    res.json({
      ...response,
      correlationId,
    });
  }),
);

/**
 * Generate cache key for evaluation
 */
function generateCacheKey(context: any, policies?: string[]): string {
  const data = JSON.stringify({ context, policies: policies?.sort() });
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return `evaluation:${hash}`;
}

export default router;
