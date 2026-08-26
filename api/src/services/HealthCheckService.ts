import db, { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import AuditLogModel from '../models/AuditLog.js'
import type {
  ChannelHealth,
  AuditAction,
} from '../../../shared/types.js'

export interface HeartbeatResult {
  health: ChannelHealth
  was_degraded: boolean
}

export async function getChannelHealth(channelId: number): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }
  let health = await ChannelHealthModel.findByChannelId(channelId)
  if (!health) {
    health = await ChannelHealthModel.create({ channel_id: channelId })
  }
  return health
}

export async function getAllChannelHealth(): Promise<ChannelHealth[]> {
  const result = await ChannelHealthModel.findAll({ page: 1, pageSize: 1000 })
  return result.items
}

export async function getDegradedChannels(): Promise<ChannelHealth[]> {
  return ChannelHealthModel.findDegradedChannels()
}

export async function recordHeartbeat(
  channelId: number,
  operatorId?: number,
  ipAddress?: string,
): Promise<HeartbeatResult> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const beforeHealth = await ChannelHealthModel.findByChannelId(channelId)
  const wasDegraded = beforeHealth?.is_degraded ?? false

  const health = await ChannelHealthModel.recordHeartbeat(channelId)
  if (!health) {
    throw createError('更新心跳失败', 500, 'HEARTBEAT_FAILED')
  }

  await AuditLogModel.create({
    operator_id: operatorId ?? null,
    action: 'channel_heartbeat',
    resource_type: 'channel',
    resource_id: channelId,
    detail: wasDegraded ? `渠道 ${channel.name} 心跳恢复，已自动清除降级状态` : `渠道 ${channel.name} 心跳上报成功`,
    ip_address: ipAddress ?? null,
  })

  return { health, was_degraded: wasDegraded }
}

export async function recordPublishFailure(
  channelId: number,
  reason: string,
  scheduleId?: number,
  operatorId?: number,
  ipAddress?: string,
): Promise<{ health: ChannelHealth; degraded: boolean }> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const health = await ChannelHealthModel.recordFailure(channelId, reason)
  if (!health) {
    throw createError('记录失败状态失败', 500, 'RECORD_FAILURE_FAILED')
  }

  const degraded = health.is_degraded

  await AuditLogModel.create({
    operator_id: operatorId ?? null,
    action: 'health_check_performed',
    resource_type: 'channel',
    resource_id: channelId,
    detail: `渠道 ${channel.name} 发布失败，连续失败次数: ${health.consecutive_failures}，原因: ${reason}`,
    ip_address: ipAddress ?? null,
  })

  if (degraded) {
    await AuditLogModel.create({
      operator_id: operatorId ?? null,
      action: 'channel_degrade',
      resource_type: 'channel',
      resource_id: channelId,
      detail: `渠道 ${channel.name} 连续失败 ${health.consecutive_failures} 次达到阈值 ${health.degradation_threshold}，自动降级`,
      ip_address: ipAddress ?? null,
    })

    await movePendingSchedulesToReview(channelId, reason, operatorId, ipAddress)
  }

  if (scheduleId) {
    const existingPending = db.prepare(
      "SELECT id FROM failure_reviews WHERE schedule_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1"
    ).get(scheduleId) as { id: number } | undefined
    if (!existingPending) {
      db.prepare(`
        INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status, created_at)
        VALUES (NULL, ?, ?, 'pending', ?)
      `).run(scheduleId, `渠道${degraded ? '已降级' : '发布失败'}: ${reason}`, new Date().toISOString())
    }
  }

  return { health, degraded }
}

export async function recordPublishSuccess(
  channelId: number,
  operatorId?: number,
  ipAddress?: string,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const health = await ChannelHealthModel.recordSuccess(channelId)
  if (!health) {
    throw createError('记录成功状态失败', 500, 'RECORD_SUCCESS_FAILED')
  }

  await AuditLogModel.create({
    operator_id: operatorId ?? null,
    action: 'health_check_performed',
    resource_type: 'channel',
    resource_id: channelId,
    detail: `渠道 ${channel.name} 发布成功，已重置连续失败计数`,
    ip_address: ipAddress ?? null,
  })

  return health
}

export async function degradeChannelManually(
  channelId: number,
  reason: string,
  operatorId: number,
  ipAddress?: string,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (!reason || reason.trim().length === 0) {
    throw createError('降级原因不能为空', 400, 'EMPTY_REASON')
  }

  const health = await ChannelHealthModel.degradeChannel(channelId, reason)
  if (!health) {
    throw createError('降级渠道失败', 500, 'DEGRADE_FAILED')
  }

  await AuditLogModel.create({
    operator_id: operatorId,
    action: 'channel_degrade',
    resource_type: 'channel',
    resource_id: channelId,
    detail: `管理员手动降级渠道 ${channel.name}: ${reason}`,
    ip_address: ipAddress ?? null,
  })

  await movePendingSchedulesToReview(channelId, reason, operatorId, ipAddress)

  return health
}

export async function restoreChannel(
  channelId: number,
  operatorId: number,
  ipAddress?: string,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const health = await ChannelHealthModel.restoreChannel(channelId)
  if (!health) {
    throw createError('恢复渠道失败', 500, 'RESTORE_FAILED')
  }

  await AuditLogModel.create({
    operator_id: operatorId,
    action: 'channel_restore',
    resource_type: 'channel',
    resource_id: channelId,
    detail: `管理员恢复渠道 ${channel.name}，清除降级状态和失败计数`,
    ip_address: ipAddress ?? null,
  })

  return health
}

