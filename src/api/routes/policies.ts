/**
 * Hardened Policy Routes
 *
 * Enterprise-grade REST API endpoints with:
 * - Agentics-only identity verification
 * - Append-only audit trail
 * - Policy versioning with governance
 * - Fail-closed validation
 * - Executive synthesis
 * - Enterprise metrics
 */
import { Router, Response, Request, NextFunction } from 'express';
import { YAMLParser } from '@core/parser/yaml-parser';
import { JSONParser } from '@core/parser/json-parser';
import { SchemaValidator } from '@core/validator/schema-validator';
import { cacheManager } from '@cache/cache-manager';
import { asyncHandler } from '../middleware/error-handler';
import logger from '@utils/logger';
import { Policy, PolicyStatus } from '../../types/policy';
import { PolicyValidationError, PolicyNotFoundError } from '@utils/errors';
import crypto from 'crypto';

// Security modules
import {
  requireAgenticsIdentity,
  requireReadScope,
  requireWriteScope,
  AuthenticatedRequest,
  getActorIdentity,
} from '../../security/agentics-identity';
import {
  versionedPolicyRepository,
  VersionedPolicy,
} from '../../security/versioned-policy-repository';
import {
  validatePolicyGovernance,
  detectPolicyType,
  isProductionPolicy,
} from '../../security/policy-governance';
import { auditTrail } from '../../security/audit-trail';
import {
  recordMutation,
  recordValidationFailure,
  recordGovernanceViolation,
} from '../../security/metrics';
import {
  readRateLimiter,
  mutationRateLimiter,
  strictRateLimiter,
} from '../../security/rate-limiter';

// Synthesis
import {
  buildPolicyCreateSynthesis,
  buildPolicyEditSynthesis,
  buildPolicyToggleSynthesis,
} from '../../synthesis/builder';
import { ExecutiveSummary } from '../../synthesis/types';

const router = Router();
const yamlParser = new YAMLParser();
const jsonParser = new JSONParser();
const validator = new SchemaValidator();

/**
 * Add correlation ID to all requests
 */
function addCorrelationId(req: Request, _res: Response, next: NextFunction): void {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.correlationId) {
    authReq.correlationId = req.get('x-correlation-id') || crypto.randomUUID();
  }
  next();
}

router.use(addCorrelationId);

/**
 * GET /api/policies
 * List all policies
 */
