/**
 * Cost-Performance Tradeoff Agent
 *
 * Analyzes cost-performance tradeoffs and recommends optimal configurations.
 * Emits exactly ONE DecisionEvent per invocation via ruvector-service.
 *
 * NON-RESPONSIBILITIES:
 * - Does NOT execute SQL directly
 * - Does NOT intercept live execution
 * - Does NOT apply optimizations directly (that is LLM-Auto-Optimizer)
 * - Does NOT enforce policies (that is LLM-Shield)
 */
import {
  CostPerformanceTradeoffInput,
  CostPerformanceTradeoffOutput,
  CostPerformanceTradeoffDecisionEvent,
} from '../contracts';
import { config } from '../config';
import { logger, ruvectorClient, hashInputs, generateEventId } from '../utils';

/**
 * Model performance profiles
 */
interface ModelProfile {
  provider: string;
  model: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  avg_latency_ms: number;
  quality_score: number; // 0-1
  max_tokens: number;
  capabilities: string[];
}

const MODEL_PROFILES: ModelProfile[] = [
  // OpenAI
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    cost_per_1k_input: 0.01,
    cost_per_1k_output: 0.03,
    avg_latency_ms: 2000,
    quality_score: 0.95,
    max_tokens: 128000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    cost_per_1k_input: 0.005,
    cost_per_1k_output: 0.015,
    avg_latency_ms: 1500,
    quality_score: 0.93,
    max_tokens: 128000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
    avg_latency_ms: 800,
    quality_score: 0.85,
    max_tokens: 128000,
    capabilities: ['reasoning', 'coding', 'analysis'],
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    cost_per_1k_input: 0.0005,
    cost_per_1k_output: 0.0015,
    avg_latency_ms: 500,
    quality_score: 0.75,
    max_tokens: 16384,
    capabilities: ['reasoning', 'coding'],
  },
  // Anthropic
  {
    provider: 'anthropic',
    model: 'claude-3-opus',
    cost_per_1k_input: 0.015,
    cost_per_1k_output: 0.075,
    avg_latency_ms: 3000,
    quality_score: 0.98,
    max_tokens: 200000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
  },
  {
    provider: 'anthropic',
    model: 'claude-3.5-sonnet',
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    avg_latency_ms: 1200,
    quality_score: 0.94,
    max_tokens: 200000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
  },
  {
    provider: 'anthropic',
    model: 'claude-3-haiku',
    cost_per_1k_input: 0.00025,
    cost_per_1k_output: 0.00125,
    avg_latency_ms: 400,
    quality_score: 0.80,
    max_tokens: 200000,
    capabilities: ['reasoning', 'coding'],
  },
  // Google
  {
    provider: 'google',
    model: 'gemini-pro',
    cost_per_1k_input: 0.00025,
    cost_per_1k_output: 0.0005,
    avg_latency_ms: 600,
    quality_score: 0.82,
    max_tokens: 32000,
    capabilities: ['reasoning', 'coding', 'analysis'],
  },
  {
    provider: 'google',
    model: 'gemini-ultra',
    cost_per_1k_input: 0.0025,
    cost_per_1k_output: 0.0075,
    avg_latency_ms: 2500,
    quality_score: 0.92,
    max_tokens: 32000,
    capabilities: ['reasoning', 'coding', 'analysis', 'vision'],
  },
];

export class CostPerformanceTradeoffAgent {
  private readonly agentId = 'llm-costops-tradeoff';
  private readonly agentVersion = '1.0.0';

  /**
   * Process cost-performance tradeoff analysis
   */
  async process(
    input: CostPerformanceTradeoffInput
  ): Promise<CostPerformanceTradeoffDecisionEvent> {
    const startTime = Date.now();

    logger.info(
      { request_id: input.request_id, optimization_goal: input.optimization_goal },
      'Processing cost-performance tradeoff analysis'
    );

    // Analyze tradeoffs
    const output = this.analyzeTradeoffs(input);

    // Create DecisionEvent
    const event: CostPerformanceTradeoffDecisionEvent = {
      event_id: generateEventId(),
      agent_id: this.agentId,
      agent_version: this.agentVersion,
      decision_type: 'cost_performance_tradeoff',
      inputs_hash: hashInputs(input),
      inputs: input,
      outputs: output,
      confidence: 0.85,
      execution_ref: {
        request_id: input.request_id,
        environment: config.service.environment,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        processing_time_ms: Date.now() - startTime,
        source: 'cost-performance-tradeoff-agent',
      },
    };

    // Persist to ruvector-service
    await ruvectorClient.persistDecisionEvent(event);

    logger.info(
      {
        event_id: event.event_id,
        recommended_model: output.recommended_config.model,
        savings: output.recommended_config.expected_savings_monthly,
      },
      'Cost-performance tradeoff analysis completed'
    );

    return event;
  }

