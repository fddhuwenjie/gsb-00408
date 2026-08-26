import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createTempDatabase, makeToken, startTestServer, api, type TestServer } from './helpers.js'

createTempDatabase('integration')

let server: TestServer
let adminToken: string
let editorToken: string
let reviewerToken: string
let channelId: number
let editorId: number
let db: import('better-sqlite3').Database
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PublishService: any

const THRESHOLD = 3
const originalRandom = Math.random

before(async () => {
  const { initDatabase, seedData } = await import('../src/models/index.js')
  initDatabase()
  seedData()

  db = (await import('../src/db/index.js')).default
  const { createApp } = await import('../src/app.js')
  PublishService = (await import('../src/scheduler/publishTask.js')).PublishService

  const admin = db.prepare("SELECT id FROM users WHERE role='admin'").get() as { id: number }
  const editor = db.prepare("SELECT id FROM users WHERE role='editor'").get() as { id: number }
  const reviewer = db.prepare("SELECT id FROM users WHERE role='reviewer'").get() as { id: number }
  adminToken = makeToken(admin.id)
  editorToken = makeToken(editor.id)
  reviewerToken = makeToken(reviewer.id)
  editorId = editor.id

  channelId = (db.prepare('SELECT id FROM channels LIMIT 1').get() as { id: number }).id
  db.prepare('UPDATE channel_health SET failure_threshold = ? WHERE channel_id = ?').run(THRESHOLD, channelId)

  // 强制发布失败：simulatePublish 使用 Math.random() > 0.1 判定成功
  Math.random = () => 0

  server = await startTestServer(createApp())
})

after(async () => {
  Math.random = originalRandom
  if (server) await server.close()
})

/** 新建一个 scheduled 排期并返回其 id */
function createScheduledTask(): number {
  const content = db
    .prepare("INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', '集成内容', '正文', 'scheduled')")
    .run(editorId)
  const sched = db
    .prepare("INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, '2099-01-01T00:00:00.000Z', 'scheduled')")
    .run(content.lastInsertRowid as number, channelId)
  return sched.lastInsertRowid as number
}

