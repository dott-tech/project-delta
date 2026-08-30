import multer from 'multer';
import path from 'path';

// Allowed extensions for structural engineering assets
const ALLOWED_EXTENSIONS = /pdf|dwg|dxf|rvt|ifc|png|jpg|jpeg|doc|docx|xlsx/;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (ALLOWED_EXTENSIONS.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type .${ext} is not allowed.`));
    }
  },
});