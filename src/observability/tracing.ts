/**
 * Distributed Tracing using OpenTelemetry
 * Production-grade tracing for request flow visibility
 */
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { RedisInstrumentation as Redis4Instrumentation } from '@opentelemetry/instrumentation-redis-4';
import { trace, Span, SpanStatusCode, Context, context } from '@opentelemetry/api';
import { config } from '@utils/config';
import logger from '@utils/logger';

export class TracingService {
  private provider: NodeTracerProvider | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = config.observability.traceEnabled;
  }

  /**
   * Initialize tracing
   */
  initialize(): void {
    if (!this.enabled) {
      logger.info('Tracing disabled');
      return;
    }

    try {
      const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: 'llm-policy-engine',
        [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.nodeEnv,
      });

      this.provider = new NodeTracerProvider({
        resource,
      });

      const jaegerExporter = new JaegerExporter({
        endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
      });

      this.provider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter) as any);

      this.provider.register();

      registerInstrumentations({
        instrumentations: [
          new HttpInstrumentation({
            requestHook: (span, request) => {
              const headers = (request as any).headers;
              span.setAttribute('http.request.id', headers?.['x-request-id'] || '');
            },
          }),
          new ExpressInstrumentation(),
          new PgInstrumentation({
            enhancedDatabaseReporting: true,
          }),
          new Redis4Instrumentation(),
        ],
      });

      logger.info('Tracing initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize tracing');
      this.enabled = false;
    }
  }

  /**
   * Create a new span
   */
  createSpan(name: string, attributes?: Record<string, any>): Span | null {
    if (!this.enabled) {
      return null;
    }

    const tracer = trace.getTracer('llm-policy-engine');
    const span = tracer.startSpan(name, {
      attributes: attributes || {},
    });

    return span;
  }

  /**
   * Start a span with context
   */
  startSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    attributes?: Record<string, any>,
  ): Promise<T> {
    if (!this.enabled) {
      const mockSpan = {
        end: () => {},
        setStatus: () => {},
        setAttribute: () => {},
        addEvent: () => {},
      } as any;
      return fn(mockSpan);
    }

    const tracer = trace.getTracer('llm-policy-engine');

    return tracer.startActiveSpan(name, { attributes: attributes || {} }, async (span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get current context
   */
  getCurrentContext(): Context {
    return context.active();
  }

  /**
   * Wrap a function with tracing
   */
  wrap<T extends (...args: any[]) => Promise<any>>(
    name: string,
    fn: T,
    getAttributes?: (...args: Parameters<T>) => Record<string, any>,
  ): T {
    if (!this.enabled) {
      return fn;
    }

    return (async (...args: Parameters<T>) => {
      const attributes = getAttributes ? getAttributes(...args) : {};
      return this.startSpan(name, () => fn(...args), attributes);
    }) as T;
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, attributes?: Record<string, any>): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Set attribute on current span
   */
  setAttribute(key: string, value: string | number | boolean): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.setAttribute(key, value);
    }
  }

  /**
   * Set multiple attributes on current span
   */
  setAttributes(attributes: Record<string, string | number | boolean>): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
  }

  /**
   * Record exception in current span
   */
  recordException(error: Error): void {
    if (!this.enabled) {
      return;
    }

    const span = trace.getActiveSpan();
    if (span) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }

  /**
   * Shutdown tracing
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      logger.info('Tracing shutdown complete');
    }
  }
}

export const tracingService = new TracingService();

/**
 * Trace decorator for class methods
 */
export function Trace(spanName?: string, getAttributes?: (...args: any[]) => Record<string, any>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const attributes = getAttributes ? getAttributes(...args) : {};
      return tracingService.startSpan(name, () => originalMethod.apply(this, args), attributes);
    };

    return descriptor;
  };
}
