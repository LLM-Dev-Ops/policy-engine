/**
 * Hardened Evaluation Routes
 *
 * Enterprise-grade policy evaluation endpoints with:
 * - Agentics-only identity verification
 * - Post-auth rate limiting
 * - Correlation ID tracking
 * - Enterprise metrics
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

// Security modules
import {
  requireAgenticsIdentity,
  requireReadScope,
  requireAdminScope,
  AuthenticatedRequest,
  getActorIdentity,
} from '../../security/agentics-identity';
import {
  evaluationRateLimiter,
  readRateLimiter,
  strictRateLimiter,
} from '../../security/rate-limiter';
import {
  recordEvaluation,
  recordDecision,
} from '../../security/metrics';

const router = Router();
const policyRepository = new PolicyRepository();
const evaluationRepository = new EvaluationRepository();

/**
 * Add correlation ID to all requests
 */
function addCorrelationId(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.correlationId) {
    authReq.correlationId = req.get('x-correlation-id') || uuidv4();
  }
  next();
}

router.use(addCorrelationId);

/**
 * POST /api/evaluate
 * Evaluate policies against context
 */
router.post(
  '/',
  requireAgenticsIdentity,
  requireReadScope,
  evaluationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { context, policies, trace = false, dryRun = false, useCache = true } = req.body;

    if (!context) {
      res.status(400).json({
        error: 'MISSING_CONTEXT',
        message: 'Evaluation context is required',
        correlationId: authReq.correlationId,
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
        logger.info({
          correlationId: authReq.correlationId,
          requestId,
          cached: true,
          actor: getActorIdentity(authReq.identity),
        }, 'Returning cached evaluation');

        res.json({
          ...cachedResult,
          requestId,
          cached: true,
          correlationId: authReq.correlationId,
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
        'default', // namespace
        evaluationTimeMs,
        cached,
      );
    }

    recordDecision(
      response.decision.decision,
      'default', // namespace
      'evaluation',
    );

    logger.info({
      correlationId: authReq.correlationId,
      requestId,
      decision: response.decision.decision,
      allowed: response.decision.allowed,
      evaluationTimeMs,
      matchedPolicies: response.decision.matchedPolicies?.length || 0,
      actor: getActorIdentity(authReq.identity),
    }, 'Policy evaluation completed');

    res.json({
      ...response,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * POST /api/evaluate/batch
 * Batch evaluate multiple contexts
 */
router.post(
  '/batch',
  requireAgenticsIdentity,
  requireReadScope,
  evaluationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { contexts, policies, trace = false, dryRun = false } = req.body;

    if (!contexts || !Array.isArray(contexts)) {
      res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'contexts must be an array',
        correlationId: authReq.correlationId,
      });
      return;
    }

    if (contexts.length > 100) {
      res.status(400).json({
        error: 'BATCH_SIZE_EXCEEDED',
        message: 'Maximum batch size is 100',
        correlationId: authReq.correlationId,
      });
      return;
    }

    const startTime = Date.now();
    const activePolicies = await policyRepository.findActive();
    const engine = new PolicyEngine(activePolicies);

    const results = await Promise.all(
      contexts.map(async (context) => {
        const requestId = uuidv4();
        const request: PolicyEvaluationRequest = {
          requestId,
          context,
          policies,
          trace,
          dryRun,
        };

        const response = await engine.evaluate(request);

        if (!dryRun) {
          await evaluationRepository.log(request, response);
        }

        return response;
      }),
    );

    const evaluationTimeMs = Date.now() - startTime;

    // Record aggregated metrics
    const allowedCount = results.filter(r => r.decision.allowed).length;
    const deniedCount = results.length - allowedCount;

    logger.info({
      correlationId: authReq.correlationId,
      batchSize: contexts.length,
      evaluationTimeMs,
      allowedCount,
      deniedCount,
      actor: getActorIdentity(authReq.identity),
    }, 'Batch evaluation completed');

    res.json({
      results,
      count: results.length,
      summary: {
        allowed: allowedCount,
        denied: deniedCount,
        evaluationTimeMs,
      },
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/evaluate/history
 * Get evaluation history
 */
router.get(
  '/history',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const {
      requestId,
      policyId,
      decision,
      allowed,
      startDate,
      endDate,
      limit = '100',
      offset = '0',
    } = req.query;

    const filters: any = {
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    };

    if (requestId) filters.requestId = requestId as string;
    if (policyId) filters.policyIds = [policyId as string];
    if (decision) filters.decision = decision as string;
    if (allowed !== undefined) filters.allowed = allowed === 'true';
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const evaluations = await evaluationRepository.find(filters);

    logger.info({
      correlationId: authReq.correlationId,
      count: evaluations.length,
      filters: { requestId, policyId, decision, allowed },
      actor: getActorIdentity(authReq.identity),
    }, 'Evaluation history retrieved');

    res.json({
      evaluations,
      count: evaluations.length,
      limit: filters.limit,
      offset: filters.offset,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/evaluate/history/:requestId
 * Get specific evaluation by request ID
 */
router.get(
  '/history/:requestId',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { requestId } = req.params;

    const evaluation = await evaluationRepository.findByRequestId(requestId);

    if (!evaluation) {
      res.status(404).json({
        error: 'EVALUATION_NOT_FOUND',
        message: `Evaluation not found: ${requestId}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    logger.info({
      correlationId: authReq.correlationId,
      requestId,
      actor: getActorIdentity(authReq.identity),
    }, 'Evaluation retrieved');

    res.json({
      evaluation,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/evaluate/stats
 * Get evaluation statistics
 */
router.get(
  '/stats',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { days = '7' } = req.query;

    const daysNum = parseInt(days as string, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const stats = await evaluationRepository.getStats(startDate);

    logger.info({
      correlationId: authReq.correlationId,
      days: daysNum,
      actor: getActorIdentity(authReq.identity),
    }, 'Evaluation stats retrieved');

    res.json({
      stats,
      period: { days: daysNum, startDate },
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * DELETE /api/evaluate/history
 * Delete old evaluation history (admin only)
 */
router.delete(
  '/history',
  requireAgenticsIdentity,
  requireAdminScope,
  strictRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { days = '90' } = req.query;

    const daysNum = parseInt(days as string, 10);

    // Safety check: don't delete less than 30 days old data
    if (daysNum < 30) {
      res.status(400).json({
        error: 'INVALID_RETENTION_PERIOD',
        message: 'Minimum retention period is 30 days',
        correlationId: authReq.correlationId,
      });
      return;
    }

    const deletedCount = await evaluationRepository.deleteOlderThan(daysNum);

    logger.info({
      correlationId: authReq.correlationId,
      deletedCount,
      days: daysNum,
      actor: getActorIdentity(authReq.identity),
    }, 'Old evaluations deleted');

    res.json({
      deletedCount,
      days: daysNum,
      correlationId: authReq.correlationId,
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
