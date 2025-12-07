/**
 * LLM Observatory Integration Client
 * Phase 2B: Consumes telemetry signals and emits policy evaluation events
 *
 * This adapter follows the unidirectional dependency pattern:
 * Observatory -> Policy Engine (consumes-from)
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export type DecisionOutcome = 'allow' | 'deny' | 'warn' | 'modify' | 'error';

export interface PolicyEvaluationEvent {
  eventId: string;
  timestamp: string;
  traceId?: string;
  spanId?: string;
  policyId: string;
  ruleId?: string;
  decision: DecisionOutcome;
  durationMs: number;
  cached: boolean;
  context: Record<string, string>;
  labels: Record<string, string>;
}

export interface TraceContext {
  traceId: string;
  parentSpanId?: string;
  traceFlags: number;
  traceState?: string;
  baggage: Record<string, string>;
}

export interface PolicySpan {
  name: string;
  traceId: string;
  parentSpanId?: string;
  startTime: string;
  kind: 'INTERNAL' | 'SERVER' | 'CLIENT' | 'PRODUCER' | 'CONSUMER';
  attributes: Record<string, any>;
}

export interface SpanRegistration {
  spanId: string;
  registeredAt: string;
}

export interface SpanResult {
  endTime: string;
  status: 'UNSET' | 'OK' | 'ERROR';
  statusMessage?: string;
  attributes: Record<string, any>;
}

export interface TelemetrySignalRequest {
  service: string;
  model?: string;
  provider?: string;
  timeWindowSeconds: number;
  signalTypes: SignalType[];
}

export type SignalType = 'error_rate' | 'latency' | 'request_rate' | 'token_usage' | 'cost' | 'availability';

export interface TelemetrySignals {
  timestamp: string;
  timeWindowSeconds: number;
  errorRate?: number;
  latencyPercentiles: LatencyPercentiles;
  requestRate?: number;
  tokenUsage?: TokenUsage;
  cost?: number;
  availability?: number;
}

export interface LatencyPercentiles {
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CurrentMetrics {
  timestamp: string;
  service: string;
  model?: string;
  activeRequests: number;
  errorCount: number;
  avgLatencyMs: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
}

export interface TelemetrySubscription {
  name: string;
  services: string[];
  signalTypes: SignalType[];
  callbackUrl?: string;
  threshold?: TelemetryThreshold;
}

export interface TelemetryThreshold {
  signalType: SignalType;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  value: number;
}

export interface SubscriptionAck {
  subscriptionId: string;
  active: boolean;
}

export interface PolicyDecisionRecord {
  decisionId: string;
  timestamp: string;
  userId?: string;
  model?: string;
  provider?: string;
  policyId: string;
  decision: DecisionOutcome;
  latencyMs: number;
  reason?: string;
  metadata: Record<string, any>;
}

export interface EventAck {
  accepted: boolean;
  eventId?: string;
}

export interface BatchEventAck {
  acceptedCount: number;
  rejectedCount: number;
  rejectedIds: string[];
}

export interface RecordAck {
  accepted: boolean;
  recordId?: string;
}

export class ObservatoryClient {
  private client: AxiosInstance;
  private enabled: boolean;
  private serviceName: string;

  constructor() {
    this.enabled = !!config.integrations.llmObservatoryUrl;
    this.serviceName = 'llm-policy-engine';

    this.client = axios.create({
      baseURL: config.integrations.llmObservatoryUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Emit a policy evaluation event
   */
  async emitEvaluationEvent(event: PolicyEvaluationEvent): Promise<EventAck> {
    if (!this.enabled) {
      logger.debug('Observatory integration disabled');
      return { accepted: true };
    }

    try {
      const response = await this.client.post('/api/v1/events/policy-evaluation', event);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to emit evaluation event');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Observatory service unavailable');
        return { accepted: false };
      }
      // Don't throw - event emission should not fail the request
      return { accepted: false };
    }
  }

  /**
   * Emit a batch of policy evaluation events
   */
  async emitEvaluationEventsBatch(events: PolicyEvaluationEvent[]): Promise<BatchEventAck> {
    if (!this.enabled) {
      return { acceptedCount: events.length, rejectedCount: 0, rejectedIds: [] };
    }

    try {
      const request = {
        service: this.serviceName,
        events,
      };
      const response = await this.client.post('/api/v1/events/batch', request);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to emit batch events');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return { acceptedCount: 0, rejectedCount: events.length, rejectedIds: events.map(e => e.eventId) };
      }
      return { acceptedCount: 0, rejectedCount: events.length, rejectedIds: events.map(e => e.eventId) };
    }
  }

  /**
   * Get trace context for a request
   */
  async getTraceContext(traceId: string): Promise<TraceContext | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.get(`/api/v1/traces/${traceId}/context`);
      return response.data;
    } catch (error) {
      logger.error({ error, traceId }, 'Failed to get trace context');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      return null;
    }
  }

  /**
   * Register a trace span for policy evaluation
   */
  async registerSpan(span: PolicySpan): Promise<SpanRegistration | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.post('/api/v1/spans/register', span);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to register span');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      return null;
    }
  }

  /**
   * Complete a trace span with results
   */
  async completeSpan(spanId: string, result: SpanResult): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await this.client.post(`/api/v1/spans/${spanId}/complete`, result);
    } catch (error) {
      logger.error({ error, spanId }, 'Failed to complete span');
      // Don't throw - span completion should not fail the request
    }
  }

  /**
   * Get telemetry signals for a specific context
   */
  async getTelemetrySignals(request: TelemetrySignalRequest): Promise<TelemetrySignals | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.post('/api/v1/signals/query', request);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to get telemetry signals');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      return null;
    }
  }

  /**
   * Get current metrics for a service/model combination
   */
  async getCurrentMetrics(service: string, model?: string): Promise<CurrentMetrics | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const params = model ? `?service=${service}&model=${model}` : `?service=${service}`;
      const response = await this.client.get(`/api/v1/metrics/current${params}`);
      return response.data;
    } catch (error) {
      logger.error({ error, service, model }, 'Failed to get current metrics');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      return null;
    }
  }

  /**
   * Subscribe to real-time telemetry updates
   */
  async subscribeTelemetry(request: TelemetrySubscription): Promise<SubscriptionAck | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.post('/api/v1/subscriptions/telemetry', request);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to subscribe to telemetry');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      return null;
    }
  }

  /**
   * Record a policy decision for analytics
   */
  async recordDecision(decision: PolicyDecisionRecord): Promise<RecordAck> {
    if (!this.enabled) {
      return { accepted: true };
    }

    try {
      const response = await this.client.post('/api/v1/analytics/decisions', decision);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to record decision');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return { accepted: false };
      }
      return { accepted: false };
    }
  }

  /**
   * Check Observatory service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'Observatory health check failed');
      return false;
    }
  }

  /**
   * Check if the client is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a new trace context
   */
  createTraceContext(traceId: string): TraceContext {
    return {
      traceId,
      traceFlags: 1, // Sampled
      baggage: {},
    };
  }
}

export const observatoryClient = new ObservatoryClient();
