/**
 * Policy Engine - Main evaluation engine
 */
import {
  Policy,
  EvaluationContext,
  PolicyDecision,
  DecisionType,
  EvaluationTrace,
  ConditionEvaluation,
  PolicyEvaluationRequest,
  PolicyEvaluationResponse,
} from '../../types/policy';
import { ConditionEvaluator } from '../evaluator/condition-evaluator';
import { TokenCounter, PIIDetector, CostCalculator } from '../primitives';
import { PolicyEvaluationError } from '@utils/errors';
import logger from '@utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class PolicyEngine {
  private conditionEvaluator: ConditionEvaluator;
  private tokenCounter: TokenCounter;
  private piiDetector: PIIDetector;
  private costCalculator: CostCalculator;
  private policies: Map<string, Policy>;

  constructor(policies: Policy[] = []) {
    this.conditionEvaluator = new ConditionEvaluator();
    this.tokenCounter = new TokenCounter();
    this.piiDetector = new PIIDetector();
    this.costCalculator = new CostCalculator();
    this.policies = new Map();

    // Load initial policies
    for (const policy of policies) {
      this.addPolicy(policy);
    }
  }

  /**
   * Add a policy to the engine
   */
  addPolicy(policy: Policy): void {
    if (policy.status === 'active') {
      this.policies.set(policy.metadata.id, policy);
      logger.info({ policyId: policy.metadata.id }, 'Policy added to engine');
    }
  }

  /**
   * Remove a policy from the engine
   */
  removePolicy(policyId: string): void {
    this.policies.delete(policyId);
    logger.info({ policyId }, 'Policy removed from engine');
  }

  /**
   * Update a policy in the engine
   */
  updatePolicy(policy: Policy): void {
    this.policies.set(policy.metadata.id, policy);
    logger.info({ policyId: policy.metadata.id }, 'Policy updated in engine');
  }

  /**
   * Get all active policies (sorted by priority, highest first)
   */
  getPolicies(): Policy[] {
    return Array.from(this.policies.values()).sort(
      (a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0),
    );
  }

  /**
   * Evaluate a request against all policies
   */
  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResponse> {
    const startTime = performance.now();
    const { requestId = uuidv4(), context, policies: policyIds, dryRun = false, trace = false } = request;

    logger.info({ requestId, dryRun, trace }, 'Starting policy evaluation');

    try {
      // Enrich context with calculated fields
      const enrichedContext = await this.enrichContext(context);

      // Get policies to evaluate
      const policiesToEvaluate = policyIds
        ? policyIds.map((id) => this.policies.get(id)).filter((p): p is Policy => p !== undefined)
        : Array.from(this.policies.values());

      // Sort policies by priority (higher priority first)
      policiesToEvaluate.sort((a, b) => (b.metadata.priority || 0) - (a.metadata.priority || 0));

      // Evaluate policies
      const decision = await this.evaluatePolicies(
        policiesToEvaluate,
        enrichedContext,
        trace,
      );

      const evaluationTimeMs = performance.now() - startTime;

      logger.info(
        {
          requestId,
          decision: decision.decision,
          evaluationTimeMs,
          matchedPolicies: decision.matchedPolicies.length,
        },
        'Policy evaluation completed',
      );

      return {
        requestId,
        decision: {
          ...decision,
          evaluationTimeMs,
        },
        timestamp: Date.now(),
        cached: false,
      };
    } catch (error) {
      logger.error({ requestId, error }, 'Policy evaluation failed');
      throw new PolicyEvaluationError(
        `Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
        { requestId },
      );
    }
  }

  /**
   * Enrich context with calculated fields
   */
  private async enrichContext(context: EvaluationContext): Promise<EvaluationContext> {
    const enriched = { ...context };

    // Add token count if prompt is provided
    if (context.llm?.prompt) {
      const { tokens } = this.tokenCounter.estimateTokens(
        context.llm.prompt,
        context.llm.model,
      );
      enriched.llm = {
        ...context.llm,
        estimatedTokens: tokens,
      } as any;
    }

    // Add PII detection
    if (context.llm?.prompt) {
      const piiMatches = this.piiDetector.detectPII(context.llm.prompt);
      enriched.llm = {
        ...enriched.llm!,
        containsPII: piiMatches.length > 0,
        piiTypes: [...new Set(piiMatches.map((m) => m.type))],
      } as any;
    }

    // Add cost estimate
    if (context.llm?.provider && context.llm?.model && context.llm?.prompt) {
      const costEstimate = this.costCalculator.estimateCostFromText(
        context.llm.provider,
        context.llm.model,
        context.llm.prompt,
        context.llm.maxTokens || 500,
      );
      enriched.llm = {
        ...enriched.llm!,
        estimatedCost: costEstimate.totalCost,
      } as any;
    }

    return enriched;
  }

  /**
   * Evaluate multiple policies and aggregate decisions
   */
  private async evaluatePolicies(
    policies: Policy[],
    context: EvaluationContext,
    trace: boolean,
  ): Promise<PolicyDecision> {
    const matchedPolicies: string[] = [];
    const matchedRules: string[] = [];
    const traces: EvaluationTrace[] = [];
    const modifications: Record<string, any> = {};

    let finalDecision: DecisionType = DecisionType.ALLOW;
    let finalReason: string | undefined;

    // Evaluate each policy
    for (const policy of policies) {
      for (const rule of policy.rules) {
        if (!rule.enabled) continue;

        const conditionResult = this.conditionEvaluator.evaluate(rule.condition, context);

        if (trace) {
          const conditionEval: ConditionEvaluation = {
            condition: rule.condition,
            result: conditionResult.result,
            evaluationTimeMs: conditionResult.evaluationTimeMs,
            details: conditionResult.details,
          };

          traces.push({
            policyId: policy.metadata.id,
            ruleId: rule.id,
            conditionEvaluations: [conditionEval],
            finalDecision: rule.action.decision,
            timestamp: Date.now(),
          });
        }

        // If condition matches, record it
        if (conditionResult.result) {
          matchedPolicies.push(policy.metadata.id);
          matchedRules.push(rule.id);

          // Priority: DENY > MODIFY > WARN > ALLOW
          if (rule.action.decision === DecisionType.DENY) {
            finalDecision = DecisionType.DENY;
            finalReason = rule.action.reason;
            break; // DENY is highest priority, stop evaluation
          } else if (rule.action.decision === DecisionType.MODIFY) {
            finalDecision = DecisionType.MODIFY;
            finalReason = rule.action.reason;
            Object.assign(modifications, rule.action.modifications || {});
          } else if (rule.action.decision === DecisionType.WARN) {
            finalDecision = DecisionType.WARN;
            finalReason = rule.action.reason;
          }
        }
      }

      // Break early if DENY decision made
      if (finalDecision === DecisionType.DENY) {
        break;
      }
    }

    return {
      decision: finalDecision,
      allowed: finalDecision !== DecisionType.DENY,
      reason: finalReason,
      matchedPolicies: [...new Set(matchedPolicies)],
      matchedRules: [...new Set(matchedRules)],
      evaluationTimeMs: 0, // Will be set by caller
      modifications: Object.keys(modifications).length > 0 ? modifications : undefined,
      trace: trace && traces.length > 0 ? traces[0] : undefined,
    };
  }

  /**
   * Simulate policy evaluation (dry run)
   */
  async simulate(request: PolicyEvaluationRequest): Promise<PolicyEvaluationResponse> {
    return this.evaluate({ ...request, dryRun: true, trace: true });
  }
}
