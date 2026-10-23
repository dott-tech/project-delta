import { Router, Request, Response } from 'express';
import { ProjectRole, PhaseStatus, FileType, FileReviewStatus } from '@prisma/client';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';
import { access, constants, createReadStream } from 'fs';
import { Transform, Writable } from 'stream';
import { promisify } from 'util';
import { pipeline } from 'stream/promises';
import { prisma } from '../db.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { requireProjectRole } from '../middleware/projectAuth.js';
import { expectedUploadContentType, validatePreviewFilePrefix } from '../services/fileValidation.js';
import { StorageService } from '../services/storage.js';

const router = Router();
const accessFile = promisify(access);
const discardUploadedObject = async (key: string) => {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME!, Key: key }));
  } catch (error) {
    console.error('Could not remove an unregistered uploaded object:', error);
  }
};

// ============================================================================
// AWS S3 CLIENT INITIALIZATION
// ============================================================================
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely extracts user ID from JWT payload
 */
const getUserId = (req: Request): string | null => {
  const user = (req as any).user;
  return user?.id || user?.userId || user?.sub || null;
};

const canDownloadProjectFiles = (globalRole: string, projectRole: ProjectRole | null) =>
  globalRole === 'ADMIN' || (globalRole === 'TEAM_MEMBER' && projectRole === 'EDITOR');

const logProjectActivity = async (projectId: string, req: Request, action: string, details: string) => {
  try {
    await prisma.projectActivity.create({
      data: { projectId, userId: getUserId(req), action, details },
    });
  } catch (error) {
    // Activity logging must never turn a successful project change into a failed request.
    console.error('Project activity could not be recorded:', error);
  }
};

/**
 * Maps file extensions or MIME types to Prisma's FileType Enum
 */
const mapToFileType = (fileTypeStr: string, fileName: string): FileType => {
  const typeLower = (fileTypeStr || '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (
    ['dwg', 'dxf', 'dgn', 'rvt', 'rfa', 'ifc', 'ifczip', 'nwc', 'nwd', 'nwf', 'skp', 'obj', 'stl', 'step', 'stp', 'iges', 'igs'].includes(ext) ||
    typeLower.includes('cad') || typeLower.includes('dwg')
  ) {
    return FileType.CAD;
  }

  if (ext === 'pdf' || typeLower.includes('pdf')) {
    return FileType.PDF;
  }

  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'svg'].includes(ext) || typeLower.startsWith('image/')) {
    return FileType.IMAGE;
  }
  return FileType.OTHER;
};

const getProjectS3Key = (fileUrl: string, projectId: string): string | null => {
  try {
    const parsed = new URL(fileUrl);
    const bucket = process.env.AWS_S3_BUCKET_NAME;
    const region = process.env.AWS_REGION;
    if (!bucket || !region || parsed.hostname !== `${bucket}.s3.${region}.amazonaws.com`) return null;
    const key = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    return key.startsWith(`projects/${projectId}/`) ? key : null;
  } catch {
    return null;
  }
};

const getEffectiveProjectRole = async (projectId: string, userId: string): Promise<ProjectRole | null> => {
  let cursor: string | null = projectId;
  const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    const member: { role: ProjectRole } | null = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: cursor, userId } }, select: { role: true },
    });
    if (member) return member.role;
    const project: { parentProjectId: string | null } | null = await prisma.project.findUnique({
      where: { id: cursor }, select: { parentProjectId: true },
    });
    cursor = project?.parentProjectId ?? null;
  }
  return null;
};

/**
 * PERMISSION EVALUATOR: Determines file visibility based on:
 * 1. Global System ADMINs always get access.
 * 2. Unassigned users fallback to 'VIEWER' role.
 * 3. Role hierarchy check (MANAGER > EDITOR > VIEWER).
 */
const canAccessFile = (
  userGlobalRole: string,
  userProjectRole?: ProjectRole | null,
  allowedRoles: ProjectRole[] = ['MANAGER']
): boolean => {
  // 1. System ADMINs bypass file restrictions
  if (userGlobalRole === 'ADMIN') return true;

  // 2. Unassigned users fallback to VIEWER role
  const effectiveRole: ProjectRole = userProjectRole || 'VIEWER';

  // 3. Direct match check
  if (allowedRoles.includes(effectiveRole)) return true;

  // 4. Role Hierarchy inheritances
  if (effectiveRole === 'MANAGER' && (allowedRoles.includes('EDITOR') || allowedRoles.includes('VIEWER'))) {
    return true;
  }
  if (effectiveRole === 'EDITOR' && allowedRoles.includes('VIEWER')) {
    return true;
  }

  return false;
};

const canViewProjectFile = (
  globalRole: string,
  projectRole: ProjectRole | null,
  file: { reviewStatus: FileReviewStatus; allowedRoles: ProjectRole[]; uploadedByUserId: string | null },
  userId: string
): boolean => {
  if (globalRole === 'ADMIN') return true;

  // Clients only ever see approved files and are evaluated as viewers, regardless
  // of any stale or manually modified project membership row.
  if (globalRole === 'CLIENT') {
    return file.reviewStatus === 'APPROVED' && canAccessFile('CLIENT', 'VIEWER', file.allowedRoles);
  }

  if (file.reviewStatus !== 'APPROVED') {
    return projectRole === 'MANAGER' || (
      globalRole === 'TEAM_MEMBER' && projectRole === 'EDITOR' && file.uploadedByUserId === userId
    );
  }

  return canDownloadProjectFiles(globalRole, projectRole) ||
    canAccessFile(globalRole, projectRole, file.allowedRoles);
};

