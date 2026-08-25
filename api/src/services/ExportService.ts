import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../db/index.js'
import { createError } from '../types/index.js'
import ExportRecordModel from '../models/ExportRecord.js'
import PublishRecordModel from '../models/PublishRecord.js'
import UserModel from '../models/User.js'
import { generatePublishRecordsCSV } from '../utils/csv.js'
import type {
  ExportRecord,
  PublishRecord,
  PaginationParams,
  PaginationResult,
  PublishStatus,
  ScheduleStatus,
} from '../../../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const EXPORT_DIR = path.join(__dirname, '../../../data/exports')

async function ensureExportDir() {
  try {
    await fs.access(EXPORT_DIR)
  } catch {
    await fs.mkdir(EXPORT_DIR, { recursive: true })
  }
}

export async function exportPublishRecords(
  operatorId: number,
  filters?: {
    status?: string
    start_date?: string
    end_date?: string
    channel_id?: number
  },
): Promise<ExportRecord> {
  const operator = await UserModel.findById(operatorId)
  if (!operator) {
    throw createError('操作员不存在', 404, 'OPERATOR_NOT_FOUND')
  }

  const queryParams: PaginationParams & {
    status?: string
    start_date?: string
    end_date?: string
  } = { page: 1, pageSize: 10000 }
  if (filters?.status) {
    queryParams.status = filters.status
  }
  if (filters?.start_date && filters?.end_date) {
    queryParams.start_date = filters.start_date
    queryParams.end_date = filters.end_date
  }

  const recordsResult = await PublishRecordModel.findAll(queryParams)
  const records = recordsResult.items

  const recordIds = records.map((r) => r.id)
  const placeholders = recordIds.map(() => '?').join(', ')

  const detailedRecordsSql = `
    SELECT 
      pr.id, pr.schedule_id, pr.status, pr.result, pr.withdraw_reason, pr.publish_time, pr.created_at,
      s.id as 'schedule.id', s.content_id as 'schedule.content_id', s.channel_id as 'schedule.channel_id',
      s.schedule_time as 'schedule.schedule_time', s.status as 'schedule.status',
      s.created_at as 'schedule.created_at', s.updated_at as 'schedule.updated_at',
      c.id as 'content.id', c.title as 'content.title', c.type as 'content.type',
      ch.id as 'channel.id', ch.name as 'channel.name', ch.type as 'channel.type'
    FROM publish_records pr
    LEFT JOIN schedules s ON pr.schedule_id = s.id
    LEFT JOIN contents c ON s.content_id = c.id
    LEFT JOIN channels ch ON s.channel_id = ch.id
    WHERE pr.id IN (${placeholders})
    ORDER BY pr.created_at DESC
  `

  interface DetailedRecordRow {
    id: number
    schedule_id: number
    status: string
    result: string | null
    withdraw_reason: string | null
    publish_time: string | null
    created_at: string
    'schedule.id': number
    'schedule.content_id': number
    'schedule.channel_id': number
    'schedule.schedule_time': string
    'schedule.status': string
    'schedule.created_at': string
    'schedule.updated_at': string
    'content.id': number
    'content.title': string
    'content.type': string
    'channel.id': number
    'channel.name': string
    'channel.type': string
  }

  const detailedRecords = db.prepare(detailedRecordsSql).all(...recordIds) as DetailedRecordRow[]

  const formattedRecords: PublishRecord[] = detailedRecords.map((row) => {
    const record: PublishRecord = {
      id: row.id,
      schedule_id: row.schedule_id,
      status: row.status as unknown as PublishStatus,
      result: row.result,
      withdraw_reason: row.withdraw_reason,
      publish_time: row.publish_time,
      created_at: row.created_at,
      schedule: undefined,
    }

    if (row['schedule.id']) {
      record.schedule = {
        id: row['schedule.id'],
        content_id: row['schedule.content_id'],
        channel_id: row['schedule.channel_id'],
        schedule_time: row['schedule.schedule_time'],
        status: row['schedule.status'] as unknown as ScheduleStatus,
        created_at: row['schedule.created_at'],
        updated_at: row['schedule.updated_at'],
        content: undefined,
        channel: undefined,
      }

      if (row['content.id']) {
        record.schedule.content = {
          id: row['content.id'],
          creator_id: 0,
          type: row['content.type'] as unknown as 'article' | 'video' | 'poster',
          title: row['content.title'],
          content: '',
          status: 'draft',
          scan_version: 0,
          created_at: '',
          updated_at: '',
        }
      }

      if (row['channel.id']) {
        record.schedule.channel = {
          id: row['channel.id'],
          name: row['channel.name'],
          type: row['channel.type'],
          status: 'active',
        }
      }
    }

    return record
  })

  if (filters?.channel_id) {
    const filtered = formattedRecords.filter(
      (r) => r.schedule?.channel_id === filters.channel_id,
    )
    const csv = await generatePublishRecordsCSV(filtered)
    return saveExportRecord(operatorId, csv)
  }

  const csv = await generatePublishRecordsCSV(formattedRecords)
  return saveExportRecord(operatorId, csv)
}

async function saveExportRecord(
  operatorId: number,
  csv: string,
): Promise<ExportRecord> {
  await ensureExportDir()

  const timestamp = Date.now()
  const filename = `publish_records_${timestamp}.csv`
  const filepath = path.join(EXPORT_DIR, filename)

  await fs.writeFile(filepath, '\uFEFF' + csv, 'utf8')

  const relativePath = `/exports/${filename}`

  return ExportRecordModel.create({
    operator_id: operatorId,
    file_path: relativePath,
  })
}

export async function getExportRecords(
  params?: PaginationParams & {
    operator_id?: number
    start_date?: string
    end_date?: string
  },
): Promise<PaginationResult<ExportRecord>> {
  if (params?.operator_id) {
    return ExportRecordModel.findByOperatorId(params.operator_id, params)
  }

  if (params?.start_date && params?.end_date) {
    return ExportRecordModel.findByTimeRange(
      params.start_date,
      params.end_date,
      params,
    )
  }

  return ExportRecordModel.findAll(params)
}

export async function getExportRecordDetail(
  recordId: number,
): Promise<ExportRecord> {
  const record = await ExportRecordModel.findById(recordId, true)

  if (!record) {
    throw createError('导出记录不存在', 404, 'RECORD_NOT_FOUND')
  }

  return record
}

export async function downloadExportFile(
  recordId: number,
): Promise<{ filepath: string; filename: string }> {
  const record = await ExportRecordModel.findById(recordId)

  if (!record) {
    throw createError('导出记录不存在', 404, 'RECORD_NOT_FOUND')
  }

  const relativePath = record.file_path.replace(/^\/exports\//, '')
  const filepath = path.join(EXPORT_DIR, relativePath)

  try {
    await fs.access(filepath)
  } catch {
    throw createError('导出文件不存在', 404, 'FILE_NOT_FOUND')
  }

  return {
    filepath,
    filename: relativePath,
  }
}

export default {
  exportPublishRecords,
  getExportRecords,
  getExportRecordDetail,
  downloadExportFile,
}
