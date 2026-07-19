import { Response } from 'express';
import { IncidentService } from '../services/incident.service';
import { IncidentUpdateService } from '../services/incident-update.service';
import { AuthenticatedRequest, IncidentType, IncidentStatus } from '../../core/types';
import { logger } from '../../core/utils/logger';

/**
 * Incident Controller
 * Handles incident CRUD operations
 */
export class IncidentController {
  private incidentService: IncidentService;
  private updateService: IncidentUpdateService;

  constructor() {
    this.incidentService = new IncidentService();
    this.updateService = new IncidentUpdateService();
  }

  /**
   * POST /api/incidents
   * Feature C: Create incident with idempotency
   */
  createIncident = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string;
      
      if (!idempotencyKey) {
        res.status(400).json({
          error: {
            code: 'MISSING_IDEMPOTENCY_KEY',
            message: 'Idempotency-Key header is required',
          },
        });
        return;
      }

      const { type, riderId, location, processedData, unfilteredData, description, organizationId, region } = req.body;

      if (!type || !riderId || !location || !organizationId || !region) {
        res.status(400).json({
          error: {
            code: 'MISSING_FIELDS',
            message: 'Type, riderId, location, organizationId, and region are required',
          },
        });
        return;
      }

      const result = await this.incidentService.createIncidentIdempotent(
        idempotencyKey,
        {
          type,
          riderId,
          location,
          organizationId,
          region,
          processedData,
          unfilteredData,
          description,
        }
      );

      if (result.error) {
        if (result.error.code === 'REQUEST_IN_PROGRESS') {
          res.status(409).json(result);
          return;
        }
        res.status(400).json(result);
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      logger.error('Create incident error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create incident',
        },
      });
    }
  };

  /**
   * GET /api/incidents
   * List incidents with filters and pagination
   */
  listIncidents = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
        });
        return;
      }
      
      if (!user.organizationId || !user.region) {
        res.status(403).json({
          error: {
            code: 'INVALID_SCOPE',
            message: 'Organization and region required',
          },
        });
        return;
      }

      const {
        type,
        status,
        dateFrom,
        dateTo,
        cursor,
        limit,
      } = req.query;

      const result = await this.incidentService.listIncidents({
        organizationId: user.organizationId,
        region: user.region,
        type: type as IncidentType,
        status: status as IncidentStatus,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined,
        cursor: cursor as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.status(200).json(result);
    } catch (error) {
      logger.error('List incidents error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list incidents',
        },
      });
    }
  };

  /**
   * GET /api/incidents/:id
   * Get single incident
   */
  getIncident = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
        });
        return;
      }
      const { id } = req.params;

      if (!user.organizationId || !user.region) {
        res.status(403).json({
          error: {
            code: 'INVALID_SCOPE',
            message: 'Organization and region required',
          },
        });
        return;
      }

      const incidentId = Array.isArray(id) ? id[0] : id;

      const result = await this.incidentService.getIncident(
        incidentId,
        user.organizationId,
        user.region
      );

      if (result.error) {
        res.status(404).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Get incident error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get incident',
        },
      });
    }
  };

  /**
   * PATCH /api/incidents/:id/resolve
   * R1: Resolve incident (atomic)
   */
  resolveIncident = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
        });
        return;
      }
      const { id } = req.params;

      if (!user.organizationId || !user.region) {
        res.status(403).json({
          error: {
            code: 'INVALID_SCOPE',
            message: 'Organization and region required',
          },
        });
        return;
      }

      const incidentId = Array.isArray(id) ? id[0] : id;

      const result = await this.incidentService.resolveIncident(
        incidentId,
        user.userId,
        user.organizationId,
        user.region
      );

      if (result.error) {
        res.status(404).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      logger.error('Resolve incident error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to resolve incident',
        },
      });
    }
  };

  /**
   * GET /api/incidents/:id/updates
   * Get incident updates
   */
  getIncidentUpdates = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          },
        });
        return;
      }
      
      if (!user.organizationId || !user.region) {
        res.status(403).json({
          error: {
            code: 'INVALID_SCOPE',
            message: 'Organization and region required',
          },
        });
        return;
      }

      const { id } = req.params;
      const incidentId = Array.isArray(id) ? id[0] : id;

      // Verify incident belongs to user's org/region first (R3 - IDOR prevention)
      const incidentResult = await this.incidentService.getIncident(
        incidentId,
        user.organizationId,
        user.region
      );

      if (incidentResult.error) {
        res.status(404).json(incidentResult);
        return;
      }

      const result = await this.updateService.getAllUpdates(incidentId);

      res.status(200).json(result);
    } catch (error) {
      logger.error('Get updates error', error);
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get updates',
        },
      });
    }
  };
}
