import { Router } from 'express';
import { SafeReturnController } from './controllers/safe-return.controller';
import { authenticate } from '../core/middlewares/auth.middleware';
import { authorizeRider } from '../core/middlewares/authorization.middleware';
import { validate } from '../core/middlewares/validation.middleware';
import {
  createSessionValidation,
  completeSessionValidation,
  extendSessionValidation,
  getSessionValidation,
} from './validators/safe-return.validators';

const router = Router();
const safeReturnController = new SafeReturnController();

router.post('/', authenticate, authorizeRider, validate(createSessionValidation), safeReturnController.createSession);
router.get('/active', authenticate, authorizeRider, safeReturnController.getActiveSession);
router.patch('/:id/complete', authenticate, authorizeRider, validate(completeSessionValidation), safeReturnController.completeSession);
router.patch('/:id/extend', authenticate, authorizeRider, validate(extendSessionValidation), safeReturnController.extendSession);
router.get('/:id', authenticate, authorizeRider, validate(getSessionValidation), safeReturnController.getSession);

export { router as safeReturnRouter };
