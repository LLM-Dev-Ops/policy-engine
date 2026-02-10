import { executeAgent, buildExecutionResult } from '../executor';
import { createRepoSpan } from '../spans';

describe('Executor', () => {
  describe('executeAgent', () => {
    it('should create an agent span and return result', async () => {
      const repoSpan = createRepoSpan('core-123');
      const mockData = { event_id: 'evt-1', value: 42 };

      const { data, agentSpan } = await executeAgent(
        repoSpan,
        'test-agent',
        async () => mockData,
      );

      expect(data).toEqual(mockData);
      expect(agentSpan.type).toBe('agent');
      expect(agentSpan.agent_name).toBe('test-agent');
      expect(agentSpan.parent_span_id).toBe(repoSpan.span_id);
      expect(agentSpan.status).toBe('completed');
      expect(agentSpan.end_time).toBeDefined();
    });

    it('should attach artifact when extractor is provided', async () => {
      const repoSpan = createRepoSpan('core-123');

      const { agentSpan } = await executeAgent(
        repoSpan,
        'test-agent',
        async () => ({ event_id: 'evt-1' }),
        (result) => ({
          id: result.event_id,
          type: 'decision_event',
          reference: result.event_id,
        }),
      );

      expect(agentSpan.artifacts).toHaveLength(1);
      expect(agentSpan.artifacts[0].id).toBe('evt-1');
      expect(agentSpan.artifacts[0].type).toBe('decision_event');
      expect(agentSpan.artifacts[0].producer_span_id).toBe(agentSpan.span_id);
    });

    it('should mark span as failed on error', async () => {
      const repoSpan = createRepoSpan('core-123');

      await expect(
        executeAgent(repoSpan, 'test-agent', async () => {
          throw new Error('agent failure');
        }),
      ).rejects.toThrow('agent failure');
    });
  });

  describe('buildExecutionResult', () => {
    it('should return success with valid agent spans', () => {
      const repoSpan = createRepoSpan('core-123');

      // Simulate a completed agent span
      const { agentSpan } = buildAgentSpanSync(repoSpan);

      const result = buildExecutionResult(repoSpan, [agentSpan], { value: 'test' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ value: 'test' });
      expect(result.execution.repo_span.type).toBe('repo');
      expect(result.execution.repo_span.status).toBe('completed');
      expect(result.execution.agent_spans).toHaveLength(1);
      expect(result.execution.agent_spans[0].type).toBe('agent');
    });

    it('should fail if no agent spans exist', () => {
      const repoSpan = createRepoSpan('core-123');

      const result = buildExecutionResult(repoSpan, []);

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('EXECUTION_INVARIANT_ERROR');
      expect(result.error!.message).toContain('No agent-level spans');
      expect(result.execution.repo_span.status).toBe('failed');
      expect(result.execution.agent_spans).toHaveLength(0);
    });

    it('should still return spans when execution has an error', () => {
      const repoSpan = createRepoSpan('core-123');
      const { agentSpan } = buildAgentSpanSync(repoSpan);

      const result = buildExecutionResult(
        repoSpan,
        [agentSpan],
        undefined,
        { code: 'TEST_ERROR', message: 'something broke' },
      );

      expect(result.success).toBe(false);
      expect(result.error!.code).toBe('TEST_ERROR');
      expect(result.execution.repo_span).toBeDefined();
      expect(result.execution.repo_span.status).toBe('failed');
      expect(result.execution.agent_spans).toHaveLength(1);
    });

    it('should mark repo as failed if any agent span failed', () => {
      const repoSpan = createRepoSpan('core-123');
      const { agentSpan } = buildAgentSpanSync(repoSpan, 'failed');

      const result = buildExecutionResult(repoSpan, [agentSpan], { value: 'partial' });

      expect(result.success).toBe(false);
      expect(result.execution.repo_span.status).toBe('failed');
    });

    it('should produce JSON-serializable output', () => {
      const repoSpan = createRepoSpan('core-123');
      const { agentSpan } = buildAgentSpanSync(repoSpan);

      const result = buildExecutionResult(repoSpan, [agentSpan], { key: 'value' });

      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);

      expect(parsed.success).toBe(true);
      expect(parsed.execution.repo_span.type).toBe('repo');
      expect(parsed.execution.agent_spans[0].type).toBe('agent');
    });
  });
});

/**
 * Helper: build a completed/failed agent span synchronously for testing
 */
function buildAgentSpanSync(repoSpan: ReturnType<typeof createRepoSpan>, status: 'completed' | 'failed' = 'completed') {
  const { createAgentSpan, finalizeSpan } = require('../spans');
  const agentSpan = createAgentSpan(repoSpan.span_id, 'test-agent');
  finalizeSpan(agentSpan, status, status === 'failed' ? 'test failure' : undefined);
  return { agentSpan };
}
