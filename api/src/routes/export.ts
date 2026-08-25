import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import PublishRecordModel from '../models/PublishRecord.js'
import ExportRecordModel from '../models/ExportRecord.js'
import { generatePublishRecordsCSV } from '../utils/csv.js'
import type {
  PublishRecord,
  ExportRecord,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXPORT_DIR = path.join(__dirname, '../../../data/exports')

if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true })
}

const router = Router()

router.use(authMiddleware)

router.get(
  '/publish',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw createError('用户未登录', 401)
    }

    const { startDate, endDate, status } = req.query as {
      startDate?: string
      endDate?: string
      status?: string
    }

    let records: PublishRecord[]

    if (startDate && endDate) {
      const result = await PublishRecordModel.findByDateRange(startDate, endDate, {
        page: 1,
        pageSize: 10000,
      })
      records = result.items
    } else if (status) {
      const result = await PublishRecordModel.findByStatus(status as PublishRecord['status'], {
        page: 1,
        pageSize: 10000,
      })
      records = result.items
    } else {
      const result = await PublishRecordModel.findAll({ page: 1, pageSize: 10000 })
      records = result.items
    }

    const recordsWithRelations = await Promise.all(
      records.map(async (record) => {
        return PublishRecordModel.findById(record.id, true)
      }),
    )

    const validRecords = recordsWithRelations.filter(
      (r): r is PublishRecord => r !== null,
    )

    const csvContent = await generatePublishRecordsCSV(validRecords)

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `publish-records-${timestamp}.csv`
    const filePath = path.join(EXPORT_DIR, filename)

    fs.writeFileSync(filePath, '\ufeff' + csvContent, 'utf-8')

    await ExportRecordModel.create({
      operator_id: req.user.id,
      file_path: filename,
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(csvContent)
  }),
)

router.get(
  '/records',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize } = req.query as PaginationParams

    const result = await ExportRecordModel.findAll({ page, pageSize })

    const itemsWithRelations = await Promise.all(
      result.items.map(async (record) => {
        return ExportRecordModel.findById(record.id, true)
      }),
    )

    const validItems = itemsWithRelations.filter(
      (r): r is ExportRecord => r !== null,
    )

    const response: ApiResponse<PaginationResult<ExportRecord>> = {
      success: true,
      data: {
        ...result,
        items: validItems,
      },
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/download/:filename',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { filename } = req.params

    if (!filename) {
      throw createError('文件名不能为空', 400)
    }

    const filePath = path.join(EXPORT_DIR, filename)

    if (!fs.existsSync(filePath)) {
      throw createError('文件不存在', 404)
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)
  }),
)

export default router