/**
 * Standard Prisma query include structure for parent & nested sub-projects
 */
const fullProjectInclude = {
  phases: { orderBy: { order: 'asc' as const } },
  members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
  files: true,
  createdBy: { select: { id: true, email: true, name: true } },
  updatedBy: { select: { id: true, email: true, name: true } },
};

// ============================================================================
// 1. GET ALL ROOT-LEVEL PROJECTS (Available to All Authenticated Users)
// ============================================================================
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userRole = user?.role;
    const { location, projectType, search, archived } = req.query;

    const conditions: any[] = [];
    conditions.push({ parentProjectId: null });

    const isArchivedQuery = archived === 'true';
    conditions.push({ isArchived: isArchivedQuery });
    if (isArchivedQuery && userRole !== 'ADMIN') {
      conditions.push({ members: { some: { userId: user.id || user.userId || user.sub } } });
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
        ...fullProjectInclude,
        subProjects: {
          include: fullProjectInclude,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Sanitize file lists based on user role / VIEWER fallback permissions
    const sanitizedProjects = projects.map((p) => {
      const userMember = p.members.find((m) => m.userId === user.id);
      const projectRole = userMember?.role || 'VIEWER';

      const canDownload = canDownloadProjectFiles(userRole, userMember?.role ?? null);
      const filteredFiles = p.files.filter((f) =>
        canViewProjectFile(userRole, userMember?.role ?? null, f, getUserId(req) || '')
      ).map((f) => ({ ...f, fileUrl: canDownload ? f.fileUrl : '' }));

      const sanitizedSubProjects = p.subProjects.map((sub) => {
        const subMember = sub.members.find((m) => m.userId === user.id) || userMember;
        const subCanDownload = canDownloadProjectFiles(userRole, subMember?.role ?? null);
        return {
          ...sub,
          files: sub.files.filter((f) =>
            canViewProjectFile(userRole, subMember?.role ?? null, f, getUserId(req) || '')
          ).map((f) => ({ ...f, fileUrl: subCanDownload ? f.fileUrl : '' })),
        };
      });

      return {
        ...p,
        files: filteredFiles,
        subProjects: sanitizedSubProjects,
      };
    });

    res.json(sanitizedProjects);
  } catch (error: any) {
    console.error('SERVER ERROR FETCHING PROJECTS:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// ============================================================================
// 2. GENERATE PRESIGNED S3 DOWNLOAD URL FOR A FILE
// ============================================================================
router.get(
  '/:projectId/files/:fileId/download-url',
  authenticateToken,
  requireProjectRole('VIEWER'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const rawFileId = req.params.fileId;
      const fileId = Array.isArray(rawFileId) ? rawFileId[0] : String(rawFileId);
      const projectId = Array.isArray(req.params.projectId) ? req.params.projectId[0] : String(req.params.projectId);

      const file = await prisma.projectFile.findFirst({ where: { id: fileId, projectId } });

      if (!file) {
        return res.status(404).json({ error: 'File record not found in database' });
      }

      const member = await prisma.projectMember.findFirst({
        where: { projectId, userId: user.id || user.userId || user.sub },
      });

      const effectiveRole = member?.role || await getEffectiveProjectRole(projectId, user.id || user.userId || user.sub || '');

      if (!canDownloadProjectFiles(user.role, effectiveRole)) {
        return res.status(403).json({ error: 'Downloads are available to admins and assigned editor team members only' });
      }

      if (file.reviewStatus !== 'APPROVED' && file.uploadedByUserId !== getUserId(req) && user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Unapproved drafts can only be downloaded by their uploader or a system admin' });
      }

      let downloadUrl = file.fileUrl;
      if (file.fileUrl) {
        const s3Key = getProjectS3Key(file.fileUrl, projectId);
        if (!s3Key) return res.status(404).json({ error: 'File storage reference is invalid' });

        const command = new GetObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME!,
          Key: s3Key,
          ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        });

        downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      }

      return res.json({ downloadUrl, fileName: file.fileName });
    } catch (error: any) {
      console.error('Error generating presigned download URL:', error);
      return res.status(500).json({
        error: 'Failed to generate download link',
      });
    }
  }
);

