import db, { transaction } from '../db/index.js';

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('editor', 'reviewer', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sensitive_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('article', 'video', 'poster')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      thumbnail_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'review_approved', 'review_rejected', 'scheduled', 'published', 'withdrawn')),
      scan_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      schedule_time DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'publishing', 'published', 'failed', 'withdrawn', 'pending_review')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS scan_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      word_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      matched_text TEXT NOT NULL,
      position INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (word_id) REFERENCES sensitive_words(id)
    );

    CREATE TABLE IF NOT EXISTS review_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('approve', 'reject')),
      opinion TEXT NOT NULL,
      opinion_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS review_audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_record_id INTEGER NOT NULL,
      operator_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('create', 'override')),
      previous_decision TEXT CHECK(previous_decision IN ('approve', 'reject')),
      new_decision TEXT NOT NULL CHECK(new_decision IN ('approve', 'reject')),
      opinion TEXT NOT NULL,
      opinion_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (review_record_id) REFERENCES review_records(id),
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS publish_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'withdrawn')),
      result TEXT,
      withdraw_reason TEXT,
      publish_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );

    CREATE TABLE IF NOT EXISTS channel_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL UNIQUE,
      success_rate REAL NOT NULL DEFAULT 1.0,
      last_failure_reason TEXT,
      rate_limit_status TEXT NOT NULL DEFAULT 'normal' CHECK(rate_limit_status IN ('normal', 'limited', 'blocked')),
      responsible_person TEXT,
      is_health_check_enabled INTEGER NOT NULL DEFAULT 1,
      last_heartbeat_at DATETIME,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      failure_threshold INTEGER NOT NULL DEFAULT 3,
      is_degraded INTEGER NOT NULL DEFAULT 0,
      degraded_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS failure_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER,
      conclusion TEXT,
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS export_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );
  `);

  migrateChannelHealthColumns();
  migrateSchedulePendingReview();
  backfillChannelHealth();
}

/**
 * 为历史库（channel_health 已存在但缺少健康检查字段）幂等补齐列。
 * 新建库通过上方 CREATE TABLE 已包含这些列，此处将全部跳过。
 */
function migrateChannelHealthColumns(): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(channel_health)').all() as { name: string }[]).map(
      (c) => c.name,
    ),
  );

  const columns: { name: string; ddl: string }[] = [
    { name: 'is_health_check_enabled', ddl: 'is_health_check_enabled INTEGER NOT NULL DEFAULT 1' },
    { name: 'last_heartbeat_at', ddl: 'last_heartbeat_at DATETIME' },
    { name: 'consecutive_failures', ddl: 'consecutive_failures INTEGER NOT NULL DEFAULT 0' },
    { name: 'failure_threshold', ddl: 'failure_threshold INTEGER NOT NULL DEFAULT 3' },
    { name: 'is_degraded', ddl: 'is_degraded INTEGER NOT NULL DEFAULT 0' },
    { name: 'degraded_at', ddl: 'degraded_at DATETIME' },
  ];

  for (const col of columns) {
    if (!existing.has(col.name)) {
      db.exec(`ALTER TABLE channel_health ADD COLUMN ${col.ddl}`);
    }
  }
}

/**
 * 历史库 schedules 的 CHECK 约束可能不允许 'pending_review'。
 * 若检测到缺失，则在事务内重建表并保留数据与外键关系，失败自动回滚。
 */
function migrateSchedulePendingReview(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='schedules'")
    .get() as { sql: string } | undefined;

  if (!row || row.sql.includes("'pending_review'")) {
    return;
  }

  const foreignKeysOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1;
  if (foreignKeysOn) {
    db.pragma('foreign_keys = OFF');
  }

  try {
    transaction((tx) => {
      tx.exec(`
        CREATE TABLE schedules_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content_id INTEGER NOT NULL,
          channel_id INTEGER NOT NULL,
          schedule_time DATETIME NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'publishing', 'published', 'failed', 'withdrawn', 'pending_review')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (content_id) REFERENCES contents(id),
          FOREIGN KEY (channel_id) REFERENCES channels(id)
        );

        INSERT INTO schedules_new (id, content_id, channel_id, schedule_time, status, created_at, updated_at)
        SELECT id, content_id, channel_id, schedule_time, status, created_at, updated_at FROM schedules;

        DROP TABLE schedules;
        ALTER TABLE schedules_new RENAME TO schedules;
      `);

      const violations = tx.pragma('foreign_key_check') as unknown[];
      if (violations.length > 0) {
        throw new Error('schedules 迁移后外键校验失败，已回滚');
      }
    });
  } finally {
    if (foreignKeysOn) {
      db.pragma('foreign_keys = ON');
    }
  }
}

/**
 * 为尚未建立健康记录的渠道补齐默认健康行（幂等）。
 */
function backfillChannelHealth(): void {
  db.exec(`
    INSERT OR IGNORE INTO channel_health (channel_id, success_rate, rate_limit_status, updated_at)
    SELECT id, 1.0, 'normal', CURRENT_TIMESTAMP
    FROM channels
  `);
}

export default initDatabase;
