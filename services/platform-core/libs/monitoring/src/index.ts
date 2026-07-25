import * as promClient from 'prom-client';
import { PlatformConfig } from '@platform/config';
import { Logger } from '@platform/logging';

export class MetricsCollector {
  private httpRequestDuration: promClient.Histogram;
  private httpRequestsTotal: promClient.Counter;
  private httpErrorsTotal: promClient.Counter;
  private eventPublishedTotal: promClient.Counter;
  private eventConsummedTotal: promClient.Counter;
  private eventProcessingDuration: promClient.Histogram;
  private databaseConnectionPoolSize: promClient.Gauge;
  private databaseQueryDuration: promClient.Histogram;
  private cacheHitsTotal: promClient.Counter;
  private cacheMissesTotal: promClient.Counter;

  constructor(private config: PlatformConfig, private logger: Logger) {
    // Register default metrics
    promClient.collectDefaultMetrics();

    // HTTP metrics
    this.httpRequestDuration = new promClient.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.httpRequestsTotal = new promClient.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.httpErrorsTotal = new promClient.Counter({
      name: 'http_errors_total',
      help: 'Total HTTP errors',
      labelNames: ['method', 'route', 'status'],
    });

    // Event metrics
    this.eventPublishedTotal = new promClient.Counter({
      name: 'event_published_total',
      help: 'Total events published',
      labelNames: ['event_type'],
    });

    this.eventConsummedTotal = new promClient.Counter({
      name: 'event_consumed_total',
      help: 'Total events consumed',
      labelNames: ['event_type'],
    });

    this.eventProcessingDuration = new promClient.Histogram({
      name: 'event_processing_duration_seconds',
      help: 'Event processing duration in seconds',
      labelNames: ['event_type'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 5, 10],
    });

    // Database metrics
    this.databaseConnectionPoolSize = new promClient.Gauge({
      name: 'database_connection_pool_size',
      help: 'Current database connection pool size',
    });

    this.databaseQueryDuration = new promClient.Histogram({
      name: 'database_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['query_type'],
      buckets: [0.001, 0.01, 0.1, 0.5, 1, 5],
    });

    // Cache metrics
    this.cacheHitsTotal = new promClient.Counter({
      name: 'cache_hits_total',
      help: 'Total cache hits',
      labelNames: ['cache_name'],
    });

    this.cacheMissesTotal = new promClient.Counter({
      name: 'cache_misses_total',
      help: 'Total cache misses',
      labelNames: ['cache_name'],
    });

    this.logger.info('MetricsCollector initialized');
  }

  // HTTP metrics
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    durationSeconds: number
  ): void {
    this.httpRequestDuration.labels(method, route, String(status)).observe(durationSeconds);
    this.httpRequestsTotal.labels(method, route, String(status)).inc();

    if (status >= 400) {
      this.httpErrorsTotal.labels(method, route, String(status)).inc();
    }
  }

  // Event metrics
  recordEventPublished(eventType: string): void {
    this.eventPublishedTotal.labels(eventType).inc();
  }

  recordEventConsumed(eventType: string): void {
    this.eventConsummedTotal.labels(eventType).inc();
  }

  recordEventProcessing(eventType: string, durationSeconds: number): void {
    this.eventProcessingDuration.labels(eventType).observe(durationSeconds);
  }

  // Database metrics
  setDatabaseConnectionPoolSize(size: number): void {
    this.databaseConnectionPoolSize.set(size);
  }

  recordDatabaseQuery(queryType: string, durationSeconds: number): void {
    this.databaseQueryDuration.labels(queryType).observe(durationSeconds);
  }

  // Cache metrics
  recordCacheHit(cacheName: string): void {
    this.cacheHitsTotal.labels(cacheName).inc();
  }

  recordCacheMiss(cacheName: string): void {
    this.cacheMissesTotal.labels(cacheName).inc();
  }

  // Export metrics
  async getMetrics(): Promise<string> {
    return promClient.register.metrics();
  }
}

export function expressMetricsMiddleware(collector: MetricsCollector) {
  return (req: any, res: any, next: any) => {
    const start = Date.now();

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      collector.recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration
      );
    });

    next();
  };
}

export function metricsRoutes(collector: MetricsCollector) {
  return async (req: any, res: any) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(await collector.getMetrics());
  };
}
