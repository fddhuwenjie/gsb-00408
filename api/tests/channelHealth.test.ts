import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsb-health-test-'))
process.env.DB_PATH = path.join(tmpDir, 'test.db')

const { default: db } = await import('../src/db/index.js')
const { initDatabase } = await import('../src/models/init.js')
const { default: ChannelHealthModel } = await import('../src/models/ChannelHealth.js')
const { default: FailureReviewModel } = await import('../src/models/FailureReview.js')
const { default: AuditRecordModel } = await import('../src/models/AuditRecord.js')
const { default: ScheduleModel } = await import('../src/models/Schedule.js')
const { default: PublishService } = await import('../src/services/PublishService.js')
const { default: ScheduleService } = await import('../src/services/ScheduleService.js')
const { default: ChannelService } = await import('../src/services/ChannelService.js')

let userId: number
let channelId: number
let contentId: number

function futureTime(hoursAhead = 2): string {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString()
}

function createSchedule(status: 'scheduled' | 'pending' = 'scheduled') {
  return ScheduleModel.create({
    content_id: contentId,
    channel_id: channelId,
    schedule_time: futureTime(),
    status,
  })
}

before(() => {
  initDatabase()

  const user = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES ('tester', 'x', 'admin')")
    .run()
  userId = user.lastInsertRowid as number

  const channel = db
    .prepare("INSERT INTO channels (name, type, status) VALUES ('测试渠道', 'wechat', 'active')")
    .run()
  channelId = channel.lastInsertRowid as number

  const content = db
    .prepare(
      "INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', '测试内容', '正文', 'review_approved')",
    )
    .run(userId)
  contentId = content.lastInsertRowid as number
})

test('初始化后渠道健康包含启用状态、心跳、连续失败与降级阈值', async () => {
  const health = await ChannelHealthModel.create({ channel_id: channelId })
  assert.equal(health.enabled, true)
  assert.equal(health.consecutive_failures, 0)
  assert.equal(health.degrade_threshold, 3)
  assert.ok(health.last_heartbeat)
  assert.equal(await ChannelHealthModel.isHealthy(channelId), true)
})

test('连续失败达到阈值时渠道自动降级，心跳后恢复', async () => {
  const health = await ChannelHealthModel.findByChannelId(channelId)
  const threshold = health!.degrade_threshold

  let degraded = false
  for (let i = 0; i < threshold; i++) {
    const outcome = await ChannelHealthModel.recordPublishOutcome(channelId, false, `失败${i}`)
    degraded = outcome!.degraded
    if (i < threshold - 1) {
      assert.equal(degraded, false, '未达到阈值不应降级')
    }
  }
  assert.equal(degraded, true, '达到阈值应触发降级')

  const after = await ChannelHealthModel.findByChannelId(channelId)
  assert.equal(after!.enabled, false)
  assert.equal(after!.consecutive_failures, threshold)
  assert.equal(await ChannelHealthModel.isHealthy(channelId), false)

  const recovered = await ChannelService.recordHeartbeat(channelId, userId)
  assert.equal(recovered.enabled, true)
  assert.equal(recovered.consecutive_failures, 0)
  assert.ok(recovered.last_heartbeat)
  assert.equal(await ChannelHealthModel.isHealthy(channelId), true)

  const audits = await AuditRecordModel.findAll({ action: 'channel.heartbeat', target_id: channelId })
  assert.ok(audits.total >= 1, '心跳应写入审计记录')
})

test('发布前健康检查：降级渠道的排期任务转入待复核并生成失败复核与审计', async () => {
  const schedule = await createSchedule()

  // 手工将渠道置为降级状态
  await ChannelHealthModel.updateByChannelId(channelId, { enabled: false })
  assert.equal(await ChannelHealthModel.isHealthy(channelId), false)

  const record = await PublishService.executePublish(schedule.id)
  assert.equal(record.status, 'failed')
  assert.match(record.result ?? '', /健康检查未通过/)

  const updated = await ScheduleModel.findById(schedule.id)
  assert.equal(updated!.status, 'pending_review', '排期应转入待复核')

  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review, '应生成待处理的失败复核')

  const audits = await AuditRecordModel.findAll({ action: 'schedule.pending_review', target_id: schedule.id })
  assert.equal(audits.total, 1, '转入待复核应写入系统审计')
})

test('渠道降级时禁止创建排期与重新排期，心跳恢复后允许人工重新排期', async () => {
  const pendingReview = db
    .prepare("SELECT id FROM schedules WHERE status = 'pending_review' LIMIT 1")
    .get() as { id: number }

  // 仍处于降级状态：禁止创建排期
  await assert.rejects(
    () => ScheduleService.createSchedule(contentId, { channel_id: channelId, schedule_time: futureTime(3) }),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'CHANNEL_DEGRADED')
      return true
    },
  )

  // 仍处于降级状态：禁止重新排期
  await assert.rejects(
    () => ScheduleService.rescheduleSchedule(pendingReview.id, futureTime(4), userId),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'CHANNEL_DEGRADED')
      return true
    },
  )

  // 心跳恢复后允许重新排期
  await ChannelService.recordHeartbeat(channelId, userId)
  const newTime = futureTime(5)
  const rescheduled = await ScheduleService.rescheduleSchedule(pendingReview.id, newTime, userId)
  assert.equal(rescheduled.status, 'scheduled')
  assert.equal(rescheduled.schedule_time, newTime)

  const audits = await AuditRecordModel.findAll({ action: 'schedule.reschedule', target_id: pendingReview.id })
  assert.equal(audits.total, 1, '重新排期应写入审计记录')
  assert.equal(audits.items[0].operator_id, userId)
})

test('失败复核处理写入统一审计记录', async () => {
  const review = db
    .prepare("SELECT id FROM failure_reviews WHERE status = 'pending' LIMIT 1")
    .get() as { id: number }

  const resolved = await PublishService.resolveFailureReview(review.id, userId, '已人工处理完成', 'manual_publish')
  assert.equal(resolved!.status, 'resolved')

  const audits = await AuditRecordModel.findAll({ action: 'failure_review.resolve', target_id: review.id })
  assert.equal(audits.total, 1)
  assert.equal(audits.items[0].operator_id, userId)
})
