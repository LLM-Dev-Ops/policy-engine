/**
 * Agentics Execution System - Span Factory Functions
 *
 * Helpers to create, finalize, and manage execution spans.
 * All spans are append-only and causally ordered via parent_span_id.
 */
import { v4 as uuidv4 } from 'uuid';
import { ExecutionSpan, Artifact, SpanStatus } from './types';

const REPO_NAME = 'policy-engine';

/**
 * Create a repo-level execution span.
 * Called once per entry into this repository.
 *
 * @param parentSpanId - The Core-level span ID provided by the caller
 */
export function createRepoSpan(parentSpanId: string): ExecutionSpan {
  return {
    type: 'repo',
    span_id: uuidv4(),
    parent_span_id: parentSpanId,
    repo_name: REPO_NAME,
    status: 'running',
    start_time: new Date().toISOString(),
    artifacts: [],
  };
}

/**
 * Create an agent-level execution span nested under a repo span.
 * Called once per agent invocation within this repository.
 *
 * @param repoSpanId - The repo-level span ID (parent)
 * @param agentName - The name of the agent being executed
 */
export function createAgentSpan(repoSpanId: string, agentName: string): ExecutionSpan {
  return {
    type: 'agent',
    span_id: uuidv4(),
    parent_span_id: repoSpanId,
    repo_name: REPO_NAME,
    agent_name: agentName,
    status: 'running',
    start_time: new Date().toISOString(),
    artifacts: [],
  };
}

/**
 * Finalize a span by setting its end time and status.
 *
 * @param span - The span to finalize
 * @param status - Final status ('completed' or 'failed')
 * @param error - Optional error message if status is 'failed'
 */
export function finalizeSpan(
  span: ExecutionSpan,
  status: SpanStatus,
  error?: string,
): ExecutionSpan {
  span.end_time = new Date().toISOString();
  span.status = status;
  if (error) {
    span.error = error;
  }
  return span;
}

/**
 * Attach an artifact to a span.
 * Artifacts MUST only be attached to agent-level or repo-level spans,
 * never directly to the Core span.
 *
 * @param span - The span to attach the artifact to
 * @param artifact - The artifact to attach (without producer_span_id)
 */
export function attachArtifact(
  span: ExecutionSpan,
  artifact: Omit<Artifact, 'producer_span_id'>,
): Artifact {
  const fullArtifact: Artifact = {
    ...artifact,
    producer_span_id: span.span_id,
  };
  span.artifacts.push(fullArtifact);
  return fullArtifact;
}
