/**
 * RuVector Service Client
 *
 * Client for persisting DecisionEvents to ruvector-service.
 *
 * IMPORTANT: LLM-Policy-Engine NEVER connects directly to Google SQL.
 * ALL persistence occurs via ruvector-service client calls only.
 *
 * This follows the LLM-Policy-Engine Agent Infrastructure Constitution:
 * - No local persistence
 * - No direct SQL access
 * - Async, non-blocking writes
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';
import {
  DecisionEvent,
  AgentRegistration,
} from '../../agents/contracts/decision-event';

/**
 * Response from persisting a DecisionEvent
 */
export interface DecisionEventAck {
  /** Whether the event was accepted */
  accepted: boolean;
  /** Persisted event ID */
  event_id?: string;
  /** Error message if rejected */
  error?: string;
  /** Timestamp of persistence */
  persisted_at?: string;
}

/**
 * Batch persistence response
 */
export interface BatchDecisionEventAck {
  /** Number of events accepted */
  accepted_count: number;
  /** Number of events rejected */
  rejected_count: number;
  /** IDs of rejected events */
  rejected_ids: string[];
  /** Error details for rejections */
  errors?: Record<string, string>;
}

/**
 * Query parameters for retrieving DecisionEvents
 */
export interface DecisionEventQuery {
  /** Filter by agent ID */
  agent_id?: string;
  /** Filter by decision type */
  decision_type?: string;
  /** Filter by request ID */
  request_id?: string;
  /** Filter by timestamp range (start) */
  from_timestamp?: string;
  /** Filter by timestamp range (end) */
  to_timestamp?: string;
  /** Filter by environment */
  environment?: string;
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Search results for DecisionEvents
 */
export interface DecisionEventSearchResult {
  /** Total count of matching events */
  total: number;
  /** Events in this page */
  events: DecisionEvent[];
  /** Whether there are more results */
  has_more: boolean;
}

/**
 * Agent registration response
 */
export interface AgentRegistrationAck {
  /** Whether registration was successful */
  registered: boolean;
  /** Registered agent ID */
  agent_id?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Health check response
 */
export interface HealthCheckResponse {
  /** Service status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Database connectivity */
  database: boolean;
  /** Version info */
  version: string;
  /** Response time in ms */
  latency_ms: number;
}

/**
 * RuVector Service Client
 *
 * Provides async, non-blocking access to ruvector-service for:
 * - Persisting DecisionEvents
 * - Registering agents
 * - Querying historical decisions
 */
export class RuVectorServiceClient {
  private client: AxiosInstance;
  private enabled: boolean;
  private serviceName: string;

