/**
 * Versioned Policy Repository
 *
 * Extends base repository with:
 * - Automatic version incrementing
 * - Version history tracking
 * - Version-specific retrieval
 * - Audit trail integration
 */

import { db } from '@db/client';
import { Policy, PolicyStatus } from '../types/policy';
import { DatabaseError, PolicyNotFoundError, PolicyValidationError } from '@utils/errors';
import logger from '@utils/logger';
import { auditTrail, AuditAction } from './audit-trail';
import { enforceGovernance, validatePolicyGovernance } from './policy-governance';
import { AgenticsIdentity, hasApprovalAuthority } from './agentics-identity';

/**
 * Policy with version metadata
 */
export interface VersionedPolicy extends Policy {
  internalVersion: number;
  previousVersionId?: string;
}

/**
 * Version query options
 */
export interface VersionQueryOptions {
  version?: number;
  latest?: boolean;
}

/**
 * Versioned Policy Repository
 */
export class VersionedPolicyRepository {
  /**
   * Create a new policy with version 1
   */
  async create(
    policy: Policy,
    identity: AgenticsIdentity,
    correlationId: string,
  ): Promise<VersionedPolicy> {
    // Enforce governance before creation
    enforceGovernance(policy, { isEnabling: policy.status === PolicyStatus.ACTIVE });

    try {
      const result = await db.query(
        `INSERT INTO policies (
          id, name, description, version, namespace, tags, priority,
          status, rules, created_by, internal_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          policy.metadata.id,
          policy.metadata.name,
          policy.metadata.description,
          policy.metadata.version,
          policy.metadata.namespace,
          policy.metadata.tags || [],
          policy.metadata.priority || 0,
          policy.status,
          JSON.stringify(policy.rules),
          identity.subject,
          1, // Initial version
        ],
      );

      const created = this.mapRowToVersionedPolicy(result.rows[0]);

      // Record audit entry
      await auditTrail.record({
        policyId: created.metadata.id,
        policyVersion: created.internalVersion,
        action: 'create',
        actorIdentity: `${identity.type}:${identity.subject}`,
        correlationId,
        beforeState: null,
        afterState: created,
        metadata: {
          policyName: created.metadata.name,
          namespace: created.metadata.namespace,
        },
      });

      logger.info({
        policyId: created.metadata.id,
        version: created.internalVersion,
        correlationId,
      }, 'Policy created');

      return created;
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to create policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get policy by ID with optional version
   */
  async findById(
    id: string,
    options: VersionQueryOptions = { latest: true },
  ): Promise<VersionedPolicy | null> {
    try {
      let result;

      if (options.version !== undefined) {
        // Get specific version from history
        result = await db.query(
          `SELECT * FROM policy_versions
           WHERE policy_id = $1 AND internal_version = $2`,
          [id, options.version],
        );

        if (result.rows.length === 0) {
          throw new PolicyValidationError(
            `Policy version ${options.version} not found for policy ${id}`,
          );
        }
      } else {
        // Get latest from main table
        result = await db.query(
          'SELECT * FROM policies WHERE id = $1',
          [id],
        );
      }

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToVersionedPolicy(result.rows[0]);
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to find policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get all active policies
   */
  async findActive(): Promise<VersionedPolicy[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policies
         WHERE status = $1
         ORDER BY priority DESC, created_at DESC`,
        ['active'],
      );

      return result.rows.map(row => this.mapRowToVersionedPolicy(row));
    } catch (error) {
      throw new DatabaseError('Failed to find active policies');
    }
  }

