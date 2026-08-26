import AuditLogModel from '../models/AuditLog.js'
import type { AuditLog, PaginationParams, PaginationResult, AuditTargetType } from '../../../shared/types.js'

/**
 * 统一审计服务。健康检查、排期、失败复核等敏感操作都通过此服务落库，
 * 保证所有变更共享同一套审计记录，便于全局追溯。
 */
export async function record(params: {
  operatorId: number | null
  action: string
  targetType: AuditTargetType | string
  targetId?: number | null
  detail?: string | Record<string, unknown> | null
}): Promise<AuditLog> {
  return AuditLogModel.create({
    operator_id: params.operatorId,
    action: params.action,
    target_type: params.targetType,
    target_id: params.targetId ?? null,
    detail: params.detail ?? null,
  })
}

export async function list(
  params?: PaginationParams & {
    target_type?: string
    target_id?: number
    operator_id?: number
    action?: string
  },
): Promise<PaginationResult<AuditLog>> {
  return AuditLogModel.findAll(params)
}

export default {
  record,
  list,
}
