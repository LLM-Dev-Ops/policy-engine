import jwt from 'jsonwebtoken';

import { generateToken, verifyToken } from '../auth';
import { config } from '@utils/config';

const user = {
  id: 'user-123',
  email: 'user@example.com',
  roles: ['operator'],
  permissions: ['policy:read'],
};

describe('JWT trust boundary', () => {
  it('generates a scoped HS256 token that round-trips', () => {
    const token = generateToken(user);
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload).toEqual(
      expect.objectContaining({
        sub: user.id,
        iss: config.security.jwtIssuer,
        aud: config.security.jwtAudience,
      }),
    );
    expect(verifyToken(token)).toEqual(user);
  });

  it.each([
    ['missing issuer and audience', {}],
    ['wrong issuer', { issuer: 'other-service', audience: config.security.jwtAudience }],
    ['wrong audience', { issuer: config.security.jwtIssuer, audience: 'other-api' }],
  ])('rejects a token with %s', (_description, claims) => {
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
      },
      config.security.jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h', ...claims },
    );

    expect(verifyToken(token)).toBeNull();
  });

  it.each([
    ['missing subject', { email: user.email }],
    ['missing email', { sub: user.id }],
    ['non-array roles', { sub: user.id, email: user.email, roles: 'admin' }],
    [
      'non-string permissions',
      { sub: user.id, email: user.email, permissions: ['policy:read', 7] },
    ],
  ])('rejects malformed identity claims: %s', (_description, claims) => {
    const token = jwt.sign(claims, config.security.jwtSecret, {
      algorithm: 'HS256',
      issuer: config.security.jwtIssuer,
      audience: config.security.jwtAudience,
      expiresIn: '1h',
    });

    expect(verifyToken(token)).toBeNull();
  });
});
