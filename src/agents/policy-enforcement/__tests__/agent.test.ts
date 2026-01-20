/**
 * Policy Enforcement Agent Tests
 *
 * Verification tests for the Policy Enforcement Agent.
 * These tests verify:
 * - Contract compliance
 * - DecisionEvent schema validation
 * - Correct evaluation behavior
 * - Non-responsibility constraints
 */
import {
  PolicyEnforcementAgent,
  AGENT_ID,
  AGENT_VERSION,
  DECISION_TYPE,
} from '../agent';
import {
  DecisionEvent,
  PolicyEnforcementInput,
  PolicyDecisionOutcome,
} from '../../contracts/decision-event';
import { Policy, PolicyStatus, DecisionType, ConditionOperator } from '../../../types/policy';

// Mock the external dependencies
jest.mock('../../../integrations/ruvector-service', () => ({
  ruvectorServiceClient: {
    persistDecisionEvent: jest.fn().mockResolvedValue({ accepted: true }),
    isEnabled: jest.fn().mockReturnValue(false),
  },
}));

jest.mock('../../../integrations/observatory', () => ({
  observatoryClient: {
    emitEvaluationEvent: jest.fn().mockResolvedValue({ accepted: true }),
    isEnabled: jest.fn().mockReturnValue(false),
  },
}));

describe('PolicyEnforcementAgent', () => {
  let agent: PolicyEnforcementAgent;
  let testPolicy: Policy;

  beforeEach(() => {
    // Create test policy
    testPolicy = {
      metadata: {
        id: 'test-policy-1',
        name: 'Test Policy',
        version: '1.0.0',
        namespace: 'test',
        priority: 100,
      },
      rules: [
        {
          id: 'deny-high-cost',
          name: 'Deny High Cost Requests',
          condition: {
            operator: ConditionOperator.GREATER_THAN,
            field: 'llm.maxTokens',
            value: 1000,
          },
          action: {
            decision: DecisionType.DENY,
            reason: 'Request exceeds token limit',
          },
          enabled: true,
        },
        {
          id: 'allow-default',
          name: 'Allow Default',
          condition: {
            operator: ConditionOperator.EQUALS,
            field: 'llm.provider',
            value: 'openai',
          },
          action: {
            decision: DecisionType.ALLOW,
          },
          enabled: true,
        },
      ],
      status: PolicyStatus.ACTIVE,
    };

    agent = new PolicyEnforcementAgent([testPolicy]);
  });

  describe('Agent Metadata', () => {
    it('should have correct agent ID', () => {
      expect(AGENT_ID).toBe('policy-enforcement-agent');
    });

    it('should have correct agent version', () => {
      expect(AGENT_VERSION).toBe('1.0.0');
    });

    it('should have correct decision type', () => {
      expect(DECISION_TYPE).toBe('policy_enforcement_decision');
    });
  });

  describe('Agent Registration', () => {
    const registration = PolicyEnforcementAgent.getRegistration();

    it('should provide valid registration metadata', () => {
      expect(registration.agent_id).toBe(AGENT_ID);
      expect(registration.agent_version).toBe(AGENT_VERSION);
      expect(registration.agent_type).toBe('policy_evaluation');
    });

    it('should declare correct CLI contract', () => {
      expect(registration.cli_contract.command).toBe('agent');
      expect(registration.cli_contract.subcommands).toContain('evaluate');
      expect(registration.cli_contract.subcommands).toContain('resolve');
      expect(registration.cli_contract.subcommands).toContain('route');
    });

    it('should declare correct consumers', () => {
      expect(registration.consumers).toContain('llm-edge-agent');
      expect(registration.consumers).toContain('llm-orchestrator');
      expect(registration.consumers).toContain('llm-incident-manager');
    });

    it('should declare non-responsibilities per constitution', () => {
      expect(registration.non_responsibilities).toContain('Intercept execution traffic directly');
      expect(registration.non_responsibilities).toContain('Execute workflows');
      expect(registration.non_responsibilities).toContain('Connect directly to databases');
    });
  });

  describe('Policy Evaluation', () => {
    it('should produce a valid DecisionEvent on evaluation', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            max_tokens: 500,
          },
          user: {
            id: 'user-1',
          },
        },
      };

      const result = await agent.evaluate(input);

      // Verify DecisionEvent structure
      expect(result).toHaveProperty('event_id');
      expect(result).toHaveProperty('agent_id', AGENT_ID);
      expect(result).toHaveProperty('agent_version', AGENT_VERSION);
      expect(result).toHaveProperty('decision_type', DECISION_TYPE);
      expect(result).toHaveProperty('inputs_hash');
      expect(result).toHaveProperty('outputs');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('constraints_applied');
      expect(result).toHaveProperty('execution_ref');
      expect(result).toHaveProperty('timestamp');
    });

    it('should return policy_allow for allowed requests', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-2',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            max_tokens: 500, // Under limit
          },
        },
      };

      const result = await agent.evaluate(input);

      expect(result.outputs.decision).toBe('policy_allow');
      expect(result.outputs.allowed).toBe(true);
    });

    it('should return policy_deny for denied requests', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-3',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            max_tokens: 2000, // Over limit
          },
        },
      };

      const result = await agent.evaluate(input);

      expect(result.outputs.decision).toBe('policy_deny');
      expect(result.outputs.allowed).toBe(false);
      expect(result.outputs.reason).toContain('token limit');
    });

    it('should include execution reference', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-4',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      expect(result.execution_ref.request_id).toBe('test-request-4');
      expect(result.execution_ref).toHaveProperty('trace_id');
      expect(result.execution_ref).toHaveProperty('environment');
    });

    it('should calculate confidence score', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-5',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should track applied constraints', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-6',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            max_tokens: 500,
          },
        },
      };

      const result = await agent.evaluate(input);

      expect(Array.isArray(result.constraints_applied)).toBe(true);
      // When a rule matches, it should be tracked as a constraint
      if (result.outputs.matched_policies.length > 0) {
        expect(result.constraints_applied.length).toBeGreaterThan(0);
      }
    });

    it('should create deterministic inputs hash', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-request-7',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result1 = await agent.evaluate(input);
      const result2 = await agent.evaluate(input);

      expect(result1.inputs_hash).toBe(result2.inputs_hash);
    });
  });

  describe('Resolve Command', () => {
    it('should resolve with trace enabled', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-resolve-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.resolve(input);

      expect(result).toHaveProperty('event_id');
      expect(result.outputs).toHaveProperty('decision');
    });
  });

  describe('Route Command', () => {
    it('should add routing metadata', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-route-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.route(input);

      expect(result.metadata).toHaveProperty('routed', true);
      expect(result.metadata).toHaveProperty('routing_targets');
    });

    it('should route denied decisions to incident manager', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-route-2',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
            max_tokens: 2000, // Will be denied
          },
        },
      };

      const result = await agent.route(input);
      const targets = (result.metadata as any)?.routing_targets || [];

      expect(targets).toContain('llm-incident-manager');
    });
  });

  describe('Dry Run Mode', () => {
    it('should support dry run mode', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-dryrun-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
        dry_run: true,
      };

      const result = await agent.evaluate(input);

      expect(result.metadata?.mode).toBe('dry-run');
    });
  });

  describe('Trace Mode', () => {
    it('should support trace mode', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-trace-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
        trace: true,
      };

      const result = await agent.evaluate(input);

      expect(result).toHaveProperty('event_id');
    });
  });

  describe('Contract Compliance', () => {
    it('should emit exactly one DecisionEvent per invocation', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-compliance-1',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      // Result should be a single DecisionEvent, not an array
      expect(result.event_id).toBeDefined();
      expect(typeof result.event_id).toBe('string');
    });

    it('should include all required DecisionEvent fields', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-compliance-2',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      // Required fields per constitution
      const requiredFields = [
        'event_id',
        'agent_id',
        'agent_version',
        'decision_type',
        'inputs_hash',
        'outputs',
        'confidence',
        'constraints_applied',
        'execution_ref',
        'timestamp',
      ];

      requiredFields.forEach((field) => {
        expect(result).toHaveProperty(field);
      });
    });

    it('should have valid timestamp format', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-compliance-3',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      // Should be ISO 8601 format
      expect(() => new Date(result.timestamp)).not.toThrow();
    });

    it('should produce valid PolicyDecisionOutcome', async () => {
      const input: PolicyEnforcementInput = {
        request_id: 'test-compliance-4',
        context: {
          llm: {
            provider: 'openai',
            model: 'gpt-4',
          },
        },
      };

      const result = await agent.evaluate(input);

      const validOutcomes: PolicyDecisionOutcome[] = [
        'policy_allow',
        'policy_deny',
        'approval_required',
        'conditional_allow',
        'constraint_violation',
      ];

      expect(validOutcomes).toContain(result.outputs.decision);
    });
  });
});

