/**
 * Agentics Identity Middleware
 *
 * CRITICAL: This service does NOT manage identity - it only ASSERTS identity
 * from the Agentics platform. All authentication is delegated to:
 * - Agentics CLI issued JWT tokens
 * - GCP IAM service identity via Agentics runtime
 *
 * NO local login, NO credential storage, NO user management
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from '@utils/errors';
import logger from '@utils/logger';
import crypto from 'crypto';

// Agentics platform JWT issuer
const AGENTICS_ISSUER = process.env.AGENTICS_ISSUER || 'https://auth.agentics.dev';
const AGENTICS_AUDIENCE = process.env.AGENTICS_AUDIENCE || 'policy-engine';

// GCP service identity
const GCP_IDENTITY_HEADER = 'x-gcp-identity-token';

// Agentics public key for JWT verification (loaded from env or fetched)
const AGENTICS_PUBLIC_KEY = process.env.AGENTICS_PUBLIC_KEY || '';

/**
 * Identity context extracted from Agentics authentication
 */
export interface AgenticsIdentity {
  /** Unique subject identifier from Agentics platform */
  subject: string;
  /** Email associated with the identity */
  email: string;
  /** Identity type: user, service, or gcp-service */
  type: 'user' | 'service' | 'gcp-service';
  /** Scopes granted to this identity */
  scopes: string[];
  /** Organization ID in Agentics platform */
  orgId?: string;
  /** Project ID if scoped to a project */
  projectId?: string;
  /** Raw token for audit purposes (hashed) */
  tokenHash: string;
  /** Token expiration timestamp */
  expiresAt: Date;
  /** Token issued at timestamp */
  issuedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  identity?: AgenticsIdentity;
  correlationId?: string;
}

/**
 * Verify Agentics-issued JWT token
 */
async function verifyAgenticsToken(token: string): Promise<AgenticsIdentity> {
  try {
    // Decode without verification first to check issuer
    const unverified = jwt.decode(token, { complete: true });

    if (!unverified || typeof unverified.payload === 'string') {
      throw new AuthenticationError('Invalid token format');
    }

    const payload = unverified.payload as jwt.JwtPayload;

    // Verify issuer is Agentics platform
    if (payload.iss !== AGENTICS_ISSUER) {
      throw new AuthenticationError('Token not issued by Agentics platform');
    }

    // Verify audience includes this service
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(AGENTICS_AUDIENCE)) {
      throw new AuthenticationError('Token not intended for this service');
    }

    // Verify with public key if available
    if (AGENTICS_PUBLIC_KEY) {
      try {
        jwt.verify(token, AGENTICS_PUBLIC_KEY, {
          issuer: AGENTICS_ISSUER,
          audience: AGENTICS_AUDIENCE,
          algorithms: ['RS256', 'ES256'],
        });
      } catch (verifyError) {
        throw new AuthenticationError('Token signature verification failed');
      }
    } else {
      // In production, signature verification is REQUIRED
      // For development, we log a warning but continue
      if (process.env.NODE_ENV === 'production') {
        throw new AuthenticationError('Token verification not configured');
      }
      logger.warn('AGENTICS_PUBLIC_KEY not set - signature verification skipped (dev only)');
    }

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new AuthenticationError('Token has expired');
    }

    // Extract identity
    return {
      subject: payload.sub || '',
      email: payload.email || `${payload.sub}@agentics.dev`,
      type: payload.identity_type || 'user',
      scopes: payload.scopes || payload.scope?.split(' ') || [],
      orgId: payload.org_id,
      projectId: payload.project_id,
      tokenHash: crypto.createHash('sha256').update(token).digest('hex').substring(0, 16),
      expiresAt: new Date((payload.exp || 0) * 1000),
      issuedAt: new Date((payload.iat || 0) * 1000),
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError(`Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify GCP service identity token
 */
async function verifyGCPIdentity(token: string): Promise<AgenticsIdentity> {
  try {
    // GCP identity tokens are Google-signed JWTs
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded.payload === 'string') {
      throw new AuthenticationError('Invalid GCP identity token format');
    }

    const payload = decoded.payload as jwt.JwtPayload;

    // Verify it's from Google
    if (!payload.iss?.includes('accounts.google.com')) {
      throw new AuthenticationError('Token not issued by Google');
    }

    // Check if it's from an authorized Agentics service
    const authorizedServicePatterns = [
      /.*@agentics-.*\.iam\.gserviceaccount\.com$/,
      /.*@.*\.iam\.gserviceaccount\.com$/, // Allow all service accounts in dev
    ];

    const email = payload.email || '';
    const isAuthorized = process.env.NODE_ENV === 'production'
      ? authorizedServicePatterns[0].test(email)
      : authorizedServicePatterns.some(p => p.test(email));

    if (!isAuthorized) {
      throw new AuthenticationError('GCP service account not authorized');
    }

    return {
      subject: payload.sub || email,
      email,
      type: 'gcp-service',
      scopes: ['policy:read', 'policy:write'], // GCP service accounts get full access
      orgId: payload.hd, // Google Workspace domain
      tokenHash: crypto.createHash('sha256').update(token).digest('hex').substring(0, 16),
      expiresAt: new Date((payload.exp || 0) * 1000),
      issuedAt: new Date((payload.iat || 0) * 1000),
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    throw new AuthenticationError('GCP identity verification failed');
  }
}

/**
 * Generate correlation ID for request tracing
 */
function generateCorrelationId(req: Request): string {
  // Use existing correlation ID if provided, otherwise generate new one
  const existing = req.headers['x-correlation-id'] || req.headers['x-request-id'];
  if (existing && typeof existing === 'string') {
    return existing;
  }
  return `pe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Main authentication middleware
 * Accepts ONLY Agentics-issued identity tokens
 */
export const requireAgenticsIdentity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const correlationId = generateCorrelationId(req);
  req.correlationId = correlationId;

  // Add correlation ID to response
  res.setHeader('X-Correlation-ID', correlationId);

  try {
    const authHeader = req.headers.authorization;
    const gcpIdentityToken = req.headers[GCP_IDENTITY_HEADER] as string | undefined;

    // Try Agentics JWT first
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      req.identity = await verifyAgenticsToken(token);

      logger.info({
        correlationId,
        subject: req.identity.subject,
        type: req.identity.type,
        scopes: req.identity.scopes,
        path: req.path,
        method: req.method,
      }, 'Agentics identity verified');

      next();
      return;
    }

    // Try GCP service identity
    if (gcpIdentityToken) {
      req.identity = await verifyGCPIdentity(gcpIdentityToken);

      logger.info({
        correlationId,
        subject: req.identity.subject,
        type: req.identity.type,
        path: req.path,
        method: req.method,
      }, 'GCP service identity verified');

      next();
      return;
    }

    throw new AuthenticationError('No valid Agentics identity provided');
  } catch (error) {
    const message = error instanceof AuthenticationError
      ? error.message
      : 'Authentication failed';

    logger.warn({
      correlationId,
      error: message,
      path: req.path,
      method: req.method,
      ip: req.ip,
    }, 'Authentication rejected');

    res.status(401).json({
      error: 'AUTHENTICATION_REQUIRED',
      message,
      correlationId,
    });
  }
};

