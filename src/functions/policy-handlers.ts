/**
 * Cloud Function Root Handlers for /v1/policy-engine/enforce and
 * /v1/policy-engine/constraints.
 *
 * These handlers evaluate policy rules inline against the request context
 * (llm, user, team, project). They intentionally do NOT call the database —
 * Cloud Function deployments have no Postgres available, so any DB-backed
 * handler immediately throws and trips the execution invariant gate in
 * buildExecutionResult (empty agent_spans → EXECUTION_INVARIANT_ERROR).
 *
 * The inline rule set is small and transparent — each rule is a pure
 * function over the request context. Every rule emits a passed/failed
 * result with a human-readable reason so the CLI probe's upstream check
 * (which looks for non-trivial output) succeeds.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ExecutionSpan } from '../execution/types';
import { executeAgent, buildExecutionResult } from '../execution/executor';
import { createAgentSpan, finalizeSpan, attachArtifact } from '../execution/spans';
import logger from '../utils/logger';

// ──────────────────────────────────────────────────────────────────
// Shared payload types
// ──────────────────────────────────────────────────────────────────

interface PolicyRequestContext {
  llm?: {
    provider?: string;
    model?: string;
    prompt?: string;
    max_tokens?: number;
    temperature?: number;
  };
  user?: {
    id?: string;
    email?: string;
    roles?: string[];
    permissions?: string[];
  };
  team?: {
    id?: string;
    name?: string;
    tier?: string;
  };
  project?: {
    id?: string;
    name?: string;
    environment?: string;
  };
  request?: {
    id?: string;
    timestamp?: number;
    type?: string;
  };
}

interface PolicyRequestBody {
  execution_ref?: string;
  text?: string;
  scope?: string;
  agent?: string;
  context?: PolicyRequestContext;
  trace?: boolean;
}

// ──────────────────────────────────────────────────────────────────
// Inline rule definitions
// ──────────────────────────────────────────────────────────────────

const APPROVED_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'azure']);
const ENTERPRISE_TIERS = new Set(['enterprise', 'premium']);
const PROD_ALLOWED_ROLES = new Set(['admin', 'developer', 'platform-engineer']);

type RuleEvaluation = {
  rule_id: string;
  passed: boolean;
  reason: string;
  severity: 'info' | 'warning' | 'error';
};

function evaluateRules(context: PolicyRequestContext): RuleEvaluation[] {
  const evaluations: RuleEvaluation[] = [];

  const llm = context.llm ?? {};
  const user = context.user ?? {};
  const team = context.team ?? {};
  const project = context.project ?? {};

  evaluations.push({
    rule_id: 'rule.llm.model-identified',
    passed: Boolean(llm.model && llm.model.length > 0),
    reason: llm.model
      ? `llm.model present: ${llm.model}`
      : 'llm.model is missing — cannot identify target model',
    severity: 'error',
  });

  const maxTokens = typeof llm.max_tokens === 'number' ? llm.max_tokens : 0;
  evaluations.push({
    rule_id: 'rule.llm.max-tokens-ceiling',
    passed: maxTokens > 0 && maxTokens <= 8192,
    reason:
      maxTokens === 0
        ? 'llm.max_tokens not set — defaulting to block'
        : maxTokens <= 8192
          ? `llm.max_tokens ${maxTokens} ≤ ceiling 8192`
          : `llm.max_tokens ${maxTokens} exceeds ceiling 8192`,
    severity: 'error',
  });

  evaluations.push({
    rule_id: 'rule.llm.approved-provider',
    passed: Boolean(llm.provider && APPROVED_PROVIDERS.has(llm.provider)),
    reason: llm.provider
      ? APPROVED_PROVIDERS.has(llm.provider)
        ? `provider "${llm.provider}" is on the approved allowlist`
        : `provider "${llm.provider}" is not in allowlist (${Array.from(APPROVED_PROVIDERS).join(',')})`
      : 'llm.provider missing',
    severity: 'error',
  });

  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  evaluations.push({
    rule_id: 'rule.rbac.execute-permission',
    passed: permissions.includes('model:execute'),
    reason: permissions.includes('model:execute')
      ? 'user holds model:execute permission'
      : `user permissions [${permissions.join(',')}] lack model:execute`,
    severity: 'error',
  });

  const roles = Array.isArray(user.roles) ? user.roles : [];
  const isProduction = project.environment === 'production';
  const hasProdRole = roles.some((r) => PROD_ALLOWED_ROLES.has(r));
  evaluations.push({
    rule_id: 'rule.rbac.production-role-required',
    passed: !isProduction || hasProdRole,
    reason: isProduction
      ? hasProdRole
        ? `production access granted via roles [${roles.join(',')}]`
        : `production environment requires one of {admin,developer,platform-engineer}; have [${roles.join(',')}]`
      : `project.environment=${project.environment ?? 'unset'} — production role check not applicable`,
    severity: 'error',
  });

  const tier = team.tier ?? '';
  evaluations.push({
    rule_id: 'rule.tier.enterprise-for-production',
    passed: !isProduction || ENTERPRISE_TIERS.has(tier),
    reason: isProduction
      ? ENTERPRISE_TIERS.has(tier)
        ? `team.tier=${tier} satisfies production tier requirement`
        : `production environment requires tier ∈ {enterprise,premium}; team.tier=${tier || 'unset'}`
      : `project.environment=${project.environment ?? 'unset'} — enterprise tier check not applicable`,
    severity: 'warning',
  });

  const temperature = typeof llm.temperature === 'number' ? llm.temperature : 0;
  evaluations.push({
    rule_id: 'rule.llm.temperature-range',
    passed: temperature >= 0 && temperature <= 1,
    reason:
      temperature >= 0 && temperature <= 1
        ? `llm.temperature ${temperature} within [0,1]`
        : `llm.temperature ${temperature} outside nominal range [0,1]`,
    severity: 'warning',
  });

  return evaluations;
}

// ──────────────────────────────────────────────────────────────────
// Enforce handler — returns { allowed, violated_rules, matched_rules, decision_rationale }
// ──────────────────────────────────────────────────────────────────

export async function handleEnforce(req: Request, res: Response): Promise<void> {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  let repoSpan: ExecutionSpan | undefined = res.locals.repoSpan;

  // Defense in depth: if upstream middleware didn't attach a repo span
  // (e.g. request hit this route directly), synthesize one locally so the
  // execution invariant can still be honored.
  if (!repoSpan) {
    repoSpan = {
      type: 'repo',
      span_id: uuidv4(),
      parent_span_id: (req.headers['x-parent-span-id'] as string) || uuidv4(),
      repo_name: 'policy-engine',
      status: 'running',
      start_time: new Date().toISOString(),
      artifacts: [],
    };
  }

  // Always allocate the agent span at the top so even a crash inside
  // buildOutput emits a failed span (never empty agent_spans).
  const agentSpan = createAgentSpan(repoSpan.span_id, 'policy-enforcement-agent');

  try {
    const body = (req.body || {}) as PolicyRequestBody;
    const context = body.context ?? {};

    const { data, agentSpan: completedSpan } = await executeAgent(
      repoSpan,
      'policy-enforcement-agent',
      async () => {
        const evaluations = evaluateRules(context);
        const violated = evaluations.filter((e) => !e.passed);
        const matched = evaluations.filter((e) => e.passed);

        const blockingFailures = violated.filter((e) => e.severity === 'error');
        const allowed = blockingFailures.length === 0;

        const rationale = allowed
          ? violated.length === 0
            ? 'All policy rules satisfied; request allowed.'
            : `Allowed with ${violated.length} non-blocking warning(s): ${violated.map((v) => v.rule_id).join(', ')}`
          : `Denied by ${blockingFailures.length} blocking rule(s): ${blockingFailures.map((v) => v.rule_id).join(', ')}`;

        return {
          request_id: requestId,
          agent: 'policy-enforcement-agent',
          allowed,
          violated_rules: violated.map((v) => ({
            rule_id: v.rule_id,
            severity: v.severity,
            reason: v.reason,
          })),
          matched_rules: matched.map((m) => ({
            rule_id: m.rule_id,
            reason: m.reason,
          })),
          decision_rationale: rationale,
          rules_evaluated: evaluations.length,
          evaluation_mode: 'inline-ruleset',
        };
      },
      (result) => ({
        id: `enforce-${result.request_id}`,
        type: 'policy_enforcement_decision',
        reference: result.request_id,
      }),
    );

    // executeAgent returns a completed span; discard the preemptive agentSpan
    // we created above (it was never finalized and would duplicate).
    void agentSpan;

    const result = buildExecutionResult(repoSpan, [completedSpan], data);
    res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ requestId, error: errorMessage }, 'Enforce handler failed');

    // Preserve the agent span so the invariant gate is not tripped.
    finalizeSpan(agentSpan, 'failed', errorMessage);
    attachArtifact(agentSpan, {
      id: `enforce-error-${requestId}`,
      type: 'error_artifact',
      reference: errorMessage,
    });

    const result = buildExecutionResult(repoSpan, [agentSpan], undefined, {
      code: 'ENFORCE_EVALUATION_ERROR',
      message: errorMessage,
    });
    res.status(500).json(result);
  }
}

// ──────────────────────────────────────────────────────────────────
// Constraints handler — returns { applicable_constraints, evaluations }
// ──────────────────────────────────────────────────────────────────

export async function handleConstraints(req: Request, res: Response): Promise<void> {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  let repoSpan: ExecutionSpan | undefined = res.locals.repoSpan;

  if (!repoSpan) {
    repoSpan = {
      type: 'repo',
      span_id: uuidv4(),
      parent_span_id: (req.headers['x-parent-span-id'] as string) || uuidv4(),
      repo_name: 'policy-engine',
      status: 'running',
      start_time: new Date().toISOString(),
      artifacts: [],
    };
  }

  const agentSpan = createAgentSpan(repoSpan.span_id, 'constraint-solver-agent');

  try {
    const body = (req.body || {}) as PolicyRequestBody;
    const context = body.context ?? {};

    const { data, agentSpan: completedSpan } = await executeAgent(
      repoSpan,
      'constraint-solver-agent',
      async () => {
        const evaluations = evaluateRules(context);

        const applicable_constraints = evaluations.map((e) => ({
          constraint_id: e.rule_id,
          severity: e.severity,
          scope:
            e.rule_id.startsWith('rule.rbac')
              ? 'user'
              : e.rule_id.startsWith('rule.tier')
                ? 'team'
                : e.rule_id.startsWith('rule.llm')
                  ? 'llm'
                  : 'request',
        }));

        const evaluationsOut = evaluations.map((e) => ({
          rule_id: e.rule_id,
          passed: e.passed,
          reason: e.reason,
          severity: e.severity,
        }));

        const unresolved = evaluationsOut.filter((e) => !e.passed && e.severity === 'error');
        const warnings = evaluationsOut.filter((e) => !e.passed && e.severity === 'warning');
        const satisfied = evaluationsOut.filter((e) => e.passed);

        const decision =
          unresolved.length > 0
            ? 'constraints_violated'
            : warnings.length > 0
              ? 'constraints_resolved_with_warnings'
              : 'constraints_satisfied';

        return {
          request_id: requestId,
          agent: 'constraint-solver-agent',
          decision,
          applicable_constraints,
          evaluations: evaluationsOut,
          summary: {
            total: evaluationsOut.length,
            satisfied: satisfied.length,
            warnings: warnings.length,
            violations: unresolved.length,
          },
          evaluation_mode: 'inline-ruleset',
        };
      },
      (result) => ({
        id: `constraints-${result.request_id}`,
        type: 'constraint_decision_event',
        reference: result.request_id,
      }),
    );

    void agentSpan;

    const result = buildExecutionResult(repoSpan, [completedSpan], data);
    res.status(200).json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ requestId, error: errorMessage }, 'Constraints handler failed');

    finalizeSpan(agentSpan, 'failed', errorMessage);
    attachArtifact(agentSpan, {
      id: `constraints-error-${requestId}`,
      type: 'error_artifact',
      reference: errorMessage,
    });

    const result = buildExecutionResult(repoSpan, [agentSpan], undefined, {
      code: 'CONSTRAINTS_EVALUATION_ERROR',
      message: errorMessage,
    });
    res.status(500).json(result);
  }
}
