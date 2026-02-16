/**
 * Error handling utilities and custom error classes for the wedding gallery application.
 *
 * This module follows project principles for proper error handling:
 * - Fail fast with clear validation
 * - Specific error types with context
 * - User-friendly messages that don't expose technical details
 * - Graceful degradation for non-critical failures
 */

/**
 * Base error class for application-specific errors.
 * Extends Error with additional context and user-friendly messaging.
 */
abstract class BaseApplicationError extends Error {
  abstract readonly code: string;
  abstract readonly userMessage: string;

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a sanitized error object safe for client consumption.
   */
  toClientError(): { code: string; message: string; details?: string } {
    return {
      code: this.code,
      message: this.userMessage,
      details: typeof this.context?.details === 'string' ? this.context.details : undefined,
    };
  }
}

/**
 * Validation error for input validation failures.
 * Used when user input doesn't meet requirements.
 */
export class ValidationError extends BaseApplicationError {
  readonly code = 'VALIDATION_ERROR';

  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, { ...context, field });
  }

  get userMessage(): string {
    if (this.field) {
      return `Please check the ${this.field} field: ${this.message}`;
    }
    return this.message;
  }
}
