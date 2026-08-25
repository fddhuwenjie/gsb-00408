import db from '../db/index.js'
import type { Content } from '../../../shared/types.js'

export async function validateSensitiveWordsHandled(
  contentId: number,
): Promise<{ valid: boolean; error?: string }> {
  const content = db
    .prepare('SELECT id, status, scan_version FROM contents WHERE id = ?')
    .get(contentId) as Content | undefined

  if (!content) {
    return { valid: false, error: '内容不存在' }
  }

  const unresolvedHits = db
    .prepare(
      'SELECT COUNT(*) as count FROM scan_records WHERE content_id = ? AND version >= ?',
    )
    .get(contentId, content.scan_version) as { count: number }

  if (unresolvedHits.count > 0) {
    return { valid: false, error: '存在未处理的敏感词命中记录' }
  }

  return { valid: true }
}

export async function validateScheduleTime(
  scheduleTime: string,
): Promise<{ valid: boolean; error?: string }> {
  const scheduleDate = new Date(scheduleTime)
  const now = new Date()

  if (isNaN(scheduleDate.getTime())) {
    return { valid: false, error: '排期时间格式无效' }
  }

  if (scheduleDate <= now) {
    return { valid: false, error: '排期时间必须晚于当前时间' }
  }

  return { valid: true }
}

export async function validateDuplicateSchedule(
  channelId: number,
  scheduleTime: string,
  excludeId?: number,
): Promise<{ valid: boolean; error?: string }> {
  const scheduleDate = new Date(scheduleTime)
  const startHour = new Date(scheduleDate)
  startHour.setMinutes(0, 0, 0)
  const endHour = new Date(startHour)
  endHour.setHours(startHour.getHours() + 1)

  let query = `
    SELECT COUNT(*) as count FROM schedules 
    WHERE channel_id = ? 
    AND schedule_time >= ? 
    AND schedule_time < ?
    AND status != 'withdrawn'
  `
  const params: (number | string)[] = [channelId, startHour.toISOString(), endHour.toISOString()]

  if (excludeId) {
    query += ' AND id != ?'
    params.push(excludeId)
  }

  const result = db.prepare(query).get(...params) as { count: number }

  if (result.count > 0) {
    return { valid: false, error: '同一渠道同一小时内已有排期' }
  }

  return { valid: true }
}

export async function validatePublishedContentDeletable(
  contentId: number,
): Promise<{ valid: boolean; error?: string }> {
  const content = db
    .prepare('SELECT id, status FROM contents WHERE id = ?')
    .get(contentId) as Content | undefined

  if (!content) {
    return { valid: false, error: '内容不存在' }
  }

  if (content.status === 'published') {
    const activeSchedules = db
      .prepare(
        `SELECT COUNT(*) as count FROM schedules 
         WHERE content_id = ? AND status IN ('scheduled', 'published')`,
      )
      .get(contentId) as { count: number }

    if (activeSchedules.count > 0) {
      return { valid: false, error: '已发布内容存在有效排期，无法删除' }
    }
  }

  return { valid: true }
}

export async function validateReviewOpinion(
  decision: string,
  opinion: string,
): Promise<{ valid: boolean; error?: string }> {
  if (decision === 'reject' && (!opinion || opinion.trim().length === 0)) {
    return { valid: false, error: '驳回时必须填写复核意见' }
  }

  return { valid: true }
}
