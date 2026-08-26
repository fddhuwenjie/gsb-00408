import { test } from 'node:test'
import assert from 'node:assert/strict'
import Database from 'better-sqlite3'
import { createTempDatabase } from './helpers.js'

const dbPath = createTempDatabase('migration')

/**
 * 构造一个「历史库」：schedules 的 CHECK 不含 pending_review，
 * channel_health 缺少健康检查相关列，且存在关联的发布记录与失败复核。
 */
function buildLegacyDatabase(): void {
  const legacy = new Database(dbPath)
  legacy.pragma('foreign_keys = ON')
  legacy.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      config TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL,
      content TEXT NOT NULL, thumbnail_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft', scan_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL, channel_id INTEGER NOT NULL,
      schedule_time DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','scheduled','publishing','published','failed','withdrawn')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
    CREATE TABLE publish_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT, withdraw_reason TEXT, publish_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    CREATE TABLE channel_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL UNIQUE,
      success_rate REAL NOT NULL DEFAULT 1.0,
      last_failure_reason TEXT,
      rate_limit_status TEXT NOT NULL DEFAULT 'normal',
      responsible_person TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
    CREATE TABLE failure_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER, conclusion TEXT, action_type TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
  `)

  legacy.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (1,'admin','x','admin')").run()
  legacy.prepare("INSERT INTO channels (id, name, type, status) VALUES (1,'微信','wechat','active')").run()
  legacy.prepare("INSERT INTO contents (id, creator_id, type, title, content) VALUES (1,1,'article','标题','正文')").run()
  legacy.prepare("INSERT INTO schedules (id, content_id, channel_id, schedule_time, status) VALUES (1,1,1,'2099-01-01T00:00:00.000Z','failed')").run()
  legacy.prepare("INSERT INTO publish_records (id, schedule_id, status, result) VALUES (1,1,'failed','网络超时')").run()
  legacy.prepare("INSERT INTO failure_reviews (id, publish_record_id, schedule_id, status) VALUES (1,1,1,'pending')").run()
  legacy.prepare("INSERT INTO channel_health (channel_id, success_rate) VALUES (1, 0.5)").run()
  legacy.close()
}

test('迁移：历史库补齐健康列、放开 pending_review 并保留关联数据', async () => {
  buildLegacyDatabase()

  const { initDatabase } = await import('../src/models/init.js')
  initDatabase()

  const { default: db } = await import('../src/db/index.js')

  // 1) schedules 现在允许 pending_review
  const scheduleSql = (db.prepare("SELECT sql FROM sqlite_master WHERE name='schedules'").get() as { sql: string }).sql
  assert.ok(scheduleSql.includes("'pending_review'"), 'schedules 应允许 pending_review')

  // 2) channel_health 新列已补齐
  const cols = new Set((db.prepare('PRAGMA table_info(channel_health)').all() as { name: string }[]).map((c) => c.name))
  for (const col of ['is_health_check_enabled', 'last_heartbeat_at', 'consecutive_failures', 'failure_threshold', 'is_degraded', 'degraded_at']) {
    assert.ok(cols.has(col), `channel_health 应包含列 ${col}`)
  }

  // 3) 历史数据与外键关联保留
  const schedule = db.prepare('SELECT * FROM schedules WHERE id = 1').get() as { status: string }
  assert.equal(schedule.status, 'failed')
  const health = db.prepare('SELECT * FROM channel_health WHERE channel_id = 1').get() as { success_rate: number; failure_threshold: number }
  assert.equal(health.success_rate, 0.5)
  assert.equal(health.failure_threshold, 3, '新列应有默认阈值 3')
  const fr = db.prepare('SELECT * FROM failure_reviews WHERE id = 1').get() as { publish_record_id: number; schedule_id: number }
  assert.equal(fr.publish_record_id, 1)
  assert.equal(fr.schedule_id, 1)

  // 4) 迁移后 pending_review 可正常写入
  db.prepare("UPDATE schedules SET status='pending_review' WHERE id=1").run()
  const updated = db.prepare('SELECT status FROM schedules WHERE id=1').get() as { status: string }
  assert.equal(updated.status, 'pending_review')

  // 5) 外键完整性校验通过
  const violations = db.pragma('foreign_key_check') as unknown[]
  assert.equal(violations.length, 0, '迁移后不应有外键冲突')
})