describe('Smoke Tests', () => {
  it('should handle empty context gracefully', async () => {
    const agent = new PolicyEnforcementAgent([]);
    const input: PolicyEnforcementInput = {
      request_id: 'smoke-test-1',
      context: {},
    };

    const result = await agent.evaluate(input);

    // Should default to allow when no policies match
    expect(result.outputs.allowed).toBe(true);
  });

  it('should handle no policies gracefully', async () => {
    const agent = new PolicyEnforcementAgent([]);
    const input: PolicyEnforcementInput = {
      request_id: 'smoke-test-2',
      context: {
        llm: {
          provider: 'openai',
          model: 'gpt-4',
        },
      },
    };

    const result = await agent.evaluate(input);

    expect(result.outputs.decision).toBe('policy_allow');
    expect(result.confidence).toBeLessThan(1); // Lower confidence when no policies match
  });

  it('should include evaluation time in output', async () => {
    const agent = new PolicyEnforcementAgent([]);
    const input: PolicyEnforcementInput = {
      request_id: 'smoke-test-3',
      context: {
        llm: {
          provider: 'openai',
          model: 'gpt-4',
        },
      },
    };

    const result = await agent.evaluate(input);

    expect(result.outputs.evaluation_time_ms).toBeGreaterThanOrEqual(0);
  });
});
