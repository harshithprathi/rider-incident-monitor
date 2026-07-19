import { Router } from 'express';
import { AuthController } from './controllers/auth.controller';
import { validate } from '../core/middlewares/validation.middleware';
import {
  loginValidation,
  registerRiderValidation,
  registerResponderValidation,
  requestOtpValidation,
  verifyOtpValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
} from './validators/auth.validators';

const router = Router();
const authController = new AuthController();

router.post('/login', validate(loginValidation), authController.login);
router.post('/register/rider', validate(registerRiderValidation), authController.registerRider);
router.post('/register/responder', validate(registerResponderValidation), authController.registerResponder);
router.get('/organizations', authController.listOrganizations);
router.post('/otp/request', validate(requestOtpValidation), authController.requestOtp);
router.post('/otp/login', validate(verifyOtpValidation), authController.verifyOtpLogin);
router.post('/password/forgot', validate(forgotPasswordValidation), authController.requestPasswordReset);
router.post('/password/reset', validate(resetPasswordValidation), authController.resetPassword);

export { router as authRouter };
