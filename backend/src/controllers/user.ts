// backend/src/controllers/user.ts
import { Request, Response } from 'express';
import { prisma } from '../db'; // 👈 Point to the correct db instance

// GET /api/users - List all users (Admin Only)
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// PATCH /api/users/:id/role - Update a user's role (Admin Only)
export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = (Array.isArray(idParam) ? idParam[0] : idParam) as string;
    const { role } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'User ID parameter is required' });
    }

    if (!['ADMIN', 'TEAM_MEMBER', 'CLIENT'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role provided' });
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true },
    });

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
};