/**
 * Commands Module
 * Central export for all command modules with synthesis integration
 *
 * Executive Synthesis Integration:
 * - policy create: synthesis with conflict analysis and enforcement impact
 * - policy edit: synthesis with change tracking and impact projection
 * - policy enable: synthesis with rollback instructions
 * - policy disable: synthesis with rollback instructions
 * - policy dry-run: violation predictions without state change
 *
 * Agent Commands:
 * - agent evaluate: Evaluate request against policies
 * - agent resolve: Resolve constraint conflicts
 * - agent route: Route decision to enforcement layers
 */

export * from './policy';
export * from './agent';
export * from './approval-routing';

// Re-export commonly used synthesis utilities for command implementations
export {
  buildExecutiveSummary,
  buildDecisionPacket,
  buildConflictAnalysis,
  buildEnforcementImpact,
  buildRollbackInstructions,
  buildViolationPredictions,
  buildPolicyDryRunSynthesis,
  elevateRiskForProduction,
  extractBlockingIssues,
  isProductionTarget,
  calculateSuccessRate,
} from '../synthesis';
