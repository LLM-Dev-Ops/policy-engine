/**
 * Authentication Middleware
 * JWT-based authentication for API endpoints
 */
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '@utils/config';
import { AuthenticationError } from '@utils/errors';
import logger from '@utils/logger';
import { apiKeyRepository } from '@db/models/api-key-repository';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

type AuthPayload = jwt.JwtPayload & {
  id?: unknown;
  email?: unknown;
  roles?: unknown;
  permissions?: unknown;
};

const stringArrayClaim = (value: unknown, claim: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new AuthenticationError(`Invalid ${claim} claim`);
  }
  return value;
};

const verifyJwtUser = (token: string): AuthUser => {
  const decoded = jwt.verify(token, config.security.jwtSecret, {
    algorithms: [config.security.jwtAlgorithm],
    issuer: config.security.jwtIssuer,
    audience: config.security.jwtAudience,
  });

  if (typeof decoded === 'string') {
    throw new AuthenticationError('Invalid token payload');
  }

  const payload = decoded as AuthPayload;
  const id = typeof payload.sub === 'string' ? payload.sub : payload.id;
  if (typeof id !== 'string' || id.length === 0 || typeof payload.email !== 'string') {
    throw new AuthenticationError('Invalid identity claims');
  }

  return {
    id,
    email: payload.email,
    roles: stringArrayClaim(payload.roles, 'roles'),
    permissions: stringArrayClaim(payload.permissions, 'permissions'),
  };
};

/**
 * JWT authentication middleware
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers[(config.security.apiKeyHeader || 'X-API-Key').toLowerCase()];

    // Check for Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        req.user = verifyJwtUser(token);

        logger.debug({ userId: req.user.id }, 'User authenticated via JWT');
        next();
        return;
      } catch (error) {
        throw new AuthenticationError('Invalid or expired token');
      }
    }

    // Check for API key
    if (apiKey) {
      // Validate API key against database with bcrypt
      const validatedKey = await apiKeyRepository.validateApiKey(apiKey as string);

      if (!validatedKey) {
        throw new AuthenticationError('Invalid or expired API key');
      }

      // Set user context from API key permissions
      req.user = {
        id: validatedKey.id,
        email: `apikey-${validatedKey.key_prefix}@llm-policy-engine.com`,
        roles: ['api-user'],
        permissions: validatedKey.permissions,
      };

      logger.debug(
        {
          keyId: validatedKey.id,
          keyPrefix: validatedKey.key_prefix,
          permissions: validatedKey.permissions,
        },
        'User authenticated via API key',
      );
      next();
      return;
    }

    throw new AuthenticationError('No authentication credentials provided');
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({
        error: 'Authentication failed',
        message: error.message,
      });
    } else {
      logger.error({ error }, 'Authentication error');
      res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid credentials',
      });
    }
  }
};

/**
 * Optional authentication - don't fail if no auth provided
 */
export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      try {
        req.user = verifyJwtUser(token);
      } catch (error) {
        logger.debug('Optional auth: Invalid token, continuing without auth');
      }
    }

    next();
  } catch (error) {
    logger.error({ error }, 'Optional auth error');
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'You must be authenticated to access this resource',
      });
      return;
    }

    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

    if (!hasRole) {
      logger.warn(
        { userId: req.user.id, requiredRoles: allowedRoles, userRoles: req.user.roles },
        'Authorization failed: insufficient roles',
      );

      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this resource',
      });
      return;
    }

    next();
  };
};

/**
 * Permission-based authorization middleware
 */
export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'You must be authenticated to access this resource',
      });
      return;
    }

    const hasPermission = requiredPermissions.every((permission) =>
      req.user!.permissions.includes(permission),
    );

    if (!hasPermission) {
      logger.warn(
        {
          userId: req.user.id,
          requiredPermissions,
          userPermissions: req.user.permissions,
        },
        'Authorization failed: insufficient permissions',
      );

      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
      });
      return;
    }

    next();
  };
};

/**
 * Generate JWT token
 */
export const generateToken = (user: AuthUser): string => {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      permissions: user.permissions,
    },
    config.security.jwtSecret,
    {
      expiresIn: config.security.jwtExpiresIn,
      algorithm: config.security.jwtAlgorithm,
      issuer: config.security.jwtIssuer,
      audience: config.security.jwtAudience,
    } as jwt.SignOptions,
  );
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string): AuthUser | null => {
  try {
    return verifyJwtUser(token);
  } catch (error) {
    return null;
  }
};
