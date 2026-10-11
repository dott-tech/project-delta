import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/projectAuth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { StorageService } from '../services/storage.js';
import { FileType } from '@prisma/client';
import { validateLocalPreviewFile } from '../services/fileValidation.js';

const router = Router();

async function getEffectiveProjectRole(projectId: string, userId: string): Promise<string | null> {
  let cursor: string | null = projectId;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const membership = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: cursor, userId } }, select: { role: true },
    });
    if (membership) return membership.role;
    const project: { parentProjectId: string | null } | null = await prisma.project.findUnique({ where: { id: cursor }, select: { parentProjectId: true } });
    cursor = project?.parentProjectId ?? null;
  }
  return null;
}

async function recordFileActivity(projectId: string, userId: string | undefined, action: string, details: string) {
  try {
    await prisma.projectActivity.create({ data: { projectId, userId, action, details } });
  } catch (error) {
    console.error('File activity could not be recorded:', error);
  }
}

// Helper function to map file extensions to Prisma FileType enum
function getPrismaFileType(originalname: string): FileType {
  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  if (['dwg', 'dxf', 'dgn', 'rvt', 'rfa', 'ifc', 'ifczip', 'nwc', 'nwd', 'nwf', 'skp', 'obj', 'stl', 'step', 'stp', 'iges', 'igs'].includes(ext)) {
    return FileType.CAD;
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(ext)) {
    return FileType.IMAGE;
  }
  if (ext === 'pdf') return FileType.PDF;
  return FileType.OTHER;
}

// Legacy local upload path. Project editor permissions are required, and files
// are served only through the authenticated download route below.
router.post(
  '/projects/:projectId/files',
  authenticateToken,
  requireProjectRole('EDITOR'),
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      if (!await validateLocalPreviewFile(file.path, file.originalname)) {
        await StorageService.deleteFile(file.filename);
        return res.status(400).json({ error: 'File contents do not match the selected PDF or image type' });
      }

      // Verify project exists
      const project = await prisma.project.findUnique({
        where: { id: String(projectId) },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Save via abstraction service
      const fileUrl = await StorageService.saveFile(file);
      const mappedFileType = getPrismaFileType(file.originalname);

      // Save record to ProjectFile model
      const fileRecord = await prisma.projectFile.create({
        data: {
          fileName: file.originalname,
          fileType: mappedFileType,
          fileUrl: fileUrl,
          fileSize: file.size,
          projectId: String(projectId),
          allowedRoles: ['VIEWER'],
        },
      });

      const user = (req as any).user;
      await recordFileActivity(String(projectId), user.id || user.userId || user.sub, 'file.uploaded', `Uploaded “${fileRecord.fileName}”`);

      res.status(201).json({
        message: 'File uploaded successfully',
        file: fileRecord,
      });
    } catch (error) {
      console.error('Upload Error:', error);
      if (req.file?.path) {
        try { await fs.unlink(req.file.path); } catch (cleanupError) { console.error('Failed to remove incomplete local upload:', cleanupError); }
      }
      res.status(500).json({ error: 'Failed to upload file' });
    }
  }
);

router.get('/files/:id/download', authenticateToken, async (req: Request, res: Response) => {
  try {
    const file = await prisma.projectFile.findUnique({ where: { id: String(req.params.id) } });
    if (!file || !file.fileUrl.startsWith('/uploads/')) {
      return res.status(404).json({ error: 'Local file not found' });
    }
    const user = (req as any).user;
    if (user.role !== 'ADMIN') {
      const userId = user.id || user.userId || user.sub;
      const projectRole = await getEffectiveProjectRole(file.projectId, userId);
      if (user.role !== 'TEAM_MEMBER' || projectRole !== 'EDITOR') {
        return res.status(403).json({ error: 'Downloads are available to admins and assigned editor team members only' });
      }
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const filePath = path.resolve(uploadsRoot, path.basename(file.fileUrl));
    if (!filePath.startsWith(uploadsRoot + path.sep)) return res.status(400).json({ error: 'Invalid file path' });
    return res.download(filePath, file.fileName);
  } catch (error) {
    console.error('Local file download failed:', error);
    return res.status(500).json({ error: 'Failed to download file' });
  }
});

// 2. DELETE FILE (Restricted to ADMIN)
router.delete(
  '/files/:id',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const fileRecord = await prisma.projectFile.findUnique({
        where: { id: String(id) },
      });

      if (!fileRecord) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Delete physical file from disk/cloud
      await StorageService.deleteFile(fileRecord.fileUrl);

      // Delete database record from ProjectFile
      await prisma.projectFile.delete({
        where: { id: String(id) },
      });

      const user = (req as any).user;
      await recordFileActivity(fileRecord.projectId, user.id || user.userId || user.sub, 'file.deleted', `Deleted “${fileRecord.fileName}”`);

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Local file delete failed:', error);
      res.status(500).json({ error: 'Failed to delete file' });
    }
  }
);

export default router;
