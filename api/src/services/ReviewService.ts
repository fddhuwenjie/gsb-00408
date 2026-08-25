import db, { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import ReviewRecordModel from '../models/ReviewRecord.js'
import ReviewAuditTrailModel from '../models/ReviewAuditTrail.js'
import ContentModel from '../models/Content.js'
import { validateReviewOpinion } from '../utils/validator.js'
import type {
  ReviewRecord,
  ReviewAuditTrail,
  Content,
  PaginationParams,
  PaginationResult,
  ReviewDecision,
} from '../../../shared/types.js'

export async function getReviewQueue(
  params?: PaginationParams & {
    type?: string
  },
): Promise<PaginationResult<Content>> {
  const page = params?.page || 1
  const pageSize = params?.pageSize || 10
  const offset = (page - 1) * pageSize

  let countSql = 'SELECT COUNT(*) as total FROM contents WHERE status = ?'
  let querySql = `
    SELECT id, creator_id, type, title, content, thumbnail_url, status, scan_version, created_at, updated_at
    FROM contents
    WHERE status = ?
  `
  const countParams: (string | number)[] = ['pending_review']
  const queryParams: (string | number)[] = ['pending_review']

  if (params?.type) {
    countSql += ' AND type = ?'
    querySql += ' AND type = ?'
    countParams.push(params.type)
    queryParams.push(params.type)
  }

  querySql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  queryParams.push(pageSize, offset)

  const countStmt = db.prepare(countSql)
  const { total } = countStmt.get(...countParams) as { total: number }

  const stmt = db.prepare(querySql)
  const items = stmt.all(...queryParams) as Content[]

  return { items, total, page, pageSize }
}

export async function approveContent(
  contentId: number,
  reviewerId: number,
  opinion: string,
): Promise<ReviewRecord> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.status !== 'pending_review') {
    throw createError('内容状态不允许复核', 400, 'INVALID_STATUS')
  }

  const opinionValid = await validateReviewOpinion('approve', opinion)
  if (!opinionValid.valid) {
    throw createError(opinionValid.error!, 400, 'INVALID_OPINION')
  }

  return transaction(async (tx) => {
    const reviewRecord = await ReviewRecordModel.create({
      content_id: contentId,
      reviewer_id: reviewerId,
      decision: 'approve',
      opinion: opinion || '',
    })

    await ReviewAuditTrailModel.create({
      review_record_id: reviewRecord.id,
      operator_id: reviewerId,
      action: 'create',
      previous_decision: null,
      new_decision: 'approve',
      opinion: opinion || '',
      opinion_version: 1,
    })

    await ContentModel.update(contentId, {
      status: 'review_approved',
    })

    const scheduleStmt = tx.prepare(`
      UPDATE schedules
      SET status = 'approved'
      WHERE content_id = ? AND status = 'pending'
    `)
    scheduleStmt.run(contentId)

    const pendingSchedulesStmt = tx.prepare(`
      SELECT id FROM schedules WHERE content_id = ? AND status = 'approved'
    `)
    const pendingSchedules = pendingSchedulesStmt.all(contentId) as { id: number }[]

    const now = new Date().toISOString()
    const publishRecordStmt = tx.prepare(`
      INSERT INTO publish_records (schedule_id, status, created_at)
      VALUES (?, 'pending', ?)
    `)

    for (const schedule of pendingSchedules) {
      publishRecordStmt.run(schedule.id, now)
    }

    return reviewRecord
  })
}

export async function rejectContent(
  contentId: number,
  reviewerId: number,
  opinion: string,
): Promise<ReviewRecord> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.status !== 'pending_review') {
    throw createError('内容状态不允许复核', 400, 'INVALID_STATUS')
  }

  const opinionValid = await validateReviewOpinion('reject', opinion)
  if (!opinionValid.valid) {
    throw createError(opinionValid.error!, 400, 'INVALID_OPINION')
  }

  return transaction(async (tx) => {
    const reviewRecord = await ReviewRecordModel.create({
      content_id: contentId,
      reviewer_id: reviewerId,
      decision: 'reject',
      opinion,
    })

    await ReviewAuditTrailModel.create({
      review_record_id: reviewRecord.id,
      operator_id: reviewerId,
      action: 'create',
      previous_decision: null,
      new_decision: 'reject',
      opinion,
      opinion_version: 1,
    })

    await ContentModel.update(contentId, {
      status: 'review_rejected',
    })

    const scheduleStmt = tx.prepare(`
      UPDATE schedules
      SET status = 'rejected'
      WHERE content_id = ? AND status = 'pending'
    `)
    scheduleStmt.run(contentId)

    return reviewRecord
  })
}

export async function getReviewRecords(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewRecord>> {
  const content = await ContentModel.findById(contentId)
  
  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  return ReviewRecordModel.findByContentId(contentId, params)
}

export async function getReviewerRecords(
  reviewerId: number,
  params?: PaginationParams & {
    decision?: ReviewDecision
  },
): Promise<PaginationResult<ReviewRecord>> {
  if (params?.decision) {
    return ReviewRecordModel.findByReviewerIdAndDecision(
      reviewerId,
      params.decision,
      params,
    )
  }

  return ReviewRecordModel.findByReviewerId(reviewerId, params)
}

export async function overrideReview(
  contentId: number,
  operatorId: number,
  newDecision: 'approve' | 'reject',
  opinion: string,
): Promise<ReviewRecord> {
  const content = await ContentModel.findById(contentId)

  if (!content) {
    throw createError('内容不存在', 404, 'CONTENT_NOT_FOUND')
  }

  if (content.status !== 'review_approved' && content.status !== 'review_rejected') {
    throw createError('内容状态不允许覆核', 400, 'INVALID_STATUS')
  }

  const latestRecord = await ReviewRecordModel.getLatestByContentId(contentId)

  if (!latestRecord) {
    throw createError('未找到复核记录', 404, 'REVIEW_RECORD_NOT_FOUND')
  }

  const previousDecision = latestRecord.decision
  const newVersion = latestRecord.opinion_version + 1

  return transaction(async (tx) => {
    const newReviewRecord = await ReviewRecordModel.create({
      content_id: contentId,
      reviewer_id: operatorId,
      decision: newDecision,
      opinion,
      opinion_version: newVersion,
    })

    await ReviewAuditTrailModel.create({
      review_record_id: newReviewRecord.id,
      operator_id: operatorId,
      action: 'override',
      previous_decision: previousDecision,
      new_decision: newDecision,
      opinion,
      opinion_version: newVersion,
    })

    await ContentModel.update(contentId, {
      status: newDecision === 'approve' ? 'review_approved' : 'review_rejected',
    })

    if (newDecision === 'approve') {
      const scheduleStmt = tx.prepare(`
        UPDATE schedules
        SET status = 'scheduled'
        WHERE content_id = ? AND status = 'pending'
      `)
      scheduleStmt.run(contentId)
    } else {
      const scheduleStmt = tx.prepare(`
        UPDATE schedules
        SET status = 'rejected'
        WHERE content_id = ? AND status IN ('pending', 'scheduled')
      `)
      scheduleStmt.run(contentId)
    }

    return newReviewRecord
  })
}

export async function getReviewAuditTrail(
  contentId: number,
  params?: PaginationParams,
): Promise<PaginationResult<ReviewAuditTrail>> {
  return ReviewAuditTrailModel.findByContentId(contentId, params)
}

export default {
  getReviewQueue,
  approveContent,
  rejectContent,
  getReviewRecords,
  getReviewerRecords,
  overrideReview,
  getReviewAuditTrail,
}