// Stream only safe inline-preview formats through the authenticated API. This
// keeps client previews available without exposing the storage URL or a signed
// download URL to the browser.
router.get(
  '/:projectId/files/:fileId/preview',
  authenticateToken,
  requireProjectRole('VIEWER'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const fileId = String(req.params.fileId);
      const user = (req as any).user;
      const userId = getUserId(req) || '';
      const [project, file] = await Promise.all([
        prisma.project.findUnique({ where: { id: projectId }, select: { isArchived: true } }),
        prisma.projectFile.findFirst({ where: { id: fileId, projectId } }),
      ]);
      if (!project || !file) return res.status(404).json({ error: 'File not found in this project' });

      const projectRole = await getEffectiveProjectRole(projectId, userId);
      if (project.isArchived && user.role !== 'ADMIN' && !projectRole) {
        return res.status(403).json({ error: 'Access denied. This project is archived.' });
      }
      if (!canViewProjectFile(user.role, projectRole, file, userId)) {
        return res.status(403).json({ error: 'You do not have permission to view this file' });
      }

      const extension = path.extname(file.fileName).toLowerCase();
      const contentTypeByExtension: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.avif': 'image/avif',
        '.txt': 'text/plain; charset=utf-8',
        '.csv': 'text/csv; charset=utf-8',
      };
      const previewContentType = contentTypeByExtension[extension];
      if (!previewContentType) return res.status(415).json({ error: 'Preview is available for PDF, image, CSV, and text files' });
      if (['.txt', '.csv'].includes(extension) && (file.fileSize || 0) > 2 * 1024 * 1024) {
        return res.status(413).json({ error: 'Text and CSV previews are limited to 2 MB' });
      }
      let previewStream: NodeJS.ReadableStream;
      if (file.fileUrl.startsWith('/uploads/')) {
        const uploadsRoot = path.resolve(process.cwd(), 'uploads');
        const filePath = path.resolve(uploadsRoot, path.basename(file.fileUrl));
        if (!filePath.startsWith(uploadsRoot + path.sep)) return res.status(400).json({ error: 'Invalid file path' });
        try {
          await accessFile(filePath, constants.R_OK);
        } catch {
          return res.status(404).json({ error: 'Preview file was not found in storage' });
        }
        previewStream = createReadStream(filePath);
      } else {
        const s3Key = getProjectS3Key(file.fileUrl, projectId);
        if (!s3Key) return res.status(404).json({ error: 'File storage reference is invalid' });
        const object = await s3Client.send(new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME!, Key: s3Key }));
        if (!object.Body) return res.status(404).json({ error: 'Preview file was not found in storage' });
        previewStream = object.Body as NodeJS.ReadableStream;
      }

      // Return a JSON envelope containing base64 data instead of a raw PDF or
      // image response. Some download-manager browser integrations intercept
      // binary responses even when requested as XHR; JSON keeps preview bytes
      // inside the app's data flow. Encode as a stream to avoid buffering the
      // entire file in backend memory.
      res.set({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.write(`{"contentType":${JSON.stringify(previewContentType)},"data":"`);

      let carry = Buffer.alloc(0);
      const base64Encoder = new Transform({
        transform(chunk: Buffer | string, _encoding, callback) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const combined = carry.length ? Buffer.concat([carry, bytes]) : bytes;
          const completeLength = combined.length - (combined.length % 3);
          if (completeLength) this.push(combined.subarray(0, completeLength).toString('base64'));
          carry = Buffer.from(combined.subarray(completeLength));
          callback();
        },
        flush(callback) {
          if (carry.length) this.push(carry.toString('base64'));
          callback();
        },
      });
      const jsonResponseWriter = new Writable({
        write(chunk, _encoding, callback) {
          if (res.write(chunk)) callback();
          else res.once('drain', callback);
        },
        final(callback) {
          res.end('"}');
          callback();
        },
      });
      await pipeline(previewStream, base64Encoder, jsonResponseWriter);
    } catch (error) {
      console.error('File preview failed:', error);
      if (res.headersSent) res.destroy(error as Error);
      else res.status(500).json({ error: 'Failed to preview file' });
    }
  }
);