test('完整闭环：计划任务连续失败→阈值降级→暂停渠道→转待复核→心跳恢复→人工解除降级→重新排期', async () => {
  // ---------- 阶段1：连续发布失败累计，直到达到阈值触发自动降级 ----------
  let degradedScheduleId = 0
  for (let i = 1; i <= THRESHOLD; i++) {
    const scheduleId = createScheduledTask()
    await PublishService.executePublish(scheduleId)

    const health = db.prepare('SELECT * FROM channel_health WHERE channel_id = ?').get(channelId) as {
      consecutive_failures: number
      is_degraded: number
    }

    if (i < THRESHOLD) {
      // 未达阈值：失败计数递增、未降级、排期标记 failed 并生成失败复盘
      assert.equal(health.consecutive_failures, i, `第 ${i} 次失败计数应为 ${i}`)
      assert.equal(health.is_degraded, 0, `第 ${i} 次不应降级`)
      const schedule = db.prepare('SELECT status FROM schedules WHERE id = ?').get(scheduleId) as { status: string }
      assert.equal(schedule.status, 'failed')
      const fr = db.prepare('SELECT COUNT(*) as c FROM failure_reviews WHERE schedule_id = ?').get(scheduleId) as { c: number }
      assert.equal(fr.c, 1, '未降级失败应生成失败复盘')
    } else {
      // 达到阈值：自动降级
      assert.equal(health.is_degraded, 1, '达到阈值应降级')
      degradedScheduleId = scheduleId
    }
  }

  // ---------- 阶段2：验证暂停渠道 + 排期转待复核 + 自动降级审计 ----------
  const channel = db.prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as { status: string }
  assert.equal(channel.status, 'inactive', '降级后渠道应被暂停')

  const degradedSchedule = db.prepare('SELECT status FROM schedules WHERE id = ?').get(degradedScheduleId) as { status: string }
  assert.equal(degradedSchedule.status, 'pending_review', '触发降级的排期应转入待复核')

  const autoAudit = db
    .prepare("SELECT * FROM audit_logs WHERE action = 'channel_auto_degrade' AND target_id = ?")
    .get(channelId) as { operator_id: number | null } | undefined
  assert.ok(autoAudit, '应写入自动降级审计')
  assert.equal(autoAudit!.operator_id, null, '自动降级操作人应为系统(null)')

  // ---------- 阶段3：待复核排期在前端接口可见 ----------
  const pendingList = await api(server.baseUrl, 'GET', '/api/schedule?status=pending_review', { token: editorToken })
  assert.equal(pendingList.status, 200)
  const pendingItems = (pendingList.body.data as { items: { id: number }[] }).items
  assert.ok(pendingItems.some((s) => s.id === degradedScheduleId), '待复核列表应包含降级排期')

  // ---------- 阶段4：降级期间发布前健康检查阻断，即使关闭健康检查也不放行 ----------
  const blocked = await api(server.baseUrl, 'PUT', `/api/channel/${channelId}/health/config`, {
    token: adminToken,
    body: { is_health_check_enabled: false },
  })
  assert.equal(blocked.status, 200)
  const HealthCheckService = (await import('../src/services/HealthCheckService.js')).default
  const stillBlocked = await HealthCheckService.checkChannelPublishable(channelId)
  assert.equal(stillBlocked.publishable, false, '关闭健康检查不得绕过降级/停用状态')
  // 恢复健康检查开关，进入正常恢复流程
  await api(server.baseUrl, 'PUT', `/api/channel/${channelId}/health/config`, {
    token: adminToken,
    body: { is_health_check_enabled: true },
  })

  // ---------- 阶段5：鉴权校验 ----------
  const noAuth = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`)
  assert.equal(noAuth.status, 401, '未鉴权应 401')
  const editorDegrade = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/recover`, { token: editorToken })
  assert.equal(editorDegrade.status, 403, 'editor 无权恢复渠道应 403')

  // ---------- 阶段6：未恢复心跳时不允许解除降级 ----------
  db.prepare("UPDATE channel_health SET last_heartbeat_at = '2000-01-01T00:00:00.000Z' WHERE channel_id = ?").run(channelId)
  const staleRecover = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/recover`, { token: adminToken })
  assert.equal(staleRecover.status, 400, '心跳早于降级时间应拒绝恢复')

  // ---------- 阶段7：上报心跳（admin），审计记录 ----------
  const heartbeat = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/heartbeat`, { token: adminToken })
  assert.equal(heartbeat.status, 200)
  const hbHealth = heartbeat.body.data as { last_heartbeat_at: string | null; consecutive_failures: number }
  assert.ok(hbHealth.last_heartbeat_at, '心跳应刷新时间')
  assert.equal(hbHealth.consecutive_failures, 0, '心跳应清零连续失败')

  // ---------- 阶段8：人工解除降级（admin），渠道重新启用，审计记录 ----------
  const recover = await api(server.baseUrl, 'POST', `/api/channel/${channelId}/recover`, { token: adminToken })
  assert.equal(recover.status, 200)
  assert.equal((recover.body.data as { is_degraded: boolean }).is_degraded, false)
  const recoveredChannel = db.prepare('SELECT status FROM channels WHERE id = ?').get(channelId) as { status: string }
  assert.equal(recoveredChannel.status, 'active', '恢复后渠道应重新启用')

  // ---------- 阶段9：重新排期（editor），转回 scheduled，审计记录 ----------
  const futureTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
  const reschedule = await api(server.baseUrl, 'POST', `/api/schedule/${degradedScheduleId}/reschedule`, {
    token: editorToken,
    body: { schedule_time: futureTime },
  })
  assert.equal(reschedule.status, 200, reschedule.body.error || '重新排期应成功')
  assert.equal((reschedule.body.data as { status: string }).status, 'scheduled')

  // ---------- 阶段10：各阶段审计记录齐全，可经全局审计接口查询 ----------
  const auditRes = await api(server.baseUrl, 'GET', '/api/audit-logs?pageSize=100', { token: reviewerToken })
  assert.equal(auditRes.status, 200)
  const actions = (auditRes.body.data as { items: { action: string; target_id: number | null }[] }).items
  const actionSet = new Set(actions.map((a) => a.action))
  for (const expected of [
    'channel_auto_degrade',
    'channel_health_config',
    'channel_heartbeat',
    'channel_recover',
    'schedule_reschedule',
  ]) {
    assert.ok(actionSet.has(expected), `审计应包含 ${expected}`)
  }
  assert.ok(
    actions.some((a) => a.action === 'schedule_reschedule' && a.target_id === degradedScheduleId),
    '重新排期审计应指向该排期',
  )
})
