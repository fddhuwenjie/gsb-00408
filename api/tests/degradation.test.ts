import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { createTempDatabase } from './helpers.js'

createTempDatabase('degrade')

let channelId: number

before(async () => {
  const { initDatabase, seedData } = await import('../src/models/index.js')
  initDatabase()
  seedData()
  const { default: db } = await import('../src/db/index.js')
  channelId = (db.prepare('SELECT id FROM channels LIMIT 1').get() as { id: number }).id
  // 阈值设为 2 便于测试
  db.prepare('UPDATE channel_health SET failure_threshold = 2 WHERE channel_id = ?').run(channelId)
})

test('连续失败达到阈值时自动降级并暂停渠道，排期转待复核', async () => {
  const { default: db } = await import('../src/db/index.js')
  const HealthCheckService = (await import('../src/services/HealthCheckService.js')).default

  // 构造一个 scheduled 排期
  const user = db.prepare("SELECT id FROM users WHERE role='editor'").get() as { id: number }
  const content = db
    .prepare("INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', 't', 'c', 'scheduled')")
    .run(user.id)
  const sched = db
    .prepare("INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, '2099-01-01T00:00:00.000Z', 'scheduled')")
    .run(content.lastInsertRowid as number, channelId)
  const scheduleId = sched.lastInsertRowid as number

  // 第一次失败：未达阈值
  const first = await HealthCheckService.registerFailure(channelId, scheduleId, '失败1')
  assert.equal(first.degraded, false)
  assert.equal(first.health.consecutive_failures, 1)

  // 第二次失败：达到阈值 2，触发降级
  const second = await HealthCheckService.registerFailure(channelId, scheduleId, '失败2')
  assert.equal(second.degraded, true)
  assert.equal(second.health.is_degraded, true)

  const channel = db.prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as { status: string }
  assert.equal(channel.status, 'inactive', '触发降级后渠道应暂停')

  const schedule = db.prepare('SELECT status FROM schedules WHERE id = ?').get(scheduleId) as { status: string }
  assert.equal(schedule.status, 'pending_review', '排期应转入待复核')

  // 自动降级审计记录（operator_id 为 NULL）
  const audit = db
    .prepare("SELECT * FROM audit_logs WHERE action = 'channel_auto_degrade' AND target_id = ?")
    .get(channelId) as { operator_id: number | null } | undefined
  assert.ok(audit, '应写入自动降级审计')
  assert.equal(audit!.operator_id, null, '自动降级操作人应为系统(null)')
})

test('健康检查关闭的渠道不会自动降级，发布检查放行', async () => {
  const { default: db } = await import('../src/db/index.js')
  const HealthCheckService = (await import('../src/services/HealthCheckService.js')).default

  const ch = db.prepare("INSERT INTO channels (name, type, status) VALUES ('无检查渠道','other','active')").run()
  const cid = ch.lastInsertRowid as number
  db.prepare("INSERT INTO channel_health (channel_id, is_health_check_enabled, failure_threshold) VALUES (?, 0, 1)").run(cid)

  const result = await HealthCheckService.registerFailure(cid, null, '失败')
  assert.equal(result.degraded, false, '关闭健康检查后不应降级')

  const check = await HealthCheckService.checkChannelPublishable(cid)
  assert.equal(check.publishable, true, '关闭健康检查的渠道应放行发布')
})

test('已降级渠道的发布前检查应拒绝发布', async () => {
  const HealthCheckService = (await import('../src/services/HealthCheckService.js')).default
  const check = await HealthCheckService.checkChannelPublishable(channelId)
  assert.equal(check.publishable, false)
  assert.match(check.reason || '', /降级/)
})
