/**
 * RuVector Service Client for LLM-CostOps
 *
 * ALL persistence occurs via ruvector-service client calls only.
 * LLM-CostOps does NOT connect directly to Google SQL.
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import logger from './logger';
import { AnyCostOpsDecisionEvent } from '../contracts';

export interface DecisionEventAck {
  accepted: boolean;
  event_id?: string;
  error?: string;
  persisted_at?: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: boolean;
  version: string;
  latency_ms: number;
}

export class RuVectorClient {
  private client: AxiosInstance;
  private serviceName: string;

  constructor() {
    this.serviceName = config.service.name;

    this.client = axios.create({
      baseURL: config.ruvector.serviceUrl,
      timeout: config.ruvector.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `${this.serviceName}/${config.service.version}`,
        'X-Service-Name': this.serviceName,
      },
    });

    // Add auth interceptor
    this.client.interceptors.request.use((requestConfig) => {
      if (config.ruvector.apiKey) {
        requestConfig.headers.Authorization = `Bearer ${config.ruvector.apiKey}`;
      }
      return requestConfig;
    });
  }

  /**
   * Persist a CostOps DecisionEvent to ruvector-service
   */
  async persistDecisionEvent(event: AnyCostOpsDecisionEvent): Promise<DecisionEventAck> {
    try {
      const response = await this.client.post<DecisionEventAck>(
        '/api/v1/decision-events',
        event
      );

      logger.info(
        { event_id: event.event_id, agent_id: event.agent_id, decision_type: event.decision_type },
        'CostOps DecisionEvent persisted'
      );

      return response.data;
    } catch (error) {
      logger.error({ error, event_id: event.event_id }, 'Failed to persist DecisionEvent');

      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('RuVector service unavailable - graceful degradation');
        return { accepted: false, error: 'Service unavailable' };
      }

      return {
        accepted: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Query cost data from ruvector-service
   */
  async queryCostData(params: {
    scope?: { user_id?: string; team_id?: string; project_id?: string };
    from_date?: string;
    to_date?: string;
    limit?: number;
  }): Promise<any[]> {
    try {
      const response = await this.client.get('/api/v1/cost-data', { params });
      return response.data.records || [];
    } catch (error) {
      logger.error({ error }, 'Failed to query cost data');
      return [];
    }
  }

  /**
   * Query budget data from ruvector-service
   */
  async queryBudget(params: {
    user_id?: string;
    team_id?: string;
    project_id?: string;
    budget_id?: string;
  }): Promise<any | null> {
    try {
      const response = await this.client.get('/api/v1/budgets', { params });
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to query budget');
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    const startTime = Date.now();
    try {
      const response = await this.client.get<HealthCheckResponse>('/health');
      return {
        ...response.data,
        latency_ms: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        database: false,
        version: 'unknown',
        latency_ms: Date.now() - startTime,
      };
    }
  }
}

export const ruvectorClient = new RuVectorClient();
