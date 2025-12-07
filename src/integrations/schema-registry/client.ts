/**
 * LLM Schema Registry Integration Client
 * Phase 2B: Consumes schema definitions for policy document validation
 *
 * This adapter follows the unidirectional dependency pattern:
 * Schema Registry -> Policy Engine (consumes-from)
 */
import axios, { AxiosInstance } from 'axios';
import { config } from '@utils/config';
import logger from '@utils/logger';

export interface SchemaDefinition {
  id: string;
  subject: string;
  version: number;
  schemaType: 'json-schema' | 'avro' | 'protobuf' | 'openapi';
  schema: Record<string, any>;
  metadata: SchemaMetadata;
}

export interface SchemaMetadata {
  subject: string;
  description?: string;
  owner?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PolicyDocumentSchema {
  apiVersion: string;
  kind: string;
  policies: Record<string, any>[];
}

export interface RuleSchema {
  id: string;
  name: string;
  condition: Record<string, any>;
  action: Record<string, any>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
  code?: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
}

export interface CompatibilityCheckRequest {
  subject: string;
  schema: Record<string, any>;
  compatibilityLevel?: 'NONE' | 'BACKWARD' | 'FORWARD' | 'FULL' | 'BACKWARD_TRANSITIVE' | 'FORWARD_TRANSITIVE' | 'FULL_TRANSITIVE';
}

export interface CompatibilityResult {
  compatible: boolean;
  issues: CompatibilityIssue[];
}

export interface CompatibilityIssue {
  issueType: string;
  description: string;
  path?: string;
}

export class SchemaRegistryClient {
  private client: AxiosInstance;
  private enabled: boolean;

  constructor() {
    this.enabled = !!config.integrations.llmSchemaRegistryUrl;

    this.client = axios.create({
      baseURL: config.integrations.llmSchemaRegistryUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LLM-Policy-Engine/1.0',
      },
    });
  }

  /**
   * Fetch a schema definition by its subject name
   */
  async getSchema(subject: string): Promise<SchemaDefinition | null> {
    if (!this.enabled) {
      logger.debug('Schema Registry integration disabled');
      return null;
    }

    try {
      const response = await this.client.get(`/api/v1/schemas/${subject}/latest`);
      return response.data;
    } catch (error) {
      logger.error({ error, subject }, 'Failed to fetch schema');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Schema Registry service unavailable');
        return null;
      }
      throw error;
    }
  }

  /**
   * Fetch a specific version of a schema
   */
  async getSchemaVersion(subject: string, version: number): Promise<SchemaDefinition | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const response = await this.client.get(`/api/v1/schemas/${subject}/versions/${version}`);
      return response.data;
    } catch (error) {
      logger.error({ error, subject, version }, 'Failed to fetch schema version');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Validate a policy document against the policy schema
   */
  async validatePolicyDocument(document: PolicyDocumentSchema): Promise<ValidationResult> {
    if (!this.enabled) {
      logger.debug('Schema Registry disabled, skipping validation');
      return { valid: true, errors: [], warnings: [] };
    }

    try {
      const response = await this.client.post('/api/v1/validate/policy-document', document);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Policy document validation failed');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        logger.warn('Schema Registry unavailable, skipping validation');
        return { valid: true, errors: [], warnings: [] };
      }
      throw error;
    }
  }

  /**
   * Validate a policy rule structure against the rule schema
   */
  async validateRuleStructure(rule: RuleSchema): Promise<ValidationResult> {
    if (!this.enabled) {
      return { valid: true, errors: [], warnings: [] };
    }

    try {
      const response = await this.client.post('/api/v1/validate/policy-rule', rule);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Rule structure validation failed');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return { valid: true, errors: [], warnings: [] };
      }
      throw error;
    }
  }

  /**
   * Check schema compatibility for a policy update
   */
  async checkCompatibility(request: CompatibilityCheckRequest): Promise<CompatibilityResult> {
    if (!this.enabled) {
      return { compatible: true, issues: [] };
    }

    try {
      const response = await this.client.post('/api/v1/compatibility/check', request);
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Compatibility check failed');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return { compatible: true, issues: [] };
      }
      throw error;
    }
  }

  /**
   * List available policy-related schemas
   */
  async listPolicySchemas(): Promise<SchemaMetadata[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const response = await this.client.get('/api/v1/schemas?filter=policy');
      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to list policy schemas');
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Check Schema Registry service health
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error({ error }, 'Schema Registry health check failed');
      return false;
    }
  }

  /**
   * Check if the client is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

export const schemaRegistryClient = new SchemaRegistryClient();
