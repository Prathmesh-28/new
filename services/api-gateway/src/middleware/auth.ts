import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { UnauthorizedError } from './errorHandler.js';

export interface JWTPayload {
  userId: string;
  organisationId: string;
  email: string;
  role: 'owner' | 'accountant' | 'investor' | 'admin';
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function generateRefreshToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    throw new UnauthorizedError('Missing or invalid JWT token');
  }
}

export async function requireRole(
  request: FastifyRequest,
  reply: FastifyReply,
  allowedRoles: string[]
): Promise<void> {
  await requireAuth(request, reply);

  const payload = request.user as JWTPayload;
  if (!allowedRoles.includes(payload.role)) {
    throw new UnauthorizedError(`Requires one of roles: ${allowedRoles.join(', ')}`);
  }
}

export async function requireOrgAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);

  const payload = request.user as JWTPayload;
  const requestedOrgId = request.params.orgId;

  // Admin can access any org
  if (payload.role === 'admin') {
    return;
  }

  // Otherwise, user must access their own org
  if (payload.organisationId !== requestedOrgId) {
    throw new UnauthorizedError('No access to this organisation');
  }
}
