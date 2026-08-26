import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsb-publish-test-'))
process.env.DB_PATH = path.join(tmpDir, 'test.db')

const { default: db } = await import('../src/db/index.js')
const { initDatabase } = await import('../src/models/init.js')
const { default: ChannelHealthModel } = await import('../src/models/ChannelHealth.js')
const { default: FailureReviewModel } = await import('../src/models/FailureReview.js')
const { default: AuditRecordModel } = await import('../src/models/AuditRecord.js')
const { default: ScheduleModel } = await import('../src/models/Schedule.js')
const { default: ContentModel } = await import('../src/models/Content.js')
const { default: PublishService } = await import('../src/services/PublishService.js')
const { default: ScheduleService } = await import('../src/services/ScheduleService.js')
const { default: ChannelService } = await import('../src/services/ChannelService.js')

let adminId: number
let channelId: number
let contentId: number

const realRandom = Math.random

function futureTime(hoursAhead = 2): string {
  return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString()
}

function createSchedule() {
  return ScheduleModel.create({
    content_id: contentId,
    channel_id: channelId,
    schedule_time: futureTime(),
    status: 'scheduled',
  })
}

before(() => {
  initDatabase()

  adminId = db
    .prepare("INSERT INTO users (username, password_hash, role) VALUES ('admin_flow', 'x', 'admin')")
    .run().lastInsertRowid as number

  channelId = db
    .prepare("INSERT INTO channels (name, type, status) VALUES ('流程渠道', 'weibo', 'active')")
    .run().lastInsertRowid as number

  contentId = db
    .prepare(
      "INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, 'article', '流程内容', '正文', 'review_approved')",
    )
    .run(adminId).lastInsertRowid as number

  // 阈值默认为 3
  return ChannelHealthModel.create({ channel_id: channelId })
})

after(() => {
  Math.random = realRandom
})

test('健康渠道正常发布成功，不再因异步事务报错', async () => {
  Math.random = () => 0.9 // 强制模拟发布成功

  const schedule = await createSchedule()
  const record = await PublishService.executePublish(schedule.id)

  assert.equal(record.status, 'success')

  const updatedSchedule = await ScheduleModel.findById(schedule.id)
  assert.equal(updatedSchedule!.status, 'published')

  const content = await ContentModel.findById(contentId)
  assert.equal(content!.status, 'published')

  const health = await ChannelHealthModel.findByChannelId(channelId)
  assert.equal(health!.enabled, true)
  assert.equal(health!.consecutive_failures, 0)
})

test('阈值前一次失败：渠道不降级，排期标记为失败并生成失败复核', async () => {
  Math.random = () => 0.05 // 强制模拟发布失败

  const schedule = await createSchedule()
  const record = await PublishService.executePublish(schedule.id)

  assert.equal(record.status, 'failed')

  const health = await ChannelHealthModel.findByChannelId(channelId)
  assert.equal(health!.consecutive_failures, 1)
  assert.equal(health!.enabled, true, '未达阈值不应暂停渠道')
  assert.equal(await ChannelHealthModel.isHealthy(channelId), true)

  const updatedSchedule = await ScheduleModel.findById(schedule.id)
  assert.equal(updatedSchedule!.status, 'failed', '未达阈值时排期标记为失败而非待复核')

  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review, '失败应生成失败复核')

  const degradedAudits = await AuditRecordModel.findAll({ action: 'channel.degraded', target_id: channelId })
  assert.equal(degradedAudits.total, 0, '未达阈值不应写入降级审计')
})

test('连续失败刚好达到阈值：暂停渠道、触发排期转待复核、生成失败复核并写审计', async () => {
  Math.random = () => 0.05

  // 第 2 次失败：仍未达阈值
  const schedule2 = await createSchedule()
  await PublishService.executePublish(schedule2.id)
  let health = await ChannelHealthModel.findByChannelId(channelId)
  assert.equal(health!.consecutive_failures, 2)
  assert.equal(health!.enabled, true)
  assert.equal((await ScheduleModel.findById(schedule2.id))!.status, 'failed')

  // 第 3 次失败：刚好达到阈值，触发降级
  const schedule3 = await createSchedule()
  const record3 = await PublishService.executePublish(schedule3.id)
  assert.equal(record3.status, 'failed')

  health = await ChannelHealthModel.findByChannelId(channelId)
  assert.equal(health!.consecutive_failures, 3)
  assert.equal(health!.enabled, false, '达到阈值必须暂停渠道')
  assert.equal(await ChannelHealthModel.isHealthy(channelId), false)

  const degradedSchedule = await ScheduleModel.findById(schedule3.id)
  assert.equal(degradedSchedule!.status, 'pending_review', '触发降级的排期必须转入待复核')

  const review = await FailureReviewModel.findPendingByScheduleId(schedule3.id)
  assert.ok(review, '触发降级的排期必须生成失败复核')

  const degradedAudits = await AuditRecordModel.findAll({ action: 'channel.degraded', target_id: channelId })
  assert.equal(degradedAudits.total, 1, '刚好达到阈值时写入一次降级审计')

  const pendingReviewAudits = await AuditRecordModel.findAll({ action: 'schedule.pending_review', target_id: schedule3.id })
  assert.equal(pendingReviewAudits.total, 1, '触发降级的排期转入待复核必须写审计')
})

test('心跳恢复后允许对待复核排期人工重新排期', async () => {
  const pendingReview = db
    .prepare("SELECT id FROM schedules WHERE status = 'pending_review' LIMIT 1")
    .get() as { id: number }
  assert.ok(pendingReview, '应存在待复核排期')

  // 降级状态下禁止重新排期
  await assert.rejects(
    () => ScheduleService.rescheduleSchedule(pendingReview.id, futureTime(6), adminId),
    (err: Error & { code?: string }) => {
      assert.equal(err.code, 'CHANNEL_DEGRADED')
      return true
    },
  )

  // 心跳恢复
  const health = await ChannelService.recordHeartbeat(channelId, adminId)
  assert.equal(health.enabled, true)
  assert.equal(health.consecutive_failures, 0)

  // 恢复后允许重新排期
  const newTime = futureTime(7)
  const rescheduled = await ScheduleService.rescheduleSchedule(pendingReview.id, newTime, adminId)
  assert.equal(rescheduled.status, 'scheduled')
  assert.equal(rescheduled.schedule_time, newTime)

  const recoveredAudits = await AuditRecordModel.findAll({ action: 'channel.recovered', target_id: channelId })
  assert.ok(recoveredAudits.total >= 1, '心跳解除降级应写入恢复审计')

  const rescheduleAudits = await AuditRecordModel.findAll({ action: 'schedule.reschedule', target_id: pendingReview.id })
  assert.equal(rescheduleAudits.total, 1)
  assert.equal(rescheduleAudits.items[0].operator_id, adminId)
})