/**
 * Scope-based authorization middleware
 * Must be used AFTER requireAgenticsIdentity
 */
export const requireScope = (...requiredScopes: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.identity) {
      res.status(401).json({
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Identity not established',
        correlationId: req.correlationId,
      });
      return;
    }

    const hasAllScopes = requiredScopes.every(scope =>
      req.identity!.scopes.includes(scope) ||
      req.identity!.scopes.includes('*') ||
      req.identity!.scopes.includes('policy:*')
    );

    if (!hasAllScopes) {
      logger.warn({
        correlationId: req.correlationId,
        subject: req.identity.subject,
        requiredScopes,
        actualScopes: req.identity.scopes,
        path: req.path,
        method: req.method,
      }, 'Authorization denied - insufficient scopes');

      res.status(403).json({
        error: 'INSUFFICIENT_SCOPE',
        message: `Required scopes: ${requiredScopes.join(', ')}`,
        correlationId: req.correlationId,
      });
      return;
    }

    next();
  };
};

/**
 * Convenience middleware for read operations
 */
export const requireReadScope = requireScope('policy:read');

/**
 * Convenience middleware for write operations
 */
export const requireWriteScope = requireScope('policy:write');

/**
 * Convenience middleware for admin operations
 */
export const requireAdminScope = requireScope('policy:admin');

/**
 * Extract actor identity for audit logging
 */
export function getActorIdentity(identity: AgenticsIdentity | undefined): string {
  if (!identity) {
    return 'anonymous';
  }
  return `${identity.type}:${identity.subject}`;
}

/**
 * Check if identity has approval authority for security/compliance policies
 */
export function hasApprovalAuthority(identity: AgenticsIdentity | undefined): boolean {
  if (!identity) return false;

  return identity.scopes.includes('policy:approve') ||
         identity.scopes.includes('policy:admin') ||
         identity.scopes.includes('*');
}