// ============================================================================
// 3. GET SINGLE PROJECT OR SUB-PROJECT BY ID
// ============================================================================
router.get('/:id/available-users', authenticateToken, requireProjectRole('MANAGER'), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
    return res.json(users);
  } catch (error) {
    console.error('Failed to load project user directory:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

router.get(
  '/:id/activity',
  authenticateToken,
  requireRole(['ADMIN', 'TEAM_MEMBER']),
  requireProjectRole('VIEWER'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);
      const exists = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
      if (!exists) return res.status(404).json({ error: 'Project not found' });
      const activities = await prisma.projectActivity.findMany({
        where: { projectId }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      return res.json(activities);
    } catch (error) {
      console.error('Failed to load project activity:', error);
      return res.status(500).json({ error: 'Failed to load project activity' });
    }
  }
);

router.get(
  '/:id',
  authenticateToken,
  requireProjectRole('VIEWER'),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const id = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const user = (req as any).user;
      const userRole = user?.role;

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          ...fullProjectInclude,
          parentProject: { select: { id: true, title: true, location: true } },
          subProjects: {
            include: fullProjectInclude,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      if (project.isArchived && userRole !== 'ADMIN') {
        const effectiveRole = await getEffectiveProjectRole(project.id, user?.id || user?.userId || user?.sub || '');
        const isAssigned = Boolean(effectiveRole);
        if (!isAssigned) {
          res.status(403).json({ error: 'Access denied. This project is archived.' });
          return;
        }
      }

      const currentUserMember = project.members.find((m) => m.userId === user.id);
      const userProjectRole = currentUserMember?.role || 'VIEWER';
      const effectiveRole = await getEffectiveProjectRole(project.id, user.id || user.userId || user.sub || '');
      const canDownload = canDownloadProjectFiles(user.role, effectiveRole);

      const accessibleFiles = project.files.filter((f) =>
        canViewProjectFile(user.role, effectiveRole || userProjectRole, f, getUserId(req) || '')
      );

      const filesWithPresignedUrls = await Promise.all(
        accessibleFiles.map(async (file) => {
          let downloadUrl = '';
          try {
            const s3Key = getProjectS3Key(file.fileUrl, project.id);
            if (canDownload && s3Key) {

              const command = new GetObjectCommand({
                Bucket: process.env.AWS_S3_BUCKET_NAME!,
                Key: s3Key,
                ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
              });

              downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
            }
          } catch (s3Err) {
            console.error(`Failed to generate signed URL for file ${file.id}:`, s3Err);
          }

          return { ...file, fileUrl: canDownload ? file.fileUrl : '', downloadUrl };
        })
      );

      const sanitizedSubProjects = await Promise.all(project.subProjects.map(async (subProject) => {
        const subRole = await getEffectiveProjectRole(subProject.id, getUserId(req) || '');
        const subCanDownload = canDownloadProjectFiles(user.role, subRole);
        const visibleFiles = subProject.files.filter((file) =>
          canViewProjectFile(user.role, subRole, file, getUserId(req) || '')
        ).map((file) => ({
          ...file,
          fileUrl: canDownloadProjectFiles(user.role, subRole) ? file.fileUrl : '',
          downloadUrl: '',
        }));
        return { ...subProject, files: visibleFiles };
      }));

      res.json({
        ...project,
        effectiveProjectRole: effectiveRole,
        files: filesWithPresignedUrls,
        subProjects: sanitizedSubProjects,
      });
    } catch (error) {
      console.error('Error fetching project:', error);
      res.status(500).json({ error: 'Failed to fetch project' });
    }
  }
);

// ============================================================================
// 4. CREATE NEW PROJECT OR SUB-PROJECT (Admin Only)
// ============================================================================
router.post(
  '/',
  authenticateToken,
  requireRole(['ADMIN']),
  async (req: Request, res: Response) => {
    try {
      const { title, projectType, location, description, parentProjectId, buildingCode, facilityType } = req.body;
      const currentUserId = getUserId(req);

      if (!title || !projectType || !location) {
        return res.status(400).json({ error: 'Title, projectType, and location are required' });
      }

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: Unable to resolve user identity from session.' });
      }

      const creatorExists = await prisma.user.findUnique({
        where: { id: String(currentUserId) },
      });

      if (!creatorExists) {
        return res.status(400).json({ error: 'Creator user account does not exist in the database.' });
      }

      if (parentProjectId) {
        const parentExists = await prisma.project.findUnique({ where: { id: String(parentProjectId) } });
        if (!parentExists) {
          return res.status(400).json({ error: 'Parent category project does not exist' });
        }
      }

      const newProject = await prisma.project.create({
        data: {
          title: String(title),
          projectType: String(projectType),
          location: String(location),
          description: description ? String(description) : null,
          parentProjectId: parentProjectId ? String(parentProjectId) : null,
          buildingCode: buildingCode ? String(buildingCode).trim() : null,
          facilityType: facilityType ? String(facilityType).trim() : null,
          createdByUserId: String(currentUserId),
          members: {
            create: {
              userId: String(currentUserId),
              role: 'MANAGER',
            },
          },
          phases: {
            create: ENGINEERING_PHASES.map((name, index) => ({
              name,
              order: index + 1,
            })),
          },
        },
        include: fullProjectInclude,
      });

      await logProjectActivity(newProject.id, req, 'project.created', `Created project “${newProject.title}”`);

      return res.status(201).json(newProject);
    } catch (error: any) {
      console.error('Project creation failed:', error);
      return res.status(500).json({
        error: 'Failed to create project',
      });
    }
  }
);

// ============================================================================
// 5. GENERATE PRESIGNED S3 UPLOAD URL (Editor Or Manager)
// ============================================================================
router.post(
  '/:id/upload-url',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);

      const fileName = req.body?.fileName as string | undefined;
      const fileSize = Number(req.body?.fileSize);

      if (!fileName || fileName.length > 255) {
        return res.status(400).json({ error: 'A fileName of at most 255 characters is required' });
      }
      const allowedExtensions = new Set([
        'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif',
        'dwg', 'dxf', 'dgn', 'rvt', 'rfa', 'ifc', 'ifczip', 'nwc', 'nwd', 'nwf',
        'skp', 'obj', 'stl', 'step', 'stp', 'iges', 'igs',
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf',
      ]);
      const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
      if (!allowedExtensions.has(fileExt)) {
        return res.status(400).json({ error: 'This file type is not supported' });
      }
      if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > 200 * 1024 * 1024) {
        return res.status(400).json({ error: 'File size must be between 1 byte and 200 MB' });
      }
      const bucket = process.env.AWS_S3_BUCKET_NAME;
      const region = process.env.AWS_REGION;
      if (!bucket || !region) {
        return res.status(503).json({ error: 'File storage is not configured on this server' });
      }

      const extSuffix = '.' + fileExt;
      const fileKey = 'projects/' + projectId + '/' + crypto.randomUUID() + extSuffix;

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!,
        Key: fileKey,
        ContentType: expectedUploadContentType(fileName),
        ContentLength: fileSize,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      const fileUrl = `https://${bucket}.s3.${region}.amazonaws.com/${fileKey}`;

      return res.json({ uploadUrl, fileUrl, contentType: expectedUploadContentType(fileName) });
    } catch (error: any) {
      console.error('Error generating upload URL:', error);
      return res.status(500).json({
        error: 'Failed to generate S3 upload URL',
      });
    }
  }
);

