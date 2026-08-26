import express, {
  type Request,
  type Response,
  type NextFunction,
  type Application,
} from 'express'
import cors from 'cors'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import authRoutes from './routes/auth.js'
import contentRoutes from './routes/content.js'
import scheduleRoutes from './routes/schedule.js'
import reviewRoutes from './routes/review.js'
import sensitiveRoutes from './routes/sensitive.js'
import channelRoutes from './routes/channel.js'
import exportRoutes from './routes/export.js'
import publishRoutes from './routes/publish.js'
import failureReviewRouter from './routes/failureReview.js'
import dashboardRouter from './routes/dashboard.js'
import auditLogRouter from './routes/auditLog.js'
import type { ApiResponse } from '../../shared/types.js'

/**
 * 构建并返回配置好的 Express 应用（不监听端口）。
 * index.ts 与测试共用此工厂，保证路由与中间件一致。
 */
export function createApp(): Application {
  const app: Application = express()

  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true, limit: '10mb' }))

  app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[Request] ${req.method} ${req.path}`)
    next()
  })

  app.get('/api/health', (req: Request, res: Response): void => {
    const response: ApiResponse<string> = {
      success: true,
      data: 'ok',
    }
    res.status(200).json(response)
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/content', contentRoutes)
  app.use('/api/schedule', scheduleRoutes)
  app.use('/api/review', reviewRoutes)
  app.use('/api/sensitive', sensitiveRoutes)
  app.use('/api/channel', channelRoutes)
  app.use('/api/export', exportRoutes)
  app.use('/api/publish', publishRoutes)
  app.use('/api/failure-reviews', failureReviewRouter)
  app.use('/api/dashboard', dashboardRouter)
  app.use('/api/audit-logs', auditLogRouter)

  app.use(errorHandler)
  app.use(notFoundHandler)

  return app
}

export default createApp
