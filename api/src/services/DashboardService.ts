import { db } from '../db/index.js'
import type { DashboardStats } from '../../../shared/types.js'

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const pendingReviewResult = db.prepare("SELECT COUNT(*) as count FROM contents WHERE status = 'pending_review'").get() as { count: number }
  const todayScheduleResult = db.prepare("SELECT COUNT(*) as count FROM schedules WHERE DATE(schedule_time) = ?").get(todayStr) as { count: number }
  const sensitiveHitResult = db.prepare("SELECT COUNT(DISTINCT content_id) as count FROM scan_records").get() as { count: number }
  const totalPublishResult = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success FROM publish_records").get() as { total: number; success: number }
  const highRiskResult = db.prepare("SELECT COUNT(*) as count FROM channel_health WHERE rate_limit_status = 'blocked' OR success_rate < 0.5").get() as { count: number }
  const pendingFailureReviewResult = db.prepare("SELECT COUNT(*) as count FROM failure_reviews WHERE status = 'pending'").get() as { count: number }

  const successRate = (totalPublishResult.total || 0) > 0
    ? Math.round(((totalPublishResult.success || 0) / totalPublishResult.total) * 1000) / 10
    : 0

  return {
    pending_review_count: pendingReviewResult.count || 0,
    today_schedule_count: todayScheduleResult.count || 0,
    sensitive_hit_count: sensitiveHitResult.count || 0,
    publish_success_rate: successRate,
    high_risk_channel_count: highRiskResult.count || 0,
    pending_failure_review_count: pendingFailureReviewResult.count || 0,
  }
}
