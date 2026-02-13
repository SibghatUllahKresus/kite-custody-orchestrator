/**
 * Centralized error handling for KITE Custody Orchestrator.
 * Maps errors to proper HTTP status codes and clear, user-facing messages.
 */

export interface HttpErrorResponse {
  statusCode: number;
  message: string;
}

/** Default message for unexpected server errors. */
export const DEFAULT_SERVER_MESSAGE = 'An unexpected error occurred. Please try again.';

/**
 * Returns HTTP status code and a clear, safe error message for the client.
 */
export function toHttpError(error: unknown): HttpErrorResponse {
  const err = error as any;
  const msg = typeof err?.message === 'string' ? err.message : '';

  // Not found
  if (
    msg?.toLowerCase().includes('not found') ||
    msg?.toLowerCase().includes('access denied')
  ) {
    return {
      statusCode: 404,
      message: msg || 'Resource not found.',
    };
  }

  // Conflict
  if (msg?.toLowerCase().includes('already has a wallet')) {
    return {
      statusCode: 409,
      message: msg || 'User already has a wallet in this organization.',
    };
  }

  // Client/bad request
  if (
    msg?.toLowerCase().includes('required') ||
    msg?.toLowerCase().includes('invalid') ||
    msg?.toLowerCase().includes('missing') ||
    msg?.toLowerCase().includes('must be') ||
    msg?.toLowerCase().includes('custody vault not configured') ||
    (msg?.toLowerCase().includes('rpc') && msg?.toLowerCase().includes('connect')) ||
    msg?.toLowerCase().includes('change transactiontype') ||
    msg?.toLowerCase().includes('change data')
  ) {
    return {
      statusCode: 400,
      message: msg || 'Invalid request.',
    };
  }

  // Signature / nonce / insufficient funds (client or chain error)
  if (
    msg?.toLowerCase().includes('signature') ||
    msg?.toLowerCase().includes('nonce') ||
    msg?.toLowerCase().includes('insufficient funds')
  ) {
    return {
      statusCode: 400,
      message: msg || 'Transaction validation failed.',
    };
  }

  // Unknown or empty or internal — do not expose raw message
  if (!msg || msg === 'Unknown' || msg.length > 200) {
    return {
      statusCode: 500,
      message: DEFAULT_SERVER_MESSAGE,
    };
  }

  return {
    statusCode: 500,
    message: msg,
  };
}
