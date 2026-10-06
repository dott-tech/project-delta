import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { S3Client, PutObjectCommand , DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { FileType } from '@prisma/client';


const router = Router();

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Helper to safely extract user ID from JWT payload
const getUserId = (req: Request): string | null => {
  const user = (req as any).user;
  return user?.id || user?.userId || user?.sub || null;
};

// 1. GET ALL PROJECTS (Filtered by role & query parameters)
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

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: User authentication required.' });
      }

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

// 4. GENERATE PRESIGNED S3 UPLOAD URL (Restricted to ADMIN and TEAM_MEMBER)
router.post(
  '/:id/upload-url',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  async (req: Request, res: Response) => {
    try {
      const { id: projectId } = req.params;
      const { fileName, contentType } = req.body;

      if (!fileName) {
        return res.status(400).json({ error: 'fileName is required' });
      }

      const fileExt = fileName.includes('.') ? fileName.split('.').pop() : '';
      const fileKey = `projects/${projectId}/${crypto.randomUUID()}${fileExt ? `.${fileExt}` : ''}`;

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: fileKey,
        ContentType: contentType || 'application/octet-stream',
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

      return res.json({ uploadUrl, fileUrl, fileKey });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      return res.status(500).json({ error: 'Failed to generate S3 upload URL', details: String(error) });
    }
  }
);

// Helper to convert MIME types or file extensions to the Prisma FileType Enum
const mapToFileType = (fileTypeStr: string, fileName: string): FileType => {
  const typeLower = (fileTypeStr || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // 1. Check for CAD formats
  if (
    ext === 'dwg' || ext === 'dxf' || ext === 'dgn' ||
    typeLower.includes('cad') || typeLower.includes('dwg')
  ) {
    return FileType.CAD;
  }

  // 2. Check for PDF
  if (ext === 'pdf' || typeLower.includes('pdf')) {
    return FileType.PDF;
  }

  // 3. Fallback to IMAGE for pictures, or default to IMAGE
  return FileType.IMAGE;
};

// 5. SAVE FILE METADATA TO DATABASE
router.post(
  '/:id/files',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const { fileName, fileType, fileUrl, fileSize } = req.body;

      console.log('Incoming Payload to /files:', { projectId, fileName, fileType, fileUrl, fileSize });

      if (!fileName || !fileUrl) {
        return res.status(400).json({ error: 'fileName and fileUrl are required' });
      }

      // Map string MIME type or extension to your Prisma FileType Enum (CAD | PDF | IMAGE)
      const mappedType: FileType = mapToFileType(fileType, fileName);

      const fileRecord = await prisma.projectFile.create({
        data: {
          projectId,
          fileName: String(fileName),
          fileType: mappedType,
          fileUrl: String(fileUrl),
          fileSize: fileSize ? Number(fileSize) : null,
          // NOTE: Do NOT include fileKey here unless it is in your schema.prisma
        },
      });

      return res.status(201).json(fileRecord);
    } catch (error: any) {
      console.error('--- SAVE FILE METADATA ERROR ---');
      console.error(error); // Logs full error stack in backend terminal
      return res.status(500).json({ 
        error: 'Failed to save file record', 
        details: error?.message || String(error) 
      });
    }
  }
);

// 6. UPDATE PROJECT METADATA (Restricted to ADMIN and TEAM_MEMBER)
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

// 7. ARCHIVE / UNARCHIVE A PROJECT (Restricted to ADMIN)
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

// DELETE /projects/:projectId/files/:fileId
// Removes the object from AWS S3 using the URL path, then deletes the DB record
router.delete(
  '/:projectId/files/:fileId',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  async (req: Request, res: Response) => {
    try {
      const rawFileId = req.params.fileId;
      const fileId = Array.isArray(rawFileId) ? rawFileId[0] : String(rawFileId);

      // 1. Look up file record in Prisma to get fileUrl
      const file = await prisma.projectFile.findUnique({
        where: { id: fileId },
      });

      if (!file) {
        return res.status(404).json({ error: 'File record not found' });
      }

      // 2. Extract S3 Object Key from fileUrl and delete from S3
      if (file.fileUrl) {
        try {
          const parsedUrl = new URL(file.fileUrl);
          // Removes leading '/' (e.g. "/projects/123/doc.pdf" -> "projects/123/doc.pdf")
          const s3Key = parsedUrl.pathname.substring(1);

          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET_NAME!,
              Key: s3Key,
            })
          );
          console.log(`Successfully deleted S3 object: ${s3Key}`);
        } catch (s3Err) {
          console.error('S3 deletion warning (continuing DB deletion):', s3Err);
        }
      }

      // 3. Delete database record
      await prisma.projectFile.delete({
        where: { id: fileId },
      });

      return res.status(200).json({ message: 'File deleted from S3 and database' });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return res.status(500).json({
        error: 'Failed to delete file',
        details: error?.message || String(error),
      });
    }
  }
);

export default router;