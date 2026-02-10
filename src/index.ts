/**
 * LLM-Policy-Engine Main Entry Point
 * Enterprise-grade policy enforcement for LLM operations
 */

// Core exports
export * from './core';

// Type exports
export * from './types/policy';
export * from './types/config';

// Database exports
export { db } from './db/client';
export { PolicyRepository } from './db/models/policy-repository';
export { EvaluationRepository } from './db/models/evaluation-repository';
export { MigrationRunner } from './db/migrate';

// Cache exports
export { cacheManager, CacheManager } from './cache/cache-manager';
export { MemoryCache } from './cache/l1/memory-cache';
export { RedisCache } from './cache/l2/redis-cache';

// Utility exports
export { config } from './utils/config';
export { default as logger } from './utils/logger';
export * from './utils/errors';

// Agentics Execution System exports
export * from './execution';

// Phase 4 Layer 1 - Governance & FinOps exports
export * from './governance';
export {
  governanceSignalEmitter,
  GovernanceSignalEmitter,
} from './governance/emitters/governance-signal-emitter';
export {
  GovernanceSignalType,
  CostRiskSignal,
  BudgetThresholdSignal,
  PolicyViolationSignal,
  ApprovalRequiredSignal,
  GovernanceSignal,
  PERFORMANCE_BUDGETS,
  validatePerformanceBudget,
} from './governance/contracts/governance-signals';

// Main policy engine service
import { PolicyEngine } from './core/engine/policy-engine';
import { PolicyRepository } from './db/models/policy-repository';
import { EvaluationRepository } from './db/models/evaluation-repository';
import { cacheManager } from './cache/cache-manager';
import logger from './utils/logger';

export class PolicyEngineService {
  private engine: PolicyEngine;
  private policyRepository: PolicyRepository;
  private evaluationRepository: EvaluationRepository;

  constructor() {
    this.policyRepository = new PolicyRepository();
    this.evaluationRepository = new EvaluationRepository();
    this.engine = new PolicyEngine();
  }

  /**
   * Initialize the service - load active policies
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Policy Engine Service');

      const policies = await this.policyRepository.findActive();
      for (const policy of policies) {
        this.engine.addPolicy(policy);
      }

      logger.info({ count: policies.length }, 'Policy Engine Service initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize Policy Engine Service');
      throw error;
    }
  }

  /**
   * Get the policy engine instance
   */
  getEngine(): PolicyEngine {
    return this.engine;
  }

  /**
   * Get the policy repository
   */
  getPolicyRepository(): PolicyRepository {
    return this.policyRepository;
  }

  /**
   * Get the evaluation repository
   */
  getEvaluationRepository(): EvaluationRepository {
    return this.evaluationRepository;
  }

  /**
   * Get the cache manager
   */
  getCacheManager() {
    return cacheManager;
  }

  /**
   * Shutdown the service gracefully
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Policy Engine Service');
    await cacheManager.close();
  }
}

// Export singleton instance
export const policyEngineService = new PolicyEngineService();
