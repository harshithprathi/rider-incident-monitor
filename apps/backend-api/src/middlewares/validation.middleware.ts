import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';

/**
 * Validation middleware factory
 * - Validates request using express-validator chains
 * - Returns structured validation errors
 */
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Execute all validations
    await Promise.all(validations.map((validation) => validation.run(req)));

    // Check for errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: errors.array().map((err) => ({
            field: err.type === 'field' ? err.path : undefined,
            message: err.msg,
            value: err.type === 'field' ? err.value : undefined,
          })),
        },
      });
      return;
    }

    next();
  };
};
