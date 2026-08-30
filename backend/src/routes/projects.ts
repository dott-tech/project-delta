import { Router, Request, Response } from 'express';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

// 1. GET ALL PROJECTS (Includes files & Replit embed - Protected by JWT)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      include: {
        files: true,
        replitEmbed: true,
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
    res.status(500).json({ error: 'Failed to fetch projects', details: String(error) });
  }
});

// 2. GET SINGLE PROJECT BY ID (Protected by JWT)
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id: String(id) },
      include: {
        files: true,
        replitEmbed: true,
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

      // Automatically grabs the creator ID from the decoded JWT token
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

export default router;