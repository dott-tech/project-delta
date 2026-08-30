import { Router, Request, Response } from 'express';
import path from 'path';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { StorageService } from '../services/storage.js';
import { FileType } from '@prisma/client';

const router = Router();

// Helper function to map file extensions to Prisma FileType enum
function getPrismaFileType(originalname: string): FileType {
  const ext = path.extname(originalname).toLowerCase().replace('.', '');
  if (['dwg', 'dxf', 'rvt', 'ifc'].includes(ext)) {
    return FileType.CAD;
  }
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return FileType.IMAGE;
  }
  return FileType.PDF; // Default fallback for PDFs & docs
}

// 1. UPLOAD FILE TO PROJECT (Restricted to ADMIN & TEAM_MEMBER)
router.post(
  '/projects/:projectId/files',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  uploadMiddleware.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
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
        },
      });

      res.status(201).json({
        message: 'File uploaded successfully',
        file: fileRecord,
      });
    } catch (error) {
      console.error('Upload Error:', error);
      res.status(500).json({ error: 'Failed to upload file', details: String(error) });
    }
  }
);

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

      res.json({ message: 'File deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete file', details: String(error) });
    }
  }
);

export default router;