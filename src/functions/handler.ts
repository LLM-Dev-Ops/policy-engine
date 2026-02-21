/**
 * Cloud Function Entry Point: policy-engine-agents
 *
 * Single HTTP Cloud Function serving all 3 policy engine agents:
 * - Policy Enforcement Agent  → /v1/policy-engine/enforce
 * - Constraint Solver Agent   → /v1/policy-engine/constraints
 * - Approval Routing Agent    → /v1/policy-engine/approval
 * - Health endpoint           → /v1/policy-engine/health
 *
 * DEPLOYMENT:
 *   gcloud functions deploy policy-engine-agents \
 *     --runtime nodejs20 --trigger-http --region us-central1 \
 *     --project agentics-dev --entry-point handler \
 *     --memory 512MB --timeout 30s --no-allow-unauthenticated
 *
 * RESPONSE ENVELOPE:
 *   Every response includes execution_metadata and layers_executed
 *   per the Agentics Cloud Function contract.
 */
import express, { Request, Response, NextFunction } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'crypto';

import {
  handleEvaluate as enforceEvaluate,
  handleResolve as enforceResolve,
  handleRoute as enforceRoute,
  handleInfo as enforceInfo,
  handleHealth as enforceHealth,
} from '../agents/policy-enforcement/handler';

import {
  handleResolve as constraintsResolve,
  handleAnalyze as constraintsAnalyze,
  handleExplain as constraintsExplain,
  handleInfo as constraintsInfo,
  handleHealth as constraintsHealth,
} from '../agents/constraint-solver/handler';

import {
  handleEvaluate as approvalEvaluate,
  handleRoute as approvalRoute,
  handleResolve as approvalResolve,
  handleStatus as approvalStatus,
  handleInfo as approvalInfo,
  handleHealth as approvalHealth,
} from '../agents/approval-routing/handler';

import { executionContextMiddleware } from '../execution/middleware';
import { errorHandler, notFoundHandler } from '../api/middleware/error-handler';
import logger from '../utils/logger';

/**
 * Allowed CORS origins for Cloud Function deployment
 */
const ALLOWED_ORIGINS = [
  'https://agentics-dev.web.app',
  'https://agentics-dev.firebaseapp.com',
  'https://us-central1-agentics-dev.cloudfunctions.net',
];

if (process.env.NODE_ENV === 'development') {
  ALLOWED_ORIGINS.push('http://localhost:3000', 'http://localhost:8080');
}

const SERVICE_NAME = 'policy-engine-agents';

/**
 * Build execution_metadata for every response
 */
function buildExecutionMetadata(req: Request): {
  trace_id: string;
  timestamp: string;
  service: string;
  execution_id: string;
} {
  return {
    trace_id: (req.headers['x-correlation-id'] as string) || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    service: SERVICE_NAME,
    execution_id: crypto.randomUUID(),
  };
}

/**
 * Middleware that wraps agent responses with execution_metadata and layers_executed
 */
function executionEnvelopeMiddleware(agentName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const metadata = buildExecutionMetadata(req);

    // Store metadata on locals for access
    res.locals._cf_metadata = metadata;
    res.locals._cf_agent = agentName;
    res.locals._cf_start = startTime;

    // Override res.json to wrap the response
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      const elapsed = Date.now() - startTime;

      const envelope = {
        ...(typeof body === 'object' && body !== null ? body : { data: body }),
        execution_metadata: metadata,
        layers_executed: [
          { layer: 'AGENT_ROUTING', status: 'completed' },
          { layer: `POLICY_ENGINE_${agentName.toUpperCase()}`, status: 'completed', duration_ms: elapsed },
        ],
      };

      return originalJson(envelope);
    };

    next();
  };
}

/**
 * Create the Cloud Function Express app
 */
