import { Response } from 'express';
import { SafeReturnService } from '../services/safe-return.service';
import { AuthenticatedRequest } from '../../core/types';
import { logger } from '../../core/utils/logger';

/**
 * Safe Return Controller
 * Feature A: Safe return session management
 */
export class SafeReturnController {
  private safeReturnService: SafeReturnService;

  constructor() {
    this.safeReturnService = new SafeReturnService();
  }

  /**
   * POST /api/safe-return
   * Create new safe return session
   */
  createSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { destination, destinationCoords, deadline, organizationId, region } = req.body;

      if (!destination || !deadline || !organizationId || !region) {
        res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'Destination, deadline, organizationId, and region are required',
          },
        });
        return;
      }

      const result = await this.safeReturnService.createSession({
        riderId: user.userId,
        destination,
        destinationCoords,
        deadline: new Date(deadline),
        organizationId,
        region,
      });

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      logger.error('Create safe return session error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create session',
        },
      });
    }
  };

  /**
   * PATCH /api/safe-return/:id/complete
   * Complete safe return session
   */
  completeSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const sessionId = Array.isArray(id) ? id[0] : id;

      const result = await this.safeReturnService.completeSession(sessionId, user.userId);

      if (result.error) {
        res.status(404).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Complete safe return session error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to complete session',
        },
      });
    }
  };

  /**
   * GET /api/safe-return/:id
   * Get safe return session details
   */
  getSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const sessionId = Array.isArray(id) ? id[0] : id;

      const result = await this.safeReturnService.getSession(sessionId, user.userId);

      if (result.error) {
        res.status(404).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Get safe return session error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get session',
        },
      });
    }
  };

  /**
   * GET /api/safe-return/active
   * Get active safe return session
   */
  getActiveSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const result = await this.safeReturnService.getActiveSession(user.userId);
      res.status(200).json(result);
    } catch (error) {
      logger.error('Get active safe return session error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get active session',
        },
      });
    }
  };

  /**
   * PATCH /api/safe-return/:id/extend
   * Extend safe return session
   */
  extendSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { id } = req.params;
      const { additionalMinutes } = req.body;
      const sessionId = Array.isArray(id) ? id[0] : id;

      if (!additionalMinutes || typeof additionalMinutes !== 'number') {
        res.status(400).json({
          error: {
            code: 'INVALID_INPUT',
            message: 'additionalMinutes must be a number',
          },
        });
        return;
      }

      const result = await this.safeReturnService.extendSession(sessionId, user.userId, additionalMinutes);

      if (result.error) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Extend safe return session error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to extend session',
        },
      });
    }
  };
}
