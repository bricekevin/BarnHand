import { logger } from '../config/logger';

interface QueuedMessage {
  id: string;
  type: string;
  target: string; // userId, streamId, or farmId
  data: unknown;
  timestamp: Date;
  retries: number;
  maxRetries: number;
  priority: 'high' | 'medium' | 'low';
}

interface MessageQueueOptions {
  maxSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  flushInterval?: number;
}

export class MessageQueue {
  private queues: Map<string, QueuedMessage[]> = new Map();
  private processing: Set<string> = new Set();
  private options: Required<MessageQueueOptions>;
  private flushTimer?: NodeJS.Timeout | undefined;

  constructor(options: MessageQueueOptions = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      flushInterval: options.flushInterval || 100,
    };

    this.startFlushTimer();
  }

  // Add message to queue
  public enqueue(
    target: string,
    type: string,
    data: unknown,
    priority: 'high' | 'medium' | 'low' = 'medium'
  ): string {
    const messageId = this.generateId();
    const message: QueuedMessage = {
      id: messageId,
      type,
      target,
      data,
      timestamp: new Date(),
      retries: 0,
      maxRetries: this.options.maxRetries,
      priority,
    };

    if (!this.queues.has(target)) {
      this.queues.set(target, []);
    }

    const queue = this.queues.get(target)!;

    // Check queue size limit
    if (queue.length >= this.options.maxSize) {
      // Remove oldest low priority message
      const lowPriorityIndex = queue.findIndex(m => m.priority === 'low');
      if (lowPriorityIndex !== -1) {
        queue.splice(lowPriorityIndex, 1);
        logger.warn('Message queue full, dropping low priority message', {
          target,
          droppedMessageType: queue[lowPriorityIndex]?.type || 'unknown',
        });
      } else {
        logger.error('Message queue full, cannot add message', {
          target,
          messageType: type,
        });
        throw new Error('Message queue full');
      }
    }

    // Insert based on priority
    if (priority === 'high') {
      queue.unshift(message);
    } else if (priority === 'low') {
      queue.push(message);
    } else {
      // Medium priority - insert after high priority messages
      const highPriorityCount = queue.filter(m => m.priority === 'high').length;
      queue.splice(highPriorityCount, 0, message);
    }

    logger.debug('Message enqueued', {
      messageId,
      target,
      type,
      priority,
      queueSize: queue.length,
    });

    return messageId;
  }

  // Process messages for a specific target
  public async processQueue(
    target: string,
    processor: (message: QueuedMessage) => Promise<boolean>
  ): Promise<number> {
    if (this.processing.has(target)) {
      logger.debug('Queue already being processed', { target });
      return 0;
    }

    const queue = this.queues.get(target);
    if (!queue || queue.length === 0) {
      return 0;
    }

    this.processing.add(target);
    let processedCount = 0;

    try {
      while (queue.length > 0) {
        const message = queue[0];
        if (!message) {
          break; // Safety check for undefined message
        }

        try {
          const success = await processor(message);

          if (success) {
            queue.shift(); // Remove successfully processed message
            processedCount++;

            logger.debug('Message processed successfully', {
              messageId: message.id,
              target,
              type: message.type,
            });
          } else {
            // Processing failed, handle retry
            message.retries++;

            if (message.retries >= message.maxRetries) {
              // Max retries reached, move to dead letter queue
              this.moveToDeadLetter(message);
              queue.shift();

              logger.error('Message moved to dead letter queue', {
                messageId: message.id,
                target,
                type: message.type,
                retries: message.retries,
              });
            } else {
              // Move to end of queue for retry
              queue.shift();
              queue.push(message);

              logger.warn('Message processing failed, will retry', {
                messageId: message.id,
                target,
                type: message.type,
                retries: message.retries,
              });

              // Add delay before retrying
              await this.delay(this.options.retryDelay);
            }
          }
        } catch (error) {
          logger.error('Error processing message', {
            error: error instanceof Error ? error.message : 'Unknown error',
            messageId: message.id,
            target,
            type: message.type,
          });

          // Move failed message to end for retry
          queue.shift();
          queue.push(message);
          message.retries++;
        }
      }
    } finally {
      this.processing.delete(target);
    }

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(target);
    }

    return processedCount;
  }

  // Batch process all queues
  public async processAllQueues(
    processor: (message: QueuedMessage) => Promise<boolean>
  ): Promise<number> {
    let totalProcessed = 0;

    for (const target of this.queues.keys()) {
      const processed = await this.processQueue(target, processor);
      totalProcessed += processed;
    }

    return totalProcessed;
  }

  // Get queue size for a target
  public getQueueSize(target: string): number {
    return this.queues.get(target)?.length || 0;
  }

  // Get total queue size
  public getTotalQueueSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  // Clear queue for a target
  public clearQueue(target: string): void {
    this.queues.delete(target);
    logger.info('Queue cleared', { target });
  }

  // Clear all queues
  public clearAllQueues(): void {
    const queueCount = this.queues.size;
    this.queues.clear();
    logger.info('All queues cleared', { queueCount });
  }

  // Get queue metrics
  public getMetrics() {
    const metrics = {
      totalQueues: this.queues.size,
      totalMessages: this.getTotalQueueSize(),
      processingTargets: this.processing.size,
      queueDetails: Array.from(this.queues.entries()).map(
        ([target, queue]) => ({
          target,
          size: queue.length,
          oldestMessage: queue[0]?.timestamp,
          priorities: {
            high: queue.filter(m => m.priority === 'high').length,
            medium: queue.filter(m => m.priority === 'medium').length,
            low: queue.filter(m => m.priority === 'low').length,
          },
        })
      ),
    };

    return metrics;
  }

  // Start automatic queue flushing
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      const metrics = this.getMetrics();
      if (metrics.totalMessages > 0) {
        logger.debug('Message queue metrics', metrics);
      }
    }, this.options.flushInterval);
  }

  // Stop automatic queue flushing
  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  // Move message to dead letter queue (could be database or external service)
  private moveToDeadLetter(message: QueuedMessage): void {
    // TODO: Implement dead letter queue storage
    logger.error('Message moved to dead letter queue', {
      message: {
        id: message.id,
        type: message.type,
        target: message.target,
        retries: message.retries,
        timestamp: message.timestamp,
      },
    });
  }

  // Utility functions
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const messageQueue = new MessageQueue({
  maxSize: 10000,
  maxRetries: 3,
  retryDelay: 1000,
  flushInterval: 5000,
});

export default MessageQueue;
