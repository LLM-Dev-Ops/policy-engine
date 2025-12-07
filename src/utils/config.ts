/**
 * Configuration loader
 */
import dotenv from 'dotenv';
import { AppConfig } from '../types/config';

dotenv.config();

export const config: AppConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/llm_policy_engine',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
    ssl: process.env.DATABASE_SSL === 'true',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'llm-policy:',
  },

  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '300', 10),
    maxSize: parseInt(process.env.CACHE_MAX_SIZE || '10000', 10),
    enabled: process.env.CACHE_ENABLED !== 'false',
  },

  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    grpcPort: parseInt(process.env.GRPC_PORT || '50051', 10),
    host: process.env.HOST || '0.0.0.0',
  },

  security: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    apiKeyHeader: process.env.API_KEY_HEADER || 'X-API-Key',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  observability: {
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    metricsPath: process.env.METRICS_PATH || '/metrics',
    logLevel: (process.env.LOG_LEVEL || 'info') as any,
    traceEnabled: process.env.TRACE_ENABLED === 'true',
  },

  integrations: {
    llmShieldUrl: process.env.LLM_SHIELD_URL,
    llmCostOpsUrl: process.env.LLM_COSTOPS_URL,
    llmGovernanceUrl: process.env.LLM_GOVERNANCE_URL,
    llmEdgeAgentUrl: process.env.LLM_EDGE_AGENT_URL,
    // Phase 2B: Upstream consumption adapters
    llmSchemaRegistryUrl: process.env.LLM_SCHEMA_REGISTRY_URL,
    llmConfigManagerUrl: process.env.LLM_CONFIG_MANAGER_URL,
    llmObservatoryUrl: process.env.LLM_OBSERVATORY_URL,
  },

  performance: {
    maxPolicySizeMB: parseInt(process.env.MAX_POLICY_SIZE_MB || '10', 10),
    maxEvaluationTimeMs: parseInt(process.env.MAX_EVALUATION_TIME_MS || '100', 10),
    enableParallelEvaluation: process.env.ENABLE_PARALLEL_EVALUATION !== 'false',
  },
};

export default config;
