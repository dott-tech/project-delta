import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// Helper to safely extract user ID from JWT payload (supports `id` or `userId`)
const getUserId = (req: Request): string | null => {
  const user = (req as any).user;
  return user?.id || user?.userId || user?.sub || null;
};

// 1. GET ALL PROJECTS (Filtered by role & query parameters)
// backend/src/routes/projects.ts

router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { location, projectType, search, archived } = req.query;

    const conditions: any[] = [];

    if (userRole === 'ADMIN' && archived === 'true') {
      conditions.push({ isArchived: true });
    } else {
      conditions.push({ isArchived: false });
    }

    if (location && typeof location === 'string') {
      conditions.push({ location: { contains: location, mode: 'insensitive' } });
    }

    if (projectType && typeof projectType === 'string') {
      conditions.push({ projectType: { contains: projectType, mode: 'insensitive' } });
    }

    if (search && typeof search === 'string') {
      conditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const projects = await prisma.project.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      include: {
        files: true,
        createdBy: {
          select: { id: true, email: true, name: true },
        },
        updatedBy: {
          select: { id: true, email: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error: any) {
    console.error('SERVER ERROR FETCHING PROJECTS:', error);
    res.status(500).json({
      error: 'Failed to fetch projects',
      message: error?.message || String(error),
    });
  }
});

// 2. GET SINGLE PROJECT BY ID
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    const project = await prisma.project.findUnique({
      where: { id: String(id) },
      include: {
        files: true,
        replitEmbeds: true,
        createdBy: {
          select: { id: true, email: true, name: true },
        },
        updatedBy: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    if (project.isArchived && userRole !== 'ADMIN') {
      res.status(403).json({ error: 'Access denied. This project is archived.' });
      return;
    }

    res.json(project);
  } catch (error) {
    console.error('Error fetching single project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// 3. CREATE A NEW PROJECT (Restricted to ADMIN and TEAM_MEMBER)
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  async (req: Request, res: Response) => {
    try {
      const { title, projectType, location, description } = req.body;
      const currentUserId = getUserId(req);

      if (!title || !projectType || !location) {
        res.status(400).json({ 
          error: 'title, projectType, and location are required' 
        });
        return;
      }

   // 1. Guard check to ensure currentUserId exists
if (!currentUserId) {
  return res.status(401).json({ error: 'Unauthorized: User authentication required.' });
}

// 2. Create project with guaranteed currentUserId
const newProject = await prisma.project.create({
  data: {
    title,
    projectType,
    location,
    description,
    createdBy: {
      connect: { id: currentUserId },
    },
  },
  include: {
    files: true,
    createdBy: { select: { id: true, email: true, name: true } },
  },
});

      res.status(201).json(newProject);
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({ error: 'Failed to create project', details: String(error) });
    }
  }
);

// 4. UPDATE PROJECT METADATA (Restricted to ADMIN and TEAM_MEMBER)
router.put(
  '/:id',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, projectType, location, description } = req.body;
      const currentUserId = getUserId(req);

      if (!title || !projectType || !location) {
        res.status(400).json({ error: 'title, projectType, and location are required' });
        return;
      }

      const updatedProject = await prisma.project.update({
        where: { id: String(id) },
        data: {
          title,
          projectType,
          location,
          description,
          ...(currentUserId ? { updatedByUserId: currentUserId } : {}),
        },
        include: {
          files: true,
          replitEmbeds: true,
          createdBy: { select: { id: true, email: true, name: true } },
          updatedBy: { select: { id: true, email: true, name: true } },
        },
      });

      res.json(updatedProject);
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Failed to update project', details: String(error) });
    }
  }
);

// 5. ARCHIVE / UNARCHIVE A PROJECT (Restricted to ADMIN)
router.patch(
  '/:id/archive',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isArchived } = req.body;
      const currentUserId = getUserId(req);

      const updatedProject = await prisma.project.update({
        where: { id: String(id) },
        data: { 
          isArchived: isArchived ?? true,
          ...(currentUserId ? { updatedByUserId: currentUserId } : {}),
        },
      });

      res.json({
        message: `Project ${updatedProject.isArchived ? 'archived' : 'restored'} successfully`,
        project: updatedProject,
      });
    } catch (error) {
      console.error('Error archiving project:', error);
      res.status(500).json({ error: 'Failed to update project archive status', details: String(error) });
    }
  }
);

export default router;