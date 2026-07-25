export interface PlatformConfig {
  // Deployment
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  serviceName: string;
  servicePort: number;

  // API Gateway
  apiGatewayUrl: string;

  // Database
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    maxConnections: number;
  };

  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // RabbitMQ
  rabbitmq: {
    url: string;
    prefetch: number;
  };

  // Service URLs
  services: {
    auth: string;
    reporter: string;
    media: string;
    producerControl: string;
    streaming: string;
    recording: string;
    asset: string;
    ai: string;
    notification: string;
    analytics: string;
    monitoring: string;
    admin: string;
  };

  // Security
  security: {
    jwtSecret: string;
    jwtExpiryMinutes: number;
    refreshTokenExpiryDays: number;
  };

  // Features
  features: {
    enableAI: boolean;
    enableMultiRegion: boolean;
    recordingMaxDurationMinutes: number;
  };
}

export function loadConfig(): PlatformConfig {
  const env = process.env.ENVIRONMENT || 'development';
  const logLevel = (process.env.LOG_LEVEL || 'info') as PlatformConfig['logLevel'];
  const serviceName = process.env.SERVICE_NAME || 'unknown';
  const servicePort = parseInt(process.env.SERVICE_PORT || '3000', 10);

  return {
    environment: env as PlatformConfig['environment'],
    logLevel,
    serviceName,
    servicePort,

    apiGatewayUrl: process.env.API_GATEWAY_URL || 'http://localhost:8000',

    database: {
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'telemab',
      ssl: process.env.DB_SSL === 'true',
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
    },

    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },

    rabbitmq: {
      url: process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672',
      prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '10', 10),
    },

    services: {
      auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
      reporter: process.env.REPORTER_SERVICE_URL || 'http://reporter-service:3002',
      media: process.env.MEDIA_SERVICE_URL || 'http://media-service:3003',
      producerControl: process.env.PRODUCER_CONTROL_SERVICE_URL || 'http://producer-control-service:3004',
      streaming: process.env.STREAMING_SERVICE_URL || 'http://streaming-service:3005',
      recording: process.env.RECORDING_SERVICE_URL || 'http://recording-service:3006',
      asset: process.env.ASSET_SERVICE_URL || 'http://asset-service:3007',
      ai: process.env.AI_SERVICE_URL || 'http://ai-service:3008',
      notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3009',
      analytics: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3010',
      monitoring: process.env.MONITORING_SERVICE_URL || 'http://monitoring-service:3011',
      admin: process.env.ADMIN_SERVICE_URL || 'http://admin-service:3012',
    },

    security: {
      jwtSecret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
      jwtExpiryMinutes: parseInt(process.env.JWT_EXPIRY_MINUTES || '15', 10),
      refreshTokenExpiryDays: parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10),
    },

    features: {
      enableAI: process.env.ENABLE_AI === 'true',
      enableMultiRegion: process.env.ENABLE_MULTI_REGION === 'true',
      recordingMaxDurationMinutes: parseInt(process.env.RECORDING_MAX_DURATION_MINUTES || '480', 10),
    },
  };
}

export function validateConfig(config: PlatformConfig): void {
  if (!config.serviceName) {
    throw new Error('SERVICE_NAME environment variable is required');
  }

  if (!config.security.jwtSecret || config.security.jwtSecret.length < 32) {
    if (config.environment === 'production') {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }

  if (config.database.host === 'localhost' && config.environment === 'production') {
    throw new Error('Database host cannot be localhost in production');
  }
}
