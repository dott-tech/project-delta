import { Role } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  id?: string;
  role: Role;
  authVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