// ============================================================================
// 6. SAVE FILE METADATA & PERMISSIONS TO DATABASE
// ============================================================================
router.post(
  '/:id/files',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    let pendingObjectKey: string | null = null;
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const { fileName, fileType, fileUrl, fileSize, allowedRoles } = req.body;

      if (!fileName || !fileUrl) {
        return res.status(400).json({ error: 'fileName and fileUrl are required' });
      }

      if (typeof fileName !== 'string' || fileName.length > 255) {
        return res.status(400).json({ error: 'fileName must be a string of at most 255 characters' });
      }
      const mappedType: FileType = mapToFileType(String(fileType || ''), fileName);
      if (typeof fileUrl !== 'string' || !getProjectS3Key(fileUrl, projectId)) {
        return res.status(400).json({ error: 'fileUrl must point to this project’s uploaded S3 file' });
      }
      if (fileSize !== undefined && (!Number.isInteger(Number(fileSize)) || Number(fileSize) < 0)) {
        return res.status(400).json({ error: 'fileSize must be a positive whole number' });
      }

      const s3Key = getProjectS3Key(fileUrl, projectId)!;
      pendingObjectKey = s3Key;
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME!, Key: s3Key }));
      if (!head.ContentLength || head.ContentLength > 200 * 1024 * 1024 ||
        (fileSize !== undefined && head.ContentLength !== Number(fileSize)) ||
        head.ContentType !== expectedUploadContentType(fileName)) {
        await discardUploadedObject(s3Key);
        pendingObjectKey = null;
        return res.status(400).json({ error: 'Uploaded file size or content type could not be verified' });
      }
      const prefixObject = await s3Client.send(new GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME!, Key: s3Key, Range: 'bytes=0-31',
      }));
      if (!prefixObject.Body) {
        await discardUploadedObject(s3Key);
        pendingObjectKey = null;
        return res.status(400).json({ error: 'Uploaded file could not be validated' });
      }
      const prefixChunks: Buffer[] = [];
      for await (const chunk of prefixObject.Body as AsyncIterable<Uint8Array>) {
        prefixChunks.push(Buffer.from(chunk));
        if (prefixChunks.reduce((size, part) => size + part.length, 0) >= 32) break;
      }
      const prefix = Buffer.concat(prefixChunks).subarray(0, 32);
      if (!validatePreviewFilePrefix(fileName, prefix)) {
        await discardUploadedObject(s3Key);
        pendingObjectKey = null;
        return res.status(400).json({ error: 'File contents do not match the selected PDF or image type' });
      }

      const validAllowedRoles: ProjectRole[] =
        Array.isArray(allowedRoles) && allowedRoles.length > 0
          ? allowedRoles
          : ['VIEWER' as ProjectRole];
      if (validAllowedRoles.some((role) => !['MANAGER', 'EDITOR', 'VIEWER'].includes(role))) {
        await discardUploadedObject(s3Key);
        pendingObjectKey = null;
        return res.status(400).json({ error: 'allowedRoles contains an invalid project role' });
      }

      const uploaderId = getUserId(req);
      if (!uploaderId) {
        await discardUploadedObject(s3Key);
        pendingObjectKey = null;
        return res.status(401).json({ error: 'Uploader identity is missing' });
      }

      const fileRecord = await prisma.projectFile.create({
        data: {
          projectId,
          fileName: String(fileName),
          fileType: mappedType,
          fileUrl: String(fileUrl),
          fileSize: fileSize !== undefined ? Number(fileSize) : null,
          allowedRoles: validAllowedRoles,
          reviewStatus: 'DRAFT',
          uploadedByUserId: uploaderId,
        } as any,
      });
      pendingObjectKey = null;

      await logProjectActivity(projectId, req, 'file.draft_created', `Uploaded “${fileRecord.fileName}” as a draft`);

      return res.status(201).json(fileRecord);
    } catch (error: any) {
      console.error('SAVE FILE METADATA ERROR:', error);
      if (pendingObjectKey) await discardUploadedObject(pendingObjectKey);
      return res.status(500).json({
        error: 'Failed to save file record', 
      });
    }
  }
);

// Submit an uploaded draft (or a rejected file) for manager/admin review.
router.post(
  '/:projectId/files/:fileId/submit-review',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const fileId = String(req.params.fileId);
      const userId = getUserId(req);
      const file = await prisma.projectFile.findFirst({ where: { id: fileId, projectId } });
      if (!file) return res.status(404).json({ error: 'File not found in this project' });
      if (file.uploadedByUserId !== userId && (req as any).user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only the uploader or a system admin can submit this file for review' });
      }
      if (file.reviewStatus !== 'DRAFT' && file.reviewStatus !== 'REJECTED') {
        return res.status(409).json({ error: 'Only draft or rejected files can be submitted for review' });
      }

      const submitted = await prisma.projectFile.updateMany({
        where: { id: fileId, projectId, reviewStatus: { in: ['DRAFT', 'REJECTED'] } },
        data: {
          reviewStatus: 'PENDING_REVIEW',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewComment: null,
        },
      });
      if (submitted.count !== 1) return res.status(409).json({ error: 'This file has already changed review state' });
      const updatedFile = await prisma.projectFile.findUnique({ where: { id: fileId } });
      await logProjectActivity(projectId, req, 'file.submitted_for_review', `Submitted “${file.fileName}” for review`);
      return res.json(updatedFile);
    } catch (error) {
      console.error('Failed to submit file for review:', error);
      return res.status(500).json({ error: 'Failed to submit file for review' });
    }
  }
);

