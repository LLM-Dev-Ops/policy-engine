/**
 * Cost Attribution Agent
 *
 * Attributes token, model, and infrastructure costs to users, teams, and projects.
 * Emits exactly ONE DecisionEvent per invocation via ruvector-service.
 *
 * NON-RESPONSIBILITIES:
 * - Does NOT execute SQL directly
 * - Does NOT intercept live execution
 * - Does NOT enforce policies (that is LLM-Shield)
 * - Does NOT apply optimizations (that is LLM-Auto-Optimizer)
 */
import {
  CostAttributionInput,
  CostAttributionOutput,
  CostAttributionDecisionEvent,
  CurrencyCode,
} from '../contracts';
import { config } from '../config';
import { logger, ruvectorClient, hashInputs, generateEventId } from '../utils';

/**
 * Model pricing data (per 1K tokens)
 * In production, this would be fetched from a pricing service
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  // Anthropic
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  // Google
  'gemini-pro': { input: 0.00025, output: 0.0005 },
  'gemini-ultra': { input: 0.0025, output: 0.0075 },
  // Default
  default: { input: 0.001, output: 0.002 },
};

export class CostAttributionAgent {
  private readonly agentId = 'llm-costops-attribution';
  private readonly agentVersion = '1.0.0';

  /**
   * Process cost attribution request
   */
  async process(input: CostAttributionInput): Promise<CostAttributionDecisionEvent> {
    const startTime = Date.now();

    logger.info({ request_id: input.request_id }, 'Processing cost attribution');

    // Calculate costs
    const output = this.calculateCosts(input);

    // Create DecisionEvent
    const event: CostAttributionDecisionEvent = {
      event_id: generateEventId(),
      agent_id: this.agentId,
      agent_version: this.agentVersion,
      decision_type: 'cost_attribution',
      inputs_hash: hashInputs(input),
      inputs: input,
      outputs: output,
      confidence: 1.0, // Deterministic calculation
      execution_ref: {
        request_id: input.request_id,
        environment: config.service.environment,
      },
      timestamp: new Date().toISOString(),
      metadata: {
        processing_time_ms: Date.now() - startTime,
        source: 'cost-attribution-agent',
      },
    };

    // Persist to ruvector-service (async, non-blocking)
    await ruvectorClient.persistDecisionEvent(event);

    logger.info(
      {
        event_id: event.event_id,
        total_cost: output.total_cost,
        provider: input.provider,
        model: input.model,
      },
      'Cost attribution completed'
    );

    return event;
  }

  /**
   * Calculate costs based on token usage and model pricing
   */
  private calculateCosts(input: CostAttributionInput): CostAttributionOutput {
    const pricing = this.getModelPricing(input.provider, input.model);

    const inputCost = (input.input_tokens / 1000) * pricing.input;
    const outputCost = (input.output_tokens / 1000) * pricing.output;
    const baseCost = inputCost + outputCost;

    // Apply any markup (e.g., infrastructure overhead)
    const markup = baseCost * 0.1; // 10% overhead
    const totalCost = baseCost + markup;

    return {
      total_cost: Math.round(totalCost * 1000000) / 1000000, // 6 decimal places
      currency: 'USD' as CurrencyCode,
      breakdown: {
        input_cost: Math.round(inputCost * 1000000) / 1000000,
        output_cost: Math.round(outputCost * 1000000) / 1000000,
        base_cost: Math.round(baseCost * 1000000) / 1000000,
        markup: Math.round(markup * 1000000) / 1000000,
      },
      unit_costs: {
        per_1k_input_tokens: pricing.input,
        per_1k_output_tokens: pricing.output,
      },
      attribution: {
        user_id: input.user_id,
        team_id: input.team_id,
        project_id: input.project_id,
      },
      tags: this.generateTags(input),
    };
  }

  /**
   * Get pricing for model
   */
  private getModelPricing(
    provider: string,
    model: string
  ): { input: number; output: number } {
    // Normalize model name
    const normalizedModel = model.toLowerCase().replace(/[_-]/g, '-');

    // Try exact match
    if (MODEL_PRICING[normalizedModel]) {
      return MODEL_PRICING[normalizedModel];
    }

    // Try provider-model combination
    const providerModel = `${provider.toLowerCase()}-${normalizedModel}`;
    if (MODEL_PRICING[providerModel]) {
      return MODEL_PRICING[providerModel];
    }

    // Return default pricing
    logger.warn({ provider, model }, 'Using default pricing for unknown model');
    return MODEL_PRICING.default;
  }

  /**
   * Generate tags for cost attribution
   */
  private generateTags(input: CostAttributionInput): string[] {
    const tags: string[] = [];

    tags.push(`provider:${input.provider}`);
    tags.push(`model:${input.model}`);

    if (input.environment) {
      tags.push(`env:${input.environment}`);
    }
    if (input.user_id) {
      tags.push(`user:${input.user_id}`);
    }
    if (input.team_id) {
      tags.push(`team:${input.team_id}`);
    }
    if (input.project_id) {
      tags.push(`project:${input.project_id}`);
    }

    return tags;
  }
}

export const costAttributionAgent = new CostAttributionAgent();
