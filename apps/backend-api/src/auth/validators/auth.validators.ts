import { body } from 'express-validator';

/**
 * Validation chains for auth endpoints
 * Applied via the validate() middleware before controller logic runs
 */

/** POST /api/auth/login */
export const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('password')
    .isString()
    .notEmpty()
    .withMessage('Password is required'),
  body('userType')
    .isIn(['rider', 'responder'])
    .withMessage('userType must be "rider" or "responder"'),
];

/** POST /api/auth/register/rider */
export const registerRiderValidation = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Name is required'),
  body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('phone')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Phone is required'),
  body('password')
    .isString()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
];

/** POST /api/auth/register/responder */
export const registerResponderValidation = [
  body('name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Name is required'),
  body('email')
    .isEmail()
    .withMessage('Must be a valid email address')
    .normalizeEmail(),
  body('phone')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Phone is required'),
  body('password')
    .isString()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('organizationId')
    .isMongoId()
    .withMessage('Must be a valid organization ID'),
  body('region')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Region is required'),
];
