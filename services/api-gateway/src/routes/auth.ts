import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { generateToken, generateRefreshToken, hashPassword, verifyPassword } from '../middleware/auth.js';
import { withTenantContext } from '../lib/database.js';
import { UnauthorizedError, ConflictError } from '../middleware/errorHandler.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string(),
});

export async function registerAuthRoutes(fastify: FastifyInstance) {
  // POST /auth/login
  fastify.post('/auth/login', {
    schema: {
      body: loginSchema,
    },
  }, async (request, reply) => {
    const { email, password } = request.body as z.infer<typeof loginSchema>;

    // Find user by email
    const userResult = await fastify.db.query(
      'SELECT u.id, u.email, u.password_hash, u.role, u.tenant_id, t.name as tenant_name FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.email = $1 AND u.status = $2',
      [email, 'active']
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const user = userResult.rows[0];

    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Generate tokens
    const payload = {
      userId: user.id,
      organisationId: user.tenant_id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token in database
    await fastify.db.query(
      'INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\')',
      [refreshToken, user.id, user.tenant_id]
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organisationId: user.tenant_id,
        organisationName: user.tenant_name,
      },
    };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', {
    schema: {
      body: refreshSchema,
    },
  }, async (request, reply) => {
    const { refreshToken } = request.body as z.infer<typeof refreshSchema>;

    // Verify refresh token exists and is valid
    const sessionResult = await fastify.db.query(
      'SELECT s.user_id, s.tenant_id, u.email, u.role, t.name as tenant_name FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = s.tenant_id WHERE s.token = $1 AND s.expires_at > NOW()',
      [refreshToken]
    );

    if (sessionResult.rows.length === 0) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const session = sessionResult.rows[0];

    // Generate new access token
    const payload = {
      userId: session.user_id,
      organisationId: session.tenant_id,
      email: session.email,
      role: session.role,
    };

    const accessToken = generateToken(payload);

    return {
      accessToken,
      user: {
        id: session.user_id,
        email: session.email,
        role: session.role,
        organisationId: session.tenant_id,
        organisationName: session.tenant_name,
      },
    };
  });

  // POST /auth/logout
  fastify.post('/auth/logout', async (request, reply) => {
    // Extract token from Authorization header if present
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // Remove session from database
      await fastify.db.query(
        'DELETE FROM sessions WHERE token = $1',
        [token]
      );
    }

    return { success: true };
  });
}
