/**
 * Cost Calculator for LLM requests
 */
import { TokenCounter } from './token-counter';

export interface CostEstimate {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCost: number;
  completionCost: number;
  totalCost: number;
  currency: string;
}

export interface ProviderPricing {
  promptCostPer1kTokens: number;
  completionCostPer1kTokens: number;
  currency: string;
}

export class CostCalculator {
  private tokenCounter: TokenCounter;

  // Pricing data (as of 2025 - update regularly)
  private pricing: Record<string, Record<string, ProviderPricing>> = {
    openai: {
      'gpt-4-turbo': {
        promptCostPer1kTokens: 0.01,
        completionCostPer1kTokens: 0.03,
        currency: 'USD',
      },
      'gpt-4': {
        promptCostPer1kTokens: 0.03,
        completionCostPer1kTokens: 0.06,
        currency: 'USD',
      },
      'gpt-4-32k': {
        promptCostPer1kTokens: 0.06,
        completionCostPer1kTokens: 0.12,
        currency: 'USD',
      },
      'gpt-3.5-turbo': {
        promptCostPer1kTokens: 0.0005,
        completionCostPer1kTokens: 0.0015,
        currency: 'USD',
      },
      'gpt-3.5-turbo-16k': {
        promptCostPer1kTokens: 0.003,
        completionCostPer1kTokens: 0.004,
        currency: 'USD',
      },
    },
    anthropic: {
      'claude-3-opus': {
        promptCostPer1kTokens: 0.015,
        completionCostPer1kTokens: 0.075,
        currency: 'USD',
      },
      'claude-3-sonnet': {
        promptCostPer1kTokens: 0.003,
        completionCostPer1kTokens: 0.015,
        currency: 'USD',
      },
      'claude-3-haiku': {
        promptCostPer1kTokens: 0.00025,
        completionCostPer1kTokens: 0.00125,
        currency: 'USD',
      },
      'claude-2.1': {
        promptCostPer1kTokens: 0.008,
        completionCostPer1kTokens: 0.024,
        currency: 'USD',
      },
      'claude-2': {
        promptCostPer1kTokens: 0.008,
        completionCostPer1kTokens: 0.024,
        currency: 'USD',
      },
      'claude-instant': {
        promptCostPer1kTokens: 0.0008,
        completionCostPer1kTokens: 0.0024,
        currency: 'USD',
      },
    },
    google: {
      'gemini-pro': {
        promptCostPer1kTokens: 0.00025,
        completionCostPer1kTokens: 0.0005,
        currency: 'USD',
      },
      'gemini-ultra': {
        promptCostPer1kTokens: 0.001,
        completionCostPer1kTokens: 0.002,
        currency: 'USD',
      },
      'palm-2': {
        promptCostPer1kTokens: 0.0005,
        completionCostPer1kTokens: 0.0005,
        currency: 'USD',
      },
    },
  };

  constructor() {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Calculate cost for a request
   */
  calculateCost(
    provider: string,
    model: string,
    promptTokens: number,
    completionTokens: number,
  ): CostEstimate {
    const pricing = this.getPricing(provider, model);

    const promptCost = (promptTokens / 1000) * pricing.promptCostPer1kTokens;
    const completionCost = (completionTokens / 1000) * pricing.completionCostPer1kTokens;
    const totalCost = promptCost + completionCost;

    return {
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      promptCost,
      completionCost,
      totalCost,
      currency: pricing.currency,
    };
  }

  /**
   * Estimate cost from text
   */
  estimateCostFromText(
    provider: string,
    model: string,
    promptText: string,
    estimatedCompletionTokens: number = 500,
  ): CostEstimate {
    const { tokens: promptTokens } = this.tokenCounter.estimateTokens(promptText, model);

    return this.calculateCost(provider, model, promptTokens, estimatedCompletionTokens);
  }

  /**
   * Get pricing for a provider/model
   */
  getPricing(provider: string, model: string): ProviderPricing {
    const providerLower = provider.toLowerCase();
    const modelLower = model.toLowerCase();

    // Try exact match first
    if (this.pricing[providerLower]?.[modelLower]) {
      return this.pricing[providerLower][modelLower];
    }

    // Try partial match (e.g., "gpt-4-turbo-preview" matches "gpt-4-turbo")
    // Sort keys by length descending to match most specific model first
    const providerPricing = this.pricing[providerLower];
    if (providerPricing) {
      const matchingModel = Object.keys(providerPricing)
        .sort((a, b) => b.length - a.length)
        .find((key) => modelLower.includes(key.toLowerCase()));

      if (matchingModel) {
        return providerPricing[matchingModel];
      }
    }

    // Default pricing if not found
    return {
      promptCostPer1kTokens: 0.01,
      completionCostPer1kTokens: 0.03,
      currency: 'USD',
    };
  }

  /**
   * Compare costs across providers/models
   */
  compareCosts(
    promptTokens: number,
    completionTokens: number,
    models: Array<{ provider: string; model: string }>,
  ): CostEstimate[] {
    return models.map(({ provider, model }) =>
      this.calculateCost(provider, model, promptTokens, completionTokens),
    );
  }

  /**
   * Find cheapest option
   */
  findCheapest(
    promptTokens: number,
    completionTokens: number,
    models: Array<{ provider: string; model: string }>,
  ): CostEstimate {
    const costs = this.compareCosts(promptTokens, completionTokens, models);
    return costs.reduce((cheapest, current) =>
      current.totalCost < cheapest.totalCost ? current : cheapest,
    );
  }

  /**
   * Calculate monthly cost based on usage
   */
  calculateMonthlyCost(
    provider: string,
    model: string,
    dailyRequests: number,
    avgPromptTokens: number,
    avgCompletionTokens: number,
  ): number {
    const singleRequestCost = this.calculateCost(
      provider,
      model,
      avgPromptTokens,
      avgCompletionTokens,
    ).totalCost;

    return singleRequestCost * dailyRequests * 30;
  }
}
