import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getCorrelationId } from './async-context';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Structured logger with correlation ID support
 * - Reads correlation ID from AsyncLocalStorage (request-scoped, thread-safe)
 * - Writes to file in production mode
 * - Creates log directory if it doesn't exist
 */
class Logger {
  private logFile: ReturnType<typeof createWriteStream> | null = null;

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      const logDir = join(process.cwd(), 'logs');
      // Ensure logs directory exists before creating write stream
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      const logPath = join(logDir, 'app.log');
      this.logFile = createWriteStream(logPath, { flags: 'a' });
    }
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    // Read correlation ID from AsyncLocalStorage — thread-safe, no global state
    const correlationId = getCorrelationId();
    const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${correlationId}] ${message}${metaStr}`;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const formatted = this.formatMessage(level, message, meta);
    
    // Console output
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // File output
    if (this.logFile) {
      this.logFile.write(formatted + '\n');
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, error?: unknown): void {
    const meta = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : (error as Record<string, unknown>);
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV !== 'production') {
      this.log('debug', message, meta);
    }
  }
}

export const logger = new Logger();
