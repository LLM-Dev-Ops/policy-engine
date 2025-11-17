/**
 * Comprehensive Unit Tests for CostCalculator
 * Enterprise-grade test coverage for all pricing calculations
 * Target: 80%+ coverage
 */
import { CostCalculator, CostEstimate, ProviderPricing } from '../cost-calculator';

describe('CostCalculator', () => {
  let calculator: CostCalculator;

  beforeEach(() => {
    calculator = new CostCalculator();
  });

  describe('calculateCost', () => {
    describe('OpenAI Pricing', () => {
      it('should calculate GPT-4 Turbo costs correctly', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4-turbo', 1000, 500);

        expect(cost.provider).toBe('openai');
        expect(cost.model).toBe('gpt-4-turbo');
        expect(cost.promptTokens).toBe(1000);
        expect(cost.completionTokens).toBe(500);
        expect(cost.totalTokens).toBe(1500);
        expect(cost.promptCost).toBe(0.01); // 1000 tokens * $0.01/1k
        expect(cost.completionCost).toBe(0.015); // 500 tokens * $0.03/1k
        expect(cost.totalCost).toBe(0.025);
        expect(cost.currency).toBe('USD');
      });

      it('should calculate GPT-4 costs correctly', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4', 2000, 1000);

        expect(cost.promptCost).toBe(0.06); // 2000 * $0.03/1k
        expect(cost.completionCost).toBe(0.06); // 1000 * $0.06/1k
        expect(cost.totalCost).toBe(0.12);
      });

      it('should calculate GPT-4-32K costs correctly', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4-32k', 5000, 2000);

        expect(cost.promptCost).toBe(0.30); // 5000 * $0.06/1k
        expect(cost.completionCost).toBe(0.24); // 2000 * $0.12/1k
        expect(cost.totalCost).toBe(0.54);
      });

      it('should calculate GPT-3.5 Turbo costs correctly', () => {
        const cost = calculator.calculateCost('openai', 'gpt-3.5-turbo', 10000, 5000);

        expect(cost.promptCost).toBe(0.005); // 10000 * $0.0005/1k
        expect(cost.completionCost).toBe(0.0075); // 5000 * $0.0015/1k
        expect(cost.totalCost).toBe(0.0125);
      });

      it('should calculate GPT-3.5 Turbo 16K costs correctly', () => {
        const cost = calculator.calculateCost('openai', 'gpt-3.5-turbo-16k', 15000, 5000);

        expect(cost.promptCost).toBe(0.045); // 15000 * $0.003/1k
        expect(cost.completionCost).toBe(0.020); // 5000 * $0.004/1k
        expect(cost.totalCost).toBe(0.065);
      });
    });

    describe('Anthropic Pricing', () => {
      it('should calculate Claude 3 Opus costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-3-opus', 1000, 500);

        expect(cost.provider).toBe('anthropic');
        expect(cost.model).toBe('claude-3-opus');
        expect(cost.promptCost).toBe(0.015); // 1000 * $0.015/1k
        expect(cost.completionCost).toBe(0.0375); // 500 * $0.075/1k
        expect(cost.totalCost).toBe(0.0525);
      });

      it('should calculate Claude 3 Sonnet costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-3-sonnet', 2000, 1000);

        expect(cost.promptCost).toBeCloseTo(0.006, 6); // 2000 * $0.003/1k
        expect(cost.completionCost).toBeCloseTo(0.015, 6); // 1000 * $0.015/1k
        expect(cost.totalCost).toBeCloseTo(0.021, 6);
      });

      it('should calculate Claude 3 Haiku costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-3-haiku', 10000, 5000);

        expect(cost.promptCost).toBe(0.0025); // 10000 * $0.00025/1k
        expect(cost.completionCost).toBe(0.00625); // 5000 * $0.00125/1k
        expect(cost.totalCost).toBe(0.00875);
      });

      it('should calculate Claude 2.1 costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-2.1', 3000, 1500);

        expect(cost.promptCost).toBeCloseTo(0.024, 6); // 3000 * $0.008/1k
        expect(cost.completionCost).toBeCloseTo(0.036, 6); // 1500 * $0.024/1k
        expect(cost.totalCost).toBeCloseTo(0.060, 6);
      });

      it('should calculate Claude 2 costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-2', 2000, 1000);

        expect(cost.promptCost).toBe(0.016);
        expect(cost.completionCost).toBe(0.024);
        expect(cost.totalCost).toBe(0.040);
      });

      it('should calculate Claude Instant costs correctly', () => {
        const cost = calculator.calculateCost('anthropic', 'claude-instant', 5000, 2500);

        expect(cost.promptCost).toBeCloseTo(0.004, 6); // 5000 * $0.0008/1k
        expect(cost.completionCost).toBeCloseTo(0.006, 6); // 2500 * $0.0024/1k
        expect(cost.totalCost).toBeCloseTo(0.010, 6);
      });
    });

    describe('Google Pricing', () => {
      it('should calculate Gemini Pro costs correctly', () => {
        const cost = calculator.calculateCost('google', 'gemini-pro', 10000, 5000);

        expect(cost.provider).toBe('google');
        expect(cost.model).toBe('gemini-pro');
        expect(cost.promptCost).toBe(0.0025); // 10000 * $0.00025/1k
        expect(cost.completionCost).toBe(0.0025); // 5000 * $0.0005/1k
        expect(cost.totalCost).toBe(0.005);
      });

      it('should calculate Gemini Ultra costs correctly', () => {
        const cost = calculator.calculateCost('google', 'gemini-ultra', 5000, 2500);

        expect(cost.promptCost).toBe(0.005); // 5000 * $0.001/1k
        expect(cost.completionCost).toBe(0.005); // 2500 * $0.002/1k
        expect(cost.totalCost).toBe(0.010);
      });

      it('should calculate PaLM-2 costs correctly', () => {
        const cost = calculator.calculateCost('google', 'palm-2', 8000, 4000);

        expect(cost.promptCost).toBe(0.004); // 8000 * $0.0005/1k
        expect(cost.completionCost).toBe(0.002); // 4000 * $0.0005/1k
        expect(cost.totalCost).toBe(0.006);
      });
    });

    describe('Case Insensitivity', () => {
      it('should handle uppercase provider names', () => {
        const cost = calculator.calculateCost('OPENAI', 'gpt-4-turbo', 1000, 500);
        expect(cost.totalCost).toBe(0.025);
      });

      it('should handle mixed case model names', () => {
        const cost = calculator.calculateCost('openai', 'GPT-4-TURBO', 1000, 500);
        expect(cost.totalCost).toBe(0.025);
      });

      it('should handle mixed case provider and model', () => {
        const cost = calculator.calculateCost('AnThRoPiC', 'ClAuDe-3-OpUs', 1000, 500);
        expect(cost.totalCost).toBe(0.0525);
      });
    });

    describe('Partial Model Matching', () => {
      it('should match GPT-4 Turbo variants', () => {
        const cost1 = calculator.calculateCost('openai', 'gpt-4-turbo-preview', 1000, 500);
        const cost2 = calculator.calculateCost('openai', 'gpt-4-turbo-2024-04-09', 1000, 500);

        expect(cost1.totalCost).toBe(0.025);
        expect(cost2.totalCost).toBe(0.025);
      });

      it('should match Claude 3 variants', () => {
        const cost1 = calculator.calculateCost('anthropic', 'claude-3-opus-20240229', 1000, 500);
        const cost2 = calculator.calculateCost('anthropic', 'claude-3-sonnet-20240229', 1000, 500);

        expect(cost1.totalCost).toBeCloseTo(0.0525, 6); // Opus pricing: 1k*0.015 + 0.5k*0.075
        expect(cost2.totalCost).toBeCloseTo(0.0105, 6); // Sonnet pricing: 1k*0.003 + 0.5k*0.015
      });
    });

    describe('Unknown Models', () => {
      it('should use default pricing for unknown model', () => {
        const cost = calculator.calculateCost('openai', 'unknown-model', 1000, 500);

        expect(cost.promptCost).toBe(0.01); // Default: $0.01/1k
        expect(cost.completionCost).toBe(0.015); // Default: $0.03/1k * 500
        expect(cost.totalCost).toBe(0.025);
        expect(cost.currency).toBe('USD');
      });

      it('should use default pricing for unknown provider', () => {
        const cost = calculator.calculateCost('unknown-provider', 'some-model', 1000, 500);

        expect(cost.promptCost).toBe(0.01);
        expect(cost.completionCost).toBe(0.015);
        expect(cost.totalCost).toBe(0.025);
      });
    });

    describe('Edge Cases', () => {
      it('should handle zero tokens', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4', 0, 0);

        expect(cost.promptTokens).toBe(0);
        expect(cost.completionTokens).toBe(0);
        expect(cost.totalTokens).toBe(0);
        expect(cost.promptCost).toBe(0);
        expect(cost.completionCost).toBe(0);
        expect(cost.totalCost).toBe(0);
      });

      it('should handle very large token counts', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4', 100000, 50000);

        expect(cost.promptCost).toBe(3.0); // 100000 * $0.03/1k
        expect(cost.completionCost).toBe(3.0); // 50000 * $0.06/1k
        expect(cost.totalCost).toBe(6.0);
      });

      it('should handle fractional token counts', () => {
        const cost = calculator.calculateCost('openai', 'gpt-4', 1500, 750);

        expect(cost.promptCost).toBe(0.045); // 1500 * $0.03/1k
        expect(cost.completionCost).toBe(0.045); // 750 * $0.06/1k
        expect(cost.totalCost).toBe(0.09);
      });
    });
  });

  describe('estimateCostFromText', () => {
    it('should estimate cost from text with default completion tokens', () => {
      const text = 'This is a test prompt that should be tokenized';
      const cost = calculator.estimateCostFromText('openai', 'gpt-4', text);

      expect(cost.provider).toBe('openai');
      expect(cost.model).toBe('gpt-4');
      expect(cost.promptTokens).toBeGreaterThan(0);
      expect(cost.completionTokens).toBe(500); // Default
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('should estimate cost with custom completion tokens', () => {
      const text = 'Short prompt';
      const cost = calculator.estimateCostFromText('openai', 'gpt-4', text, 1000);

      expect(cost.completionTokens).toBe(1000);
    });

    it('should handle empty text', () => {
      const cost = calculator.estimateCostFromText('openai', 'gpt-4', '', 100);

      expect(cost.promptTokens).toBe(0);
      expect(cost.completionTokens).toBe(100);
      expect(cost.promptCost).toBe(0);
      expect(cost.completionCost).toBeGreaterThan(0);
    });

    it('should estimate for different models', () => {
      const text = 'Test prompt';
      const cost1 = calculator.estimateCostFromText('openai', 'gpt-4', text, 500);
      const cost2 = calculator.estimateCostFromText('openai', 'gpt-3.5-turbo', text, 500);

      // GPT-4 should be more expensive
      expect(cost1.totalCost).toBeGreaterThan(cost2.totalCost);
    });
  });

  describe('getPricing', () => {
    it('should return exact pricing match', () => {
      const pricing = calculator.getPricing('openai', 'gpt-4');

      expect(pricing.promptCostPer1kTokens).toBe(0.03);
      expect(pricing.completionCostPer1kTokens).toBe(0.06);
      expect(pricing.currency).toBe('USD');
    });

    it('should return partial match for model variants', () => {
      const pricing = calculator.getPricing('openai', 'gpt-4-turbo-preview');

      expect(pricing.promptCostPer1kTokens).toBe(0.01);
      expect(pricing.completionCostPer1kTokens).toBe(0.03);
    });

    it('should return default pricing for unknown model', () => {
      const pricing = calculator.getPricing('unknown', 'unknown-model');

      expect(pricing.promptCostPer1kTokens).toBe(0.01);
      expect(pricing.completionCostPer1kTokens).toBe(0.03);
      expect(pricing.currency).toBe('USD');
    });

    it('should handle case-insensitive lookups', () => {
      const pricing1 = calculator.getPricing('OpenAI', 'GPT-4');
      const pricing2 = calculator.getPricing('openai', 'gpt-4');

      expect(pricing1.promptCostPer1kTokens).toBe(pricing2.promptCostPer1kTokens);
    });
  });

  describe('compareCosts', () => {
    it('should compare costs across multiple models', () => {
      const models = [
        { provider: 'openai', model: 'gpt-4' },
        { provider: 'openai', model: 'gpt-3.5-turbo' },
        { provider: 'anthropic', model: 'claude-3-haiku' },
      ];

      const comparisons = calculator.compareCosts(1000, 500, models);

      expect(comparisons).toHaveLength(3);
      expect(comparisons[0].model).toBe('gpt-4');
      expect(comparisons[1].model).toBe('gpt-3.5-turbo');
      expect(comparisons[2].model).toBe('claude-3-haiku');

      // Verify GPT-4 is most expensive
      expect(comparisons[0].totalCost).toBeGreaterThan(comparisons[1].totalCost);
      expect(comparisons[0].totalCost).toBeGreaterThan(comparisons[2].totalCost);
    });

    it('should handle empty models array', () => {
      const comparisons = calculator.compareCosts(1000, 500, []);
      expect(comparisons).toHaveLength(0);
    });

    it('should compare same token counts across providers', () => {
      const models = [
        { provider: 'openai', model: 'gpt-4-turbo' },
        { provider: 'anthropic', model: 'claude-3-opus' },
        { provider: 'google', model: 'gemini-pro' },
      ];

      const comparisons = calculator.compareCosts(5000, 2500, models);

      expect(comparisons).toHaveLength(3);
      comparisons.forEach((cost) => {
        expect(cost.promptTokens).toBe(5000);
        expect(cost.completionTokens).toBe(2500);
        expect(cost.totalTokens).toBe(7500);
      });
    });
  });

  describe('findCheapest', () => {
    it('should find the cheapest model option', () => {
      const models = [
        { provider: 'openai', model: 'gpt-4' }, // Most expensive
        { provider: 'openai', model: 'gpt-3.5-turbo' },
        { provider: 'anthropic', model: 'claude-3-haiku' }, // Cheapest
      ];

      const cheapest = calculator.findCheapest(1000, 500, models);

      expect(cheapest.model).toBe('claude-3-haiku');
      expect(cheapest.provider).toBe('anthropic');
      expect(cheapest.totalCost).toBeLessThan(0.01); // Very cheap
    });

    it('should return the only option when one model provided', () => {
      const models = [{ provider: 'openai', model: 'gpt-4' }];

      const cheapest = calculator.findCheapest(1000, 500, models);

      expect(cheapest.model).toBe('gpt-4');
    });

    it('should compare models with different pricing structures', () => {
      const models = [
        { provider: 'openai', model: 'gpt-4-turbo' },
        { provider: 'anthropic', model: 'claude-3-sonnet' },
        { provider: 'google', model: 'gemini-pro' },
      ];

      const cheapest = calculator.findCheapest(10000, 5000, models);

      // Gemini Pro should be cheapest for large volumes
      expect(cheapest.model).toBe('gemini-pro');
    });
  });

  describe('calculateMonthlyCost', () => {
    it('should calculate monthly cost based on daily usage', () => {
      const monthlyCost = calculator.calculateMonthlyCost(
        'openai',
        'gpt-4',
        100, // 100 requests per day
        1000, // 1000 prompt tokens average
        500, // 500 completion tokens average
      );

      const singleRequestCost = calculator.calculateCost('openai', 'gpt-4', 1000, 500).totalCost;
      const expectedMonthlyCost = singleRequestCost * 100 * 30;

      expect(monthlyCost).toBe(expectedMonthlyCost);
      expect(monthlyCost).toBeCloseTo(180, 0); // ~$180/month (100 req/day * 30 days * $0.06/req)
    });

    it('should calculate monthly cost for high-volume usage', () => {
      const monthlyCost = calculator.calculateMonthlyCost(
        'openai',
        'gpt-3.5-turbo',
        10000, // 10k requests per day
        500,
        250,
      );

      expect(monthlyCost).toBeGreaterThan(0);
      // GPT-3.5 Turbo is cheap, even at 10k req/day
      expect(monthlyCost).toBeLessThan(1000);
    });

    it('should handle zero daily requests', () => {
      const monthlyCost = calculator.calculateMonthlyCost('openai', 'gpt-4', 0, 1000, 500);

      expect(monthlyCost).toBe(0);
    });

    it('should calculate for different models', () => {
      const costGPT4 = calculator.calculateMonthlyCost('openai', 'gpt-4', 100, 1000, 500);
      const costGPT35 = calculator.calculateMonthlyCost('openai', 'gpt-3.5-turbo', 100, 1000, 500);

      // GPT-4 should be significantly more expensive
      expect(costGPT4).toBeGreaterThan(costGPT35 * 10);
    });

    it('should calculate for varying token counts', () => {
      const costSmall = calculator.calculateMonthlyCost('openai', 'gpt-4', 100, 100, 50);
      const costLarge = calculator.calculateMonthlyCost('openai', 'gpt-4', 100, 10000, 5000);

      // Larger token counts should be proportionally more expensive
      expect(costLarge).toBeGreaterThan(costSmall * 50);
    });
  });

  describe('Real-World Scenarios', () => {
    it('should estimate realistic chatbot costs', () => {
      // Chatbot: 1000 conversations/day, avg 500 tokens prompt, 1000 tokens completion
      const monthlyCost = calculator.calculateMonthlyCost(
        'openai',
        'gpt-3.5-turbo',
        1000,
        500,
        1000,
      );

      // Should be affordable for GPT-3.5 Turbo
      expect(monthlyCost).toBeGreaterThan(10);
      expect(monthlyCost).toBeLessThan(100);
    });

    it('should estimate realistic content generation costs', () => {
      // Content generation: 50 articles/day, avg 500 tokens prompt, 2000 tokens completion
      const monthlyCost = calculator.calculateMonthlyCost('openai', 'gpt-4', 50, 500, 2000);

      expect(monthlyCost).toBeGreaterThan(100);
      expect(monthlyCost).toBeLessThan(1000);
    });

    it('should compare cost-effectiveness for code generation', () => {
      const models = [
        { provider: 'openai', model: 'gpt-4-turbo' },
        { provider: 'anthropic', model: 'claude-3-sonnet' },
      ];

      // Code generation: typically 300 prompt, 1500 completion tokens
      const comparison = calculator.compareCosts(300, 1500, models);

      expect(comparison).toHaveLength(2);
      comparison.forEach((cost) => {
        expect(cost.totalCost).toBeGreaterThan(0);
        expect(cost.totalCost).toBeLessThan(0.10); // Should be under 10 cents per request
      });
    });

    it('should calculate cost for long-context document analysis', () => {
      // Document analysis with Claude 3: 50k prompt tokens, 5k completion
      const cost = calculator.calculateCost('anthropic', 'claude-3-opus', 50000, 5000);

      expect(cost.promptCost).toBeGreaterThan(0.5);
      expect(cost.completionCost).toBeGreaterThan(0.3);
      expect(cost.totalCost).toBeGreaterThan(0.8);
    });
  });

  describe('Integration with TokenCounter', () => {
    it('should use token counter for text estimation', () => {
      const text = 'A' + 'B'.repeat(100); // ~100 chars = ~25 tokens
      const cost = calculator.estimateCostFromText('openai', 'gpt-4', text, 500);

      expect(cost.promptTokens).toBeGreaterThan(20);
      expect(cost.promptTokens).toBeLessThan(30);
    });

    it('should handle very long text', () => {
      const longText = 'word '.repeat(10000); // ~50k chars = ~12.5k tokens
      const cost = calculator.estimateCostFromText('openai', 'gpt-4', longText, 1000);

      expect(cost.promptTokens).toBeGreaterThan(10000);
      expect(cost.promptCost).toBeGreaterThan(0.30); // Should be significant
    });
  });
});
