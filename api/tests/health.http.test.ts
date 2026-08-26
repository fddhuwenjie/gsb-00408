import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTempDatabase, makeToken, startTestServer, api, type TestServer } from './helpers.js'

createTempDatabase('http')

let server: TestServer
let adminToken: string
let editorToken: string
let reviewerToken: string
let channelId: number

before(async () => {
  const { initDatabase, seedData } = await import('../src/models/index.js')
  initDatabase()
  seedData()

  const { default: db } = await import('../src/db/index.js')
  const { createApp } = await import('../src/app.js')

  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get() as { id: number }
  const editor = db.prepare("SELECT id FROM users WHERE role='editor'").get() as { id: number }
  const reviewer = db.prepare("SELECT id FROM users WHERE role='reviewer'").get() as { id: number }
  adminToken = makeToken(admin.id)
  editorToken = makeToken(editor.id)
  reviewerToken = makeToken(reviewer.id)

  channelId = (db.prepare("SELECT id FROM channels LIMIT 1").get() as { id: number }).id

  server = await startTestServer(createApp())
})

after(async () => {
  if (server) await server.close()
})

test('未鉴权访问健康接口应返回 401', async () => {
  const res = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`)
  assert.equal(res.status, 401)
  assert.equal(res.body.success, false)
})

test('越权：editor 调用管理员心跳接口应返回 403', async () => {
  const res = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`, { token: editorToken })
  assert.equal(res.status, 403)
})

test('心跳上报刷新心跳并清零连续失败，且写入审计', async () => {
  const res = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`, { token: adminToken })
  assert.equal(res.status, 200)
  const health = res.body.data as { last_heartbeat_at: string | null; consecutive_failures: number }
  assert.ok(health.last_heartbeat_at, '应记录心跳时间')
  assert.equal(health.consecutive_failures, 0)

  const audit = await api(server.baseUrl, 'GET', `/api/audit-logs?target_type=channel_health`, { token: adminToken })
  const items = (audit.body.data as { items: { action: string }[] }).items
  assert.ok(items.some((i) => i.action === 'channel_heartbeat'), '审计应包含心跳记录')
})

test('设置阈值为 1 后手动降级会暂停渠道并记录审计', async () => {
  const cfg = await api(server.baseUrl, 'PUT', `/api/channel/${channelId}/health/config`, {
    token: adminToken,
    body: { failure_threshold: 1 },
  })
  assert.equal(cfg.status, 200)
  assert.equal((cfg.body.data as { failure_threshold: number }).failure_threshold, 1)

  const degrade = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/degrade`, {
    token: adminToken,
    body: { reason: '测试降级' },
  })
  assert.equal(degrade.status, 200)
  assert.equal((degrade.body.data as { is_degraded: boolean }).is_degraded, true)

  const { default: db } = await import('../src/db/index.js')
  const channel = db.prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as { status: string }
  assert.equal(channel.status, 'inactive', '降级后渠道应被暂停')
})

test('降级渠道恢复：无有效心跳时报错，补心跳后可恢复', async () => {
  const { default: db } = await import('../src/db/index.js')

  // 将心跳时间置为降级之前，模拟尚未恢复心跳
  db.prepare("UPDATE channel_health SET last_heartbeat_at = '2000-01-01T00:00:00.000Z' WHERE channel_id = ?").run(channelId)

  const stale = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/recover`, { token: adminToken })
  assert.equal(stale.status, 400, '心跳早于降级时间应拒绝恢复')

  // 上报新心跳后恢复
  await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`, { token: adminToken })
  const recover = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/recover`, { token: adminToken })
  assert.equal(recover.status, 200)
  assert.equal((recover.body.data as { is_degraded: boolean }).is_degraded, false)

  const channel = db.prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as { status: string }
  assert.equal(channel.status, 'active', '恢复后渠道应重新启用')
})

test('待复核排期的重新排期闭环', async () => {
  const { default: db } = await import('../src/db/index.js')

  const editorUser = db.prepare("SELECT id FROM users WHERE role='editor'").get() as { id: number }
  // 构造一个 pending_review 的排期
  const content = db
    .prepare("INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', '待复核内容', '正文', 'review_approved')")
    .run(editorUser.id)
  const contentId = content.lastInsertRowid as number
  const sched = db
    .prepare("INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, '2099-01-01T00:00:00.000Z', 'pending_review')")
    .run(contentId, channelId)
  const scheduleId = sched.lastInsertRowid as number

  const futureTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const res = await api(server.baseUrl, 'POST', `/api/schedule/${scheduleId}/reschedule`, {
    token: editorToken,
    body: { schedule_time: futureTime },
  })
  assert.equal(res.status, 200, res.body.error || '重新排期应成功')
  assert.equal((res.body.data as { status: string }).status, 'scheduled')

  // 审计记录闭环
  const audit = await api(server.baseUrl, 'GET', `/api/audit-logs?target_type=schedule`, { token: reviewerToken })
  const items = (audit.body.data as { items: { action: string; target_id: number }[] }).items
  assert.ok(
    items.some((i) => i.action === 'schedule_reschedule' && i.target_id === scheduleId),
    '审计应包含重新排期记录',
  )
})

test('非 pending_review 的排期不允许重新排期', async () => {
  const { default: db } = await import('../src/db/index.js')
  const editorUser = db.prepare("SELECT id FROM users WHERE role='editor'").get() as { id: number }
  const content = db
    .prepare("INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', '普通内容', '正文', 'review_approved')")
    .run(editorUser.id)
  const sched = db
    .prepare("INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, '2099-01-01T00:00:00.000Z', 'scheduled')")
    .run(content.lastInsertRowid as number, channelId)

  const res = await api(server.baseUrl, 'POST', `/api/schedule/${sched.lastInsertRowid}/reschedule`, {
    token: editorToken,
    body: { schedule_time: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() },
  })
  assert.equal(res.status, 400)
})
