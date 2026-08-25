import express, {
  type Request,
  type Response,
  type NextFunction,
  type Application,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { initDatabase, seedData } from './models/index.js'
import { initPublishScheduler } from './scheduler/publishTask.js'
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
import type { ApiResponse } from '../../shared/types.js'

dotenv.config()

const app: Application = express()
const PORT = process.env.PORT || 3001

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

app.use(errorHandler)
app.use(notFoundHandler)

async function startServer(): Promise<void> {
  try {
    console.log('[Server] 正在初始化数据库...')
    initDatabase()
    console.log('[Server] 数据库初始化完成')

    console.log('[Server] 正在初始化种子数据...')
    seedData()
    console.log('[Server] 种子数据初始化完成')

    console.log('[Server] 正在初始化定时任务调度器...')
    initPublishScheduler()
    console.log('[Server] 定时任务调度器初始化完成')

    const server = app.listen(PORT, () => {
      console.log(`[Server] 服务已启动，监听端口 ${PORT}`)
    })

    process.on('SIGTERM', () => {
      console.log('[Server] 收到 SIGTERM 信号，正在关闭服务...')
      server.close(() => {
        console.log('[Server] 服务已关闭')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('[Server] 收到 SIGINT 信号，正在关闭服务...')
      server.close(() => {
        console.log('[Server] 服务已关闭')
        process.exit(0)
      })
    })
  } catch (error) {
    console.error('[Server] 服务启动失败:', error)
    process.exit(1)
  }
}

startServer()

export default app
