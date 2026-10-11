import fs from 'fs';
import path from 'path';

// Ensure the local uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class StorageService {
  /**
   * Save incoming file and return public access URL / path
   */
  static async saveFile(file: Express.Multer.File): Promise<string> {
    const provider = process.env.STORAGE_PROVIDER || 'LOCAL';

    if (provider === 'R2' || provider === 'S3') {
      // Future Cloudflare R2 / AWS S3 implementation hook
      // e.g. return await uploadToR2(file);
      throw new Error('Cloud storage provider not configured yet.');
    }

    // Default Local Storage: return relative static URL path
    return `/uploads/${file.filename}`;
  }

  /**
   * Delete a file from disk or storage bucket
   */
  static async deleteFile(filePath: string): Promise<void> {
    const provider = process.env.STORAGE_PROVIDER || 'LOCAL';

    if (provider === 'LOCAL') {
      const fullPath = path.join(UPLOADS_DIR, path.basename(filePath));
      if (fs.existsSync(fullPath)) {
        await fs.promises.unlink(fullPath);
      }
    }
  }
}