export async function updateHealthConfig(
  channelId: number,
  data: {
    is_health_check_enabled?: boolean
    degradation_threshold?: number
  },
  operatorId: number,
  ipAddress?: string,
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (data.degradation_threshold !== undefined) {
    if (data.degradation_threshold < 1 || data.degradation_threshold > 100) {
      throw createError('降级阈值必须在1-100之间', 400, 'INVALID_THRESHOLD')
    }
  }

  const health = await ChannelHealthModel.updateByChannelId(channelId, data)
  if (!health) {
    throw createError('更新健康配置失败', 500, 'UPDATE_CONFIG_FAILED')
  }

  const changes: string[] = []
  if (data.is_health_check_enabled !== undefined) {
    changes.push(`健康检查: ${data.is_health_check_enabled ? '启用' : '禁用'}`)
  }
  if (data.degradation_threshold !== undefined) {
    changes.push(`降级阈值: ${data.degradation_threshold}`)
  }

  await AuditLogModel.create({
    operator_id: operatorId,
    action: 'channel_health_config',
    resource_type: 'channel',
    resource_id: channelId,
    detail: `更新渠道 ${channel.name} 健康配置 - ${changes.join(', ')}`,
    ip_address: ipAddress ?? null,
  })

  return health
}

export async function checkChannelHealthBeforePublish(
  channelId: number,
): Promise<{ allowed: boolean; reason?: string; health?: ChannelHealth }> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    return { allowed: false, reason: '渠道不存在' }
  }

  if (channel.status !== 'active') {
    return { allowed: false, reason: '渠道未启用' }
  }

  let health = await ChannelHealthModel.findByChannelId(channelId)
  if (!health) {
    health = await ChannelHealthModel.create({ channel_id: channelId })
  }

  if (!health.is_health_check_enabled) {
    return { allowed: true, health }
  }

  if (health.is_degraded) {
    return {
      allowed: false,
      reason: `渠道已降级（连续失败 ${health.consecutive_failures} 次）: ${health.last_failure_reason || '未知原因'}，需等待心跳恢复或人工恢复`,
      health,
    }
  }

  return { allowed: true, health }
}

export async function movePendingSchedulesToReview(
  channelId: number,
  reason: string,
  operatorId?: number,
  ipAddress?: string,
): Promise<number> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) return 0

  const movedCount = transaction(() => {
    const now = new Date().toISOString()
    const pendingSchedules = db.prepare(`
      SELECT id FROM schedules
      WHERE channel_id = ? AND status = 'scheduled' AND schedule_time <= ?
    `).all(channelId, new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()) as { id: number }[]

    let count = 0
    for (const s of pendingSchedules) {
      db.prepare(`
        UPDATE schedules SET status = 'pending_review', updated_at = ? WHERE id = ?
      `).run(now, s.id)

      const existing = db.prepare(
        "SELECT id FROM failure_reviews WHERE schedule_id = ? AND status = 'pending'"
      ).get(s.id) as { id: number } | undefined

      if (!existing) {
        db.prepare(`
          INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status, created_at)
          VALUES (NULL, ?, ?, 'pending', ?)
        `).run(s.id, `渠道"${channel.name}"已降级: ${reason}`, now)
      }
      count++
    }
    return count
  })

  if (movedCount > 0) {
    await AuditLogModel.create({
      operator_id: operatorId ?? null,
      action: 'schedule_pending_review',
      resource_type: 'channel',
      resource_id: channelId,
      detail: `渠道 ${channel.name} 降级，${movedCount} 个待发布排期已转入待复核`,
      ip_address: ipAddress ?? null,
    })
  }

  return movedCount
}

export async function checkStaleHeartbeats(
  thresholdMinutes: number = 5,
): Promise<{ degraded: ChannelHealth[] }> {
  const staleChannels = await ChannelHealthModel.findStaleHeartbeatChannels(thresholdMinutes)
  const degraded: ChannelHealth[] = []

  for (const health of staleChannels) {
    const reason = `心跳超时（超过 ${thresholdMinutes} 分钟未收到心跳）`
    const updated = await ChannelHealthModel.degradeChannel(health.channel_id, reason)
    if (updated) {
      degraded.push(updated)
      await AuditLogModel.create({
        operator_id: null,
        action: 'channel_degrade',
        resource_type: 'channel',
        resource_id: health.channel_id,
        detail: `渠道心跳超时自动降级: ${reason}`,
        ip_address: null,
      })
      await movePendingSchedulesToReview(health.channel_id, reason)
    }
  }

  return { degraded }
}

export async function getAuditLogs(params?: {
  page?: number
  pageSize?: number
  action?: AuditAction
  resource_type?: string
}) {
  return AuditLogModel.findAll(params)
}

export default {
  getChannelHealth,
  getAllChannelHealth,
  getDegradedChannels,
  recordHeartbeat,
  recordPublishFailure,
  recordPublishSuccess,
  degradeChannelManually,
  restoreChannel,
  updateHealthConfig,
  checkChannelHealthBeforePublish,
  movePendingSchedulesToReview,
  checkStaleHeartbeats,
  getAuditLogs,
}
