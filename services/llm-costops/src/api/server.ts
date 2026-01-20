/**
 * LLM-CostOps Unified API Server
 *
 * Single service exposing all CostOps agent endpoints.
 * Deployed as Google Cloud Run / Edge Functions.
 *
 * Endpoints:
 * - POST /api/v1/attribution - Cost Attribution Agent
 * - POST /api/v1/forecast - Cost Forecasting Agent
 * - POST /api/v1/budget - Budget Enforcement Agent
 * - POST /api/v1/roi - ROI Estimation Agent
 * - POST /api/v1/tradeoff - Cost-Performance Tradeoff Agent
 * - GET /health - Health check
 * - GET /ready - Readiness check
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { v4 as uuidv4 } from 'uuid';

import { config } from '../config';
import { logger, ruvectorClient } from '../utils';
import {
  costAttributionAgent,
  costForecastingAgent,
  budgetEnforcementAgent,
  roiEstimationAgent,
  costPerformanceTradeoffAgent,
} from '../agents';
import {
  CostAttributionInput,
  CostForecastInput,
  BudgetEnforcementInput,
  ROIEstimationInput,
  CostPerformanceTradeoffInput,
} from '../contracts';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.headers['x-request-id'] = requestId;

  logger.info({
    method: req.method,
    path: req.path,
    requestId,
  }, 'Incoming request');

  next();
});

// Error handling middleware
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error: err.message, stack: err.stack }, 'Request error');
  res.status(500).json({
    error: 'Internal server error',
    message: config.service.environment !== 'prod' ? err.message : undefined,
  });
};

// Health check
app.get('/health', async (_req: Request, res: Response) => {
  const ruvectorHealth = await ruvectorClient.healthCheck();

  const status = ruvectorHealth.status === 'healthy' ? 'healthy' : 'degraded';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    service: config.service.name,
    version: config.service.version,
    environment: config.service.environment,
    timestamp: new Date().toISOString(),
    dependencies: {
      ruvector: ruvectorHealth,
    },
  });
});

// Readiness check
app.get('/ready', (_req: Request, res: Response) => {
  res.status(200).json({
    ready: true,
    service: config.service.name,
    version: config.service.version,
  });
});

// Service info
app.get('/api/v1/info', (_req: Request, res: Response) => {
  res.json({
    service: config.service.name,
    version: config.service.version,
    environment: config.service.environment,
    agents: [
      {
        id: 'llm-costops-attribution',
        name: 'Cost Attribution Agent',
        endpoint: '/api/v1/attribution',
        description: 'Attributes token, model, and infrastructure costs',
      },
      {
        id: 'llm-costops-forecast',
        name: 'Cost Forecasting Agent',
        endpoint: '/api/v1/forecast',
        description: 'Forecasts future LLM spend',
      },
      {
        id: 'llm-costops-budget',
        name: 'Budget Enforcement Agent',
        endpoint: '/api/v1/budget',
        description: 'Evaluates budgets and cost constraints',
      },
      {
        id: 'llm-costops-roi',
        name: 'ROI Estimation Agent',
        endpoint: '/api/v1/roi',
        description: 'Computes ROI and cost-efficiency metrics',
      },
      {
        id: 'llm-costops-tradeoff',
        name: 'Cost-Performance Tradeoff Agent',
        endpoint: '/api/v1/tradeoff',
        description: 'Analyzes cost-performance tradeoffs',
      },
    ],
  });
});

// Cost Attribution Agent endpoint
app.post('/api/v1/attribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: CostAttributionInput = {
      request_id: req.headers['x-request-id'] as string || uuidv4(),
      ...req.body,
      timestamp: req.body.timestamp || new Date().toISOString(),
    };

    // Validate required fields
    if (!input.provider || !input.model) {
      return res.status(400).json({
        error: 'Missing required fields: provider, model',
      });
    }

    if (input.input_tokens === undefined || input.output_tokens === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: input_tokens, output_tokens',
      });
    }

    const result = await costAttributionAgent.process(input);

    res.json({
      success: true,
      event_id: result.event_id,
      outputs: result.outputs,
    });
  } catch (error) {
    next(error);
  }
});

// Cost Forecasting Agent endpoint
app.post('/api/v1/forecast', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: CostForecastInput = {
      request_id: req.headers['x-request-id'] as string || uuidv4(),
      scope: req.body.scope || {},
      forecast_period: req.body.forecast_period,
      historical_window_days: req.body.historical_window_days,
      confidence_level: req.body.confidence_level,
    };

    // Validate required fields
    if (!input.forecast_period?.start_date || !input.forecast_period?.end_date) {
      return res.status(400).json({
        error: 'Missing required fields: forecast_period.start_date, forecast_period.end_date',
      });
    }

    const result = await costForecastingAgent.process(input);

    res.json({
      success: true,
      event_id: result.event_id,
      outputs: result.outputs,
    });
  } catch (error) {
    next(error);
  }
});

// Budget Enforcement Agent endpoint
app.post('/api/v1/budget', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: BudgetEnforcementInput = {
      request_id: req.headers['x-request-id'] as string || uuidv4(),
      scope: req.body.scope || {},
      budget_id: req.body.budget_id,
      estimated_cost: req.body.estimated_cost,
      check_type: req.body.check_type || 'periodic',
    };

    const result = await budgetEnforcementAgent.process(input);

    res.json({
      success: true,
      event_id: result.event_id,
      outputs: result.outputs,
    });
  } catch (error) {
    next(error);
  }
});

// ROI Estimation Agent endpoint
app.post('/api/v1/roi', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: ROIEstimationInput = {
      request_id: req.headers['x-request-id'] as string || uuidv4(),
      scope: req.body.scope || {},
      period: req.body.period,
      value_metrics: req.body.value_metrics,
    };

    // Validate required fields
    if (!input.period?.start_date || !input.period?.end_date) {
      return res.status(400).json({
        error: 'Missing required fields: period.start_date, period.end_date',
      });
    }

    const result = await roiEstimationAgent.process(input);

    res.json({
      success: true,
      event_id: result.event_id,
      outputs: result.outputs,
    });
  } catch (error) {
    next(error);
  }
});

// Cost-Performance Tradeoff Agent endpoint
app.post('/api/v1/tradeoff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input: CostPerformanceTradeoffInput = {
      request_id: req.headers['x-request-id'] as string || uuidv4(),
      current_config: req.body.current_config,
      workload_profile: req.body.workload_profile,
      optimization_goal: req.body.optimization_goal || 'balanced',
      constraints: req.body.constraints,
    };

    // Validate required fields
    if (!input.current_config?.provider || !input.current_config?.model) {
      return res.status(400).json({
        error: 'Missing required fields: current_config.provider, current_config.model',
      });
    }

    if (!input.workload_profile?.avg_input_tokens || !input.workload_profile?.avg_output_tokens) {
      return res.status(400).json({
        error: 'Missing required fields: workload_profile.avg_input_tokens, workload_profile.avg_output_tokens',
      });
    }

    const result = await costPerformanceTradeoffAgent.process(input);

    res.json({
      success: true,
      event_id: result.event_id,
      outputs: result.outputs,
    });
  } catch (error) {
    next(error);
  }
});

// Apply error handler
app.use(errorHandler);

// Start server
export function startServer(): void {
  const port = config.service.port;

  app.listen(port, () => {
    logger.info({
      service: config.service.name,
      version: config.service.version,
      port,
      environment: config.service.environment,
    }, 'LLM-CostOps service started');
  });
}

// Export for testing
export { app };

// Start if running directly
if (require.main === module) {
  startServer();
}
