import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { asyncContext } from '../utils/async-context';

/**
 * Correlation ID middleware
 * - Generates unique ID per request
 * - Wraps request in AsyncLocalStorage context for thread-safe correlation
 * - Returns correlation ID in response header
 */
export const correlationId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate or extract correlation ID from incoming header
  const id = (req.headers['x-correlation-id'] as string) || randomUUID();

  // Add to response header
  res.setHeader('X-Correlation-ID', id);

  // Run the rest of the request inside AsyncLocalStorage context
  // This ensures every async operation in this request's call chain
  // can access the correlation ID without global state
  asyncContext.run({ correlationId: id }, () => {
    next();
  });
};
