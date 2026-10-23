import { Request, Response, NextFunction } from 'express';
import { ProjectRole } from '@prisma/client';
import { prisma } from '../db.js'; // Use your exported instance from db.ts

// Role hierarchy levels for comparison
const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  MANAGER: 3,
};

/**
 * Middleware factory to enforce project-level permissions.
 * All authenticated users get default VIEWER access to view projects.
 * Operations requiring EDITOR or MANAGER roles require explicit membership.
 * @param requiredRole The minimum ProjectRole needed to access the route.
 */
export const requireProjectRole = (requiredRole: ProjectRole) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: No active session' });
      }

      // 1. Global ADMINs bypass all project-level checks
      if (user.role === 'ADMIN') {
        return next();
      }

      // Client accounts are read-only even if an elevated membership row exists.
      if (user.role === 'CLIENT' && requiredRole !== 'VIEWER') {
        return res.status(403).json({ error: 'Client accounts have read-only project access' });
      }

      // 2. All authenticated users (Team Members & Clients) have global VIEWER access
      if (requiredRole === 'VIEWER') {
        return next();
      }

      // 3. For EDITOR or MANAGER actions, verify project ID and membership
      const rawId = req.params.id || req.params.projectId;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);

      if (!projectId) {
        return res.status(400).json({ error: 'Project ID parameter is missing' });
      }

      const userId = user.id || user.userId || user.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User identity is missing' });
      }

      // A membership on a parent project also grants the same project role to
      // its nested packages unless the user has a direct package assignment.
      let currentProjectId: string | null = projectId;
      let membership = null as Awaited<ReturnType<typeof prisma.projectMember.findUnique>>;
      const visited = new Set<string>();
      while (currentProjectId && !visited.has(currentProjectId)) {
        visited.add(currentProjectId);
        membership = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId: currentProjectId, userId } },
        });
        if (membership) break;
        const currentProject: { parentProjectId: string | null } | null = await prisma.project.findUnique({
          where: { id: currentProjectId },
          select: { parentProjectId: true },
        });
        currentProjectId = currentProject?.parentProjectId ?? null;
      }

      if (!membership) {
        return res.status(403).json({ 
          error: 'Access denied: You do not have edit/management rights on this project' 
        });
      }

      const userRoleLevel = ROLE_HIERARCHY[membership.role];
      const requiredRoleLevel = ROLE_HIERARCHY[requiredRole];

      if (userRoleLevel < requiredRoleLevel) {
        return res.status(403).json({
          error: `Insufficient project permissions. Required: ${requiredRole}, Your role: ${membership.role}`,
        });
      }

      (req as any).projectMembership = membership;
      return next();
    } catch (error: any) {
      console.error('Error verifying project membership:', error);
      return res.status(500).json({ error: 'Internal server error checking permissions' });
    }
  };
};
