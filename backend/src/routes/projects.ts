import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// 1. GET ALL PROJECTS (Filtered by role & query parameters)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const { location, projectType, search, archived } = req.query;

    const conditions: any[] = [];

    // Archive guard: Non-admins can NEVER view archived projects
    if (userRole === 'ADMIN' && archived === 'true') {
      conditions.push({ isArchived: true });
    } else {
      conditions.push({ isArchived: false });
    }

    if (location && typeof location === 'string') {
      conditions.push({
        location: { contains: location, mode: 'insensitive' },
      });
    }

    if (projectType && typeof projectType === 'string') {
      conditions.push({
        projectType: { contains: projectType, mode: 'insensitive' },
      });
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
      where: {
        AND: conditions,
      },
      include: {
        files: true,
        replitEmbeds: true, // Fixed: plural relation field name
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects', details: String(error) });
  }
});

// 2. GET SINGLE PROJECT BY ID (Protected by JWT)
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    const project = await prisma.project.findUnique({
      where: { id: String(id) },
      include: {
        files: true,
        replitEmbeds: true, // Fixed: plural relation field name
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
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

      if (!title || !projectType || !location) {
        res.status(400).json({ 
          error: 'title, projectType, and location are required' 
        });
        return;
      }

      const newProject = await prisma.project.create({
        data: {
          title,
          projectType,
          location,
          description,
          createdByUserId: req.user!.userId,
        },
      });

      res.status(201).json(newProject);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create project', details: String(error) });
    }
  }
);

// 4. ARCHIVE / UNARCHIVE A PROJECT (Restricted to ADMIN)
router.patch(
  '/:id/archive',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { isArchived } = req.body;

      const updatedProject = await prisma.project.update({
        where: { id: String(id) },
        data: { isArchived: isArchived ?? true },
      });

      res.json({
        message: `Project ${updatedProject.isArchived ? 'archived' : 'restored'} successfully`,
        project: updatedProject,
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update project archive status', details: String(error) });
    }
  }
);

export default router;