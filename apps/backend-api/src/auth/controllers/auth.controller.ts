import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { Organization } from '../schemas/organization.model';
import { logger } from '../../core/utils/logger';

/**
 * Authentication Controller
 * Handles user authentication and registration
 */
export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * POST /api/auth/login
   * Authenticate user (rider or responder)
   * Smart login: automatically detects user type if credentials match
   */
  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password, userType } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'Email and password are required',
          },
        });
        return;
      }

      // If userType is not provided or invalid, try to auto-detect
      const requestedType = userType?.toLowerCase();
      
      if (requestedType && requestedType !== 'rider' && requestedType !== 'responder') {
        res.status(400).json({
          error: {
            code: 'INVALID_USER_TYPE',
            message: 'User type must be "rider" or "responder"',
          },
        });
        return;
      }

      // Use smart authentication that auto-detects user type
      const result = await this.authService.authenticateUser(email, password, requestedType);

      if (result.error) {
        res.status(401).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Login error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to authenticate',
        },
      });
    }
  };

  /**
   * POST /api/auth/register/rider
   * Register new rider
   */
  registerRider = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, email, phone, password } = req.body;

      if (!name || !email || !phone || !password) {
        res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'Name, email, phone, and password are required',
          },
        });
        return;
      }

      const result = await this.authService.registerRider({
        name,
        email,
        phone,
        password,
      });

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      logger.error('Rider registration error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to register rider',
        },
      });
    }
  };

  /**
   * POST /api/auth/register/responder
   * Register new responder
   */
  registerResponder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, email, phone, password, organizationId, region } = req.body;

      if (!name || !email || !phone || !password || !organizationId || !region) {
        res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'All fields are required',
          },
        });
        return;
      }

      const result = await this.authService.registerResponder({
        name,
        email,
        phone,
        password,
        organizationId,
        region,
      });

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      logger.error('Responder registration error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to register responder',
        },
      });
    }
  };

  /**
   * GET /api/auth/organizations
   * List all organizations
   */
  listOrganizations = async (req: Request, res: Response): Promise<void> => {
    try {
      const organizations = await Organization.find({}, 'name regions');
      res.status(200).json({
        data: { organizations },
        meta: {},
      });
    } catch (error) {
      logger.error('List organizations error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list organizations',
        },
      });
    }
  };

  /**
   * POST /api/auth/otp/request
   * Generate and send OTP to user
   */
  requestOtp = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, userType } = req.body;
      const result = await this.authService.requestOtp(email, userType);

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Request OTP controller error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to request OTP',
        },
      });
    }
  };

  /**
   * POST /api/auth/otp/login
   * Verify OTP and return session token
   */
  verifyOtpLogin = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, code, userType } = req.body;
      const result = await this.authService.verifyOtpAndLogin(email, code, userType);

      if (result.error) {
        res.status(401).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Verify OTP login controller error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to verify OTP',
        },
      });
    }
  };

  /**
   * POST /api/auth/password/forgot
   * Generate password reset code
   */
  requestPasswordReset = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, userType } = req.body;
      const result = await this.authService.requestPasswordReset(email, userType);

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Forgot password controller error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to request password reset',
        },
      });
    }
  };

  /**
   * POST /api/auth/password/reset
   * Reset password with code
   */
  resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, code, newPassword, userType } = req.body;
      const result = await this.authService.resetPassword(email, code, newPassword, userType);

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Reset password controller error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to reset password',
        },
      });
    }
  };
}
