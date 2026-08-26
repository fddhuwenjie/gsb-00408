import { createError } from '../types/index.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import AuditLogModel from '../models/AuditLog.js'
import type { ChannelHealth } from '../../../shared/types.js'

export interface HealthCheckResult {
  healthy: boolean
  reason?: string
  code?: string
  health: ChannelHealth | null
}

async function ensureHealth(channelId: number): Promise<ChannelHealth> {
  const health = await ChannelHealthModel.findByChannelId(channelId)
  if (health) return health
  return ChannelHealthModel.create({ channel_id: channelId })
}

async function writeAudit(
  operatorId: number | null | undefined,
  action: string,
  targetType: string,
  targetId: number,
  detail?: unknown,
): Promise<void> {
  try {
    await AuditLogModel.create({
      operator_id: operatorId ?? null,
      action,
      target_type: targetType,
      target_id: targetId,
      detail,
    })
  } catch (error) {
    console.error('[HealthService] 审计日志写入失败:', error)
  }
}

export async function reportHeartbeat(
  channelId: number,
  operatorId?: number | null,
  options?: { status?: 'ok' | 'fail'; message?: string },
): Promise<{ health: ChannelHealth; degraded: boolean }> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  await ensureHealth(channelId)

  if (options?.status === 'fail') {
    const reason = options.message || '渠道心跳报告异常'
    const failed = await ChannelHealthModel.recordPublishFailure(channelId, reason)
    await ChannelHealthModel.recalculate(channelId)
    const degraded = await degradeIfThresholdReached(channelId, reason, operatorId ?? null)
    await writeAudit(operatorId, 'channel.heartbeat_fail', 'channel', channelId, {
      channel_name: channel.name,
      reason,
      degraded,
    })
    return { health: failed!, degraded }
  }

  const health = await ChannelHealthModel.recordHeartbeat(channelId)
  await writeAudit(operatorId, 'channel.heartbeat', 'channel', channelId, {
    channel_name: channel.name,
    recovered: channel.status === 'paused',
  })
  return { health: health!, degraded: false }
}

export async function checkBeforePublish(channelId: number): Promise<HealthCheckResult> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    return { healthy: false, reason: '渠道不存在', code: 'CHANNEL_NOT_FOUND', health: null }
  }

  const health = await ChannelHealthModel.findByChannelId(channelId)

  if (channel.status === 'inactive') {
    return { healthy: false, reason: '渠道未启用', code: 'CHANNEL_INACTIVE', health }
  }

  if (channel.status === 'paused' || health?.degraded_at) {
    return {
      healthy: false,
      reason: '渠道因连续发布失败已自动降级暂停，任务转入待复核',
      code: 'CHANNEL_DEGRADED',
      health,
    }
  }

  return { healthy: true, health: health ?? null }
}

export async function handlePublishSuccess(
  channelId: number,
  operatorId?: number | null,
): Promise<ChannelHealth | null> {
  await ensureHealth(channelId)
  const health = await ChannelHealthModel.recordPublishSuccess(channelId)
  await ChannelHealthModel.recalculate(channelId)
  await writeAudit(operatorId, 'channel.publish_success', 'channel', channelId, {
    consecutive_failures: 0,
  })
  return health
}

export async function handlePublishFailure(
  channelId: number,
  reason: string,
  operatorId?: number | null,
): Promise<{ health: ChannelHealth | null; degraded: boolean }> {
  await ensureHealth(channelId)
  const health = await ChannelHealthModel.recordPublishFailure(channelId, reason)
  await ChannelHealthModel.recalculate(channelId)
  const degraded = await degradeIfThresholdReached(channelId, reason, operatorId ?? null)
  await writeAudit(operatorId, degraded ? 'channel.degrade' : 'channel.publish_failure', 'channel', channelId, {
    channel_id: channelId,
    reason,
    consecutive_failures: health?.consecutive_failures ?? 1,
    failure_threshold: health?.failure_threshold ?? 3,
    degraded,
  })
  return { health, degraded }
}

export async function degradeIfThresholdReached(
  channelId: number,
  reason: string,
  operatorId?: number | null,
): Promise<boolean> {
  const health = await ChannelHealthModel.findByChannelId(channelId)
  if (!health) return false

  const channel = await ChannelModel.findById(channelId)
  if (!channel) return false

  if (channel.status === 'paused') return true
  if (health.consecutive_failures < health.failure_threshold) return false

  await ChannelModel.updateStatus(channelId, 'paused')
  await ChannelHealthModel.markDegraded(channelId)

  await writeAudit(operatorId ?? null, 'channel.degrade', 'channel', channelId, {
    channel_name: channel.name,
    reason,
    consecutive_failures: health.consecutive_failures,
    failure_threshold: health.failure_threshold,
  })

  console.warn(
    `[HealthService] 渠道 ${channel.name}(${channelId}) 连续失败 ${health.consecutive_failures} 次达到阈值 ${health.failure_threshold}，已自动降级暂停`,
  )
  return true
}

export async function resumeChannel(
  channelId: number,
  operatorId: number,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (channel.status !== 'paused') {
    throw createError('渠道未处于降级暂停状态，无需恢复', 400, 'CHANNEL_NOT_DEGRADED')
  }

  const health = await ChannelHealthModel.findByChannelId(channelId)
  if (!health) {
    throw createError('渠道健康记录不存在', 404, 'CHANNEL_HEALTH_NOT_FOUND')
  }

  const heartbeatRecovered =
    health.consecutive_failures === 0 &&
    !!health.last_heartbeat_at &&
    (!health.degraded_at || health.last_heartbeat_at >= health.degraded_at)

  if (!heartbeatRecovered) {
    throw createError(
      '渠道心跳尚未恢复，请等待渠道重新上报心跳后再恢复启用',
      400,
      'CHANNEL_HEARTBEAT_NOT_RECOVERED',
    )
  }

  await ChannelModel.updateStatus(channelId, 'active')
  const updated = await ChannelHealthModel.clearDegraded(channelId)

  await writeAudit(operatorId, 'channel.resume', 'channel', channelId, {
    channel_name: channel.name,
  })

  return updated!
}

export async function updateFailureThreshold(
  channelId: number,
  threshold: number,
  operatorId: number,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) {
    throw createError('降级阈值必须为 1-100 之间的整数', 400, 'INVALID_THRESHOLD')
  }

  await ensureHealth(channelId)
  const updated = await ChannelHealthModel.updateByChannelId(channelId, {
    failure_threshold: threshold,
  })

  await writeAudit(operatorId, 'channel.update_threshold', 'channel', channelId, {
    channel_name: channel.name,
    failure_threshold: threshold,
  })

  return updated!
}

export async function getDegradedChannels(): Promise<ChannelHealth[]> {
  return ChannelHealthModel.findDegraded()
}

export default {
  reportHeartbeat,
  checkBeforePublish,
  handlePublishSuccess,
  handlePublishFailure,
  degradeIfThresholdReached,
  resumeChannel,
  updateFailureThreshold,
  getDegradedChannels,
}
