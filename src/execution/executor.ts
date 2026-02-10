/**
 * Agentics Execution System - Agent Execution Wrapper
 *
 * Wraps agent invocations to create proper span hierarchy, attach
 * artifacts, and enforce execution invariants.
 */
import { ExecutionSpan, ExecutionResult, Artifact } from './types';
import { createAgentSpan, finalizeSpan, attachArtifact } from './spans';
import logger from '../utils/logger';

/**
 * Result of a single agent execution, including the span and data.
 */
export interface AgentExecutionResult<T> {
  data: T;
  agentSpan: ExecutionSpan;
}

/**
 * Execute an agent within the execution span hierarchy.
 *
 * Creates an agent-level span, runs the provided function,
 * finalizes the span, and attaches the result as an artifact.
 *
 * @param repoSpan - The repo-level parent span
 * @param agentName - Name of the agent being executed
 * @param fn - The agent function to execute
 * @param artifactExtractor - Optional function to extract artifact info from the result
 */
export async function executeAgent<T>(
  repoSpan: ExecutionSpan,
  agentName: string,
  fn: () => Promise<T>,
  artifactExtractor?: (result: T) => Omit<Artifact, 'producer_span_id'>,
): Promise<AgentExecutionResult<T>> {
  const agentSpan = createAgentSpan(repoSpan.span_id, agentName);

  logger.info(
    {
      agent_name: agentName,
      agent_span_id: agentSpan.span_id,
      repo_span_id: repoSpan.span_id,
    },
    'Agent execution started',
  );

  try {
    const data = await fn();

    finalizeSpan(agentSpan, 'completed');

    if (artifactExtractor) {
      attachArtifact(agentSpan, artifactExtractor(data));
    }

    logger.info(
      {
        agent_name: agentName,
        agent_span_id: agentSpan.span_id,
        status: 'completed',
      },
      'Agent execution completed',
    );

    return { data, agentSpan };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    finalizeSpan(agentSpan, 'failed', errorMessage);

    logger.error(
      {
        agent_name: agentName,
        agent_span_id: agentSpan.span_id,
        error: errorMessage,
      },
      'Agent execution failed',
    );

    throw error;
  }
}

/**
 * Build the final ExecutionResult, enforcing all invariants.
 *
 * Invariants enforced:
 * - At least one agent span MUST exist (otherwise execution is INVALID)
 * - Repo span is finalized with appropriate status
 * - All spans are included in the output
 *
 * @param repoSpan - The repo-level span
 * @param agentSpans - All agent-level spans from this execution
 * @param data - The primary data payload (if successful)
 * @param error - Error info (if execution failed)
 */
export function buildExecutionResult<T>(
  repoSpan: ExecutionSpan,
  agentSpans: ExecutionSpan[],
  data?: T,
  error?: { code: string; message: string; details?: unknown },
): ExecutionResult<T> {
  // Invariant: at least one agent span must exist
  if (agentSpans.length === 0) {
    finalizeSpan(repoSpan, 'failed', 'No agent-level spans were emitted — execution is INVALID');

    return {
      success: false,
      error: {
        code: 'EXECUTION_INVARIANT_ERROR',
        message: 'No agent-level spans were emitted. This repository MUST NOT execute silently.',
      },
      execution: {
        repo_span: repoSpan,
        agent_spans: [],
      },
    };
  }

  // Determine repo span status from agent spans
  const anyFailed = agentSpans.some((s) => s.status === 'failed');
  const repoStatus = error || anyFailed ? 'failed' : 'completed';
  const repoError = error?.message || (anyFailed ? 'One or more agent spans failed' : undefined);

  finalizeSpan(repoSpan, repoStatus, repoError);

  return {
    success: !error && !anyFailed,
    data,
    error,
    execution: {
      repo_span: repoSpan,
      agent_spans: agentSpans,
    },
  };
}
