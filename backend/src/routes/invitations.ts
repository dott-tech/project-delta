import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const validEmail = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

router.use(authenticateToken, requireRole(['ADMIN']));

router.get('/', async (_req: Request, res: Response) => {
  try {
    const invitations = await prisma.invitation.findMany({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(invitations);
  } catch (error) {
    console.error('Failed to load invitations:', error);
    return res.status(500).json({ error: 'Failed to load invitations' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const role = req.body?.role;
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (role !== 'CLIENT' && role !== 'TEAM_MEMBER') {
      return res.status(400).json({ error: 'Invitation role must be CLIENT or TEAM_MEMBER' });
    }
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      return res.status(409).json({ error: 'An account already exists for this email' });
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const createdById = req.user?.id || req.user?.userId;
    if (!createdById) return res.status(401).json({ error: 'Administrator identity is unavailable' });

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.invitation.create({
        data: { email, role: role as Role, tokenHash: hashToken(token), expiresAt, createdById },
        select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
      });
    });

    // The raw token is returned once only; the database stores only its SHA-256 hash.
    return res.status(201).json({ invitation, token });
  } catch (error) {
    console.error('Failed to create invitation:', error);
    return res.status(500).json({ error: 'Failed to create invitation' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await prisma.invitation.updateMany({
      where: { id: String(req.params.id), acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) return res.status(404).json({ error: 'Pending invitation not found' });
    return res.json({ message: 'Invitation revoked' });
  } catch (error) {
    console.error('Failed to revoke invitation:', error);
    return res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

export default router;
