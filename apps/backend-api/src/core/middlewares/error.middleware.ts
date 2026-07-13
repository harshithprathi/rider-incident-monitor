import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { logger } from '../utils/logger';

/**
 * Centralized error handler middleware
 * - Stable error contract (code, message, details)
 * - Structured logging
 * - Handles different error types
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Request error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // Mongoose validation error
  if (error instanceof MongooseError.ValidationError) {
    const details = Object.keys(error.errors).map((key) => ({
      field: key,
      message: error.errors[key].message,
    }));

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details,
      },
    });
    return;
  }

  // Mongoose cast error (invalid ObjectId)
  if (error instanceof MongooseError.CastError) {
    res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: `Invalid ${error.path}: ${error.value}`,
        details: {
          field: error.path,
          value: error.value,
        },
      },
    });
    return;
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    res.status(409).json({
      error: {
        code: 'DUPLICATE_KEY',
        message: `Duplicate value for ${field}`,
        details: {
          field,
          value: error.keyValue[field],
        },
      },
    });
    return;
  }

  // Custom application errors
  if (error.name === 'ApplicationError') {
    res.status(error.statusCode || 400).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  // Default internal server error
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    },
  });
};

/**
 * 404 handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

/**
 * Custom application error class
 */
export class ApplicationError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}