// Only project managers and global admins can approve or reject submitted files.
router.post(
  '/:projectId/files/:fileId/review',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.projectId);
      const fileId = String(req.params.fileId);
      const decision = req.body?.decision;
      const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
      if (decision !== 'APPROVED' && decision !== 'REJECTED') {
        return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });
      }
      if (decision === 'REJECTED' && !comment) {
        return res.status(400).json({ error: 'Add a reason when rejecting a file' });
      }
      if (comment.length > 2000) {
        return res.status(400).json({ error: 'Review comments must be 2,000 characters or fewer' });
      }

      const file = await prisma.projectFile.findFirst({ where: { id: fileId, projectId } });
      if (!file) return res.status(404).json({ error: 'File not found in this project' });
      if (file.reviewStatus !== 'PENDING_REVIEW') {
        return res.status(409).json({ error: 'Only files pending review can be approved or rejected' });
      }
      const reviewerId = getUserId(req);
      if (!reviewerId) return res.status(401).json({ error: 'Reviewer identity is missing' });

      const reviewed = await prisma.projectFile.updateMany({
        where: { id: fileId, projectId, reviewStatus: 'PENDING_REVIEW' },
        data: {
          reviewStatus: decision as FileReviewStatus,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          reviewComment: decision === 'REJECTED' ? comment : null,
        },
      });
      if (reviewed.count !== 1) return res.status(409).json({ error: 'This file has already been reviewed' });
      const updatedFile = await prisma.projectFile.findUnique({ where: { id: fileId } });
      await logProjectActivity(
        projectId,
        req,
        decision === 'APPROVED' ? 'file.approved' : 'file.rejected',
        `${decision === 'APPROVED' ? 'Approved' : 'Rejected'} “${file.fileName}”`
      );
      return res.json(updatedFile);
    } catch (error) {
      console.error('Failed to review file:', error);
      return res.status(500).json({ error: 'Failed to review file' });
    }
  }
);

// ============================================================================
// 7. UPDATE FILE PERMISSION ROLES (Manager Only)
// ============================================================================
router.patch(
  '/:projectId/files/:fileId/permissions',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const fileId = String(req.params.fileId);
      const { allowedRoles } = req.body;

      if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
        return res.status(400).json({ error: 'allowedRoles array must contain at least one role' });
      }

      const projectId = String(req.params.projectId);
      if (allowedRoles.some((role: unknown) => !['MANAGER', 'EDITOR', 'VIEWER'].includes(String(role)))) {
        return res.status(400).json({ error: 'allowedRoles contains an invalid project role' });
      }
      const existingFile = await prisma.projectFile.findFirst({ where: { id: fileId, projectId } });
      if (!existingFile) return res.status(404).json({ error: 'File not found in this project' });

      const updatedFile = await prisma.projectFile.update({
        where: { id: fileId },
        data: {
          allowedRoles: allowedRoles as ProjectRole[],
        } as any,
      });

      await logProjectActivity(projectId, req, 'file.visibility_changed', `Changed file visibility for “${existingFile.fileName}”`);

      return res.json({ message: 'File permissions updated', file: updatedFile });
    } catch (error: any) {
      console.error('Error updating file permissions:', error);
      return res.status(500).json({ error: 'Failed to update file permissions' });
    }
  }
);

// ============================================================================
// 8. UPDATE PROJECT DETAILS (Manager Only)
// ============================================================================
const handleUpdateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, projectType, location, description, parentProjectId, buildingCode, facilityType } = req.body;
    const currentUserId = getUserId(req);

    const updateData: any = {};
    if (title !== undefined) updateData.title = String(title);
    if (projectType !== undefined) updateData.projectType = String(projectType);
    if (location !== undefined) updateData.location = String(location);
    if (description !== undefined) updateData.description = description ? String(description) : null;
    if (buildingCode !== undefined) updateData.buildingCode = buildingCode ? String(buildingCode).trim() : null;
    if (facilityType !== undefined) updateData.facilityType = facilityType ? String(facilityType).trim() : null;
    if (parentProjectId !== undefined) {
      const parentId = parentProjectId ? String(parentProjectId) : null;
      if (parentId === String(id)) return res.status(400).json({ error: 'A project cannot be its own parent' });
      if (parentId) {
        let cursor: string | null = parentId;
        const visited = new Set<string>();
        while (cursor) {
          if (cursor === String(id)) return res.status(400).json({ error: 'Moving this project would create a hierarchy cycle' });
          if (visited.has(cursor)) return res.status(400).json({ error: 'The project hierarchy already contains a cycle' });
          visited.add(cursor);
          const ancestor: { parentProjectId: string | null } | null = await prisma.project.findUnique({
            where: { id: cursor }, select: { parentProjectId: true },
          });
          if (!ancestor) return res.status(400).json({ error: 'Parent project does not exist' });
          cursor = ancestor.parentProjectId;
        }
      }
      updateData.parentProjectId = parentId;
    }

    if (currentUserId) {
      updateData.updatedByUserId = String(currentUserId);
    }

    const updatedProject = await prisma.project.update({
      where: { id: String(id) },
      data: updateData,
      include: fullProjectInclude,
    });

    const changedFields = ['title', 'projectType', 'location', 'description', 'parentProjectId', 'buildingCode', 'facilityType']
      .filter((field) => (req.body as Record<string, unknown>)[field] !== undefined);
    if (changedFields.length) {
      await logProjectActivity(String(id), req, 'project.updated', `Updated project details: ${changedFields.join(', ')}`);
    }

    return res.json(updatedProject);
  } catch (error: any) {
    console.error('Error updating project:', error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
};

router.patch('/:id', authenticateToken, requireProjectRole('MANAGER'), handleUpdateProject);
router.put('/:id', authenticateToken, requireProjectRole('MANAGER'), handleUpdateProject);

// ============================================================================
// 9. DELETE PROJECT (Manager Only)
// ============================================================================
router.delete(
  '/:id',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);

      const existingProject = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!existingProject) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const tree: Array<{ id: string; files: Array<{ fileUrl: string }> }> = [];
      const visited = new Set<string>();
      const collectProjectFiles = async (currentId: string): Promise<void> => {
        if (visited.has(currentId)) return;
        visited.add(currentId);
        const current = await prisma.project.findUnique({
          where: { id: currentId },
          select: { id: true, files: { select: { fileUrl: true } }, subProjects: { select: { id: true } } },
        });
        if (!current) return;
        tree.push({ id: current.id, files: current.files });
        for (const child of current.subProjects) await collectProjectFiles(child.id);
      };
      await collectProjectFiles(projectId);

      try {
        for (const project of tree) {
          for (const file of project.files) {
            if (file.fileUrl.startsWith('/uploads/')) {
              await StorageService.deleteFile(file.fileUrl);
              continue;
            }
            const key = getProjectS3Key(file.fileUrl, project.id);
            if (!key) {
              console.error('Project deletion stopped: file has an invalid storage reference', project.id);
              return res.status(409).json({ error: 'A project file has an invalid storage reference; contact an administrator before deleting this project.' });
            }
            await s3Client.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME!, Key: key }));
          }
        }
      } catch (storageError) {
        console.error('Project file cleanup failed; project records were retained:', storageError);
        return res.status(503).json({ error: 'Project files could not be fully removed. Please retry later.' });
      }

      await prisma.project.delete({
        where: { id: projectId },
      });

      return res.json({ success: true, message: 'Project successfully deleted' });
    } catch (error: any) {
      console.error('Error deleting project:', error);
      return res.status(500).json({
        error: 'Failed to delete project',
      });
    }
  }
);

