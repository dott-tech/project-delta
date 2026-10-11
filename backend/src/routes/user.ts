import { Router } from 'express';
import { deleteUser, getAllUsers, updateUserRole } from '../controllers/user';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Ensure authenticateToken and requireRole(...) are valid Express middleware functions
router.get('/', authenticateToken, requireRole(['ADMIN']), getAllUsers);
router.patch('/:id/role', authenticateToken, requireRole(['ADMIN']), updateUserRole);
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), deleteUser);

// 🔒 MUST include default export
export default router;
