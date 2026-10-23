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

    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (targetUser.role === 'ADMIN' && role !== 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) return res.status(400).json({ error: 'The last administrator cannot be demoted' });
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          role,
          ...(targetUser.role !== role && { authVersion: { increment: 1 } }),
        },
        select: { id: true, name: true, email: true, role: true },
      });

      // Downgrade project memberships in the same transaction when an account
      // becomes a client, so stale assignments cannot leave write access behind.
      if (role === 'CLIENT') {
        await tx.projectMember.updateMany({
          where: { userId: id, role: { not: 'VIEWER' } },
          data: { role: 'VIEWER' },
        });
      }

      return user;
    });

    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (id === req.user?.id) return res.status(400).json({ error: 'You cannot delete your own account here' });
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) return res.status(400).json({ error: 'The last administrator cannot be deleted' });
    }
    const ownedProjects = await prisma.project.count({ where: { createdByUserId: id } });
    if (ownedProjects > 0) {
      return res.status(409).json({ error: 'Reassign or delete this user’s created projects before deleting the account' });
    }
    await prisma.user.delete({ where: { id } });
    return res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};