// ============================================================================
// 10. PROJECT PHASE MANAGEMENT (Create, Update, Delete)
// ============================================================================
const ENGINEERING_PHASES = ['Concept Design', 'Design Calculation', 'Modeling', 'Sheeting'] as const;

// Create Phase
router.post(
  '/:id/phases',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const { name, order, status, progressPercent, startDate, endDate, notes } = req.body;

      if (typeof name !== 'string' || !ENGINEERING_PHASES.includes(name as typeof ENGINEERING_PHASES[number])) {
        return res.status(400).json({ error: `Phase must be one of: ${ENGINEERING_PHASES.join(', ')}` });
      }

      const existingPhase = await prisma.projectPhase.findFirst({ where: { projectId, name } });
      if (existingPhase) return res.status(409).json({ error: `${name} already exists on this project` });

      let phaseOrder = order;
      if (phaseOrder === undefined) {
        const count = await prisma.projectPhase.count({ where: { projectId } });
        phaseOrder = count + 1;
      }

      const phase = await prisma.projectPhase.create({
        data: {
          projectId,
          name,
          order: Number(phaseOrder),
          status: (status as PhaseStatus) || 'NOT_STARTED',
          ...(progressPercent !== undefined && { progressPercent: Number(progressPercent) }),
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          notes,
        },
      });

      await logProjectActivity(projectId, req, 'phase.created', `Added phase “${phase.name}”`);

      return res.status(201).json(phase);
    } catch (error: any) {
      console.error('Error creating phase:', error);
      return res.status(500).json({ error: 'Failed to create phase' });
    }
  }
);

// Update Phase
router.patch(
  '/:id/phases/:phaseId',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    try {
      const phaseId = String(req.params.phaseId);
      const { name, order, status, progressPercent, startDate, endDate, notes } = req.body;

      const updateData: any = {};

      if (order !== undefined) updateData.order = Number(order);
      if (status !== undefined) updateData.status = status as PhaseStatus;
      if (notes !== undefined) updateData.notes = notes;

      if (progressPercent !== undefined) {
        const parsedPercent = Number(progressPercent);
        if (!isNaN(parsedPercent)) {
          updateData.progressPercent = Math.min(100, Math.max(0, Math.round(parsedPercent)));
        }
      }

      if (startDate !== undefined) {
        updateData.startDate = startDate ? new Date(startDate) : null;
      }
      if (endDate !== undefined) {
        updateData.endDate = endDate ? new Date(endDate) : null;
      }

      const existingPhase = await prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: String(req.params.id) } });
      if (!existingPhase) return res.status(404).json({ error: 'Phase not found in this project' });

      if (name !== undefined) {
        if (typeof name !== 'string' || !ENGINEERING_PHASES.includes(name as typeof ENGINEERING_PHASES[number])) {
          return res.status(400).json({ error: `Phase must be one of: ${ENGINEERING_PHASES.join(', ')}` });
        }
        const duplicate = await prisma.projectPhase.findFirst({
          where: { projectId: existingPhase.projectId, name, id: { not: phaseId } },
        });
        if (duplicate) return res.status(409).json({ error: `${name} already exists on this project` });
        updateData.name = name;
      }

      const updatedPhase = await prisma.projectPhase.update({
        where: { id: phaseId },
        data: updateData,
      });

      await logProjectActivity(String(req.params.id), req, 'phase.updated', `Updated phase “${updatedPhase.name}”`);

      return res.json(updatedPhase);
    } catch (error: any) {
      console.error('Error updating phase:', error);
      return res.status(500).json({
        error: 'Failed to update phase',
      });
    }
  }
);

