import { Router } from 'express';
import { deleteUser, getAllUsers, updateUserRole } from '../controllers/user.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, requireRole(['ADMIN']), getAllUsers);
router.patch('/:id/role', authenticateToken, requireRole(['ADMIN']), updateUserRole);
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), deleteUser);

export default router;
