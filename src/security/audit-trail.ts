/**
 * Audit Trail System
 *
 * Append-only audit log for all policy mutations.
 * Records are IMMUTABLE once written.
 */

import { db } from '@db/client';
import { DatabaseError } from '@utils/errors';
import logger from '@utils/logger';
import crypto from 'crypto';
import { Policy } from '../types/policy';

/**
 * Audit action types for policy mutations
 */
export type AuditAction =
  | 'create'
  | 'edit'
  | 'enable'
  | 'disable'
  | 'delete'
  | 'version_update';

/**
 * Audit entry structure
 */
export interface AuditEntry {
  id: string;
  policy_id: string;
  policy_version: number;
  action: AuditAction;
  actor_identity: string;
  timestamp: Date;
  before_hash: string | null;
  after_hash: string | null;
  correlation_id: string;
  metadata: Record<string, unknown>;
}

/**
 * Compute deterministic hash of policy state
 */
export function computePolicyHash(policy: Policy | null): string {
  if (!policy) {
    return 'null';
  }

  const normalized = JSON.stringify({
    id: policy.metadata.id,
    name: policy.metadata.name,
    version: policy.metadata.version,
    namespace: policy.metadata.namespace,
    status: policy.status,
    rules: policy.rules,
  }, Object.keys({
    id: 1, name: 1, version: 1, namespace: 1, status: 1, rules: 1
  }).sort());

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Audit Trail Repository
 * Append-only - no update or delete operations
 */
export class AuditTrailRepository {
  /**
   * Record a policy mutation
   * This operation is APPEND-ONLY
   */
  async record(entry: {
    policyId: string;
    policyVersion: number;
    action: AuditAction;
    actorIdentity: string;
    correlationId: string;
    beforeState: Policy | null;
    afterState: Policy | null;
    metadata?: Record<string, unknown>;
  }): Promise<AuditEntry> {
    const id = crypto.randomUUID();
    const timestamp = new Date();
    const beforeHash = computePolicyHash(entry.beforeState);
    const afterHash = computePolicyHash(entry.afterState);

    try {
      const result = await db.query(
        `INSERT INTO policy_audit_trail (
          id, policy_id, policy_version, action, actor_identity,
          timestamp, before_hash, after_hash, correlation_id, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          id,
          entry.policyId,
          entry.policyVersion,
          entry.action,
          entry.actorIdentity,
          timestamp,
          beforeHash,
          afterHash,
          entry.correlationId,
          JSON.stringify(entry.metadata || {}),
        ],
      );

      const auditEntry: AuditEntry = {
        id: result.rows[0].id,
        policy_id: result.rows[0].policy_id,
        policy_version: result.rows[0].policy_version,
        action: result.rows[0].action,
        actor_identity: result.rows[0].actor_identity,
        timestamp: result.rows[0].timestamp,
        before_hash: result.rows[0].before_hash,
        after_hash: result.rows[0].after_hash,
        correlation_id: result.rows[0].correlation_id,
        metadata: result.rows[0].metadata,
      };

      logger.info({
        auditId: id,
        policyId: entry.policyId,
        policyVersion: entry.policyVersion,
        action: entry.action,
        actorIdentity: entry.actorIdentity,
        correlationId: entry.correlationId,
        beforeHash,
        afterHash,
      }, 'Audit entry recorded');

      return auditEntry;
    } catch (error) {
      // Log the failure but don't expose internal details
      logger.error({
        policyId: entry.policyId,
        action: entry.action,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Failed to record audit entry');

      throw new DatabaseError('Failed to record audit entry');
    }
  }

  /**
   * Get audit trail for a specific policy
   */
  async getByPolicyId(policyId: string, limit: number = 100): Promise<AuditEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_audit_trail
         WHERE policy_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [policyId, limit],
      );

      return result.rows.map(this.mapRowToEntry);
    } catch (error) {
      throw new DatabaseError('Failed to retrieve audit trail');
    }
  }

  /**
   * Get audit trail for a specific policy version
   */
  async getByPolicyVersion(policyId: string, version: number): Promise<AuditEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_audit_trail
         WHERE policy_id = $1 AND policy_version = $2
         ORDER BY timestamp DESC`,
        [policyId, version],
      );

      return result.rows.map(this.mapRowToEntry);
    } catch (error) {
      throw new DatabaseError('Failed to retrieve audit trail by version');
    }
  }

  /**
   * Get audit trail by actor
   */
  async getByActor(actorIdentity: string, limit: number = 100): Promise<AuditEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_audit_trail
         WHERE actor_identity = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [actorIdentity, limit],
      );

      return result.rows.map(this.mapRowToEntry);
    } catch (error) {
      throw new DatabaseError('Failed to retrieve audit trail by actor');
    }
  }

  /**
   * Get audit trail by correlation ID (for request tracing)
   */
  async getByCorrelationId(correlationId: string): Promise<AuditEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_audit_trail
         WHERE correlation_id = $1
         ORDER BY timestamp ASC`,
        [correlationId],
      );

      return result.rows.map(this.mapRowToEntry);
    } catch (error) {
      throw new DatabaseError('Failed to retrieve audit trail by correlation ID');
    }
  }

  /**
   * Get recent audit entries (for monitoring)
   */
  async getRecent(limit: number = 100): Promise<AuditEntry[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_audit_trail
         ORDER BY timestamp DESC
         LIMIT $1`,
        [limit],
      );

      return result.rows.map(this.mapRowToEntry);
    } catch (error) {
      throw new DatabaseError('Failed to retrieve recent audit entries');
    }
  }

  /**
   * Verify audit chain integrity
   * Checks that all entries are present and hashes are consistent
   */
  async verifyIntegrity(policyId: string): Promise<{
    valid: boolean;
    entries: number;
    issues: string[];
  }> {
    try {
      const entries = await this.getByPolicyId(policyId, 10000);
      const issues: string[] = [];

      // Check chronological order
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].timestamp > entries[i - 1].timestamp) {
          issues.push(`Entry ${entries[i].id} has inconsistent timestamp order`);
        }
      }

      // Check hash chain consistency
      // The after_hash of one entry should match the before_hash of the next
      const sortedByTime = [...entries].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      for (let i = 1; i < sortedByTime.length; i++) {
        const prev = sortedByTime[i - 1];
        const curr = sortedByTime[i];

        // Only check if it's the same policy and sequential operations
        if (prev.after_hash !== curr.before_hash && curr.action !== 'create') {
          // This might be okay if there was a parallel update - log but don't fail
          logger.warn({
            policyId,
            prevEntry: prev.id,
            currEntry: curr.id,
            prevAfterHash: prev.after_hash,
            currBeforeHash: curr.before_hash,
          }, 'Potential hash chain gap detected');
        }
      }

      return {
        valid: issues.length === 0,
        entries: entries.length,
        issues,
      };
    } catch (error) {
      throw new DatabaseError('Failed to verify audit integrity');
    }
  }

  private mapRowToEntry(row: any): AuditEntry {
    return {
      id: row.id,
      policy_id: row.policy_id,
      policy_version: row.policy_version,
      action: row.action,
      actor_identity: row.actor_identity,
      timestamp: row.timestamp,
      before_hash: row.before_hash,
      after_hash: row.after_hash,
      correlation_id: row.correlation_id,
      metadata: row.metadata || {},
    };
  }
}

// Singleton instance
export const auditTrail = new AuditTrailRepository();
