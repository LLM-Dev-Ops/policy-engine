/**
 * LLM-CostOps Configuration
 *
 * All configuration is resolved via environment variables.
 * NO hardcoded service names, URLs, or credentials.
 */

export interface CostOpsConfig {
  service: {
    name: string;
    version: string;
    port: number;
    environment: 'dev' | 'staging' | 'prod';
  };
  ruvector: {
    serviceUrl: string;
    apiKey?: string;
    timeout: number;
  };
  telemetry: {
    endpoint?: string;
    serviceName: string;
    enabled: boolean;
  };
  pricing: {
    refreshIntervalMs: number;
    cacheTtlMs: number;
  };
  budgets: {
    defaultWarningThreshold: number;
    defaultCriticalThreshold: number;
  };
  forecasting: {
    defaultHistoricalWindowDays: number;
    defaultConfidenceLevel: number;
  };
}

function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): CostOpsConfig {
  const environment = getEnvOrDefault('PLATFORM_ENV', 'dev') as 'dev' | 'staging' | 'prod';

  return {
    service: {
      name: getEnvOrDefault('SERVICE_NAME', 'llm-costops'),
      version: getEnvOrDefault('SERVICE_VERSION', '1.0.0'),
      port: getEnvNumber('PORT', 8080),
      environment,
    },
    ruvector: {
      serviceUrl: getEnvOrThrow('RUVECTOR_SERVICE_URL'),
      apiKey: process.env.RUVECTOR_API_KEY,
      timeout: getEnvNumber('RUVECTOR_TIMEOUT_MS', 5000),
    },
    telemetry: {
      endpoint: process.env.TELEMETRY_ENDPOINT,
      serviceName: getEnvOrDefault('SERVICE_NAME', 'llm-costops'),
      enabled: getEnvBoolean('TELEMETRY_ENABLED', true),
    },
    pricing: {
      refreshIntervalMs: getEnvNumber('PRICING_REFRESH_INTERVAL_MS', 3600000), // 1 hour
      cacheTtlMs: getEnvNumber('PRICING_CACHE_TTL_MS', 300000), // 5 minutes
    },
    budgets: {
      defaultWarningThreshold: getEnvNumber('BUDGET_WARNING_THRESHOLD', 80) / 100,
      defaultCriticalThreshold: getEnvNumber('BUDGET_CRITICAL_THRESHOLD', 95) / 100,
    },
    forecasting: {
      defaultHistoricalWindowDays: getEnvNumber('FORECAST_HISTORICAL_WINDOW_DAYS', 30),
      defaultConfidenceLevel: getEnvNumber('FORECAST_CONFIDENCE_LEVEL', 95) / 100,
    },
  };
}

export const config = loadConfig();
