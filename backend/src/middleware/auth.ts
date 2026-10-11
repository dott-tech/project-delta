import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { JwtPayload } from '../types/express';
import { prisma } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || '';

// 1. VERIFY JWT TOKEN
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers['authorization'];
  // Authorization header format: "Bearer <TOKEN>"
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  if (!JWT_SECRET) {
    res.status(500).json({ error: 'Authentication is not configured on this server.' });
    return;
  }

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
    return;
  }

  const userId = decoded.id || decoded.userId;
  if (!userId || !Number.isInteger(decoded.authVersion)) {
    res.status(401).json({ error: 'Your session is outdated. Please sign in again.' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, authVersion: true },
    });
    if (!user || user.authVersion !== decoded.authVersion || user.role !== decoded.role) {
      res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
      return;
    }
    req.user = { ...decoded, id: user.id, userId: user.id, role: user.role, authVersion: user.authVersion };
    next();
  } catch (error) {
    console.error('Session validation failed because the database is unavailable:', error);
    res.status(503).json({ error: 'Authentication is temporarily unavailable. Please try again.' });
  }
};

// 2. REQUIRE SPECIFIC ROLES (RBAC)
export const requireRole = (allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ 
        error: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}` 
      });
      return;
    }

    next();
  };
};
