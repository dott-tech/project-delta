import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { prisma } from '../db.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import invitationRoutes from './invitations.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || '';
const TRANSIENT_DATABASE_CODES = new Set(['EAI_AGAIN', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED']);

const getDatabaseErrorCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    current = candidate.cause;
  }
  return undefined;
};

const isTransientDatabaseError = (error: unknown) =>
  TRANSIENT_DATABASE_CODES.has(getDatabaseErrorCode(error) || '');

const withTransientDatabaseRetry = async <T>(operation: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt >= 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
};

const sendDatabaseUnavailable = (res: Response) =>
  res.status(503).json({ error: 'The database is temporarily unreachable. Please try again in a moment.' });

const hashInvitationToken = (token: string) => createHash('sha256').update(token).digest('hex');
const loginLimiter = createRateLimiter(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.');
const registrationLimiter = createRateLimiter(60 * 60 * 1000, 5, 'Too many registration attempts. Try again in an hour.');

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.use('/invitations', invitationRoutes);

// 1. REGISTER USER
router.post('/register', registrationLimiter, async (req: Request, res: Response) => {
  try {
    const { email, name, password, inviteToken } = req.body;

    if (typeof inviteToken !== 'string' || inviteToken.length < 40 || inviteToken.length > 100) {
      res.status(403).json({ error: 'A valid, unexpired invitation link is required to register.' });
      return;
    }

    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, name, and password are required' });
      return;
    }

    if (typeof email !== 'string' || typeof name !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email, name, and password must be text values' });
      return;
    }
    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      res.status(400).json({ error: 'Password must be at least 12 characters and no more than 72 UTF-8 bytes' });
      return;
    }
    if (!JWT_SECRET) {
      res.status(500).json({ error: 'Authentication is not configured on this server.' });
      return;
    }

    // Check if user already exists
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !name.trim()) {
      res.status(400).json({ error: 'Email and name cannot be empty' });
      return;
    }
    const invitation = await withTransientDatabaseRetry(() => prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(inviteToken) },
      select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    }));
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      res.status(410).json({ error: 'This invitation has expired, been used, or been revoked.' });
      return;
    }
    if (invitation.email !== normalizedEmail) {
      res.status(403).json({ error: 'This invitation was issued to a different email address.' });
      return;
    }

    const existingUser = await withTransientDatabaseRetry(() => prisma.user.findUnique({ where: { email: normalizedEmail } }));
    if (existingUser) {
      res.status(409).json({ error: 'An account already exists for this email' });
      return;
    }

    // Bcrypt only processes up to 72 bytes, which is also enforced above.
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const consumed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (consumed.count !== 1) return null;
      return tx.user.create({
        data: { email: normalizedEmail, name: name.trim(), password: hashedPassword, role: invitation.role },
        select: { id: true, email: true, name: true, role: true, authVersion: true, createdAt: true },
      });
    });
    if (!newUser) {
      res.status(410).json({ error: 'This invitation was already used or revoked.' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser.id, role: newUser.role, authVersion: newUser.authVersion },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({ user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, createdAt: newUser.createdAt }, token });
  } catch (error) {
    if (isTransientDatabaseError(error)) {
      console.warn('Registration temporarily unavailable: database connection failed (%s).', getDatabaseErrorCode(error) || 'unknown');
      sendDatabaseUnavailable(res);
      return;
    }
    console.error('Registration failed:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// 2. LOGIN USER
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email and password must be text values' });
      return;
    }
    if (!JWT_SECRET) {
      res.status(500).json({ error: 'Authentication is not configured on this server.' });
      return;
    }

    // Find user by email
    const user = await withTransientDatabaseRetry(() =>
      prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    );
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Compare provided password with stored hash
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role, authVersion: user.authVersion },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    if (isTransientDatabaseError(error)) {
      console.warn('Login temporarily unavailable: database connection failed (%s).', getDatabaseErrorCode(error) || 'unknown');
      sendDatabaseUnavailable(res);
      return;
    }
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
