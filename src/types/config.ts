/**
 * Configuration Type Definitions
 */

export interface DatabaseConfig {
  url: string;
  poolMin?: number;
  poolMax?: number;
  ssl?: boolean;
}

export interface RedisConfig {
  url: string;
  password?: string;
  db?: number;
  keyPrefix?: string;
}

export interface CacheConfig {
  ttl: number; // seconds
  maxSize: number;
  enabled?: boolean;
}

export interface ServerConfig {
  port: number;
  grpcPort: number;
  host?: string;
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  apiKeyHeader?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface ObservabilityConfig {
  metricsPort: number;
  metricsPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  traceEnabled: boolean;
}

export interface IntegrationConfig {
  llmShieldUrl?: string;
  llmCostOpsUrl?: string;
  llmGovernanceUrl?: string;
  llmEdgeAgentUrl?: string;
  // Phase 2B: Upstream consumption adapters
  llmSchemaRegistryUrl?: string;
  llmConfigManagerUrl?: string;
  llmObservatoryUrl?: string;
}

export interface PerformanceConfig {
  maxPolicySizeMB: number;
  maxEvaluationTimeMs: number;
  enableParallelEvaluation: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  database: DatabaseConfig;
  redis: RedisConfig;
  cache: CacheConfig;
  server: ServerConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
  observability: ObservabilityConfig;
  integrations: IntegrationConfig;
  performance: PerformanceConfig;
}
