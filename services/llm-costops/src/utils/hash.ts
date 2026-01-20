/**
 * Hash utilities for DecisionEvent inputs
 */
import { createHash } from 'crypto';

/**
 * Generate SHA256 hash of inputs for deduplication and verification
 */
export function hashInputs(inputs: unknown): string {
  const json = JSON.stringify(inputs, Object.keys(inputs as object).sort());
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Generate unique event ID
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `costops-${timestamp}-${random}`;
}
