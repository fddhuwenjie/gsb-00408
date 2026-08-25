import { transaction } from '../db/index.js'
import { createError } from '../types/index.js'
import SensitiveWordModel from '../models/SensitiveWord.js'
import ScanRecordModel from '../models/ScanRecord.js'
import type {
  SensitiveWord,
  ScanRecord,
  PaginationParams,
  PaginationResult,
} from '../../../shared/types.js'

export async function getWordList(
  params?: PaginationParams & {
    category?: string
    is_active?: boolean
  },
): Promise<PaginationResult<SensitiveWord>> {
  if (params?.category) {
    return SensitiveWordModel.findByCategory(params.category, params)
  }

  if (params?.is_active !== undefined) {
    if (params.is_active) {
      return SensitiveWordModel.findActive(params)
    }
  }

  return SensitiveWordModel.findAll(params)
}

export async function addWord(
  word: string,
  category: string,
): Promise<SensitiveWord> {
  if (!word || word.trim().length === 0) {
    throw createError('敏感词不能为空', 400, 'EMPTY_WORD')
  }

  if (!category || category.trim().length === 0) {
    throw createError('分类不能为空', 400, 'EMPTY_CATEGORY')
  }

  const existingWord = await SensitiveWordModel.findByWord(word.trim())
  if (existingWord) {
    throw createError('敏感词已存在', 400, 'WORD_EXISTS')
  }

  return SensitiveWordModel.create({
    word: word.trim(),
    category: category.trim(),
  })
}

export async function updateWord(
  wordId: number,
  word: string,
  category: string,
): Promise<SensitiveWord> {
  const existingWord = await SensitiveWordModel.findById(wordId)
  
  if (!existingWord) {
    throw createError('敏感词不存在', 404, 'WORD_NOT_FOUND')
  }

  if (!word || word.trim().length === 0) {
    throw createError('敏感词不能为空', 400, 'EMPTY_WORD')
  }

  if (!category || category.trim().length === 0) {
    throw createError('分类不能为空', 400, 'EMPTY_CATEGORY')
  }

  const currentVersion = await SensitiveWordModel.getCurrentVersion()
  const newVersion = currentVersion + 1

  return transaction(async () => {
    const updatedWord = await SensitiveWordModel.update(wordId, {
      word: word.trim(),
      category: category.trim(),
      version: newVersion,
    })

    if (!updatedWord) {
      throw createError('更新敏感词失败', 500, 'UPDATE_FAILED')
    }

    return updatedWord
  })
}

export async function deleteWord(
  wordId: number,
): Promise<void> {
  const existingWord = await SensitiveWordModel.findById(wordId)
  
  if (!existingWord) {
    throw createError('敏感词不存在', 404, 'WORD_NOT_FOUND')
  }

  const currentVersion = await SensitiveWordModel.getCurrentVersion()
  const newVersion = currentVersion + 1

  return transaction(async (tx) => {
    const updateStmt = tx.prepare(`
      UPDATE sensitive_words
      SET is_active = 0, version = ?
      WHERE id = ?
    `)
    const result = updateStmt.run(newVersion, wordId)

    if (result.changes === 0) {
      throw createError('删除敏感词失败', 500, 'DELETE_FAILED')
    }
  })
}

export async function getScanRecords(
  params?: PaginationParams & {
    content_id?: number
    word_id?: number
    version?: number
  },
): Promise<PaginationResult<ScanRecord>> {
  if (params?.content_id) {
    return ScanRecordModel.findByContentId(params.content_id, params)
  }

  if (params?.word_id) {
    return ScanRecordModel.findByWordId(params.word_id, params)
  }

  if (params?.version) {
    return ScanRecordModel.findByVersion(params.version, params)
  }

  return ScanRecordModel.findAll(params)
}

export async function getScanRecordDetail(
  recordId: number,
): Promise<ScanRecord> {
  const record = await ScanRecordModel.findById(recordId, true)
  
  if (!record) {
    throw createError('扫描记录不存在', 404, 'RECORD_NOT_FOUND')
  }

  return record
}

export async function getCurrentVersion(): Promise<number> {
  return SensitiveWordModel.getCurrentVersion()
}

export async function batchAddWords(
  words: { word: string; category: string }[],
): Promise<SensitiveWord[]> {
  if (!words || words.length === 0) {
    throw createError('敏感词列表不能为空', 400, 'EMPTY_LIST')
  }

  return SensitiveWordModel.createNewVersion(
    words.map((w) => ({
      word: w.word.trim(),
      category: w.category.trim(),
    })),
  )
}

export default {
  getWordList,
  addWord,
  updateWord,
  deleteWord,
  getScanRecords,
  getScanRecordDetail,
  getCurrentVersion,
  batchAddWords,
}
