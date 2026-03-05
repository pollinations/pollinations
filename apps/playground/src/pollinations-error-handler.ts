import { APICallError, InvalidResponseDataError } from '@ai-sdk/provider';

/**
 * Error response types for Pollinations API
 */

export interface PollinationsErrorObject {
  message: string;
  type?: string;
  param?: string;
  code?: string;
}

export interface PollinationsErrorDetails {
  error?: PollinationsErrorObject;
  provider?: string;
}

export interface PollinationsErrorResponse {
  error?: string | PollinationsErrorObject;
  message?: string;
  status?: number;
  details?: PollinationsErrorDetails;
}

/**
 * Type guard to check if an unknown value is a Pollinations error response
 */
function isPollinationsErrorResponse(
  obj: unknown,
): obj is PollinationsErrorResponse {
  return typeof obj === 'object' && obj !== null;
}

/**
 * Type guard to check if error is an error object (not a string)
 */
function isPollinationsErrorObject(
  error: string | PollinationsErrorObject | undefined,
): error is PollinationsErrorObject {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  return 'message' in error && typeof error.message === 'string';
}

/**
 * Extract error message from Pollinations API error response
 */
async function extractErrorMessage(error: Response): Promise<string> {
  const status = error.status;
  const statusText = error.statusText;
  let errorMessage = `API call failed with status ${status}: ${statusText}`;

  try {
    const errorText = await error.clone().text();
    if (errorText) {
      try {
        const errorBody: unknown = JSON.parse(errorText);

        // Handle Pollinations API error format:
        // { error: "...", status: 400, details: { error: { message: "...", type: "...", param: "...", code: "..." }, provider: "..." } }
        if (isPollinationsErrorResponse(errorBody)) {
          // Check for nested error in details.error.message (Pollinations format)
          if (errorBody.details?.error?.message) {
            errorMessage = errorBody.details.error.message;
          }
          // Check for direct error.message
          else if (isPollinationsErrorObject(errorBody.error)) {
            errorMessage = errorBody.error.message;
          }
          // Check for error as string
          else if (errorBody.error) {
            errorMessage = errorBody.error;
          }
          // Check for direct message
          else if (errorBody.message) {
            errorMessage = errorBody.message;
          } else {
            errorMessage = `${errorMessage} - ${errorText}`;
          }
        } else {
          errorMessage = `${errorMessage} - ${errorText}`;
        }
      } catch {
        // If JSON parsing fails, use the raw text
        errorMessage = `${errorMessage} - ${errorText}`;
      }
    }
  } catch {
    // If reading body fails, use default message
  }

  return errorMessage;
}

/**
 * Handle errors from Pollinations API calls
 */
export async function handlePollinationsError(
  error: unknown,
  baseURL: string,
): Promise<never> {
  if (error instanceof Response) {
    const status = error.status;
    const errorMessage = await extractErrorMessage(error);

    throw new APICallError({
      message: errorMessage,
      url: error.url || baseURL,
      requestBodyValues: {},
      statusCode: status,
      isRetryable: (status >= 500 && status < 600) || status === 429,
      cause: error,
    });
  }

  if (
    error instanceof APICallError ||
    error instanceof InvalidResponseDataError
  ) {
    throw error;
  }

  if (error instanceof Error) {
    throw new APICallError({
      message: error.message,
      url: baseURL,
      requestBodyValues: {},
      cause: error,
    });
  }

  throw new APICallError({
    message: `Unknown error: ${String(error)}`,
    url: baseURL,
    requestBodyValues: {},
    cause: error,
  });
}
