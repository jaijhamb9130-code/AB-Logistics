export type ErrorType = 'VALIDATION_ERROR' | 'AUTH_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'SYSTEM_ERROR';

export interface ApiError {
  success: false;
  error: {
    type: ErrorType;
    message: string;
    fields?: Record<string, string>;
  };
}

export function makeError(type: ErrorType, message: string, fields?: Record<string, string>): ApiError {
  return { success: false, error: { type, message, ...(fields ? { fields } : {}) } };
}
