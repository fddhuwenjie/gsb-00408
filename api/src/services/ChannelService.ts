import db from '../db/index.js'
import { createError } from '../types/index.js'
import ChannelModel from '../models/Channel.js'
import ChannelHealthModel from '../models/ChannelHealth.js'
import ScheduleModel from '../models/Schedule.js'
import type {
  Channel,
  ChannelHealth,
  PaginationParams,
  RateLimitStatus,
  ScheduleRiskWarning,
} from '../../../shared/types.js'

interface ChannelStatus {
  id: number
  name: string
  type: string
  status: 'active' | 'inactive'
  today_schedules: number
  total_schedules: number
  success_rate: number
}

export async function getChannelList(
  params?: PaginationParams & {
    status?: 'active' | 'inactive'
    type?: string
  },
): Promise<Channel[]> {
  if (params?.status) {
    const result = await ChannelModel.findByStatus(params.status, params)
    return result.items
  }

  if (params?.type) {
    const result = await ChannelModel.findByType(params.type, params)
    return result.items
  }

  const result = await ChannelModel.findAll(params)
  return result.items
}

export async function addChannel(
  data: {
    name: string
    type: string
    status?: 'active' | 'inactive'
    config?: string
  },
): Promise<Channel> {
  if (!data.name || data.name.trim().length === 0) {
    throw createError('渠道名称不能为空', 400, 'EMPTY_NAME')
  }

  if (!data.type || data.type.trim().length === 0) {
    throw createError('渠道类型不能为空', 400, 'EMPTY_TYPE')
  }

  const existingChannel = await ChannelModel.findByName(data.name.trim())
  if (existingChannel) {
    throw createError('渠道名称已存在', 400, 'NAME_EXISTS')
  }

  const channel = await ChannelModel.create({
    name: data.name.trim(),
    type: data.type.trim(),
    status: data.status || 'active',
    config: data.config,
  })

  await ChannelHealthModel.create({ channel_id: channel.id })

  return channel
}

export async function updateChannel(
  channelId: number,
  data: {
    name?: string
    type?: string
    status?: 'active' | 'inactive'
    config?: string
  },
): Promise<Channel> {
  const channel = await ChannelModel.findById(channelId)
  
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  if (data.name && data.name.trim().length === 0) {
    throw createError('渠道名称不能为空', 400, 'EMPTY_NAME')
  }

  if (data.type && data.type.trim().length === 0) {
    throw createError('渠道类型不能为空', 400, 'EMPTY_TYPE')
  }

  if (data.name && data.name.trim() !== channel.name) {
    const existingChannel = await ChannelModel.findByName(data.name.trim())
    if (existingChannel && existingChannel.id !== channelId) {
      throw createError('渠道名称已存在', 400, 'NAME_EXISTS')
    }
  }

  const updatedChannel = await ChannelModel.update(channelId, {
    name: data.name?.trim(),
    type: data.type?.trim(),
    status: data.status,
    config: data.config,
  })

  if (!updatedChannel) {
    throw createError('更新渠道失败', 500, 'UPDATE_FAILED')
  }

  return updatedChannel
}

export async function deleteChannel(
  channelId: number,
): Promise<void> {
  const channel = await ChannelModel.findById(channelId)
  
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const schedulesResult = await ScheduleModel.findByChannelIdAndTimeRange(
    channelId,
    new Date(0).toISOString(),
    new Date().toISOString(),
    { page: 1, pageSize: 1 },
  )

  if (schedulesResult.total > 0) {
    throw createError('渠道存在排期记录，无法删除', 400, 'HAS_SCHEDULES')
  }

  const success = await ChannelModel.remove(channelId)
  if (!success) {
    throw createError('删除渠道失败', 500, 'DELETE_FAILED')
  }
}

