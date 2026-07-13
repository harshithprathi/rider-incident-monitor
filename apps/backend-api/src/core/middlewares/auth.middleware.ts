import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../auth/services/auth.service';
import { AuthenticatedRequest } from '../types';
import { logger } from '../utils/logger';

/**
 * Authentication middleware
 * - Verifies JWT token
 * - Attaches user to request object
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'NO_TOKEN',
          message: 'No authentication token provided',
        },
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const authService = new AuthService();
    const payload = authService.verifyToken(token);

    // Attach user to request
    (req as AuthenticatedRequest).user = payload;

    logger.debug('Request authenticated', {
      userId: payload.userId,
      role: payload.role,
    });

    next();
  } catch (error: any) {
    logger.warn('Authentication failed', {
      error: error.message,
    });

    if (error.message === 'TOKEN_EXPIRED') {
      res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Authentication token has expired',
        },
      });
      return;
    }

    res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid authentication token',
      },
    });
  }
};

/**
 * Optional authentication middleware
 * - Attaches user if token is present and valid
 * - Continues even if no token or invalid token
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const authService = new AuthService();
    const payload = authService.verifyToken(token);

    (req as AuthenticatedRequest).user = payload;
    next();
  } catch (error) {
    // Silent fail - continue without user
    next();
  }
};