  /**
   * Analyze tradeoffs and generate recommendations
   */
  private analyzeTradeoffs(
    input: CostPerformanceTradeoffInput
  ): CostPerformanceTradeoffOutput {
    // Find current model profile
    const currentProfile = this.findModelProfile(
      input.current_config.provider,
      input.current_config.model
    );

    // Calculate current performance
    const currentPerformance = this.calculatePerformance(currentProfile, input.workload_profile);

    // Filter applicable alternatives
    const applicableAlternatives = this.filterApplicableModels(input);

    // Score and rank alternatives
    const scoredAlternatives = applicableAlternatives
      .map((profile) => this.scoreAlternative(profile, input, currentPerformance))
      .sort((a, b) => b.recommendation_score - a.recommendation_score);

    // Select best recommendation based on optimization goal
    const recommended = this.selectBestRecommendation(
      scoredAlternatives,
      input.optimization_goal,
      currentPerformance
    );

    // Generate tradeoff analysis
    const tradeoffAnalysis = this.generateTradeoffAnalysis(scoredAlternatives);

    return {
      analysis_id: generateEventId(),
      current_performance: currentPerformance,
      alternatives: scoredAlternatives.slice(0, 5), // Top 5 alternatives
      recommended_config: recommended,
      tradeoff_analysis: tradeoffAnalysis,
    };
  }

  /**
   * Find model profile
   */
  private findModelProfile(provider: string, model: string): ModelProfile {
    const profile = MODEL_PROFILES.find(
      (p) =>
        p.provider.toLowerCase() === provider.toLowerCase() &&
        p.model.toLowerCase() === model.toLowerCase()
    );

    if (!profile) {
      // Return default profile
      return {
        provider,
        model,
        cost_per_1k_input: 0.001,
        cost_per_1k_output: 0.002,
        avg_latency_ms: 1000,
        quality_score: 0.8,
        max_tokens: 8000,
        capabilities: ['reasoning'],
      };
    }

    return profile;
  }

  /**
   * Calculate performance metrics for a model
   */
  private calculatePerformance(
    profile: ModelProfile,
    workload: CostPerformanceTradeoffInput['workload_profile']
  ): CostPerformanceTradeoffOutput['current_performance'] {
    const costPerRequest =
      (workload.avg_input_tokens / 1000) * profile.cost_per_1k_input +
      (workload.avg_output_tokens / 1000) * profile.cost_per_1k_output;

    const monthlyRequests = workload.requests_per_day * 30;
    const monthlyCost = costPerRequest * monthlyRequests;

    return {
      cost_per_request: Math.round(costPerRequest * 1000000) / 1000000,
      avg_latency_ms: profile.avg_latency_ms,
      quality_score: profile.quality_score,
      monthly_cost: Math.round(monthlyCost * 100) / 100,
    };
  }

