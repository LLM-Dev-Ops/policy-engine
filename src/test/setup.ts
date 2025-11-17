/**
 * Test Setup and Utilities
 * Global test configuration and helper functions
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/llm_policy_engine_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.CACHE_ENABLED = 'false';
process.env.TRACE_ENABLED = 'false';

// Global test timeout
jest.setTimeout(10000);

// Mock logger for tests
jest.mock('@utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  createChildLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Clean up after all tests
afterAll(async () => {
  // Close database connections
  try {
    const { db } = await import('@db/client');
    if (db && typeof db.close === 'function') {
      await db.close();
    }
  } catch (error) {
    // Database might not be initialized in all tests
  }

  // Close cache connections
  try {
    const { cacheManager } = await import('@cache/cache-manager');
    if (cacheManager && typeof cacheManager.close === 'function') {
      await cacheManager.close();
    }
  } catch (error) {
    // Cache might not be initialized in all tests
  }
});

// Helper: Create test policy
export function createTestPolicy(overrides: any = {}) {
  const { metadata, rule, status, ...otherOverrides } = overrides;

  return {
    metadata: {
      id: 'test-policy-001',
      name: 'Test Policy',
      description: 'A test policy',
      version: '1.0.0',
      namespace: 'test',
      tags: ['test'],
      priority: 50,
      ...metadata,
    },
    rules: [
      {
        id: 'test-rule-001',
        name: 'Test Rule',
        description: 'A test rule',
        enabled: true,
        condition: {
          operator: 'eq',
          field: 'llm.model',
          value: 'gpt-4',
        },
        action: {
          decision: 'deny',
          reason: 'Test denial',
        },
        ...rule,
      },
    ],
    status: status || 'active',
    ...otherOverrides,
  };
}

// Helper: Create test context
export function createTestContext(overrides: any = {}) {
  return {
    llm: {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      prompt: 'Test prompt',
      maxTokens: 100,
      temperature: 0.7,
      ...overrides.llm,
    },
    user: {
      id: 'user-123',
      email: 'test@example.com',
      roles: ['user'],
      permissions: ['policy:read'],
      ...overrides.user,
    },
    team: {
      id: 'team-456',
      name: 'Test Team',
      tier: 'pro',
      ...overrides.team,
    },
    project: {
      id: 'project-789',
      name: 'Test Project',
      environment: 'development',
      ...overrides.project,
    },
    request: {
      id: 'req-abc123',
      timestamp: Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
      ...overrides.request,
    },
    metadata: overrides.metadata || {},
  };
}

// Helper: Wait for async operations
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