export async function getChannelStatus(): Promise<ChannelStatus[]> {
  const channels = await ChannelModel.findActiveChannels()
  const today = new Date()
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

  const statusPromises = channels.map(async (channel) => {
    const todaySchedulesResult = await ScheduleModel.findByChannelIdAndTimeRange(
      channel.id,
      startOfDay,
      endOfDay,
      { page: 1, pageSize: 1000 },
    )

    const allSchedulesResult = await ScheduleModel.findByChannelIdAndTimeRange(
      channel.id,
      new Date(0).toISOString(),
      new Date().toISOString(),
      { page: 1, pageSize: 10000 },
    )

    const scheduleIds = allSchedulesResult.items.map((s) => s.id)
    let successRate = 0

    if (scheduleIds.length > 0) {
      const placeholders = scheduleIds.map(() => '?').join(', ')
      const publishStatsSql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count
        FROM publish_records
        WHERE schedule_id IN (${placeholders})
      `
      const stats = db.prepare(publishStatsSql).get(...scheduleIds) as { total: number; success_count: number }
      
      if (stats.total > 0) {
        successRate = stats.success_count / stats.total
      }
    }

    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      status: channel.status,
      today_schedules: todaySchedulesResult.total,
      total_schedules: allSchedulesResult.total,
      success_rate: successRate,
    }
  })

  return Promise.all(statusPromises)
}

export async function getChannelDetail(
  channelId: number,
): Promise<Channel> {
  const channel = await ChannelModel.findById(channelId)
  
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  return channel
}

export async function getChannelHealthList(
  params?: PaginationParams,
): Promise<ChannelHealth[]> {
  const result = await ChannelHealthModel.findAll(params)
  return result.items
}

export async function getChannelHealth(
  channelId: number,
): Promise<ChannelHealth> {
  const health = await ChannelHealthModel.findByChannelId(channelId)
  if (health) return health
  return ChannelHealthModel.create({ channel_id: channelId })
}

export async function updateChannelHealth(
  channelId: number,
  data: {
    success_rate?: number
    last_failure_reason?: string | null
    rate_limit_status?: RateLimitStatus
    responsible_person?: string | null
  },
): Promise<ChannelHealth> {
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  const updated = await ChannelHealthModel.updateByChannelId(channelId, data)
  if (!updated) {
    throw createError('更新渠道健康信息失败', 500, 'UPDATE_FAILED')
  }
  return updated
}

export async function refreshChannelHealth(
  channelId: number,
): Promise<ChannelHealth | null> {
  await ChannelHealthModel.recalculate(channelId)
  return ChannelHealthModel.findByChannelId(channelId)
}

export async function assessChannelRisk(
  channelId: number,
): Promise<ScheduleRiskWarning> {
  const health = await getChannelHealth(channelId)
  const channel = await ChannelModel.findById(channelId)
  if (!channel) {
    throw createError('渠道不存在', 404, 'CHANNEL_NOT_FOUND')
  }

  let risk_level: 'low' | 'medium' | 'high' = 'low'
  const reasons: string[] = []

  if (health.rate_limit_status === 'blocked' || health.success_rate < 0.5) {
    risk_level = 'high'
  } else if (health.rate_limit_status === 'limited' || health.success_rate < 0.8) {
    risk_level = 'medium'
  }

  if (health.rate_limit_status === 'blocked') {
    reasons.push('渠道接口已被封禁')
  }
  if (health.rate_limit_status === 'limited') {
    reasons.push('渠道接口已被限流')
  }
  if (health.success_rate < 0.5) {
    reasons.push('成功率低于50%')
  } else if (health.success_rate < 0.8) {
    reasons.push('成功率低于80%')
  }

  return {
    channel_id: channelId,
    channel_name: channel.name,
    risk_level,
    reasons,
  }
}

export async function getHighRiskChannels(): Promise<ScheduleRiskWarning[]> {
  const allHealth = await ChannelHealthModel.findAll({ page: 1, pageSize: 10000 })
  const warnings: ScheduleRiskWarning[] = []

  for (const health of allHealth.items) {
    const warning = await assessChannelRisk(health.channel_id)
    if (warning.risk_level !== 'low') {
      warnings.push(warning)
    }
  }

  return warnings
}

export default {
  getChannelList,
  addChannel,
  updateChannel,
  deleteChannel,
  getChannelStatus,
  getChannelDetail,
  getChannelHealthList,
  getChannelHealth,
  updateChannelHealth,
  refreshChannelHealth,
  assessChannelRisk,
  getHighRiskChannels,
}
