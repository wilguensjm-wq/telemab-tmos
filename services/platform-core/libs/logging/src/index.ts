import { PlatformConfig } from '@platform/config';

export interface LogContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  serviceName: string;
  environment: string;
}

export class Logger {
  private context: LogContext;
  private logLevel: number;

  private readonly LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context: LogContext, private config: PlatformConfig) {
    this.context = context;
    this.logLevel = this.LOG_LEVELS[config.logLevel] || this.LOG_LEVELS.info;
  }

  private formatLog(level: string, message: string, metadata?: Record<string, any>): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...metadata,
    };

    return JSON.stringify(logEntry);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= this.LOG_LEVELS.debug) {
      console.log(this.formatLog('DEBUG', message, metadata));
    }
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= this.LOG_LEVELS.info) {
      console.log(this.formatLog('INFO', message, metadata));
    }
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (this.logLevel <= this.LOG_LEVELS.warn) {
      console.warn(this.formatLog('WARN', message, metadata));
    }
  }

  error(message: string, error?: Error | string, metadata?: Record<string, any>): void {
    if (this.logLevel <= this.LOG_LEVELS.error) {
      const errorInfo = error instanceof Error
        ? {
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
          }
        : { errorMessage: error };

      console.error(this.formatLog('ERROR', message, { ...errorInfo, ...metadata }));
    }
  }
}

export interface LoggerContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
}

export function createLogger(
  config: PlatformConfig,
  context: LoggerContext = {}
): Logger {
  return new Logger(
    {
      requestId: context.requestId || generateRequestId(),
      correlationId: context.correlationId || generateRequestId(),
      userId: context.userId,
      serviceName: config.serviceName,
      environment: config.environment,
    },
    config
  );
}

export function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function expressLoggingMiddleware(config: PlatformConfig) {
  return (req: any, res: any, next: any) => {
    const requestId = (req.headers['x-request-id'] as string) || generateRequestId();
    const correlationId = (req.headers['x-correlation-id'] as string) || generateRequestId();

    req.logger = createLogger(config, {
      requestId,
      correlationId,
      userId: req.user?.sub,
    });

    req.headers['x-request-id'] = requestId;
    req.headers['x-correlation-id'] = correlationId;

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      req.logger.info('HTTP Request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  };
}
