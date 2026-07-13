import { body, param } from 'express-validator';

/**
 * Validation chains for safe-return endpoints
 * Applied via the validate() middleware before controller logic runs
 */

/** POST /api/safe-return */
export const createSessionValidation = [
  body('destination')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Destination is required'),
  body('deadline')
    .isISO8601()
    .withMessage('Deadline must be a valid ISO 8601 date'),
  body('organizationId')
    .isMongoId()
    .withMessage('Must be a valid organization ID'),
  body('region')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Region is required'),
  body('destinationCoords')
    .optional()
    .isObject()
    .withMessage('Destination coordinates must be an object'),
];

/** PATCH /api/safe-return/:id/complete */
export const completeSessionValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid session ID'),
];

/** PATCH /api/safe-return/:id/extend */
export const extendSessionValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid session ID'),
  body('additionalMinutes')
    .isInt({ min: 1, max: 120 })
    .withMessage('Additional minutes must be between 1 and 120'),
];

/** GET /api/safe-return/:id */
export const getSessionValidation = [
  param('id')
    .isMongoId()
    .withMessage('Must be a valid session ID'),
];
