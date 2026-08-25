import { Router, type Request, type Response } from 'express'
import { asyncHandler } from '../middleware/error.js'
import { authMiddleware, requireRole } from '../middleware/auth.js'
import { createError } from '../types/index.js'
import SensitiveWordModel from '../models/SensitiveWord.js'
import ScanRecordModel from '../models/ScanRecord.js'
import type {
  SensitiveWord,
  ScanRecord,
  PaginationParams,
  PaginationResult,
  ApiResponse,
} from '../../../shared/types.js'

const router = Router()

router.use(authMiddleware)

router.get(
  '/words',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, category, active } = req.query as PaginationParams & {
      category?: string
      active?: string
    }

    let result: PaginationResult<SensitiveWord>

    if (category) {
      result = await SensitiveWordModel.findByCategory(category, { page, pageSize })
    } else if (active === 'true') {
      result = await SensitiveWordModel.findActive({ page, pageSize })
    } else {
      result = await SensitiveWordModel.findAll({ page, pageSize })
    }

    const response: ApiResponse<PaginationResult<SensitiveWord>> = {
      success: true,
      data: result,
    }

    res.status(200).json(response)
  }),
)

router.post(
  '/words',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { word, category, is_active } = req.body as {
      word: string
      category: string
      is_active?: boolean
    }

    if (!word || !category) {
      throw createError('敏感词和分类不能为空', 400)
    }

    const existingWord = await SensitiveWordModel.findByWord(word)
    if (existingWord) {
      throw createError('该敏感词已存在', 400)
    }

    const newWord = await SensitiveWordModel.create({
      word,
      category,
      is_active,
    })

    const response: ApiResponse<SensitiveWord> = {
      success: true,
      data: newWord,
    }

    res.status(201).json(response)
  }),
)

router.put(
  '/words/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的敏感词ID', 400)
    }

    const word = await SensitiveWordModel.findById(id)
    if (!word) {
      throw createError('敏感词不存在', 404)
    }

    const { word: newWord, category, is_active } = req.body as {
      word?: string
      category?: string
      is_active?: boolean
    }

    const updateParams: Parameters<typeof SensitiveWordModel.update>[1] = {}

    if (newWord !== undefined) {
      updateParams.word = newWord
    }
    if (category !== undefined) {
      updateParams.category = category
    }
    if (is_active !== undefined) {
      updateParams.is_active = is_active
    }

    const updatedWord = await SensitiveWordModel.update(id, updateParams)

    const response: ApiResponse<SensitiveWord> = {
      success: true,
      data: updatedWord!,
    }

    res.status(200).json(response)
  }),
)

router.delete(
  '/words/:id',
  requireRole('admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      throw createError('无效的敏感词ID', 400)
    }

    const word = await SensitiveWordModel.findById(id)
    if (!word) {
      throw createError('敏感词不存在', 404)
    }

    const deleted = await SensitiveWordModel.remove(id)

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted },
    }

    res.status(200).json(response)
  }),
)

router.get(
  '/scans',
  requireRole('editor', 'reviewer', 'admin'),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, pageSize, content_id, word_id } = req.query as PaginationParams & {
      content_id?: string
      word_id?: string
    }

    let result: PaginationResult<ScanRecord>

    if (content_id) {
      result = await ScanRecordModel.findByContentId(parseInt(content_id, 10), { page, pageSize })
    } else if (word_id) {
      result = await ScanRecordModel.findByWordId(parseInt(word_id, 10), { page, pageSize })
    } else {
      result = await ScanRecordModel.findAll({ page, pageSize })
    }

    const itemsWithRelations = await Promise.all(
      result.items.map(async (record) => {
        const recordWithRelations = await ScanRecordModel.findById(record.id, true)
        return recordWithRelations || record
      }),
    )

    const response: ApiResponse<PaginationResult<ScanRecord>> = {
      success: true,
      data: {
        ...result,
        items: itemsWithRelations,
      },
    }

    res.status(200).json(response)
  }),
)

export default router
