import { Router } from 'express';
import { IncidentController } from './controllers/incident.controller';
import { authenticate } from '../core/middlewares/auth.middleware';
import { authorizeResponder } from '../core/middlewares/authorization.middleware';
import { validate } from '../core/middlewares/validation.middleware';
import {
  createIncidentValidation,
  listIncidentsValidation,
  getIncidentValidation,
  resolveIncidentValidation,
  getIncidentUpdatesValidation,
} from './validators/incident.validators';

const router = Router();
const incidentController = new IncidentController();

router.post('/', authenticate, validate(createIncidentValidation), incidentController.createIncident);
router.get('/', authenticate, authorizeResponder, validate(listIncidentsValidation), incidentController.listIncidents);
router.get('/:id', authenticate, authorizeResponder, validate(getIncidentValidation), incidentController.getIncident);
router.patch('/:id/resolve', authenticate, authorizeResponder, validate(resolveIncidentValidation), incidentController.resolveIncident);
router.get('/:id/updates', authenticate, authorizeResponder, validate(getIncidentUpdatesValidation), incidentController.getIncidentUpdates);

export { router as incidentRouter };
