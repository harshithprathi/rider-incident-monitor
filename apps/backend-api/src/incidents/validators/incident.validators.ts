import { body, param, query } from 'express-validator';

/**
 * Validation chains for incident endpoints
 * Applied via the validate() middleware before controller logic runs
 */

/** POST /api/incidents */
export const createIncidentValidation = [
  body('type')
    .isIn(['ACTIVE_CRASH', 'SOS', 'SAFE_RETURN_MISSED'])
    .withMessage('Type must be ACTIVE_CRASH, SOS, or SAFE_RETURN_MISSED'),
  body('riderId')
    .isMongoId()
    .withMessage('Must be a valid rider ID'),
  body('location')
    .isObject()
    .withMessage('Location is required'),
  body('location.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('location.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('organizationId')
    .isMongoId()
    .withMessage('Must be a valid organization ID'),
  body('region')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Region is required'),
];

/** GET /api/incidents */
export const listIncidentsValidation = [
  query('type')
    .optional()
    .isIn(['ACTIVE_CRASH', 'SOS', 'SAFE_RETURN_MISSED'])
    .withMessage('Type must be ACTIVE_CRASH, SOS, or SAFE_RETURN_MISSED'),
  query('status')
    .optional()
    .isIn(['LIVE', 'RESOLVED'])
    .withMessage('Status must be LIVE or RESOLVED'),
  query('dateFrom')
    .optional()
    .isISO8601()
    .withMessage('dateFrom must be a valid ISO 8601 date'),
  query('dateTo')
    .optional()
    .isISO8601()
    .withMessage('dateTo must be a valid ISO 8601 date'),
  query('cursor')
    .optional()
    .isString(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

/** GET /api/incidents/:id */
export const getIncidentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid incident ID'),
];

/** PATCH /api/incidents/:id/resolve */
export const resolveIncidentValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid incident ID'),
];

/** GET /api/incidents/:id/updates */
export const getIncidentUpdatesValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid incident ID'),
];
