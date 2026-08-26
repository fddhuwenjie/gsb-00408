import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const dbFile = path.join(
  os.tmpdir(),
  `gsb-health-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
)
process.env.DB_PATH = dbFile

type DbModule = typeof import('../src/db/index.js')
type InitModule = typeof import('../src/models/init.js')
type SeedModule = typeof import('../src/models/seed.js')
type ChannelModelModule = typeof import('../src/models/Channel.js')
type ChannelHealthModelModule = typeof import('../src/models/ChannelHealth.js')
type ContentModelModule = typeof import('../src/models/Content.js')
type ScheduleModelModule = typeof import('../src/models/Schedule.js')
type FailureReviewModelModule = typeof import('../src/models/FailureReview.js')
type AuditLogModelModule = typeof import('../src/models/AuditLog.js')
type HealthServiceModule = typeof import('../src/services/HealthService.js')
type PublishServiceModule = typeof import('../src/services/PublishService.js')
type AuthMiddlewareModule = typeof import('../src/middleware/auth.js')

let db: DbModule['default']
let initDatabase: InitModule['initDatabase']
let seedData: SeedModule['seedData']
let ChannelModel: ChannelModelModule['default']
let ChannelHealthModel: ChannelHealthModelModule['default']
let ContentModel: ContentModelModule['default']
let ScheduleModel: ScheduleModelModule['default']
let FailureReviewModel: FailureReviewModelModule['default']
let AuditLogModel: AuditLogModelModule['default']
let HealthService: HealthServiceModule
let PublishService: PublishServiceModule
let authMiddleware: AuthMiddlewareModule['authMiddleware']

let nameCounter = 0

before(async () => {
  db = (await import('../src/db/index.js')).default
  ;({ initDatabase } = await import('../src/models/init.js'))
  ;({ seedData } = await import('../src/models/seed.js'))
  ChannelModel = (await import('../src/models/Channel.js')).default
  ChannelHealthModel = (await import('../src/models/ChannelHealth.js')).default
  ContentModel = (await import('../src/models/Content.js')).default
  ScheduleModel = (await import('../src/models/Schedule.js')).default
  FailureReviewModel = (await import('../src/models/FailureReview.js')).default
  AuditLogModel = (await import('../src/models/AuditLog.js')).default
  HealthService = await import('../src/services/HealthService.js')
  PublishService = await import('../src/services/PublishService.js')
  ;({ authMiddleware } = await import('../src/middleware/auth.js'))

  initDatabase()
  seedData()
})

after(() => {
  try {
    fs.unlinkSync(dbFile)
    fs.unlinkSync(`${dbFile}-wal`)
    fs.unlinkSync(`${dbFile}-shm`)
  } catch {
    // ignore cleanup errors
  }
})

async function setupChannel(threshold = 2) {
  nameCounter += 1
  const channel = await ChannelModel.create({
    name: `测试渠道-${Date.now()}-${nameCounter}`,
    type: 'wechat',
    status: 'active',
  })
  await ChannelHealthModel.create({ channel_id: channel.id, failure_threshold: threshold })
  return channel
}

async function setupSchedule(channelId: number) {
  const content = await ContentModel.create({
    creator_id: 1,
    type: 'article',
    title: `测试内容-${Date.now()}-${nameCounter}`,
    content: '测试正文',
    status: 'review_approved',
  })
  const schedule = await ScheduleModel.create({
    content_id: content.id,
    channel_id: channelId,
    schedule_time: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    status: 'scheduled',
  })
  return { content, schedule }
}

test('数据库初始化：健康字段、审计表与种子数据正确', () => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all() as { name: string }[]
  const tableNames = tables.map((t) => t.name)
  assert.ok(tableNames.includes('audit_logs'), 'audit_logs 表应存在')

  const healthCols = db.prepare('PRAGMA table_info(channel_health)').all() as { name: string }[]
  const colNames = healthCols.map((c) => c.name)
  for (const col of ['last_heartbeat_at', 'consecutive_failures', 'failure_threshold', 'degraded_at']) {
    assert.ok(colNames.includes(col), `channel_health 应包含 ${col} 列`)
  }

  const reviewCols = db.prepare('PRAGMA table_info(failure_reviews)').all() as { name: string }[]
  assert.ok(reviewCols.map((c) => c.name).includes('reason'), 'failure_reviews 应包含 reason 列')

  const healthRows = db.prepare('SELECT failure_threshold, last_heartbeat_at FROM channel_health').all() as {
    failure_threshold: number
    last_heartbeat_at: string | null
  }[]
  assert.ok(healthRows.length >= 4, '种子渠道应都有健康记录')
  for (const row of healthRows) {
    assert.equal(row.failure_threshold, 3)
    assert.ok(row.last_heartbeat_at, '种子渠道应有初始心跳时间')
  }
})

test('心跳上报：更新最近心跳、重置连续失败并写审计', async () => {
  const channel = await setupChannel(3)
  await ChannelHealthModel.recordPublishFailure(channel.id, '模拟失败')

  const { health } = await HealthService.reportHeartbeat(channel.id, 3, { status: 'ok' })
  assert.ok(health.last_heartbeat_at, '心跳时间应被更新')
  assert.equal(health.consecutive_failures, 0, '心跳应重置连续失败计数')

  const logs = await AuditLogModel.findAll({ action: 'channel.heartbeat', target_id: channel.id })
  assert.ok(logs.total >= 1, '应写入心跳审计记录')
  assert.equal(logs.items[0].operator_id, 3, '审计记录应包含操作人')
})

test('自动降级：连续失败达到阈值后暂停渠道，任务转入失败复核', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '模拟发布失败：连接超时' }))

  const channel = await setupChannel(2)

  const { schedule: s1 } = await setupSchedule(channel.id)
  const r1 = await PublishService.executePublish(s1.id, null)
  assert.equal(r1.status, 'failed')

  let health = await ChannelHealthModel.findByChannelId(channel.id)
  assert.equal(health?.consecutive_failures, 1, '首次失败后连续失败计数应为 1')
  let channelRow = await ChannelModel.findById(channel.id)
  assert.equal(channelRow?.status, 'active', '未达阈值不应暂停')

  const review1 = await FailureReviewModel.findPendingByScheduleId(s1.id)
  assert.ok(review1, '失败任务应转入失败复核')

  const { schedule: s2 } = await setupSchedule(channel.id)
  const r2 = await PublishService.executePublish(s2.id, null)
  assert.equal(r2.status, 'failed')

  channelRow = await ChannelModel.findById(channel.id)
  assert.equal(channelRow?.status, 'paused', '达到阈值渠道应被自动暂停')
  health = await ChannelHealthModel.findByChannelId(channel.id)
  assert.ok(health?.degraded_at, '健康记录应标记降级时间')
  assert.equal(health?.consecutive_failures, 2)

  const s2After = await ScheduleModel.findById(s2.id)
  assert.equal(s2After?.status, 'failed', '降级任务应标记为失败待复核')

  const degradeLogs = await AuditLogModel.findAll({ action: 'channel.degrade', target_id: channel.id })
  assert.ok(degradeLogs.total >= 1, '应写入降级审计记录')
})

test('发布前健康检查：降级渠道拦截发布并转入待复核', async () => {
  PublishService.setPublishSimulator(async () => ({ success: true }))

  const pausedChannel = await ChannelModel.create({
    name: `已降级渠道-${Date.now()}`,
    type: 'weibo',
    status: 'paused',
  })
  await ChannelHealthModel.create({ channel_id: pausedChannel.id })
  await ChannelHealthModel.markDegraded(pausedChannel.id)

  const { schedule } = await setupSchedule(pausedChannel.id)
  const record = await PublishService.executePublish(schedule.id, null)

  assert.equal(record.status, 'failed')
  assert.ok(record.result?.includes('健康检查'), '记录应说明健康检查未通过')

  const scheduleAfter = await ScheduleModel.findById(schedule.id)
  assert.equal(scheduleAfter?.status, 'failed')

  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review, '被拦截任务应转入失败复核')
  assert.ok(review.reason?.includes('降级'), '复核原因应说明降级')

  const blockedLogs = await AuditLogModel.findAll({ action: 'publish.blocked', target_id: schedule.id })
  assert.ok(blockedLogs.total >= 1, '应写拦截审计')
})

test('渠道恢复：心跳未恢复时禁止恢复，恢复心跳后可人工启用', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '失败' }))
  const channel = await setupChannel(1)
  const { schedule } = await setupSchedule(channel.id)
  await PublishService.executePublish(schedule.id, null)

  const paused = await ChannelModel.findById(channel.id)
  assert.equal(paused?.status, 'paused')

  await assert.rejects(
    () => HealthService.resumeChannel(channel.id, 3),
    (err: { code?: string }) => err.code === 'CHANNEL_HEARTBEAT_NOT_RECOVERED',
    '心跳未恢复时应拒绝恢复',
  )

  await HealthService.reportHeartbeat(channel.id, 3, { status: 'ok' })
  const health = await HealthService.resumeChannel(channel.id, 3)

  const channelAfter = await ChannelModel.findById(channel.id)
  assert.equal(channelAfter?.status, 'active', '恢复后渠道应为启用状态')
  assert.equal(health.degraded_at, null, '恢复后降级标记应清除')
  assert.equal(health.consecutive_failures, 0)

  const resumeLogs = await AuditLogModel.findAll({ action: 'channel.resume', target_id: channel.id })
  assert.ok(resumeLogs.total >= 1, '应写入恢复审计')
})

test('失败复核：恢复后支持重新排期并发布成功，成功重置失败计数', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '失败' }))
  const channel = await setupChannel(1)
  const { schedule } = await setupSchedule(channel.id)
  await PublishService.executePublish(schedule.id, null)

  await HealthService.reportHeartbeat(channel.id, 3, { status: 'ok' })
  await HealthService.resumeChannel(channel.id, 3)

  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  const newTime = new Date(Date.now() + 6 * 3600 * 1000).toISOString()
  const result = await PublishService.resolveFailureReview(
    review!.id,
    3,
    '渠道已恢复，重新排期发布',
    'reschedule',
    newTime,
  )
  assert.equal(result.review.status, 'resolved')
  assert.ok(result.schedule, '应返回重新排期后的排期')
  assert.equal(result.schedule?.status, 'scheduled')

  const resolveLogs = await AuditLogModel.findAll({
    action: 'failure_review.resolve',
    target_id: review!.id,
  })
  assert.ok(resolveLogs.total >= 1, '应写入复核处理审计')

  PublishService.setPublishSimulator(async () => ({ success: true }))
  const record = await PublishService.executePublish(schedule.id, 3)
  assert.equal(record.status, 'success')

  const scheduleAfter = await ScheduleModel.findById(schedule.id)
  assert.equal(scheduleAfter?.status, 'published')

  const health = await ChannelHealthModel.findByChannelId(channel.id)
  assert.equal(health?.consecutive_failures, 0, '发布成功应重置连续失败')
})

test('降级阈值可配置，超范围校验', async () => {
  const channel = await setupChannel(3)
  const health = await HealthService.updateFailureThreshold(channel.id, 5, 3)
  assert.equal(health.failure_threshold, 5)

  await assert.rejects(
    () => HealthService.updateFailureThreshold(channel.id, 0, 3),
    (err: { statusCode?: number }) => err.statusCode === 400,
  )
})

test('鉴权中间件：无令牌/无效令牌返回 401，有效令牌放行', async () => {
  const noAuthReq = { headers: {} } as never
  const res401 = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json() {},
  } as never
  let nextCalled = false
  authMiddleware(noAuthReq, res401, () => {
    nextCalled = true
  })
  assert.equal((res401 as { statusCode: number }).statusCode, 401)
  assert.equal(nextCalled, false)

  const validToken = Buffer.from('1:ignored').toString('base64')
  const okReq = { headers: { authorization: `Bearer ${validToken}` } } as never
  const okRes = { status() { return this }, json() {} } as never
  let user: { id: number } | undefined
  authMiddleware(okReq, okRes, () => {
    nextCalled = true
    user = (okReq as { user?: { id: number } }).user
  })
  assert.equal(nextCalled, true)
  assert.equal(user?.id, 1, '应解析出登录用户')
})

async function assertReviewStillPending(
  reviewId: number,
  scheduleId: number,
  expectedScheduleStatus: string,
  originalScheduleTime: string,
) {
  const review = await FailureReviewModel.findById(reviewId)
  assert.equal(review?.status, 'pending', '复核记录应保持待处理')
  assert.equal(review?.handler_id, null, '处理人不应被写入')
  assert.equal(review?.conclusion, null, '处理结论不应被写入')
  assert.equal(review?.action_type, null, '处理动作不应被写入')

  const schedule = await ScheduleModel.findById(scheduleId)
  assert.equal(schedule?.status, expectedScheduleStatus, '排期状态应保持不变')
  assert.equal(schedule?.schedule_time, originalScheduleTime, '排期时间应保持不变')

  const logs = await AuditLogModel.findAll({ action: 'failure_review.resolve', target_id: reviewId })
  assert.equal(logs.total, 0, '失败路径不应写入处理审计')
}

test('失败复核一致性：渠道未恢复时重新发布/重新排期被拒，状态保持原样', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '发布失败' }))
  const channel = await setupChannel(1)
  const { schedule } = await setupSchedule(channel.id)
  const originalTime = schedule.schedule_time

  await PublishService.executePublish(schedule.id, null)
  const channelAfter = await ChannelModel.findById(channel.id)
  assert.equal(channelAfter?.status, 'paused')
  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '渠道未恢复，重新发布', 'republish'),
    (err: { code?: string }) => err.code === 'CHANNEL_DEGRADED',
    '降级渠道重新发布应被健康检查拒绝',
  )

  const futureTime = new Date(Date.now() + 3 * 3600 * 1000).toISOString()
  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '渠道未恢复，重新排期', 'reschedule', futureTime),
    (err: { code?: string }) => err.code === 'CHANNEL_DEGRADED',
    '降级渠道重新排期应被健康检查拒绝',
  )

  await assertReviewStillPending(review!.id, schedule.id, 'failed', originalTime)
})

test('失败复核一致性：无效排期时间被拒，复核与排期保持原样', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '发布失败' }))
  const channel = await setupChannel(5)
  const { schedule } = await setupSchedule(channel.id)
  const originalTime = schedule.schedule_time

  const record = await PublishService.executePublish(schedule.id, null)
  assert.equal(record.status, 'failed')
  const channelAfter = await ChannelModel.findById(channel.id)
  assert.equal(channelAfter?.status, 'active', '未达阈值渠道不应暂停')
  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '缺少时间', 'reschedule'),
    (err: { code?: string }) => err.code === 'SCHEDULE_TIME_REQUIRED',
  )

  const pastTime = new Date(Date.now() - 3600 * 1000).toISOString()
  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '过去时间', 'reschedule', pastTime),
    (err: { code?: string }) => err.code === 'INVALID_SCHEDULE_TIME',
    '过去时间应被拒绝',
  )

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '非法时间', 'reschedule', 'not-a-date'),
    (err: { code?: string }) => err.code === 'INVALID_SCHEDULE_TIME',
    '非法时间格式应被拒绝',
  )

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '  ', 'manual_publish'),
    (err: { code?: string }) => err.code === 'EMPTY_CONCLUSION',
    '空结论应被拒绝',
  )

  await assertReviewStillPending(review!.id, schedule.id, 'failed', originalTime)
})

test('失败复核一致性：重复排期被拒，排期时间保持不变', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '发布失败' }))
  const channel = await setupChannel(5)

  const occupiedHour = new Date(Date.now() + 2 * 3600 * 1000)
  occupiedHour.setMinutes(0, 0, 0)
  const { schedule: occupied } = await setupSchedule(channel.id)
  await ScheduleModel.update(occupied.id, { schedule_time: occupiedHour.toISOString(), status: 'scheduled' })

  const { schedule: failed } = await setupSchedule(channel.id)
  const originalTime = failed.schedule_time
  await PublishService.executePublish(failed.id, null)
  const review = await FailureReviewModel.findPendingByScheduleId(failed.id)
  assert.ok(review)

  const dupTime = new Date(occupiedHour.getTime() + 10 * 60 * 1000).toISOString()
  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '重复排期', 'reschedule', dupTime),
    (err: { code?: string }) => err.code === 'DUPLICATE_SCHEDULE',
    '同一渠道同一小时重复排期应被拒绝',
  )

  await assertReviewStillPending(review!.id, failed.id, 'failed', originalTime)

  const occupiedAfter = await ScheduleModel.findById(occupied.id)
  assert.equal(occupiedAfter?.status, 'scheduled', '已占用排期不应受影响')
})

test('失败复核一致性：重新发布失败时复核保持待处理，成功后才完成', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: '仍然失败' }))
  const channel = await setupChannel(5)
  const { schedule } = await setupSchedule(channel.id)

  await PublishService.executePublish(schedule.id, null)
  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '重试发布', 'republish'),
    (err: { code?: string; statusCode?: number }) =>
      err.code === 'REPUBLISH_FAILED' && err.statusCode === 409,
    '实际发布失败时应返回 REPUBLISH_FAILED 且不标记完成',
  )

  const after = await FailureReviewModel.findById(review!.id)
  assert.equal(after?.status, 'pending', '发布失败后复核应保持待处理')
  const scheduleAfterFail = await ScheduleModel.findById(schedule.id)
  assert.equal(scheduleAfterFail?.status, 'failed', '排期应保持失败状态')

  PublishService.setPublishSimulator(async () => ({ success: true }))
  const result = await PublishService.resolveFailureReview(
    review!.id,
    3,
    '渠道恢复，重新发布成功',
    'republish',
  )
  assert.equal(result.review.status, 'resolved')
  assert.equal(result.review.action_type, 'republish')
  assert.equal(result.review.handler_id, 3)

  const published = await ScheduleModel.findById(schedule.id)
  assert.equal(published?.status, 'published', '发布成功后排期应为已发布')

  const logs = await AuditLogModel.findAll({ action: 'failure_review.resolve', target_id: review!.id })
  assert.equal(logs.total, 1, '成功路径应恰好写入一条处理审计')
})

test('失败复核一致性：人工发布处理成功落库，重复处理被拒', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: 'x' }))
  const channel = await setupChannel(5)
  const { schedule } = await setupSchedule(channel.id)
  await PublishService.executePublish(schedule.id, null)
  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  const result = await PublishService.resolveFailureReview(
    review!.id,
    3,
    '已联系渠道方人工线下发布完成',
    'manual_publish',
  )
  assert.equal(result.review.status, 'resolved')
  assert.equal(result.review.handler_id, 3)
  assert.equal(result.review.conclusion, '已联系渠道方人工线下发布完成')

  const scheduleAfter = await ScheduleModel.findById(schedule.id)
  assert.equal(scheduleAfter?.status, 'failed', '人工处理不应改动排期状态')

  await assert.rejects(
    () => PublishService.resolveFailureReview(review!.id, 3, '再次处理', 'manual_publish'),
    (err: { code?: string }) => err.code === 'FAILURE_REVIEW_ALREADY_RESOLVED',
    '已处理复核不能重复处理',
  )

  const logs = await AuditLogModel.findAll({ action: 'failure_review.resolve', target_id: review!.id })
  assert.equal(logs.total, 1)
})

test('失败复核一致性：审计写入失败时业务变更回滚，不视为成功', async () => {
  PublishService.setPublishSimulator(async () => ({ success: false, error: 'x' }))
  const channel = await setupChannel(5)
  const { schedule } = await setupSchedule(channel.id)
  await PublishService.executePublish(schedule.id, null)
  const review = await FailureReviewModel.findPendingByScheduleId(schedule.id)
  assert.ok(review)

  // 故障注入：审计表写入抛错，模拟审计库不可用
  const originalPrepare = db.prepare.bind(db)
  db.prepare = ((sql: string, ...rest: unknown[]) => {
    if (typeof sql === 'string' && sql.includes('INSERT INTO audit_logs')) {
      throw new Error('审计库写入失败')
    }
    return originalPrepare(sql, ...rest)
  }) as typeof db.prepare

  try {
    await assert.rejects(
      () => PublishService.resolveFailureReview(review!.id, 3, '审计失败回滚验证', 'manual_publish'),
      /审计库写入失败/,
      '审计写入失败应向上抛出错误，接口不视为成功',
    )
  } finally {
    db.prepare = originalPrepare
  }

  const after = await FailureReviewModel.findById(review!.id)
  assert.equal(after?.status, 'pending', '审计失败后复核应回滚为待处理')
  assert.equal(after?.handler_id, null)
  assert.equal(after?.conclusion, null)

  const scheduleAfter = await ScheduleModel.findById(schedule.id)
  assert.equal(scheduleAfter?.status, 'failed', '排期状态应保持原样')

  const logs = await AuditLogModel.findAll({ action: 'failure_review.resolve', target_id: review!.id })
  assert.equal(logs.total, 0, '审计失败不应残留处理记录')
})
