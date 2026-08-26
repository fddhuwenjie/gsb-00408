import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Server } from 'node:http'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsb-auth-test-'))
process.env.DB_PATH = path.join(tmpDir, 'test.db')

const { default: db } = await import('../src/db/index.js')
const { initDatabase } = await import('../src/models/init.js')
const { default: express } = await import('express')
const { errorHandler } = await import('../src/middleware/error.js')
const { default: channelRoutes } = await import('../src/routes/channel.js')
const { default: scheduleRoutes } = await import('../src/routes/schedule.js')
const { default: failureReviewRoutes } = await import('../src/routes/failureReview.js')
const { default: auditRoutes } = await import('../src/routes/audit.js')

let server: Server
let baseUrl: string
let editorId: number
let reviewerId: number
let adminId: number
let channelId: number

function token(userId: number): string {
  return Buffer.from(`${userId}:token`).toString('base64')
}

async function request(
  method: string,
  path: string,
  options: { userId?: number; body?: unknown } = {},
): Promise<{ status: number; body: { success: boolean } }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.userId !== undefined) {
    headers.Authorization = `Bearer ${token(options.userId)}`
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body !== undefined && method !== 'GET' && method !== 'HEAD'
      ? JSON.stringify(options.body)
      : undefined,
  })
  return { status: res.status, body: await res.json() as { success: boolean } }
}

before(async () => {
  initDatabase()

  editorId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('editor_a', 'x', 'editor')").run().lastInsertRowid as number
  reviewerId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('reviewer_a', 'x', 'reviewer')").run().lastInsertRowid as number
  adminId = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin_a', 'x', 'admin')").run().lastInsertRowid as number
  channelId = db.prepare("INSERT INTO channels (name, type, status) VALUES ('鉴权渠道', 'wechat', 'active')").run().lastInsertRowid as number
  db.prepare('INSERT INTO channel_health (channel_id) VALUES (?)').run(channelId)

  const app = express()
  app.use(express.json())
  app.use('/api/channel', channelRoutes)
  app.use('/api/schedule', scheduleRoutes)
  app.use('/api/failure-reviews', failureReviewRoutes)
  app.use('/api/audit', auditRoutes)
  app.use(errorHandler)

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (typeof address === 'object' && address) {
    baseUrl = `http://127.0.0.1:${address.port}`
  }
})

after(() => {
  server?.close()
})

test('未登录访问健康检查、排期、失败复核与审计接口均返回 401', async () => {
  const cases: Array<[string, string]> = [
    ['GET', '/api/channel/health'],
    ['POST', `/api/channel/${channelId}/heartbeat`],
    ['PUT', `/api/channel/${channelId}/health`],
    ['POST', '/api/schedule/1/reschedule'],
    ['GET', '/api/failure-reviews'],
    ['POST', '/api/failure-reviews/1/resolve'],
    ['GET', '/api/audit'],
  ]

  for (const [method, path] of cases) {
    const res = await request(method, path, { body: {} })
    assert.equal(res.status, 401, `${method} ${path} 未登录应返回 401`)
    assert.equal(res.body.success, false)
  }
})

test('无权限角色访问受限接口返回 403', async () => {
  // editor 无权限修改渠道健康配置（admin）
  let res = await request('PUT', `/api/channel/${channelId}/health`, { userId: editorId, body: { degrade_threshold: 5 } })
  assert.equal(res.status, 403, 'editor 修改渠道健康配置应返回 403')

  // editor 无权限发送心跳（reviewer/admin）
  res = await request('POST', `/api/channel/${channelId}/heartbeat`, { userId: editorId })
  assert.equal(res.status, 403, 'editor 发送心跳应返回 403')

  // editor 无权限查看审计记录（reviewer/admin）
  res = await request('GET', '/api/audit', { userId: editorId })
  assert.equal(res.status, 403, 'editor 查看审计应返回 403')

  // reviewer 无权限处理失败复核（admin）
  res = await request('POST', '/api/failure-reviews/1/resolve', { userId: reviewerId, body: { conclusion: 'x', action_type: 'manual_publish' } })
  assert.equal(res.status, 403, 'reviewer 处理失败复核应返回 403')

  // reviewer 无权限重新排期（editor/admin）
  res = await request('POST', '/api/schedule/1/reschedule', { userId: reviewerId, body: { schedule_time: new Date(Date.now() + 3600000).toISOString() } })
  assert.equal(res.status, 403, 'reviewer 重新排期应返回 403')
})

test('具备权限的角色可正常访问对应接口', async () => {
  // editor 可查看渠道健康列表
  let res = await request('GET', '/api/channel/health', { userId: editorId })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)

  // reviewer 可查看失败复核列表
  res = await request('GET', '/api/failure-reviews', { userId: reviewerId })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)

  // reviewer 可发送心跳
  res = await request('POST', `/api/channel/${channelId}/heartbeat`, { userId: reviewerId })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)

  // admin 可查看审计记录
  res = await request('GET', '/api/audit', { userId: adminId })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)

  // admin 可修改渠道健康配置
  res = await request('PUT', `/api/channel/${channelId}/health`, { userId: adminId, body: { degrade_threshold: 5 } })
  assert.equal(res.status, 200)
  assert.equal(res.body.success, true)
})
