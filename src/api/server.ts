/**
 * Express REST API Server
 * Production-ready API server with middleware and routes
 */
import express, { Express, Request, Response } from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from '@utils/config';
import logger from '@utils/logger';
import { db } from '@db/client';
import { cacheManager } from '@cache/cache-manager';
import { errorHandler, notFoundHandler, timeoutHandler } from './middleware/error-handler';
import policyRoutes from './routes/policies';
import evaluationRoutes from './routes/evaluations';
import agentRoutes from './routes/agents';
import approvalRoutingRoutes from './routes/approval-routing';
import internalEvaluateRoutes from './routes/internal-evaluate';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
  app.use(timeoutHandler(30000));

  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          duration,
          ip: req.ip,
        },
        'HTTP request',
      );
    });

    next();
  });

  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const dbHealthy = await db.ping();
      const cacheHealth = await cacheManager.healthCheck();

      const status = !dbHealthy ? 'unhealthy' : !cacheHealth.healthy ? 'degraded' : 'healthy';

      res.status(dbHealthy ? 200 : 503).json({
        status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbHealthy ? 'connected' : 'disconnected',
        cache: cacheHealth.healthy ? 'connected' : 'disconnected',
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      });
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      const dbHealthy = await db.ping();

      if (dbHealthy) {
        res.status(200).json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'not ready', reason: 'database not connected' });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not ready',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'LLM Policy Engine API',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/health',
        ready: '/ready',
        policies: '/api/policies',
        evaluate: '/api/evaluate',
        agent: {
          evaluate: '/api/agent/evaluate',
          resolve: '/api/agent/resolve',
          route: '/api/agent/route',
          info: '/api/agent/info',
          health: '/api/agent/health',
        },
        'constraint-solver': {
          resolve: '/api/constraint-solver/resolve',
          analyze: '/api/constraint-solver/analyze',
          explain: '/api/constraint-solver/explain',
          info: '/api/constraint-solver/info',
          health: '/api/constraint-solver/health',
        },
        'approval-routing': {
          evaluate: '/api/approval-routing/evaluate',
          route: '/api/approval-routing/route',
          resolve: '/api/approval-routing/resolve',
          status: '/api/approval-routing/status/:requestId',
          info: '/api/approval-routing/info',
          health: '/api/approval-routing/health',
        },
        internal: {
          evaluate: '/api/v1/internal/evaluate',
        },
      },
    });
  });

  app.use('/api/policies', policyRoutes);
  app.use('/api/evaluate', evaluationRoutes);
  app.use('/api/agent', agentRoutes);
  app.use('/api/approval-routing', approvalRoutingRoutes);
  app.use('/api/v1/internal', internalEvaluateRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export async function startAPIServer(port?: number): Promise<void> {
  const app = createApp();
  const serverPort = port || config.server.port;

  try {
    // Start server first (Cloud Run health check needs this)
    const server = app.listen(serverPort, () => {
      logger.info(
        {
          port: serverPort,
          host: config.server.host,
          env: config.nodeEnv,
          phase: process.env.AGENT_PHASE || 'unknown',
          layer: process.env.AGENT_LAYER || 'unknown',
        },
        'API server started',
      );
    });

    // Check database connection async (don't block startup)
    db.ping().then(dbHealthy => {
      if (!dbHealthy) {
        logger.warn('Database connection not available - running in degraded mode');
      } else {
        logger.info('Database connection established');
      }
    }).catch(err => {
      logger.warn({ error: err }, 'Database connection check failed - running in degraded mode');
    });

    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal');

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          await db.close();
          await cacheManager.close();
          logger.info('Connections closed successfully');
          process.exit(0);
        } catch (error) {
          logger.error({ error }, 'Error during shutdown');
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error({ error }, 'Failed to start API server');
    process.exit(1);
  }
}

if (require.main === module) {
  startAPIServer();
}
