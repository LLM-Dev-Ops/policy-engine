/**
 * LLM Config Manager Integration Client
 * Phase 2B: Consumes configuration from upstream LLM-Config-Manager
 *
 * This adapter follows the unidirectional dependency pattern:
 * Config Manager -> Policy Engine (consumes-from)
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export interface ConfigValue {
  key: string;
  value: any;
  namespace: string;
  version: number;
  updatedAt: string;
}

export interface EnforcementParameters {
  strictMode: boolean;
  defaultDecision: 'allow' | 'deny' | 'warn';
  maxEvaluationTimeMs: number;
  failOpen: boolean;
  auditLevel: 'none' | 'basic' | 'full';
  rateLimits: RateLimitParameters;
}

export interface RateLimitParameters {
  requestsPerSecond: number;
  burstSize: number;
  perUserLimit?: number;
  perTeamLimit?: number;
}

export interface RuleThresholds {
  maxCostPerRequest: number;
  maxDailyCost: number;
  maxTokensPerRequest: number;
  maxRequestsPerMinute: number;
  latencyThresholdMs: number;
  errorRateThreshold: number;
}

export interface PolicySettings {
  enabledNamespaces: string[];
  disabledPolicies: string[];
  priorityOverrides: Record<string, number>;
  environment: string;
  cacheTtlSeconds: number;
  hotReloadEnabled: boolean;
}

export interface FeatureFlags {
  enableParallelEvaluation: boolean;
  enableCelExpressions: boolean;
  enableWasmPolicies: boolean;
  enableDistributedCache: boolean;
  enableAdvancedTelemetry: boolean;
}

export interface ConfigVersion {
  version: number;
  lastModified: string;
  modifiedBy?: string;
  changeDescription?: string;
}

export interface RbacValidationRequest {
  userId: string;
  action: string;
  resource: string;
  context?: Record<string, any>;
}

export interface RbacValidationResult {
  allowed: boolean;
  reason?: string;
  requiredRoles?: string[];
}

export class ConfigManagerClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmConfigManagerUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmConfigManagerUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Get a single configuration value
   */
  async getConfig(namespace: string, key: string): Promise<ConfigValue | null> {
    if (!this.enabled) {
      logger.debug('Config Manager integration disabled');
      return null;
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/${key}`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace, key }, 'Failed to fetch config');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Config Manager service unavailable');
        return null;
      }
      throw error;
    }
  }

  /**
   * Get multiple configuration values in a batch
   */
  async getConfigBatch(keys: { namespace: string; key: string }[]): Promise<ConfigValue[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.post('/api/v1/config/batch', { keys });
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch config batch');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get enforcement parameters for a namespace
   */
  async getEnforcementParameters(namespace: string): Promise<EnforcementParameters> {
    if (!this.enabled) {
      logger.debug('Config Manager disabled, using default enforcement parameters');
      return this.getDefaultEnforcementParameters();
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/enforcement`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to fetch enforcement parameters');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Config Manager unavailable, using defaults');
        return this.getDefaultEnforcementParameters();
      }
      throw error;
    }
  }

  /**
   * Get rule thresholds for a namespace
   */
  async getRuleThresholds(namespace: string): Promise<RuleThresholds> {
    if (!this.enabled) {
      return this.getDefaultRuleThresholds();
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/thresholds`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to fetch rule thresholds');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return this.getDefaultRuleThresholds();
      }
      throw error;
    }
  }

  /**
   * Get policy settings for a namespace
   */
  async getPolicySettings(namespace: string): Promise<PolicySettings> {
    if (!this.enabled) {
      return this.getDefaultPolicySettings();
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/policy-settings`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to fetch policy settings');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return this.getDefaultPolicySettings();
      }
      throw error;
    }
  }

  /**
   * Get feature flags for a namespace
   */
  async getFeatureFlags(namespace: string): Promise<FeatureFlags> {
    if (!this.enabled) {
      return this.getDefaultFeatureFlags();
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/features`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to fetch feature flags');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return this.getDefaultFeatureFlags();
      }
      throw error;
    }
  }

  /**
   * Get configuration version for a namespace
   */
  async getConfigVersion(namespace: string): Promise<ConfigVersion | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.get(`/api/v1/config/${namespace}/version`);
      return response.data;
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to fetch config version');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Validate RBAC access
   */
  async validateAccess(request: RbacValidationRequest): Promise<RbacValidationResult> {
    if (!this.enabled) {
      logger.debug('Config Manager disabled, allowing access by default');
      return { allowed: true };
    }

    try {
      const response = await this.client.post('/api/v1/rbac/validate', request);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'RBAC validation failed');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Config Manager unavailable, allowing access by default');
        return { allowed: true };
      }
      throw error;
    }
  }

  /**
   * Check Config Manager service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'Config Manager health check failed');
      return false;
    }
  }

  /**
   * Check if the client is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private getDefaultEnforcementParameters(): EnforcementParameters {
    return {
      strictMode: false,
      defaultDecision: 'allow',
      maxEvaluationTimeMs: 100,
      failOpen: true,
      auditLevel: 'basic',
      rateLimits: {
        requestsPerSecond: 1000,
        burstSize: 100,
      },
    };
  }

  private getDefaultRuleThresholds(): RuleThresholds {
    return {
      maxCostPerRequest: 1.0,
      maxDailyCost: 100.0,
      maxTokensPerRequest: 8192,
      maxRequestsPerMinute: 60,
      latencyThresholdMs: 1000,
      errorRateThreshold: 0.05,
    };
  }

  private getDefaultPolicySettings(): PolicySettings {
    return {
      enabledNamespaces: ['default'],
      disabledPolicies: [],
      priorityOverrides: {},
      environment: 'development',
      cacheTtlSeconds: 300,
      hotReloadEnabled: true,
    };
  }

  private getDefaultFeatureFlags(): FeatureFlags {
    return {
      enableParallelEvaluation: true,
      enableCelExpressions: false,
      enableWasmPolicies: false,
      enableDistributedCache: true,
      enableAdvancedTelemetry: false,
    };
  }
}

export const configManagerClient = new ConfigManagerClient();