  constructor() {
    this.enabled = !!config.integrations?.ruvectorServiceUrl;
    this.serviceName = 'llm-policy-engine';

    this.client = axios.create({
      baseURL: config.integrations?.ruvectorServiceUrl || 'http://localhost:8080',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
        'X-Service-Name': this.serviceName,
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use((requestConfig) => {
      // Add Agentics identity token if available
      const token = process.env.AGENTICS_API_TOKEN;
      if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
      }
      return requestConfig;
    });
  }

  /**
   * Persist a DecisionEvent to ruvector-service
   *
   * This is the PRIMARY method for recording agent decisions.
   * It MUST be called exactly ONCE per agent invocation.
   */
  async persistDecisionEvent(event: DecisionEvent): Promise<DecisionEventAck> {
    if (!this.enabled) {
      logger.debug('RuVector service integration disabled');
      return { accepted: true, event_id: event.event_id };
    }

    try {
      const response = await this.client.post<DecisionEventAck>(
        '/api/v1/decision-events',
        event
      );

      logger.info(
        { event_id: event.event_id, agent_id: event.agent_id },
        'DecisionEvent persisted successfully'
      );

      return response.data;
    } catch (error) {
      return this.handleError(error, 'persistDecisionEvent', {
        accepted: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  /**
   * Persist multiple DecisionEvents in a batch
   */
  async persistDecisionEventsBatch(events: DecisionEvent[]): Promise<BatchDecisionEventAck> {
    if (!this.enabled) {
      return {
        accepted_count: events.length,
        rejected_count: 0,
        rejected_ids: [],
      };
    }

    try {
      const response = await this.client.post<BatchDecisionEventAck>(
        '/api/v1/decision-events/batch',
        { events }
      );

      logger.info(
        { count: events.length, accepted: response.data.accepted_count },
        'Batch DecisionEvents persisted'
      );

      return response.data;
    } catch (error) {
      return this.handleError(error, 'persistDecisionEventsBatch', {
        accepted_count: 0,
        rejected_count: events.length,
        rejected_ids: events.map(e => e.event_id),
      });
    }
  }

  /**
   * Register an agent with ruvector-service
   */
  async registerAgent(registration: AgentRegistration): Promise<AgentRegistrationAck> {
    if (!this.enabled) {
      logger.debug('RuVector service integration disabled');
      return { registered: true, agent_id: registration.agent_id };
    }

    try {
      const response = await this.client.post<AgentRegistrationAck>(
        '/api/v1/agents/register',
        registration
      );

      logger.info(
        { agent_id: registration.agent_id, version: registration.agent_version },
        'Agent registered successfully'
      );

      return response.data;
    } catch (error) {
      return this.handleError(error, 'registerAgent', {
        registered: false,
        error: this.getErrorMessage(error),
      });
    }
  }

  /**
   * Query historical DecisionEvents
   */
  async queryDecisionEvents(query: DecisionEventQuery): Promise<DecisionEventSearchResult> {
    if (!this.enabled) {
      return { total: 0, events: [], has_more: false };
    }

    try {
      const response = await this.client.get<DecisionEventSearchResult>(
        '/api/v1/decision-events',
        { params: query }
      );
      return response.data;
    } catch (error) {
      return this.handleError(error, 'queryDecisionEvents', {
        total: 0,
        events: [],
        has_more: false,
      });
    }
  }

  /**
   * Get a specific DecisionEvent by ID
   */
  async getDecisionEvent(eventId: string): Promise<DecisionEvent | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.get<DecisionEvent>(
        `/api/v1/decision-events/${eventId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      return this.handleError(error, 'getDecisionEvent', null);
    }
  }

  /**
   * Get DecisionEvents by request ID
   */
  async getDecisionEventsByRequestId(requestId: string): Promise<DecisionEvent[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.get<DecisionEventSearchResult>(
        '/api/v1/decision-events',
        { params: { request_id: requestId } }
      );
      return response.data.events;
    } catch (error) {
      return this.handleError(error, 'getDecisionEventsByRequestId', []);
    }
  }

  /**
   * Check ruvector-service health
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();

    if (!this.enabled) {
      return {
        status: 'unhealthy',
        database: false,
        version: 'unknown',
        latency_ms: Date.now() - startTime,
      };
    }

    try {
      const response = await this.client.get<HealthCheckResponse>('/health');
      return {
        ...response.data,
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      logger.error({ error }, 'RuVector service health check failed');
      return {
        status: 'unhealthy',
        database: false,
        version: 'unknown',
        latency_ms: Date.now() - startTime,
      };
    }
  }

  /**
   * Check if the client is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Handle errors with graceful degradation
   * Decision event emission should not fail the main request
   */
  private handleError<T>(error: unknown, operation: string, fallback: T): T {
    const errorMessage = this.getErrorMessage(error);

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        logger.warn(
          { operation },
          'RuVector service unavailable - continuing with graceful degradation'
        );
      } else if (error.response?.status === 503) {
        logger.warn(
          { operation },
          'RuVector service temporarily unavailable'
        );
      } else {
        logger.error(
          { operation, error: errorMessage, status: error.response?.status },
          'RuVector service error'
        );
      }
    } else {
      logger.error({ operation, error: errorMessage }, 'Unexpected error in RuVector client');
    }

    return fallback;
  }

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      return error.response?.data?.message || error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}

// Export singleton instance
export const ruvectorServiceClient = new RuVectorServiceClient();