router.get(
  '/',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { namespace, status, version, limit = '100', offset = '0' } = req.query;

    let policies: VersionedPolicy[];

    if (namespace) {
      policies = await versionedPolicyRepository.findByNamespace(namespace as string);
    } else {
      policies = await versionedPolicyRepository.findActive();
    }

    if (status) {
      policies = policies.filter((p) => p.status === status);
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    const paginatedPolicies = policies.slice(offsetNum, offsetNum + limitNum);

    logger.info({
      correlationId: authReq.correlationId,
      count: paginatedPolicies.length,
      total: policies.length,
      actor: getActorIdentity(authReq.identity),
      namespace,
      version,
    }, 'Policies listed');

    res.json({
      policies: paginatedPolicies,
      total: policies.length,
      limit: limitNum,
      offset: offsetNum,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/policies/:id
 * Get policy by ID (optionally by version)
 */
router.get(
  '/:id',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { version } = req.query;

    const versionNum = version ? parseInt(version as string, 10) : undefined;
    const cacheKey = version ? `policy:${id}:v${version}` : `policy:${id}`;

    const cached = await cacheManager.get<VersionedPolicy>(cacheKey);
    if (cached) {
      logger.debug({
        correlationId: authReq.correlationId,
        policyId: id,
        version: versionNum,
      }, 'Policy retrieved from cache');

      res.json({
        policy: cached,
        cached: true,
        correlationId: authReq.correlationId,
      });
      return;
    }

    const policy = await versionedPolicyRepository.findById(id, {
      version: versionNum,
      latest: !versionNum,
    });

    if (!policy) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    await cacheManager.set(cacheKey, policy);

    logger.info({
      correlationId: authReq.correlationId,
      policyId: id,
      version: policy.internalVersion,
      actor: getActorIdentity(authReq.identity),
    }, 'Policy retrieved');

    res.json({
      policy,
      cached: false,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/policies/:id/versions
 * Get version history for a policy
 */
router.get(
  '/:id/versions',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const versions = await versionedPolicyRepository.getVersionHistory(id);

    logger.info({
      correlationId: authReq.correlationId,
      policyId: id,
      versionCount: versions.length,
      actor: getActorIdentity(authReq.identity),
    }, 'Policy versions retrieved');

    res.json({
      policyId: id,
      versions,
      total: versions.length,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/policies/:id/audit
 * Get audit trail for a policy
 */
router.get(
  '/:id/audit',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { limit = '100' } = req.query;

    const entries = await auditTrail.getByPolicyId(id, parseInt(limit as string, 10));

    logger.info({
      correlationId: authReq.correlationId,
      policyId: id,
      entryCount: entries.length,
      actor: getActorIdentity(authReq.identity),
    }, 'Policy audit trail retrieved');

    res.json({
      policyId: id,
      auditEntries: entries,
      total: entries.length,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * POST /api/policies
 * Create new policy with governance validation
 */
router.post(
  '/',
  requireAgenticsIdentity,
  requireWriteScope,
  mutationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { policy: policyData, format = 'json' } = req.body;

    let policy: Policy;
    let validationErrors: string[] = [];

    try {
      if (format === 'yaml') {
        policy = yamlParser.parse(policyData);
      } else {
        policy = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Parse error';
      validationErrors.push(`Parse error: ${errorMsg}`);

      recordValidationFailure('parse_error', 'critical', 'unknown');

      res.status(400).json({
        error: 'POLICY_PARSE_ERROR',
        message: 'Failed to parse policy',
        errors: validationErrors,
        correlationId: authReq.correlationId,
      });
      return;
    }

    // Schema validation
    const schemaValidation = validator.validate(policy);
    if (!schemaValidation.valid) {
      validationErrors = schemaValidation.errors.map((e: unknown) =>
        typeof e === 'string' ? e : (e as { message?: string })?.message || String(e)
      );

      for (const _error of validationErrors) {
        recordValidationFailure('schema_error', 'high', policy.metadata.namespace);
      }

      // Build synthesis for failed validation
      const synthesis = buildPolicyCreateSynthesis(policy, validationErrors, false);

      res.status(400).json({
        error: 'POLICY_VALIDATION_ERROR',
        message: 'Policy validation failed',
        errors: validationErrors,
        synthesis,
        correlationId: authReq.correlationId,
      });
      return;
    }

    // Governance validation (fail-closed)
    const governance = validatePolicyGovernance(policy, {
      isEnabling: policy.status === PolicyStatus.ACTIVE,
    });

    if (!governance.valid) {
      for (const violation of governance.violations) {
        recordGovernanceViolation(violation.type, detectPolicyType(policy));
      }

      const synthesis = buildPolicyCreateSynthesis(
        policy,
        governance.violations.map(v => v.message),
        false,
      );

      // Fail-closed: reject on governance violations
      res.status(422).json({
        error: 'GOVERNANCE_VIOLATION',
        message: 'Policy creation blocked by governance rules',
        violations: governance.violations,
        riskLevel: governance.riskLevel,
        requiresApproval: governance.requiresApproval,
        synthesis,
        correlationId: authReq.correlationId,
      });
      return;
    }

    try {
      // Identity is guaranteed by requireAgenticsIdentity middleware
      const identity = authReq.identity!;

      const created = await versionedPolicyRepository.create(
        policy,
        identity,
        authReq.correlationId!,
      );

      await cacheManager.set(`policy:${created.metadata.id}`, created);

      recordMutation('create', policy.metadata.namespace, identity.type);

      // Build success synthesis
      const synthesis: ExecutiveSummary = buildPolicyCreateSynthesis(policy, [], true);

      logger.info({
        correlationId: authReq.correlationId,
        policyId: created.metadata.id,
        version: created.internalVersion,
        actor: getActorIdentity(identity),
        policyType: detectPolicyType(policy),
        isProduction: isProductionPolicy(policy),
        synthesis: {
          risk_level: synthesis.risk_level,
          recommendation: synthesis.recommendation,
        },
      }, 'Policy created');

      res.status(201).json({
        policy: created,
        synthesis,
        correlationId: authReq.correlationId,
      });
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        const synthesis = buildPolicyCreateSynthesis(
          policy,
          [error.message],
          false,
        );

        res.status(422).json({
          error: 'POLICY_CREATION_FAILED',
          message: error.message,
          details: error.details,
          synthesis,
          correlationId: authReq.correlationId,
        });
        return;
      }
      throw error;
    }
  }),
);

/**
 * PUT /api/policies/:id
 * Update policy with version increment and governance
 */
router.put(
  '/:id',
  requireAgenticsIdentity,
  requireWriteScope,
  mutationRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { policy: policyData, format = 'json', hasApproval } = req.body;

    let updates: Partial<Policy>;
    let validationErrors: string[] = [];

    try {
      if (format === 'yaml') {
        updates = yamlParser.parse(policyData);
      } else {
        updates = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Parse error';

      res.status(400).json({
        error: 'POLICY_PARSE_ERROR',
        message: `Failed to parse policy: ${errorMsg}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    // Get existing policy for validation
    const existing = await versionedPolicyRepository.findById(id);
    if (!existing) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    // Merge for validation
    const mergedPolicy: Policy = {
      metadata: { ...existing.metadata, ...updates.metadata },
      rules: updates.rules || existing.rules,
      status: updates.status || existing.status,
    };

    // Schema validation
    const schemaValidation = validator.validate(mergedPolicy);
    if (!schemaValidation.valid) {
      validationErrors = schemaValidation.errors.map((e: unknown) =>
        typeof e === 'string' ? e : (e as { message?: string })?.message || String(e)
      );

      const synthesis = buildPolicyEditSynthesis(mergedPolicy, validationErrors, false);

      res.status(400).json({
        error: 'POLICY_VALIDATION_ERROR',
        message: 'Policy validation failed',
        errors: validationErrors,
        synthesis,
        correlationId: authReq.correlationId,
      });
      return;
    }

    try {
      // Identity is guaranteed by requireAgenticsIdentity middleware
      const identity = authReq.identity!;

      const updated = await versionedPolicyRepository.update(
        id,
        updates,
        identity,
        authReq.correlationId!,
        { hasApproval },
      );

      await cacheManager.delete(`policy:${id}`);

      recordMutation('update', mergedPolicy.metadata.namespace, identity.type);

      const synthesis = buildPolicyEditSynthesis(mergedPolicy, [], true);

      logger.info({
        correlationId: authReq.correlationId,
        policyId: id,
        previousVersion: existing.internalVersion,
        newVersion: updated.internalVersion,
        actor: getActorIdentity(identity),
        synthesis: {
          risk_level: synthesis.risk_level,
          recommendation: synthesis.recommendation,
        },
      }, 'Policy updated');

      res.json({
        policy: updated,
        previousVersion: existing.internalVersion,
        synthesis,
        correlationId: authReq.correlationId,
      });
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        const synthesis = buildPolicyEditSynthesis(
          mergedPolicy,
          [error.message],
          false,
        );

        res.status(422).json({
          error: 'POLICY_UPDATE_FAILED',
          message: error.message,
          details: error.details,
          synthesis,
          correlationId: authReq.correlationId,
        });
        return;
      }
      throw error;
    }
  }),
);

/**
 * PATCH /api/policies/:id/status
 * Toggle policy status with governance checks
 */
router.patch(
  '/:id/status',
  requireAgenticsIdentity,
  requireWriteScope,
  strictRateLimiter, // Stricter rate limit for status changes
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { status, hasApproval, approvalReason } = req.body;

    if (!Object.values(PolicyStatus).includes(status)) {
      res.status(400).json({
        error: 'INVALID_STATUS',
        message: `Invalid status: ${status}`,
        validStatuses: Object.values(PolicyStatus),
        correlationId: authReq.correlationId,
      });
      return;
    }

    const existing = await versionedPolicyRepository.findById(id);
    if (!existing) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    const previousStatus = existing.status;

    try {
      // Identity is guaranteed by requireAgenticsIdentity middleware
      const identity = authReq.identity!;

      const updated = await versionedPolicyRepository.toggleStatus(
        id,
        status,
        identity,
        authReq.correlationId!,
        { hasApproval, approvalReason },
      );

      await cacheManager.delete(`policy:${id}`);

      recordMutation('toggle_status', existing.metadata.namespace, identity.type);

      const synthesis = buildPolicyToggleSynthesis(updated, previousStatus, status);

      logger.info({
        correlationId: authReq.correlationId,
        policyId: id,
        previousStatus,
        newStatus: status,
        version: updated.internalVersion,
        actor: getActorIdentity(identity),
        policyType: detectPolicyType(updated),
        synthesis: {
          risk_level: synthesis.risk_level,
          recommendation: synthesis.recommendation,
        },
      }, 'Policy status changed');

      res.json({
        policy: updated,
        previousStatus,
        synthesis,
        correlationId: authReq.correlationId,
      });
    } catch (error) {
      if (error instanceof PolicyValidationError) {
        res.status(422).json({
          error: 'STATUS_CHANGE_BLOCKED',
          message: error.message,
          details: error.details,
          correlationId: authReq.correlationId,
        });
        return;
      }
      throw error;
    }
  }),
);

/**
 * DELETE /api/policies/:id
 * Delete policy (soft delete with audit)
 */
router.delete(
  '/:id',
  requireAgenticsIdentity,
  requireWriteScope,
  strictRateLimiter, // Stricter rate limit for deletes
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const existing = await versionedPolicyRepository.findById(id);
    if (!existing) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    // Check if policy is active in production
    if (existing.status === PolicyStatus.ACTIVE && isProductionPolicy(existing)) {
      res.status(422).json({
        error: 'CANNOT_DELETE_ACTIVE_PRODUCTION_POLICY',
        message: 'Cannot delete an active policy in production. Disable it first.',
        policyId: id,
        status: existing.status,
        correlationId: authReq.correlationId,
      });
      return;
    }

    try {
      // Identity is guaranteed by requireAgenticsIdentity middleware
      const identity = authReq.identity!;

      await versionedPolicyRepository.delete(id, identity, authReq.correlationId!);

      await cacheManager.delete(`policy:${id}`);

      recordMutation('delete', existing.metadata.namespace, identity.type);

      logger.info({
        correlationId: authReq.correlationId,
        policyId: id,
        version: existing.internalVersion,
        actor: getActorIdentity(identity),
      }, 'Policy deleted');

      res.status(204).send();
    } catch (error) {
      if (error instanceof PolicyNotFoundError) {
        res.status(404).json({
          error: 'POLICY_NOT_FOUND',
          message: error.message,
          correlationId: authReq.correlationId,
        });
        return;
      }
      throw error;
    }
  }),
);

/**
 * POST /api/policies/validate
 * Validate policy without creating (with full governance check)
 */
router.post(
  '/validate',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { policy: policyData, format = 'json', checkGovernance = true } = req.body;

    let policy: Policy;

    try {
      if (format === 'yaml') {
        policy = yamlParser.parse(policyData);
      } else {
        policy = typeof policyData === 'string' ? jsonParser.parse(policyData) : policyData;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Parse error';

      res.status(400).json({
        error: 'POLICY_PARSE_ERROR',
        message: `Failed to parse policy: ${errorMsg}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    const schemaValidation = validator.validate(policy);
    const validationErrors = schemaValidation.errors.map((e: unknown) =>
      typeof e === 'string' ? e : (e as { message?: string })?.message || String(e)
    );

    let governance = null;
    if (checkGovernance) {
      governance = validatePolicyGovernance(policy, {
        isEnabling: policy.status === PolicyStatus.ACTIVE,
      });
    }

    const synthesis = buildPolicyCreateSynthesis(
      policy,
      [...validationErrors, ...(governance?.violations.map(v => v.message) || [])],
      schemaValidation.valid && (governance?.valid ?? true),
    );

    logger.info({
      correlationId: authReq.correlationId,
      valid: schemaValidation.valid && (governance?.valid ?? true),
      schemaValid: schemaValidation.valid,
      governanceValid: governance?.valid,
      policyType: detectPolicyType(policy),
      actor: getActorIdentity(authReq.identity),
    }, 'Policy validated');

    res.json({
      valid: schemaValidation.valid && (governance?.valid ?? true),
      schema: {
        valid: schemaValidation.valid,
        errors: validationErrors,
      },
      governance: governance ? {
        valid: governance.valid,
        violations: governance.violations,
        riskLevel: governance.riskLevel,
        requiresApproval: governance.requiresApproval,
        approvalReason: governance.approvalReason,
      } : null,
      policyType: detectPolicyType(policy),
      isProduction: isProductionPolicy(policy),
      synthesis,
      correlationId: authReq.correlationId,
    });
  }),
);

/**
 * GET /api/policies/:id/governance
 * Get governance analysis for a policy
 */
router.get(
  '/:id/governance',
  requireAgenticsIdentity,
  requireReadScope,
  readRateLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const policy = await versionedPolicyRepository.findById(id);
    if (!policy) {
      res.status(404).json({
        error: 'POLICY_NOT_FOUND',
        message: `Policy not found: ${id}`,
        correlationId: authReq.correlationId,
      });
      return;
    }

    const governance = validatePolicyGovernance(policy, {
      isEnabling: false, // Just analyzing, not enabling
    });

    res.json({
      policyId: id,
      policyType: detectPolicyType(policy),
      isProduction: isProductionPolicy(policy),
      governance: {
        valid: governance.valid,
        violations: governance.violations,
        riskLevel: governance.riskLevel,
        requiresApproval: governance.requiresApproval,
        approvalReason: governance.approvalReason,
      },
      correlationId: authReq.correlationId,
    });
  }),
);

export default router;
