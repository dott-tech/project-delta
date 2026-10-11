// backend/src/index.ts
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import fileRoutes from './routes/files.js';
import { prisma } from './db.js';
import userRoutes from './routes/user.js'; // 👈 Added .js extension

const app = express();
const PORT = process.env.PORT || 5000;
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

// Middleware
const configuredOrigins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const localFrontendOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) {
  const missing: string[] = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with-')) missing.push('JWT_SECRET (at least 32 random characters)');
  if (configuredOrigins.length === 0 || configuredOrigins.includes('*')) missing.push('CORS_ORIGIN (one or more exact frontend origins)');
  if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET_NAME) missing.push('AWS_REGION and AWS_S3_BUCKET_NAME');
  if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(', ')}`);
}
app.use(cors({
  origin: (origin, callback) => {
    const allowed = !origin || configuredOrigins.includes(origin) || (!isProduction && localFrontendOrigins.includes(origin));
    callback(null, allowed);
  },
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '1mb' }));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.send('Structural Hub API is live!');
});

app.get('/api/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', message: 'Server and Database are healthy!' });
  } catch (error) {
    console.error('Health check: database connection failed:', error);
    res.status(503).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', fileRoutes);
app.use('/api/users', userRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(error);
  const uploadError = error instanceof multer.MulterError;
  const status = uploadError && error.code === 'LIMIT_FILE_SIZE' ? 413
    : uploadError || (error instanceof Error && error.message.startsWith('File type .')) ? 400
      : 500;
  console.error('Unhandled API error:', error);
  res.status(status).json({ error: status === 500 ? 'Internal server error' : status === 413 ? 'Uploaded file exceeds the 200 MB limit' : 'Invalid request' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