function createFunctionApp(): express.Express {
  const app = express();

  // Security & parsing
  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, Cloud Scheduler, etc.)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error('CORS: origin not allowed'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Correlation-Id',
      'X-Request-Id',
      'X-Execution-Id',
      'X-Parent-Span-Id',
    ],
    credentials: true,
    maxAge: 3600,
  }));
  app.use(bodyParser.json({ limit: '10mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info(
      { method: req.method, path: req.path, correlationId: req.headers['x-correlation-id'] },
      'Cloud Function request',
    );
    next();
  });

  // ──────────────────────────────────────────────
  // Health endpoint (no execution context required)
  // ──────────────────────────────────────────────
  app.get('/v1/policy-engine/health', (req: Request, res: Response) => {
    const metadata = buildExecutionMetadata(req);

    res.status(200).json({
      status: 'healthy',
      service: SERVICE_NAME,
      timestamp: metadata.timestamp,
      agents: ['enforce', 'constraints', 'approval'],
      execution_metadata: metadata,
      layers_executed: [
        { layer: 'AGENT_ROUTING', status: 'completed' },
        { layer: 'POLICY_ENGINE_HEALTH', status: 'completed', duration_ms: 0 },
      ],
    });
  });

  // ──────────────────────────────────────────────
  // Policy Enforcement Agent → /v1/policy-engine/enforce
  // ──────────────────────────────────────────────
  const enforceRouter = express.Router();
  enforceRouter.post('/evaluate', executionContextMiddleware, executionEnvelopeMiddleware('enforce'), enforceEvaluate);
  enforceRouter.post('/resolve', executionContextMiddleware, executionEnvelopeMiddleware('enforce'), enforceResolve);
  enforceRouter.post('/route', executionContextMiddleware, executionEnvelopeMiddleware('enforce'), enforceRoute);
  enforceRouter.get('/info', executionEnvelopeMiddleware('enforce'), enforceInfo);
  enforceRouter.get('/health', executionEnvelopeMiddleware('enforce'), enforceHealth);
  app.use('/v1/policy-engine/enforce', enforceRouter);

  // ──────────────────────────────────────────────
  // Constraint Solver Agent → /v1/policy-engine/constraints
  // ──────────────────────────────────────────────
  const constraintsRouter = express.Router();
  constraintsRouter.post('/resolve', executionContextMiddleware, executionEnvelopeMiddleware('constraints'), constraintsResolve);
  constraintsRouter.post('/analyze', executionContextMiddleware, executionEnvelopeMiddleware('constraints'), constraintsAnalyze);
  constraintsRouter.post('/explain', executionContextMiddleware, executionEnvelopeMiddleware('constraints'), constraintsExplain);
  constraintsRouter.get('/info', executionEnvelopeMiddleware('constraints'), constraintsInfo);
  constraintsRouter.get('/health', executionEnvelopeMiddleware('constraints'), constraintsHealth);
  app.use('/v1/policy-engine/constraints', constraintsRouter);

  // ──────────────────────────────────────────────
  // Approval Routing Agent → /v1/policy-engine/approval
  // ──────────────────────────────────────────────
  const approvalRouter = express.Router();
  approvalRouter.post('/evaluate', executionContextMiddleware, executionEnvelopeMiddleware('approval'), approvalEvaluate);
  approvalRouter.post('/route', executionContextMiddleware, executionEnvelopeMiddleware('approval'), approvalRoute);
  approvalRouter.post('/resolve', executionContextMiddleware, executionEnvelopeMiddleware('approval'), approvalResolve);
  approvalRouter.get('/status/:requestId', executionEnvelopeMiddleware('approval'), approvalStatus);
  approvalRouter.get('/info', executionEnvelopeMiddleware('approval'), approvalInfo);
  approvalRouter.get('/health', executionEnvelopeMiddleware('approval'), approvalHealth);
  app.use('/v1/policy-engine/approval', approvalRouter);

  // ──────────────────────────────────────────────
  // Root info
  // ──────────────────────────────────────────────
  app.get('/', (req: Request, res: Response) => {
    const metadata = buildExecutionMetadata(req);

    res.status(200).json({
      service: SERVICE_NAME,
      version: '1.0.0',
      agents: {
        enforce: '/v1/policy-engine/enforce',
        constraints: '/v1/policy-engine/constraints',
        approval: '/v1/policy-engine/approval',
      },
      health: '/v1/policy-engine/health',
      execution_metadata: metadata,
      layers_executed: [
        { layer: 'AGENT_ROUTING', status: 'completed' },
      ],
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/**
 * Cloud Function HTTP handler
 *
 * This is the entry-point referenced by:
 *   gcloud functions deploy policy-engine-agents --entry-point handler
 */
const app = createFunctionApp();

export const handler = app;
