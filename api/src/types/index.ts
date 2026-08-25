import type { User } from '../../../shared/types.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User
    }
  }
}

export interface ValidationError extends Error {
  statusCode: number
  code?: string
}

export function createError(
  message: string,
  statusCode: number = 400,
  code?: string,
): ValidationError {
  const error = new Error(message) as ValidationError
  error.statusCode = statusCode
  error.code = code
  return error
}
