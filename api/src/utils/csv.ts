import Papa from 'papaparse'
import db from '../db/index.js'
import type { PublishRecord } from '../../../shared/types.js'

interface PublishRecordCSV {
  渠道: string
  排期时间: string
  发布状态: string
  撤回原因: string
  发布时间: string
  内容标题: string
  内容类型: string
  渠道健康状态: string
  渠道成功率: string
  渠道限流状态: string
  渠道负责人: string
  失败复盘结论: string
  失败复盘处理方式: string
  复核处理人: string
  复核意见版本: string
}

export async function generatePublishRecordsCSV(
  records: PublishRecord[],
): Promise<string> {
  const csvData: PublishRecordCSV[] = await Promise.all(records.map(async (record) => {
    const channelId = record.schedule?.channel_id
    let channelHealthStatus = ''
    let channelSuccessRate = ''
    let channelRateLimit = ''
    let channelResponsible = ''

    if (channelId) {
      const healthRow = db.prepare(
        'SELECT success_rate, rate_limit_status, responsible_person FROM channel_health WHERE channel_id = ?'
      ).get(channelId) as { success_rate: number; rate_limit_status: string; responsible_person: string | null } | undefined
      if (healthRow) {
        channelHealthStatus = mapHealthStatus(healthRow.success_rate)
        channelSuccessRate = (healthRow.success_rate * 100).toFixed(1) + '%'
        channelRateLimit = mapRateLimitStatus(healthRow.rate_limit_status)
        channelResponsible = healthRow.responsible_person || ''
      }
    }

    let failureConclusion = ''
    let failureAction = ''
    if (record.id) {
      const reviewRow = db.prepare(
        'SELECT conclusion, action_type FROM failure_reviews WHERE publish_record_id = ? ORDER BY id DESC LIMIT 1'
      ).get(record.id) as { conclusion: string | null; action_type: string | null } | undefined
      if (reviewRow) {
        failureConclusion = reviewRow.conclusion || ''
        failureAction = mapFailureAction(reviewRow.action_type)
      }
    }

    let reviewerName = ''
    let opinionVersion = ''
    const contentId = record.schedule?.content?.id
    if (contentId) {
      const reviewRow = db.prepare(`
        SELECT rr.opinion_version, u.username
        FROM review_records rr
        LEFT JOIN users u ON rr.reviewer_id = u.id
        WHERE rr.content_id = ?
        ORDER BY rr.id DESC LIMIT 1
      `).get(contentId) as { opinion_version: number; username: string | null } | undefined
      if (reviewRow) {
        reviewerName = reviewRow.username || ''
        opinionVersion = String(reviewRow.opinion_version)
      }
    }

    return {
      渠道: record.schedule?.channel?.name || '',
      排期时间: record.schedule?.schedule_time || '',
      发布状态: mapPublishStatus(record.status),
      撤回原因: record.withdraw_reason || '',
      发布时间: record.publish_time || '',
      内容标题: record.schedule?.content?.title || '',
      内容类型: record.schedule?.content?.type || '',
      渠道健康状态: channelHealthStatus,
      渠道成功率: channelSuccessRate,
      渠道限流状态: channelRateLimit,
      渠道负责人: channelResponsible,
      失败复盘结论: failureConclusion,
      失败复盘处理方式: failureAction,
      复核处理人: reviewerName,
      复核意见版本: opinionVersion,
    }
  }))

  return Papa.unparse(csvData, {
    header: true,
  })
}

function mapPublishStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: '待发布',
    success: '发布成功',
    failed: '发布失败',
    withdrawn: '已撤回',
  }
  return statusMap[status] || status
}

function mapHealthStatus(successRate: number): string {
  if (successRate >= 0.8) return '健康'
  if (successRate >= 0.5) return '一般'
  return '高风险'
}

function mapRateLimitStatus(status: string): string {
  const map: Record<string, string> = {
    normal: '正常',
    limited: '限流中',
    blocked: '已阻断',
  }
  return map[status] || status
}

function mapFailureAction(action: string | null): string {
  if (!action) return ''
  const map: Record<string, string> = {
    republish: '重新发布',
    manual_publish: '转人工发布',
  }
  return map[action] || action
}
