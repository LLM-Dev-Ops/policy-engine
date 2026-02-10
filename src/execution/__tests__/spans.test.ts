import { createRepoSpan, createAgentSpan, finalizeSpan, attachArtifact } from '../spans';
import { ExecutionSpan } from '../types';

describe('Execution Spans', () => {
  describe('createRepoSpan', () => {
    it('should create a repo span with correct structure', () => {
      const parentSpanId = 'core-span-123';
      const span = createRepoSpan(parentSpanId);

      expect(span.type).toBe('repo');
      expect(span.repo_name).toBe('policy-engine');
      expect(span.parent_span_id).toBe(parentSpanId);
      expect(span.status).toBe('running');
      expect(span.artifacts).toEqual([]);
      expect(span.span_id).toBeDefined();
      expect(span.start_time).toBeDefined();
      expect(span.end_time).toBeUndefined();
      expect(span.error).toBeUndefined();
    });

    it('should generate unique span IDs', () => {
      const span1 = createRepoSpan('parent-1');
      const span2 = createRepoSpan('parent-1');

      expect(span1.span_id).not.toBe(span2.span_id);
    });

    it('should set start_time as valid ISO 8601', () => {
      const span = createRepoSpan('parent-1');
      const parsed = new Date(span.start_time);
      expect(parsed.toISOString()).toBe(span.start_time);
    });
  });

  describe('createAgentSpan', () => {
    it('should create an agent span nested under repo span', () => {
      const repoSpanId = 'repo-span-456';
      const agentName = 'policy-enforcement-agent';
      const span = createAgentSpan(repoSpanId, agentName);

      expect(span.type).toBe('agent');
      expect(span.repo_name).toBe('policy-engine');
      expect(span.parent_span_id).toBe(repoSpanId);
      expect(span.agent_name).toBe(agentName);
      expect(span.status).toBe('running');
      expect(span.artifacts).toEqual([]);
      expect(span.span_id).toBeDefined();
      expect(span.start_time).toBeDefined();
    });

    it('should generate unique span IDs per agent invocation', () => {
      const span1 = createAgentSpan('repo-1', 'agent-a');
      const span2 = createAgentSpan('repo-1', 'agent-a');

      expect(span1.span_id).not.toBe(span2.span_id);
    });
  });

  describe('finalizeSpan', () => {
    it('should set end_time and completed status', () => {
      const span = createRepoSpan('parent-1');
      finalizeSpan(span, 'completed');

      expect(span.status).toBe('completed');
      expect(span.end_time).toBeDefined();
      expect(span.error).toBeUndefined();
    });

    it('should set failed status with error message', () => {
      const span = createAgentSpan('repo-1', 'test-agent');
      finalizeSpan(span, 'failed', 'Something went wrong');

      expect(span.status).toBe('failed');
      expect(span.end_time).toBeDefined();
      expect(span.error).toBe('Something went wrong');
    });

    it('should return the span for chaining', () => {
      const span = createRepoSpan('parent-1');
      const result = finalizeSpan(span, 'completed');

      expect(result).toBe(span);
    });
  });

  describe('attachArtifact', () => {
    it('should attach artifact with producer_span_id', () => {
      const span = createAgentSpan('repo-1', 'test-agent');
      const artifact = attachArtifact(span, {
        id: 'event-123',
        type: 'decision_event',
        reference: 'event-123',
      });

      expect(span.artifacts).toHaveLength(1);
      expect(artifact.producer_span_id).toBe(span.span_id);
      expect(artifact.id).toBe('event-123');
      expect(artifact.type).toBe('decision_event');
      expect(artifact.reference).toBe('event-123');
    });

    it('should allow multiple artifacts on a single span', () => {
      const span = createAgentSpan('repo-1', 'test-agent');

      attachArtifact(span, { id: 'a1', type: 'type1', reference: 'ref1' });
      attachArtifact(span, { id: 'a2', type: 'type2', reference: 'ref2' });

      expect(span.artifacts).toHaveLength(2);
      expect(span.artifacts[0].id).toBe('a1');
      expect(span.artifacts[1].id).toBe('a2');
    });
  });

  describe('Span hierarchy invariants', () => {
    it('should maintain causal ordering: Core -> Repo -> Agent', () => {
      const coreSpanId = 'core-span-000';
      const repoSpan = createRepoSpan(coreSpanId);
      const agentSpan = createAgentSpan(repoSpan.span_id, 'my-agent');

      // Core -> Repo
      expect(repoSpan.parent_span_id).toBe(coreSpanId);
      // Repo -> Agent
      expect(agentSpan.parent_span_id).toBe(repoSpan.span_id);
    });

    it('should produce JSON-serializable spans without loss', () => {
      const repoSpan = createRepoSpan('core-123');
      const agentSpan = createAgentSpan(repoSpan.span_id, 'test-agent');
      attachArtifact(agentSpan, { id: 'a1', type: 't1', reference: 'r1' });
      finalizeSpan(agentSpan, 'completed');
      finalizeSpan(repoSpan, 'completed');

      const serialized = JSON.stringify({ repo_span: repoSpan, agent_spans: [agentSpan] });
      const deserialized = JSON.parse(serialized);

      expect(deserialized.repo_span.type).toBe('repo');
      expect(deserialized.agent_spans[0].type).toBe('agent');
      expect(deserialized.agent_spans[0].artifacts[0].id).toBe('a1');
    });
  });
});
