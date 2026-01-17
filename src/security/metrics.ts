/**
 * Enterprise Metrics Module
 *
 * Provides structured metrics for:
 * - Evaluation latency
 * - Policy hit rates
 * - Deny vs allow ratios
 * - Validation failures
 */

import { Counter, Histogram, Gauge, Registry } from 'prom-client';

// Create a dedicated registry for policy engine metrics
export const metricsRegistry = new Registry();

// Add default metrics
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register: metricsRegistry });

/**
 * Evaluation latency histogram
 */
export const evaluationLatency = new Histogram({
  name: 'policy_evaluation_latency_ms',
  help: 'Policy evaluation latency in milliseconds',
  labelNames: ['policy_id', 'decision', 'cached'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  registers: [metricsRegistry],
});

/**
 * Policy evaluation counter
 */
export const evaluationCounter = new Counter({
  name: 'policy_evaluations_total',
  help: 'Total number of policy evaluations',
  labelNames: ['policy_id', 'decision', 'namespace'],
  registers: [metricsRegistry],
});

/**
 * Deny vs Allow counter
 */
export const decisionCounter = new Counter({
  name: 'policy_decisions_total',
  help: 'Total policy decisions by type',
  labelNames: ['decision', 'namespace', 'policy_type'],
  registers: [metricsRegistry],
});

/**
 * Validation failure counter
 */
export const validationFailures = new Counter({
  name: 'policy_validation_failures_total',
  help: 'Total number of policy validation failures',
  labelNames: ['violation_type', 'severity', 'namespace'],
  registers: [metricsRegistry],
});

/**
 * Governance violation counter
 */
export const governanceViolations = new Counter({
  name: 'policy_governance_violations_total',
  help: 'Total number of governance violations',
  labelNames: ['violation_type', 'policy_type'],
  registers: [metricsRegistry],
});

/**
 * Policy mutation counter
 */
export const policyMutations = new Counter({
  name: 'policy_mutations_total',
  help: 'Total number of policy mutations',
  labelNames: ['action', 'namespace', 'actor_type'],
  registers: [metricsRegistry],
});

/**
 * Active policies gauge
 */
export const activePolicies = new Gauge({
  name: 'policy_active_count',
  help: 'Number of currently active policies',
  labelNames: ['namespace', 'policy_type'],
  registers: [metricsRegistry],
});

/**
 * Authentication attempts counter
 */
export const authAttempts = new Counter({
  name: 'policy_auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['result', 'identity_type'],
  registers: [metricsRegistry],
});

/**
 * Rate limit hits counter
 */
export const rateLimitHits = new Counter({
  name: 'policy_rate_limit_hits_total',
  help: 'Total rate limit hits',
  labelNames: ['endpoint', 'identity'],
  registers: [metricsRegistry],
});

/**
 * Request duration histogram
 */
export const requestDuration = new Histogram({
  name: 'policy_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [metricsRegistry],
});

/**
 * Record an evaluation metric
 */
export function recordEvaluation(
  policyId: string,
  decision: string,
  namespace: string,
  latencyMs: number,
  cached: boolean,
): void {
  evaluationLatency.observe(
    { policy_id: policyId, decision, cached: String(cached) },
    latencyMs,
  );

  evaluationCounter.inc({ policy_id: policyId, decision, namespace });
}

/**
 * Record a decision metric
 */
export function recordDecision(
  decision: string,
  namespace: string,
  policyType: string,
): void {
  decisionCounter.inc({ decision, namespace, policy_type: policyType });
}

/**
 * Record a validation failure
 */
export function recordValidationFailure(
  violationType: string,
  severity: string,
  namespace: string,
): void {
  validationFailures.inc({ violation_type: violationType, severity, namespace });
}

/**
 * Record a governance violation
 */
export function recordGovernanceViolation(
  violationType: string,
  policyType: string,
): void {
  governanceViolations.inc({ violation_type: violationType, policy_type: policyType });
}

/**
 * Record a policy mutation
 */
export function recordMutation(
  action: string,
  namespace: string,
  actorType: string,
): void {
  policyMutations.inc({ action, namespace, actor_type: actorType });
}

/**
 * Update active policy count
 */
export function updateActivePolicyCount(
  namespace: string,
  policyType: string,
  count: number,
): void {
  activePolicies.set({ namespace, policy_type: policyType }, count);
}

/**
 * Record authentication attempt
 */
export function recordAuthAttempt(
  result: 'success' | 'failure',
  identityType: string,
): void {
  authAttempts.inc({ result, identity_type: identityType });
}

/**
 * Record rate limit hit
 */
export function recordRateLimitHit(endpoint: string, identity: string): void {
  rateLimitHits.inc({ endpoint, identity });
}

/**
 * Record request duration
 */
export function recordRequestDuration(
  method: string,
  path: string,
  status: number,
  durationMs: number,
): void {
  requestDuration.observe({ method, path, status: String(status) }, durationMs);
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

/**
 * Get metrics as JSON (for debugging)
 */
export async function getMetricsJson(): Promise<object> {
  return metricsRegistry.getMetricsAsJSON();
}
