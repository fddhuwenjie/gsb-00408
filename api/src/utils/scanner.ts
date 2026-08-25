import db from '../db/index.js'
import type { SensitiveWord } from '../../../shared/types.js'

export interface ScanMatch {
  word_id: number
  matched_text: string
  position: number
  version: number
}

export async function scanContent(
  content: string,
  version: number,
): Promise<ScanMatch[]> {
  const sensitiveWords = db
    .prepare(
      `SELECT sw.id, sw.word, sw.version, sw.is_active
       FROM sensitive_words sw
       INNER JOIN (
         SELECT word, MAX(version) as max_version
         FROM sensitive_words
         WHERE version <= ?
         GROUP BY word
       ) latest ON sw.word = latest.word AND sw.version = latest.max_version
       WHERE sw.is_active = 1`,
    )
    .all(version) as SensitiveWord[]

  const matches: ScanMatch[] = []

  for (const word of sensitiveWords) {
    const regex = new RegExp(word.word, 'gi')
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      matches.push({
        word_id: word.id,
        matched_text: match[0],
        position: match.index,
        version: version,
      })
    }
  }

  return matches
}

export async function saveScanRecords(
  contentId: number,
  matches: ScanMatch[],
): Promise<void> {
  const insertStmt = db.prepare(`
    INSERT INTO scan_records (content_id, word_id, version, matched_text, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const now = new Date().toISOString()

  for (const match of matches) {
    insertStmt.run(
      contentId,
      match.word_id,
      match.version,
      match.matched_text,
      match.position,
      now,
    )
  }
}

export async function getLatestScanVersion(): Promise<number> {
  const result = db
    .prepare('SELECT MAX(version) as max_version FROM sensitive_words')
    .get() as { max_version: number | null }

  return result.max_version || 1
}

export async function clearScanRecords(contentId: number): Promise<void> {
  const deleteStmt = db.prepare('DELETE FROM scan_records WHERE content_id = ?')
  deleteStmt.run(contentId)
}