  /**
   * Filter models that meet requirements
   */
  private filterApplicableModels(
    input: CostPerformanceTradeoffInput
  ): ModelProfile[] {
    return MODEL_PROFILES.filter((profile) => {
      // Check latency constraint
      if (
        input.constraints?.max_latency_ms &&
        profile.avg_latency_ms > input.constraints.max_latency_ms
      ) {
        return false;
      }

      // Check quality constraint
      if (
        input.constraints?.min_quality_score &&
        profile.quality_score < input.constraints.min_quality_score
      ) {
        return false;
      }

      // Check workload quality requirement
      const minQuality = this.getMinQualityForRequirement(
        input.workload_profile.quality_requirement
      );
      if (profile.quality_score < minQuality) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get minimum quality score for requirement level
   */
  private getMinQualityForRequirement(
    requirement?: 'low' | 'medium' | 'high' | 'critical'
  ): number {
    switch (requirement) {
      case 'critical':
        return 0.95;
      case 'high':
        return 0.85;
      case 'medium':
        return 0.75;
      case 'low':
        return 0.6;
      default:
        return 0.7;
    }
  }

  /**
   * Score an alternative model
   */
  private scoreAlternative(
    profile: ModelProfile,
    input: CostPerformanceTradeoffInput,
    currentPerformance: CostPerformanceTradeoffOutput['current_performance']
  ): CostPerformanceTradeoffOutput['alternatives'][0] {
    const performance = this.calculatePerformance(profile, input.workload_profile);

    const costSavingsPercentage =
      currentPerformance.monthly_cost > 0
        ? ((currentPerformance.monthly_cost - performance.monthly_cost) /
            currentPerformance.monthly_cost) *
          100
        : 0;

    // Calculate performance impact
    let performanceImpact: string;
    const qualityDiff = profile.quality_score - currentPerformance.quality_score;
    const latencyDiff = profile.avg_latency_ms - currentPerformance.avg_latency_ms;

    if (qualityDiff > 0.05 && latencyDiff < 0) {
      performanceImpact = 'Significant improvement';
    } else if (qualityDiff > 0 || latencyDiff < 0) {
      performanceImpact = 'Slight improvement';
    } else if (qualityDiff > -0.05 && latencyDiff < 500) {
      performanceImpact = 'Comparable';
    } else if (qualityDiff > -0.1) {
      performanceImpact = 'Slight degradation';
    } else {
      performanceImpact = 'Significant degradation';
    }

    // Calculate recommendation score based on optimization goal
    const recommendationScore = this.calculateRecommendationScore(
      input.optimization_goal,
      costSavingsPercentage,
      profile.quality_score,
      profile.avg_latency_ms,
      input.constraints
    );

    return {
      provider: profile.provider,
      model: profile.model,
      cost_per_request: performance.cost_per_request,
      estimated_latency_ms: profile.avg_latency_ms,
      quality_score: profile.quality_score,
      monthly_cost: performance.monthly_cost,
      cost_savings_percentage: Math.round(costSavingsPercentage * 100) / 100,
      performance_impact: performanceImpact,
      recommendation_score: Math.round(recommendationScore * 100) / 100,
    };
  }

  /**
   * Calculate recommendation score
   */
  private calculateRecommendationScore(
    goal: CostPerformanceTradeoffInput['optimization_goal'],
    costSavings: number,
    quality: number,
    latency: number,
    constraints?: CostPerformanceTradeoffInput['constraints']
  ): number {
    let score = 0;

    switch (goal) {
      case 'minimize_cost':
        score = costSavings * 0.6 + quality * 30 + (1000 / latency) * 10;
        break;
      case 'maximize_performance':
        score = quality * 60 + (1000 / latency) * 30 + costSavings * 0.1;
        break;
      case 'quality_first':
        score = quality * 70 + costSavings * 0.2 + (1000 / latency) * 10;
        break;
      case 'balanced':
      default:
        score = costSavings * 0.33 + quality * 40 + (1000 / latency) * 20;
    }

    // Penalize for constraint violations
    if (constraints?.max_latency_ms && latency > constraints.max_latency_ms) {
      score -= 50;
    }
    if (constraints?.min_quality_score && quality < constraints.min_quality_score) {
      score -= 50;
    }

    return Math.max(0, score);
  }

  /**
   * Select best recommendation
   */
  private selectBestRecommendation(
    alternatives: CostPerformanceTradeoffOutput['alternatives'],
    goal: CostPerformanceTradeoffInput['optimization_goal'],
    currentPerformance: CostPerformanceTradeoffOutput['current_performance']
  ): CostPerformanceTradeoffOutput['recommended_config'] {
    if (alternatives.length === 0) {
      return {
        provider: 'current',
        model: 'keep-current',
        rationale: 'No better alternatives found that meet all constraints.',
        expected_savings_monthly: 0,
        expected_performance_change: 'No change',
      };
    }

    const best = alternatives[0];

    let rationale: string;
    switch (goal) {
      case 'minimize_cost':
        rationale = `Switching to ${best.model} provides ${best.cost_savings_percentage.toFixed(1)}% cost savings with ${best.performance_impact.toLowerCase()} performance.`;
        break;
      case 'maximize_performance':
        rationale = `${best.model} offers quality score of ${best.quality_score.toFixed(2)} with ${best.estimated_latency_ms}ms latency.`;
        break;
      case 'quality_first':
        rationale = `${best.model} provides highest quality (${best.quality_score.toFixed(2)}) while maintaining acceptable cost.`;
        break;
      default:
        rationale = `${best.model} provides optimal balance of cost (${best.cost_savings_percentage.toFixed(1)}% savings) and performance.`;
    }

    return {
      provider: best.provider,
      model: best.model,
      rationale,
      expected_savings_monthly:
        Math.round((currentPerformance.monthly_cost - best.monthly_cost) * 100) / 100,
      expected_performance_change: best.performance_impact,
    };
  }

  /**
   * Generate tradeoff analysis frontiers
   */
  private generateTradeoffAnalysis(
    alternatives: CostPerformanceTradeoffOutput['alternatives']
  ): CostPerformanceTradeoffOutput['tradeoff_analysis'] {
    // Cost vs Quality frontier
    const costQualityFrontier = alternatives
      .sort((a, b) => a.monthly_cost - b.monthly_cost)
      .reduce((frontier, alt) => {
        const last = frontier[frontier.length - 1];
        if (!last || alt.quality_score > last.quality) {
          frontier.push({
            cost: alt.monthly_cost,
            quality: alt.quality_score,
            config: `${alt.provider}/${alt.model}`,
          });
        }
        return frontier;
      }, [] as Array<{ cost: number; quality: number; config: string }>);

    // Cost vs Latency frontier
    const costLatencyFrontier = alternatives
      .sort((a, b) => a.monthly_cost - b.monthly_cost)
      .reduce((frontier, alt) => {
        const last = frontier[frontier.length - 1];
        if (!last || alt.estimated_latency_ms < last.latency) {
          frontier.push({
            cost: alt.monthly_cost,
            latency: alt.estimated_latency_ms,
            config: `${alt.provider}/${alt.model}`,
          });
        }
        return frontier;
      }, [] as Array<{ cost: number; latency: number; config: string }>);

    return {
      cost_vs_quality_frontier: costQualityFrontier,
      cost_vs_latency_frontier: costLatencyFrontier,
    };
  }
}

export const costPerformanceTradeoffAgent = new CostPerformanceTradeoffAgent();