// Delete Phase
router.delete(
  '/:id/phases/:phaseId',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const phaseId = String(req.params.phaseId);

      const phase = await prisma.projectPhase.findFirst({ where: { id: phaseId, projectId: String(req.params.id) } });
      if (!phase) return res.status(404).json({ error: 'Phase not found in this project' });
      return res.status(409).json({ error: 'Standard project phases cannot be deleted' });
    } catch (error: any) {
      console.error('Error deleting phase:', error);
      return res.status(500).json({ error: 'Failed to delete phase' });
    }
  }
);

// ============================================================================
// 11. PROJECT MEMBER MANAGEMENT (Manager Only)
// ============================================================================

// Add or update project member
router.post(
  '/:id/members',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const { userId, role } = req.body;

      if (!userId || !role) {
        return res.status(400).json({ error: 'userId and role are required' });
      }
      if (!['MANAGER', 'EDITOR', 'VIEWER'].includes(role)) {
        return res.status(400).json({ error: 'Invalid project role' });
      }
      const targetUser = await prisma.user.findUnique({ where: { id: String(userId) }, select: { id: true, role: true } });
      if (!targetUser) return res.status(404).json({ error: 'User not found' });
      if (targetUser.role === 'CLIENT' && role !== 'VIEWER') {
        return res.status(400).json({ error: 'Client accounts can only have the VIEWER project role' });
      }

      const member = await prisma.projectMember.upsert({
        where: {
          projectId_userId: { projectId, userId },
        },
        update: { role: role as ProjectRole },
        create: { projectId, userId, role: role as ProjectRole },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      await logProjectActivity(projectId, req, 'member.assigned', `Assigned ${member.user.name} as ${member.role}`);

      return res.json({ message: 'Project member updated successfully', member });
    } catch (error: any) {
      console.error('Error updating member:', error);
      return res.status(500).json({ error: 'Failed to assign project member' });
    }
  }
);

// Remove member from project
router.delete(
  '/:id/members/:userId',
  authenticateToken,
  requireProjectRole('MANAGER'),
  async (req: Request, res: Response) => {
    try {
      const rawId = req.params.id;
      const projectId = Array.isArray(rawId) ? rawId[0] : String(rawId);
      const userId = String(req.params.userId);

      const existingMember = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } }, include: { user: { select: { name: true } } },
      });
      if (!existingMember) return res.status(404).json({ error: 'Project member not found' });
      if (existingMember.role === 'MANAGER' && (req as any).user?.role !== 'ADMIN') {
        const managerCount = await prisma.projectMember.count({ where: { projectId, role: 'MANAGER' } });
        if (managerCount <= 1) return res.status(400).json({ error: 'A project must have at least one manager' });
      }
      await prisma.projectMember.delete({
        where: {
          projectId_userId: { projectId, userId },
        },
      });
      await logProjectActivity(projectId, req, 'member.removed', `Removed ${existingMember.user.name} from project access`);

      return res.json({ message: 'Member removed from project' });
    } catch (error: any) {
      console.error('Error removing member:', error);
      return res.status(500).json({ error: 'Failed to remove project member' });
    }
  }
);

// ============================================================================
// 12. ARCHIVE / UNARCHIVE PROJECT (Admin Only)
// ============================================================================
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

      await logProjectActivity(String(id), req, updatedProject.isArchived ? 'project.archived' : 'project.restored', updatedProject.isArchived ? 'Archived project' : 'Restored project');

      res.json({
        message: `Project ${updatedProject.isArchived ? 'archived' : 'restored'} successfully`,
        project: updatedProject,
      });
    } catch (error) {
      console.error('Error archiving project:', error);
      res.status(500).json({ error: 'Failed to update project archive status' });
    }
  }
);

// ============================================================================
// 13. DELETE FILE (Editor or Manager)
// ============================================================================
router.delete(
  '/:projectId/files/:fileId',
  authenticateToken,
  requireProjectRole('EDITOR'),
  async (req: Request, res: Response) => {
    try {
      const rawFileId = req.params.fileId;
      const fileId = Array.isArray(rawFileId) ? rawFileId[0] : String(rawFileId);

      const projectId = String(req.params.projectId);
      const file = await prisma.projectFile.findFirst({ where: { id: fileId, projectId } });

      if (!file) {
        return res.status(404).json({ error: 'File record not found' });
      }

      if (file.fileUrl) {
        const s3Key = getProjectS3Key(file.fileUrl, projectId);
        if (s3Key) {
          try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET_NAME!,
              Key: s3Key,
            })
          );
          } catch (s3Err) {
            console.error('S3 deletion warning (continuing DB deletion):', s3Err);
          }
        }
      }

      await prisma.projectFile.delete({
        where: { id: fileId },
      });

      await logProjectActivity(projectId, req, 'file.deleted', `Deleted “${file.fileName}”`);

      return res.status(200).json({ message: 'File deleted from S3 and database' });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      return res.status(500).json({
        error: 'Failed to delete file',
      });
    }
  }
);

export default router;
