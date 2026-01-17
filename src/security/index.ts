/**
 * Security Module Exports
 *
 * Enterprise security layer for the Policy Engine:
 * - Agentics-only identity verification
 * - Append-only audit trail
 * - Policy governance and fail-closed validation
 * - Versioned policy repository
 * - Prometheus metrics
 * - Post-auth rate limiting
 */

// Identity & Authentication
export {
  type AgenticsIdentity,
  type AuthenticatedRequest,
  requireAgenticsIdentity,
  requireScope,
  requireReadScope,
  requireWriteScope,
  requireAdminScope,
  hasApprovalAuthority,
  getActorIdentity,
} from './agentics-identity';

// Audit Trail
export {
  AuditAction,
  AuditEntry,
  AuditTrailRepository,
  auditTrail,
  computePolicyHash,
} from './audit-trail';

// Policy Governance
export {
  GovernanceViolationType,
  GovernanceViolation,
  GovernanceCheckResult,
  PolicyType,
  detectPolicyType,
  isProductionPolicy,
  validatePolicyGovernance,
  enforceGovernance,
  requiresApprovalForStatusChange,
} from './policy-governance';

// Versioned Policy Repository
export {
  VersionedPolicy,
  VersionQueryOptions,
  VersionedPolicyRepository,
  versionedPolicyRepository,
} from './versioned-policy-repository';

// Metrics
export {
  metricsRegistry,
  evaluationLatency,
  evaluationCounter,
  decisionCounter,
  validationFailures,
  governanceViolations,
  policyMutations,
  activePolicies,
  authAttempts,
  rateLimitHits,
  requestDuration,
  recordEvaluation,
  recordDecision,
  recordValidationFailure,
  recordGovernanceViolation,
  recordMutation,
  updateActivePolicyCount,
  recordAuthAttempt,
  recordRateLimitHit,
  recordRequestDuration,
  getMetrics,
  getMetricsJson,
} from './metrics';

// Rate Limiting
export {
  createPostAuthRateLimiter,
  evaluationRateLimiter,
  mutationRateLimiter,
  readRateLimiter,
  strictRateLimiter,
} from './rate-limiter';
