import { Router } from 'express';
import { getAllUsers, updateUserRole } from '../controllers/user';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Ensure authenticateToken and requireRole(...) are valid Express middleware functions
router.get('/', authenticateToken, requireRole(['ADMIN']), getAllUsers);
router.patch('/:id/role', authenticateToken, requireRole(['ADMIN']), updateUserRole);

// 🔒 MUST include default export
export default router;