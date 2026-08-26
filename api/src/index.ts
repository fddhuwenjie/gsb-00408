import dotenv from 'dotenv'
import { createApp } from './app.js'
import { initDatabase, seedData } from './models/index.js'
import { initPublishScheduler } from './scheduler/publishTask.js'

dotenv.config()

const app = createApp()
const PORT = process.env.PORT || 3001

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