  /**
   * Get policies by namespace
   */
  async findByNamespace(namespace: string): Promise<VersionedPolicy[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policies
         WHERE namespace = $1
         ORDER BY priority DESC, created_at DESC`,
        [namespace],
      );

      return result.rows.map(row => this.mapRowToVersionedPolicy(row));
    } catch (error) {
      throw new DatabaseError('Failed to find policies by namespace');
    }
  }

  /**
   * Update policy with version increment
   */
  async update(
    id: string,
    updates: Partial<Policy>,
    identity: AgenticsIdentity,
    correlationId: string,
    options: { hasApproval?: boolean } = {},
  ): Promise<VersionedPolicy> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new PolicyNotFoundError(id);
    }

    // Merge updates
    const updatedPolicy: Policy = {
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
      },
      rules: updates.rules || existing.rules,
      status: updates.status || existing.status,
    };

    // Check if this is an enable operation
    const isEnabling = updates.status === PolicyStatus.ACTIVE &&
                       existing.status !== PolicyStatus.ACTIVE;

    // Enforce governance
    enforceGovernance(updatedPolicy, {
      isEnabling,
      hasApproval: options.hasApproval || hasApprovalAuthority(identity),
    });

    const newVersion = existing.internalVersion + 1;

    try {
      // Start transaction
      await db.query('BEGIN');

      // Archive current version
      await db.query(
        `INSERT INTO policy_versions (
          policy_id, name, description, version, namespace, tags, priority,
          status, rules, created_by, internal_version, archived_at
        )
        SELECT id, name, description, version, namespace, tags, priority,
               status, rules, created_by, internal_version, NOW()
        FROM policies WHERE id = $1`,
        [id],
      );

      // Update policy with new version
      const result = await db.query(
        `UPDATE policies SET
          name = $1, description = $2, version = $3, namespace = $4,
          tags = $5, priority = $6, status = $7, rules = $8,
          internal_version = $9, updated_at = NOW()
        WHERE id = $10
        RETURNING *`,
        [
          updatedPolicy.metadata.name,
          updatedPolicy.metadata.description,
          updatedPolicy.metadata.version,
          updatedPolicy.metadata.namespace,
          updatedPolicy.metadata.tags || [],
          updatedPolicy.metadata.priority || 0,
          updatedPolicy.status,
          JSON.stringify(updatedPolicy.rules),
          newVersion,
          id,
        ],
      );

      await db.query('COMMIT');

      const updated = this.mapRowToVersionedPolicy(result.rows[0]);

      // Determine audit action
      let action: AuditAction = 'edit';
      if (isEnabling) {
        action = 'enable';
      } else if (updates.status === PolicyStatus.DEPRECATED) {
        action = 'disable';
      }

      // Record audit entry
      await auditTrail.record({
        policyId: id,
        policyVersion: newVersion,
        action,
        actorIdentity: `${identity.type}:${identity.subject}`,
        correlationId,
        beforeState: existing,
        afterState: updated,
        metadata: {
          previousVersion: existing.internalVersion,
          changes: Object.keys(updates),
        },
      });

      logger.info({
        policyId: id,
        previousVersion: existing.internalVersion,
        newVersion,
        action,
        correlationId,
      }, 'Policy updated');

      return updated;
    } catch (error) {
      await db.query('ROLLBACK');

      if (error instanceof PolicyValidationError) {
        throw error;
      }
      throw new DatabaseError(
        `Failed to update policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete policy (soft delete - marks as deprecated)
   */
  async delete(
    id: string,
    identity: AgenticsIdentity,
    correlationId: string,
  ): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new PolicyNotFoundError(id);
    }

    try {
      // Archive before delete
      await db.query(
        `INSERT INTO policy_versions (
          policy_id, name, description, version, namespace, tags, priority,
          status, rules, created_by, internal_version, archived_at, deleted
        )
        SELECT id, name, description, version, namespace, tags, priority,
               status, rules, created_by, internal_version, NOW(), true
        FROM policies WHERE id = $1`,
        [id],
      );

      await db.query('DELETE FROM policies WHERE id = $1', [id]);

      // Record audit entry
      await auditTrail.record({
        policyId: id,
        policyVersion: existing.internalVersion,
        action: 'delete',
        actorIdentity: `${identity.type}:${identity.subject}`,
        correlationId,
        beforeState: existing,
        afterState: null,
        metadata: {
          deletedAt: new Date().toISOString(),
        },
      });

      logger.info({
        policyId: id,
        version: existing.internalVersion,
        correlationId,
      }, 'Policy deleted');
    } catch (error) {
      throw new DatabaseError(
        `Failed to delete policy: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get version history for a policy
   */
  async getVersionHistory(id: string): Promise<VersionedPolicy[]> {
    try {
      const result = await db.query(
        `SELECT * FROM policy_versions
         WHERE policy_id = $1
         ORDER BY internal_version DESC`,
        [id],
      );

      return result.rows.map(row => this.mapRowToVersionedPolicy(row));
    } catch (error) {
      throw new DatabaseError('Failed to get version history');
    }
  }

  /**
   * Toggle policy status with proper governance
   */
  async toggleStatus(
    id: string,
    newStatus: PolicyStatus,
    identity: AgenticsIdentity,
    correlationId: string,
    options: { hasApproval?: boolean; approvalReason?: string } = {},
  ): Promise<VersionedPolicy> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new PolicyNotFoundError(id);
    }

    const isEnabling = newStatus === PolicyStatus.ACTIVE &&
                       existing.status !== PolicyStatus.ACTIVE;

    // Check governance
    const governance = validatePolicyGovernance(existing, {
      isEnabling,
      hasApproval: options.hasApproval || hasApprovalAuthority(identity),
    });

    if (!governance.valid) {
      throw new PolicyValidationError(
        'Cannot change policy status due to governance violations',
        { violations: governance.violations },
      );
    }

    if (governance.requiresApproval && !options.hasApproval && !hasApprovalAuthority(identity)) {
      throw new PolicyValidationError(
        governance.approvalReason || 'This status change requires approval',
        { requiresApproval: true },
      );
    }

    return this.update(
      id,
      { status: newStatus },
      identity,
      correlationId,
      options,
    );
  }

  private mapRowToVersionedPolicy(row: any): VersionedPolicy {
    return {
      metadata: {
        id: row.policy_id || row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        namespace: row.namespace,
        tags: row.tags || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        priority: row.priority,
      },
      rules: typeof row.rules === 'string' ? JSON.parse(row.rules) : row.rules,
      status: row.status as PolicyStatus,
      internalVersion: row.internal_version || 1,
      previousVersionId: row.previous_version_id,
    };
  }
}

// Singleton instance
export const versionedPolicyRepository = new VersionedPolicyRepository();
