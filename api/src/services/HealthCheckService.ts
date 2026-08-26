import { createError } from '../types/index.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import ScheduleModel from '../models/Schedule.js'
import AuditService from './AuditService.js'
import type { ChannelHealth } from '../../../shared/types.js'

export interface PublishableResult {
  publishable: boolean
  reason?: string
  health: ChannelHealth
}

/**
 * 获取渠道健康记录，不存在则按默认值创建。
 */
async function ensureHealth(channelId: number): Promise<ChannelHealth> {
  const existing = await ChannelHealthModel.findByChannelId(channelId)
  if (existing) return existing
  return ChannelHealthModel.create({ channel_id: channelId })
}

/**
 * 发布前的渠道健康检查。
 * - 关闭健康检查的渠道：直接放行（视为人工托管）。
 * - 已降级或渠道停用：拒绝发布。
 */
export async function checkChannelPublishable(channelId: number): Promise<PublishableResult> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const health = await ensureHealth(channelId)

  // 降级与渠道停用是硬性阻断：即使关闭健康检查也不得绕过。
  // is_health_check_enabled 只影响失败计数与自动降级（见 registerFailure），不影响此处放行判断。
  if (health.is_degraded) {
    return { publishable: false, reason: '渠道已降级并暂停发布', health }
  }

  if (channel.status !== 'active') {
    return { publishable: false, reason: '渠道未启用', health }
  }

  return { publishable: true, health }
}

/**
 * 记录一次发布失败并在达到阈值时自动降级。
 * 关闭健康检查时：不累计失败计数、不自动降级（但不影响既有降级/停用的硬阻断）。
 * 触发降级时：暂停渠道、将排期转入待复核、写入审计。
 */
export async function registerFailure(
  channelId: number,
  scheduleId: number | null,
  reason?: string | null,
): Promise<{ degraded: boolean; health: ChannelHealth }> {
  const before = await ensureHealth(channelId)

  // 健康检查关闭：停止失败计数与自动降级，直接返回当前状态
  if (!before.is_health_check_enabled) {
    return { degraded: false, health: before }
  }

  const updated = await ChannelHealthModel.incrementFailure(channelId, reason ?? null)
  const health = updated ?? before

  const reachedThreshold =
    health.consecutive_failures >= health.failure_threshold && !health.is_degraded

  if (!reachedThreshold) {
    return { degraded: false, health }
  }

  return degradeChannel(
    channelId,
    null,
    `连续失败 ${health.consecutive_failures} 次达到阈值 ${health.failure_threshold}`,
    scheduleId,
    reason ?? null,
  ).then((degradedHealth) => ({ degraded: true, health: degradedHealth }))
}

/**
 * 记录一次发布成功：清零连续失败计数。
 */
export async function registerSuccess(channelId: number): Promise<void> {
  await ChannelHealthModel.resetFailures(channelId)
}

/**
 * 降级并暂停渠道；若指定排期则一并转入待复核。operatorId 为 null 表示系统自动触发。
 */
export async function degradeChannel(
  channelId: number,
  operatorId: number | null,
  reason: string,
  scheduleId?: number | null,
  failureReason?: string | null,
): Promise<ChannelHealth> {
  const health = await ensureHealth(channelId)
  if (!health) {
    throw createError('渠道健康记录不存在', 404, 'HEALTH_NOT_FOUND')
  }

  const updated = await ChannelHealthModel.updateByChannelId(channelId, {
    is_degraded: true,
    degraded_at: new Date().toISOString(),
    last_failure_reason: failureReason ?? health.last_failure_reason,
    rate_limit_status: 'blocked',
  })

  // 暂停渠道，阻止后续排期继续发往该渠道
  await ChannelModel.updateStatus(channelId, 'inactive')

  const affectedSchedules: number[] = []
  if (scheduleId) {
    const schedule = await ScheduleModel.findById(scheduleId)
    if (schedule && ['scheduled', 'pending', 'approved', 'failed'].includes(schedule.status)) {
      await ScheduleModel.updateStatus(scheduleId, 'pending_review')
      affectedSchedules.push(scheduleId)
    }
  }

  await AuditService.record({
    operatorId,
    action: operatorId === null ? 'channel_auto_degrade' : 'channel_degrade',
    targetType: 'channel_health',
    targetId: channelId,
    detail: {
      reason,
      failure_reason: failureReason ?? null,
      affected_schedules: affectedSchedules,
    },
  })

  return updated ?? health
}

/**
 * 人工恢复渠道。前置条件：健康检查开启、已降级、且恢复心跳晚于降级时间。
 */
export async function recoverChannel(
  channelId: number,
  operatorId: number,
): Promise<ChannelHealth> {
  const health = await ensureHealth(channelId)

  if (!health.is_degraded) {
    throw createError('渠道未处于降级状态，无需恢复', 400, 'NOT_DEGRADED')
  }

  if (!health.last_heartbeat_at) {
    throw createError('渠道尚未恢复心跳，无法恢复', 400, 'NO_HEARTBEAT')
  }

  if (health.degraded_at && new Date(health.last_heartbeat_at) <= new Date(health.degraded_at)) {
    throw createError('最近心跳早于降级时间，请等待渠道恢复心跳后再试', 400, 'STALE_HEARTBEAT')
  }

  const updated = await ChannelHealthModel.updateByChannelId(channelId, {
    is_degraded: false,
    degraded_at: null,
    consecutive_failures: 0,
    rate_limit_status: 'normal',
  })

  await ChannelModel.updateStatus(channelId, 'active')

  await AuditService.record({
    operatorId,
    action: 'channel_recover',
    targetType: 'channel_health',
    targetId: channelId,
    detail: { last_heartbeat_at: health.last_heartbeat_at },
  })

  return updated ?? health
}

/**
 * 记录一次成功心跳，刷新心跳时间并清零连续失败计数。
 */
export async function heartbeat(
  channelId: number,
  operatorId: number,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  await ensureHealth(channelId)
  const updated = await ChannelHealthModel.recordHeartbeat(channelId)

  await AuditService.record({
    operatorId,
    action: 'channel_heartbeat',
    targetType: 'channel_health',
    targetId: channelId,
    detail: { at: updated?.last_heartbeat_at ?? null },
  })

  return updated as ChannelHealth
}

/**
 * 调整健康检查开关与降级阈值。
 */
export async function updateHealthConfig(
  channelId: number,
  operatorId: number,
  config: { is_health_check_enabled?: boolean; failure_threshold?: number },
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (config.failure_threshold !== undefined && config.failure_threshold < 1) {
    throw createError('降级阈值必须大于等于 1', 400, 'INVALID_THRESHOLD')
  }

  await ensureHealth(channelId)
  const updated = await ChannelHealthModel.updateByChannelId(channelId, {
    is_health_check_enabled: config.is_health_check_enabled,
    failure_threshold: config.failure_threshold,
  })

  await AuditService.record({
    operatorId,
    action: 'channel_health_config',
    targetType: 'channel_health',
    targetId: channelId,
    detail: config as Record<string, unknown>,
  })

  return updated as ChannelHealth
}

export default {
  checkChannelPublishable,
  registerFailure,
  registerSuccess,
  degradeChannel,
  recoverChannel,
  heartbeat,
  updateHealthConfig,
}
