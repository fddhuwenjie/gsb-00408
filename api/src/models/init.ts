import db from '../db/index.js';

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
      last_heartbeat DATETIME,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      degradation_threshold INTEGER NOT NULL DEFAULT 3,
      is_degraded INTEGER NOT NULL DEFAULT 0,
      degraded_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE IF NOT EXISTS failure_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER,
      conclusion TEXT,
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish', 'reschedule')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
      reason TEXT,
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
      resource_type TEXT NOT NULL,
      resource_id INTEGER,
      detail TEXT,
      ip_address TEXT,
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

  runMigrations();
}

function runMigrations(): void {
  const foreignKeysEnabled = db.pragma('foreign_keys', { simple: true }) as number;
  if (foreignKeysEnabled) {
    db.pragma('foreign_keys = OFF');
  }

  const runAllMigrations = db.transaction(() => {
    const channelHealthExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='channel_health'"
    ).get();

    if (!channelHealthExists) {
      db.exec(`
        INSERT OR IGNORE INTO channel_health (channel_id, success_rate, rate_limit_status, last_heartbeat, consecutive_failures, degradation_threshold, is_degraded, updated_at)
        SELECT id, 1.0, 'normal', CURRENT_TIMESTAMP, 0, 3, 0, CURRENT_TIMESTAMP
        FROM channels
      `);
    }

    const healthColumns = db.prepare("PRAGMA table_info(channel_health)").all() as { name: string }[];
    const healthColumnNames = healthColumns.map((c) => c.name);

    if (!healthColumnNames.includes('is_health_check_enabled')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN is_health_check_enabled INTEGER NOT NULL DEFAULT 1");
    }
    if (!healthColumnNames.includes('last_heartbeat')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN last_heartbeat DATETIME");
    }
    if (!healthColumnNames.includes('consecutive_failures')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0");
    }
    if (!healthColumnNames.includes('degradation_threshold')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN degradation_threshold INTEGER NOT NULL DEFAULT 3");
    }
    if (!healthColumnNames.includes('is_degraded')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN is_degraded INTEGER NOT NULL DEFAULT 0");
    }
    if (!healthColumnNames.includes('degraded_at')) {
      db.exec("ALTER TABLE channel_health ADD COLUMN degraded_at DATETIME");
    }

    db.exec(`
      UPDATE channel_health SET last_heartbeat = CURRENT_TIMESTAMP WHERE last_heartbeat IS NULL;
    `);

    migrateFailureReviewsInTx();
    migrateSchedulesInTx();
  });

  try {
    runAllMigrations();
  } catch (err) {
    db.exec(`
      DROP TABLE IF EXISTS schedules_new;
      DROP TABLE IF EXISTS failure_reviews_new;
    `);
    if (foreignKeysEnabled) {
      db.pragma('foreign_keys = ON');
    }
    throw new Error(`数据库迁移失败，已完整回滚: ${(err as Error).message}`);
  }

  if (foreignKeysEnabled) {
    db.pragma('foreign_keys = ON');
  }

  const fkCheck = db.pragma('foreign_key_check', { simple: false }) as unknown[];
  if (fkCheck.length > 0) {
    throw new Error(`数据库迁移后外键完整性检查失败: ${JSON.stringify(fkCheck)}`);
  }
}

function migrateFailureReviewsInTx(): void {
  const frColumns = db.prepare("PRAGMA table_info(failure_reviews)").all() as { name: string; notnull: number }[];
  const frColumnNames = frColumns.map((c) => c.name);

  const needsReasonColumn = !frColumnNames.includes('reason');
  const needsActionTypeUpdate = frColumns.some(c => c.name === 'action_type') &&
    !checkConstraintIncludes('failure_reviews', 'action_type', 'reschedule');
  const needsNullablePublishRecord = frColumns.some(c => c.name === 'publish_record_id' && c.notnull === 1);

  if (!needsActionTypeUpdate && !needsNullablePublishRecord) {
    if (needsReasonColumn) {
      db.exec("ALTER TABLE failure_reviews ADD COLUMN reason TEXT");
    }
    return;
  }

  const oldHasReason = frColumnNames.includes('reason');
  const reasonSelect = oldHasReason ? 'reason' : 'NULL as reason';

  const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM failure_reviews').get() as { count: number }).count;

  db.exec(`
    CREATE TABLE failure_reviews_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER,
      conclusion TEXT,
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish', 'reschedule')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    );
    INSERT INTO failure_reviews_new (id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, reason, created_at, resolved_at)
      SELECT id, publish_record_id, schedule_id, handler_id, conclusion, action_type, status, ${reasonSelect}, created_at, resolved_at FROM failure_reviews;
    DROP TABLE failure_reviews;
    ALTER TABLE failure_reviews_new RENAME TO failure_reviews;
  `);

  const afterCount = (db.prepare('SELECT COUNT(*) as count FROM failure_reviews').get() as { count: number }).count;
  if (beforeCount !== afterCount) {
    throw new Error(`失败复核数据丢失: 迁移前 ${beforeCount} 条, 迁移后 ${afterCount} 条`);
  }
}

function migrateSchedulesInTx(): void {
  const scheduleSql = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='schedules'"
  ).get() as { sql: string } | undefined;

  if (!scheduleSql || scheduleSql.sql.includes('pending_review')) {
    return;
  }

  const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM schedules').get() as { count: number }).count;

  db.exec(`
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

  const afterCount = (db.prepare('SELECT COUNT(*) as count FROM schedules').get() as { count: number }).count;
  if (beforeCount !== afterCount) {
    throw new Error(`排期数据丢失: 迁移前 ${beforeCount} 条, 迁移后 ${afterCount} 条`);
  }
}

function checkConstraintIncludes(tableName: string, columnName: string, value: string): boolean {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName) as { sql: string } | undefined;
  if (!row) return false;
  const match = row.sql.match(new RegExp(`${columnName}\\s+TEXT[^,]*CHECK\\s*\\(([^)]+)\\)`, 'i'));
  if (!match) return false;
  return match[1].includes(value);
}

export default initDatabase;
