import db from '../db/index.js';

export const DEFAULT_FAILURE_THRESHOLD = 3;

function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function tableSqlContains(table: string, fragment: string): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table) as { sql: string } | undefined;
  return !!row && row.sql.includes(fragment);
}

function rebuildTable(table: string, createSql: string, columns: string[]): void {
  const pragma = db.pragma('foreign_keys', { simple: true });
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(createSql.replace(`CREATE TABLE ${table}`, `CREATE TABLE ${table}_new`));
      db.exec(`INSERT INTO ${table}_new (${columns.join(', ')}) SELECT ${columns.join(', ')} FROM ${table}`);
      db.exec(`DROP TABLE ${table}`);
      db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    })();
  } finally {
    db.pragma(`foreign_keys = ${pragma ? 'ON' : 'OFF'}`);
  }
}

function migrateLegacyAuditLogs(): void {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
    .get();
  if (!exists) return;

  const cols = db.prepare('PRAGMA table_info(audit_logs)').all() as { name: string }[];
  if (cols.some((c) => c.name === 'target_type')) return;

  console.log('[initDatabase] 检测到旧版 audit_logs 表，正在迁移...');
  db.exec(`
    ALTER TABLE audit_logs RENAME TO audit_logs_legacy;
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
    );
    INSERT OR IGNORE INTO audit_logs (id, operator_id, action, target_type, target_id, detail, created_at)
    SELECT id, operator_id, action, resource_type, resource_id, detail, created_at
    FROM audit_logs_legacy;
    DROP TABLE audit_logs_legacy;
  `);
}

export function initDatabase(): void {
  migrateLegacyAuditLogs();

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
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'paused')),
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'publishing', 'published', 'failed', 'withdrawn')),
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
      last_heartbeat_at DATETIME,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      failure_threshold INTEGER NOT NULL DEFAULT 3,
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
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish', 'reschedule')),
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS export_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operator_id) REFERENCES users(id)
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

    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs(operator_id);
    CREATE INDEX IF NOT EXISTS idx_failure_reviews_status ON failure_reviews(status);
    CREATE INDEX IF NOT EXISTS idx_channel_health_degraded ON channel_health(degraded_at);
  `);

  if (!tableSqlContains('channels', "'paused'")) {
    rebuildTable(
      'channels',
      `CREATE TABLE channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'paused')),
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
      ['id', 'name', 'type', 'status', 'config', 'created_at'],
    );
  }

  if (!tableSqlContains('schedules', "'failed'")) {
    rebuildTable(
      'schedules',
      `CREATE TABLE schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      schedule_time DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'publishing', 'published', 'failed', 'withdrawn')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    )`,
      ['id', 'content_id', 'channel_id', 'schedule_time', 'status', 'created_at', 'updated_at'],
    );
  }

  if (tableSqlContains('failure_reviews', 'failure_reviews') && !tableSqlContains('failure_reviews', "'reschedule'")) {
    rebuildTable(
      'failure_reviews',
      `CREATE TABLE failure_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER,
      conclusion TEXT,
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish', 'reschedule')),
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'resolved')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id),
      FOREIGN KEY (handler_id) REFERENCES users(id)
    )`,
      ['id', 'publish_record_id', 'schedule_id', 'handler_id', 'conclusion', 'action_type', 'status', 'created_at', 'resolved_at'],
    );
  }

  addColumnIfMissing('channel_health', 'last_heartbeat_at', 'last_heartbeat_at DATETIME');
  addColumnIfMissing(
    'channel_health',
    'consecutive_failures',
    'consecutive_failures INTEGER NOT NULL DEFAULT 0',
  );
  addColumnIfMissing(
    'channel_health',
    'failure_threshold',
    `failure_threshold INTEGER NOT NULL DEFAULT ${DEFAULT_FAILURE_THRESHOLD}`,
  );
  addColumnIfMissing('channel_health', 'degraded_at', 'degraded_at DATETIME');
  addColumnIfMissing('failure_reviews', 'reason', 'reason TEXT');
  addColumnIfMissing(
    'failure_reviews',
    'action_type',
    "action_type TEXT CHECK(action_type IN ('republish', 'manual_publish', 'reschedule'))",
  );

  const channelHealthExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='channel_health'"
  ).get();

  if (!channelHealthExists) {
    db.exec(`
      INSERT OR IGNORE INTO channel_health (channel_id, success_rate, rate_limit_status, updated_at)
      SELECT id, 1.0, 'normal', CURRENT_TIMESTAMP
      FROM channels
    `);
  }

  db.exec(`
    INSERT OR IGNORE INTO channel_health (channel_id, success_rate, rate_limit_status, consecutive_failures, failure_threshold, updated_at)
    SELECT c.id, 1.0, 'normal', 0, ${DEFAULT_FAILURE_THRESHOLD}, CURRENT_TIMESTAMP
    FROM channels c
    WHERE NOT EXISTS (SELECT 1 FROM channel_health ch WHERE ch.channel_id = c.id)
  `);
}

export default initDatabase;
