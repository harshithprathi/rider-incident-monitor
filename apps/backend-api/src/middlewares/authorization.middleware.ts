import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, UserRole } from '../types';
import { logger } from '../utils/logger';

/**
 * R3: Authorization middleware - enforce org/region scope
 * - Single middleware applied to all protected routes
 * - Prevents IDOR attacks
 * - Responders can only access incidents in their org/region
 */
export const authorizeResponder = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;

  if (!user) {
    logger.warn('Authorization failed - no user');
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  // Check if user is responder
  if (user.role !== UserRole.RESPONDER) {
    logger.warn('Authorization failed - not a responder', {
      userId: user.userId,
      role: user.role,
    });

    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Responder access required',
      },
    });
    return;
  }

  // Check if responder has org/region scope
  if (!user.organizationId || !user.region) {
    logger.error('Authorization failed - missing org/region', {
      userId: user.userId,
    });

    res.status(403).json({
      error: {
        code: 'INVALID_SCOPE',
        message: 'Invalid authorization scope',
      },
    });
    return;
  }

  logger.debug('Responder authorized', {
    userId: user.userId,
    organizationId: user.organizationId,
    region: user.region,
  });

  next();
};

/**
 * Authorize rider
 */
export const authorizeRider = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (user.role !== UserRole.RIDER) {
    logger.warn('Authorization failed - not a rider', {
      userId: user.userId,
      role: user.role,
    });

    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Rider access required',
      },
    });
    return;
  }

  next();
};

/**
 * Authorize admin
 */
export const authorizeAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user;

  if (!user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  if (user.role !== UserRole.ADMIN) {
    res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
    return;
  }

  next();
};

/**
 * Authorize any authenticated user
 */
export const authorizeAny = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
    return;
  }

  next();
};
