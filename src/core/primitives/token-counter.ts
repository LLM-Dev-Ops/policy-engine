/**
 * Token Counter for LLM requests
 * Provides estimates for different providers and models
 */

interface TokenEstimate {
  tokens: number;
  method: 'exact' | 'estimate';
}

export class TokenCounter {
  /**
   * Estimate tokens for text using simple heuristic (4 chars per token)
   * This is a rough estimate. In production, use tiktoken or provider-specific APIs
   */
  estimateTokens(text: string, model?: string): TokenEstimate {
    if (!text) {
      return { tokens: 0, method: 'exact' };
    }

    // Simple heuristic: ~4 characters per token (works reasonably well for English)
    const estimatedTokens = Math.ceil(text.length / 4);

    // Model-specific adjustments
    let tokens = estimatedTokens;

    if (model) {
      // GPT-4, GPT-3.5 typically average ~4 chars/token
      if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
        tokens = estimatedTokens;
      }
      // Claude models typically average ~4 chars/token
      else if (model.includes('claude')) {
        tokens = estimatedTokens;
      }
      // PaLM models typically average ~4.5 chars/token
      else if (model.includes('palm') || model.includes('gemini')) {
        tokens = Math.ceil(text.length / 4.5);
      }
    }

    return { tokens, method: 'estimate' };
  }

  /**
   * Estimate tokens for a conversation (array of messages)
   */
  estimateConversationTokens(messages: Array<{ role: string; content: string }>, model?: string): TokenEstimate {
    let totalTokens = 0;

    for (const message of messages) {
      const { tokens } = this.estimateTokens(message.content, model);
      totalTokens += tokens;

      // Add overhead for message formatting (role, separators, etc.)
      totalTokens += 4; // Approximate overhead per message
    }

    // Add overhead for conversation formatting
    totalTokens += 3; // Approximate base overhead

    return { tokens: totalTokens, method: 'estimate' };
  }

  /**
   * Calculate maximum tokens for a request
   */
  calculateMaxTokens(
    promptTokens: number,
    modelMaxTokens: number,
    completionTokens?: number,
  ): number {
    const maxCompletion = completionTokens || modelMaxTokens;
    const available = modelMaxTokens - promptTokens;

    return Math.min(maxCompletion, Math.max(0, available));
  }

  /**
   * Get model context window size
   */
  getModelMaxTokens(model: string): number {
    // Common model context windows
    const modelLimits: Record<string, number> = {
      'gpt-4-turbo': 128000,
      'gpt-4': 8192,
      'gpt-4-32k': 32768,
      'gpt-3.5-turbo': 4096,
      'gpt-3.5-turbo-16k': 16384,
      'claude-3-opus': 200000,
      'claude-3-sonnet': 200000,
      'claude-3-haiku': 200000,
      'claude-2.1': 200000,
      'claude-2': 100000,
      'claude-instant': 100000,
      'gemini-pro': 32768,
      'gemini-ultra': 32768,
      'palm-2': 8192,
    };

    // Find matching model (case-insensitive, partial match)
    // Sort keys by length descending to match most specific model first
    const modelKey = Object.keys(modelLimits)
      .sort((a, b) => b.length - a.length)
      .find((key) => model.toLowerCase().includes(key.toLowerCase()));

    return modelKey ? modelLimits[modelKey] : 4096; // Default to 4096 if unknown
  }
}
