import type { Request, Response, NextFunction } from 'express'
import type { ApiResponse } from '../../../shared/types.js'
import type { ValidationError } from '../types/index.js'

export function errorHandler(
  error: Error | ValidationError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  console.error(`[Error] ${req.method} ${req.path}:`, error)

  const statusCode = (error as ValidationError).statusCode || 500
  const code = (error as ValidationError).code
  const message = error.message || '服务器内部错误'

  const response: ApiResponse = {
    success: false,
    error: message,
    message: code,
  }

  res.status(statusCode).json(response)
}

export function notFoundHandler(
  req: Request,
  res: Response,
): void {
  res.status(404).json({
    success: false,
    error: 'API 接口不存在',
  })
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
