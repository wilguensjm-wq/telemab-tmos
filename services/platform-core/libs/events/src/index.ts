import * as amqp from 'amqplib';
import { Logger } from '@platform/logging';
import { PlatformConfig } from '@platform/config';

export interface PlatformEvent {
  eventId: string;
  eventType: string;
  correlationId: string;
  timestamp: string;
  source: string;
  data: Record<string, any>;
}

// Media Service Events
export interface MediaPublishStartedEvent extends PlatformEvent {
  eventType: 'media.publish_started';
  data: {
    participantId: string;
    broadcastId: string;
    mediaType: 'camera' | 'microphone' | 'screen';
  };
}

export interface MediaPublishStoppedEvent extends PlatformEvent {
  eventType: 'media.publish_stopped';
  data: {
    participantId: string;
    broadcastId: string;
    mediaType: 'camera' | 'microphone' | 'screen';
  };
}

// Reporter Service Events
export interface ReporterBroadcastCreatedEvent extends PlatformEvent {
  eventType: 'reporter.broadcast_created';
  data: {
    broadcastId: string;
    reporterId: string;
    title: string;
  };
}

export interface ReporterBroadcastEndedEvent extends PlatformEvent {
  eventType: 'reporter.broadcast_ended';
  data: {
    broadcastId: string;
    reporterId: string;
    durationSeconds: number;
  };
}

// Analytics Events
export interface AnalyticsParticipantJoinedEvent extends PlatformEvent {
  eventType: 'analytics.participant_joined';
  data: {
    participantId: string;
    broadcastId: string;
    joinedAt: string;
  };
}

export interface AnalyticsParticipantLeftEvent extends PlatformEvent {
  eventType: 'analytics.participant_left';
  data: {
    participantId: string;
    broadcastId: string;
    duration: number;
  };
}

export type DomainEvent =
  | MediaPublishStartedEvent
  | MediaPublishStoppedEvent
  | ReporterBroadcastCreatedEvent
  | ReporterBroadcastEndedEvent
  | AnalyticsParticipantJoinedEvent
  | AnalyticsParticipantLeftEvent;

export class EventPublisher {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly exchangeName = 'platform.events';
  private readonly dlxExchange = 'platform.dlx';

  constructor(private config: PlatformConfig, private logger: Logger) {}

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      // Create main exchange
      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });

      // Create DLX
      await this.channel.assertExchange(this.dlxExchange, 'topic', { durable: true });

      this.logger.info('EventPublisher connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    if (!this.channel) {
      throw new Error('EventPublisher not connected');
    }

    const routingKey = this.getRoutingKey(event.eventType);
    const message = JSON.stringify(event);

    try {
      this.channel.publish(
        this.exchangeName,
        routingKey,
        Buffer.from(message),
        { persistent: true, contentType: 'application/json' }
      );

      this.logger.debug('Event published', {
        eventId: event.eventId,
        eventType: event.eventType,
        routingKey,
      });
    } catch (error) {
      this.logger.error('Failed to publish event', error, {
        eventId: event.eventId,
        eventType: event.eventType,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.info('EventPublisher disconnected');
    } catch (error) {
      this.logger.error('Failed to disconnect EventPublisher', error);
    }
  }

  private getRoutingKey(eventType: string): string {
    const [domain] = eventType.split('.');
    return eventType;
  }
}

export class EventConsumer {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private readonly exchangeName = 'platform.events';

  constructor(private config: PlatformConfig, private logger: Logger) {}

  async connect(): Promise<void> {
    try {
      this.connection = await amqp.connect(this.config.rabbitmq.url);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(this.exchangeName, 'topic', { durable: true });
      await this.channel.prefetch(this.config.rabbitmq.prefetch);

      this.logger.info('EventConsumer connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  async subscribe(
    queueName: string,
    routingPatterns: string[],
    handler: (event: DomainEvent) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('EventConsumer not connected');
    }

    try {
      // Create queue with DLX
      await this.channel.assertQueue(queueName, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'platform.dlx',
          'x-message-ttl': 24 * 60 * 60 * 1000, // 24 hours
        },
      });

      // Bind routing patterns
      for (const pattern of routingPatterns) {
        await this.channel.bindQueue(queueName, this.exchangeName, pattern);
      }

      // Start consuming
      await this.channel.consume(queueName, async (msg) => {
        if (!msg) return;

        try {
          const event = JSON.parse(msg.content.toString()) as DomainEvent;
          await handler(event);
          this.channel!.ack(msg);

          this.logger.debug('Event processed', {
            eventId: event.eventId,
            eventType: event.eventType,
          });
        } catch (error) {
          this.logger.error('Failed to process event', error, {
            queue: queueName,
          });
          // NACK and requeue, or send to DLX based on retry count
          this.channel!.nack(msg, false, true);
        }
      });

      this.logger.info('EventConsumer subscribed', {
        queueName,
        routingPatterns,
      });
    } catch (error) {
      this.logger.error('Failed to subscribe', error, { queueName });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.info('EventConsumer disconnected');
    } catch (error) {
      this.logger.error('Failed to disconnect EventConsumer', error);
    }
  }
}

export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
