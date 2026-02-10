/**
 * Agentics Execution System - Type Definitions
 *
 * This module defines the contracts for the Foundational Execution Unit
 * integration. All spans are JSON-serializable, append-only, and
 * causally ordered via parent_span_id.
 */

/**
 * Execution context provided by the Core orchestrator.
 * Every externally-invoked operation MUST receive this.
 */
export interface ExecutionContext {
  /** Unique identifier for this execution run */
  execution_id: string;
  /** Span ID of the parent (Core-level span) */
  parent_span_id: string;
}

/**
 * Status of an execution span.
 */
export type SpanStatus = 'running' | 'completed' | 'failed';

/**
 * An execution span representing either a repo-level or agent-level
 * unit of work within the ExecutionGraph.
 */
export interface ExecutionSpan {
  /** Span type: 'repo' for repository-level, 'agent' for agent-level */
  type: 'repo' | 'agent';
  /** Unique identifier for this span */
  span_id: string;
  /** Parent span ID (Core span for repo, repo span for agent) */
  parent_span_id: string;
  /** Repository name */
  repo_name: string;
  /** Agent name (required when type is 'agent') */
  agent_name?: string;
  /** Current status of this span */
  status: SpanStatus;
  /** ISO 8601 timestamp when span started */
  start_time: string;
  /** ISO 8601 timestamp when span ended */
  end_time?: string;
  /** Artifacts produced during this span */
  artifacts: Artifact[];
  /** Error description if span failed */
  error?: string;
}

/**
 * An artifact produced by an agent during execution.
 * Artifacts MUST be attached at agent or repo level only,
 * never directly to the Core span.
 */
export interface Artifact {
  /** Stable identifier for this artifact */
  id: string;
  /** Type classification (e.g., 'decision_event', 'evaluation_report') */
  type: string;
  /** Stable reference: ID, URI, hash, or filename */
  reference: string;
  /** Span ID of the agent that produced this artifact */
  producer_span_id: string;
}

/**
 * The output contract for every execution through this repository.
 * Includes the data payload alongside the full span hierarchy.
 */
export interface ExecutionResult<T = unknown> {
  /** Whether the execution succeeded */
  success: boolean;
  /** The primary data payload (e.g., DecisionEvent) */
  data?: T;
  /** Error information if execution failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** The execution span hierarchy — ALWAYS present */
  execution: {
    /** The repo-level span for this execution */
    repo_span: ExecutionSpan;
    /** All agent-level spans nested under the repo span */
    agent_spans: ExecutionSpan[];
  };
}
