/**
 * Custom HTTP error class with status code
 * Simple error class that adds a status property to Error
 * for passing HTTP status codes through the error chain
 */
export class HttpError extends Error {
    status: number;
    details?: any;

    constructor(message: string, status: number = 500, details?: any) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.details = details;

        // Maintains proper stack trace for where our error was thrown (only available on V8)ew
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, HttpError);
        }
    }
}
