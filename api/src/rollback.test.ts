import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rollbackDbPath = path.join(__dirname, '../data/test_rollback.db');
const testDir = path.dirname(rollbackDbPath);
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

for (const f of [rollbackDbPath, rollbackDbPath + '-wal', rollbackDbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.DB_PATH = rollbackDbPath;

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
    failed++;
  }
}

function createOldDatabaseWithObstruction() {
  const oldDb = new Database(rollbackDbPath);
  oldDb.pragma('journal_mode = WAL');
  oldDb.pragma('foreign_keys = ON');

  oldDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('editor', 'reviewer', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scan_version INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );
    CREATE TABLE schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      schedule_time DATETIME NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'scheduled', 'published', 'withdrawn')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES contents(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );
    CREATE TABLE publish_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
    CREATE TABLE failure_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      publish_record_id INTEGER NOT NULL,
      schedule_id INTEGER NOT NULL,
      handler_id INTEGER,
      conclusion TEXT,
      action_type TEXT CHECK(action_type IN ('republish', 'manual_publish')),
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (publish_record_id) REFERENCES publish_records(id),
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );
  `);

  const hash = bcrypt.hashSync('test', 10);
  oldDb.prepare("INSERT INTO users (username, password_hash, role) VALUES ('rollback_user', ?, 'admin')").run(hash);
  const ch = oldDb.prepare("INSERT INTO channels (name, type, status) VALUES ('回滚测试渠道', 'wechat', 'active')").run();
  const ct = oldDb.prepare("INSERT INTO contents (creator_id, type, title, content, status) VALUES (1, 'article', '回滚测试文章', '内容', 'review_approved')").run();
  const now = new Date().toISOString();

  const scheduleIds: number[] = [];
  const publishIds: number[] = [];
  for (let i = 0; i < 5; i++) {
    const s = oldDb.prepare("INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, ?, 'scheduled')")
      .run(ct.lastInsertRowid, ch.lastInsertRowid, now);
    scheduleIds.push(s.lastInsertRowid as number);
    const p = oldDb.prepare("INSERT INTO publish_records (schedule_id, status, result) VALUES (?, 'success', ?)")
      .run(s.lastInsertRowid, `历史发布记录 ${i + 1}`);
    publishIds.push(p.lastInsertRowid as number);
  }

  oldDb.prepare("INSERT INTO failure_reviews (publish_record_id, schedule_id, conclusion, action_type, status) VALUES (?, ?, '已处理', 'manual_publish', 'resolved')")
    .run(publishIds[0], scheduleIds[0]);

  const before = {
    schedulesCount: (oldDb.prepare('SELECT COUNT(*) as c FROM schedules').get() as { c: number }).c,
    publishCount: (oldDb.prepare('SELECT COUNT(*) as c FROM publish_records').get() as { c: number }).c,
    frCount: (oldDb.prepare('SELECT COUNT(*) as c FROM failure_reviews').get() as { c: number }).c,
    scheduleSql: (oldDb.prepare("SELECT sql FROM sqlite_master WHERE name='schedules'").get() as { sql: string }).sql,
    frSql: (oldDb.prepare("SELECT sql FROM sqlite_master WHERE name='failure_reviews'").get() as { sql: string }).sql,
    firstFr: oldDb.prepare('SELECT * FROM failure_reviews WHERE id = 1').get() as Record<string, unknown>,
    firstScheduleStatus: (oldDb.prepare('SELECT status FROM schedules WHERE id = ?').get(scheduleIds[0]) as { status: string }).status,
    scheduleIds,
  };

  // 故意创建 schedules_new 表，使迁移中的 CREATE TABLE schedules_new 失败
  oldDb.exec(`CREATE TABLE schedules_new (id INTEGER PRIMARY KEY);`);

  oldDb.close();
  return before;
}

async function main() {
  console.log('\n=== 数据库迁移失败回滚测试 ===\n');

  console.log('1. 创建旧版数据库（含5条排期、5条发布记录、1条复核）并制造冲突...');
  const before = createOldDatabaseWithObstruction();
  console.log(`   排期: ${before.schedulesCount} 条, 发布记录: ${before.publishCount} 条, 复核: ${before.frCount} 条\n`);

  console.log('2. 运行迁移（预期失败）...');

  await test('迁移应抛出包含"回滚"的错误', async () => {
    const { initDatabase } = await import('./models/init.js');
    let threw = false;
    let errorMsg = '';
    try {
      initDatabase();
    } catch (e) {
      threw = true;
      errorMsg = (e as Error).message;
    }
    assert.ok(threw, 'initDatabase 应抛出错误');
    assert.ok(errorMsg.includes('回滚'), `错误信息应包含"回滚"，实际: ${errorMsg}`);
  });

  console.log('\n3. 验证回滚后数据完整性:');

  const verifyDb = new Database(rollbackDbPath);
  verifyDb.pragma('foreign_keys = ON');

  await test('排期记录数完整保留（无丢失）', () => {
    const count = (verifyDb.prepare('SELECT COUNT(*) as c FROM schedules').get() as { c: number }).c;
    assert.strictEqual(count, before.schedulesCount, `应有 ${before.schedulesCount} 条，实际 ${count} 条`);
  });

  await test('发布记录数完整保留', () => {
    const count = (verifyDb.prepare('SELECT COUNT(*) as c FROM publish_records').get() as { c: number }).c;
    assert.strictEqual(count, before.publishCount);
  });

  await test('失败复核记录数完整保留', () => {
    const count = (verifyDb.prepare('SELECT COUNT(*) as c FROM failure_reviews').get() as { c: number }).c;
    assert.strictEqual(count, before.frCount);
  });

  await test('发布记录外键关系不断裂（JOIN 全部成功）', () => {
    const joined = verifyDb.prepare(`
      SELECT COUNT(*) as c FROM publish_records pr
      JOIN schedules s ON pr.schedule_id = s.id
    `).get() as { c: number };
    assert.strictEqual(joined.c, before.publishCount, '所有发布记录应能关联到排期');
  });

  await test('schedules 表恢复旧结构（CHECK 约束不含 pending_review）', () => {
    const row = verifyDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='schedules'").get() as { sql: string };
    assert.ok(!row.sql.includes('pending_review'), '旧表不应有 pending_review');
    assert.ok(!row.sql.includes('publishing'), '旧表不应有 publishing');
    assert.strictEqual(row.sql, before.scheduleSql, '表结构应与迁移前完全一致');
  });

  await test('failure_reviews 表恢复旧结构（publish_record_id NOT NULL）', () => {
    const row = verifyDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='failure_reviews'").get() as { sql: string };
    assert.ok(row.sql.includes('publish_record_id INTEGER NOT NULL'), '应恢复 NOT NULL 约束');
    assert.ok(!row.sql.includes('reschedule'), '不应包含 reschedule');
    assert.ok(!row.sql.includes('reason'), '不应包含 reason 列');
  });

  await test('schedules_new 临时表已被回滚清除', () => {
    const row = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schedules_new'").get();
    assert.strictEqual(row, undefined, '临时表不应存在');
  });

  await test('failure_reviews_new 临时表不存在', () => {
    const row = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='failure_reviews_new'").get();
    assert.strictEqual(row, undefined);
  });

  await test('原有复核数据内容不变', () => {
    const fr = verifyDb.prepare('SELECT * FROM failure_reviews WHERE id = 1').get() as {
      conclusion: string; action_type: string; status: string;
    };
    assert.strictEqual(fr.conclusion, before.firstFr.conclusion);
    assert.strictEqual(fr.action_type, before.firstFr.action_type);
    assert.strictEqual(fr.status, before.firstFr.status);
  });

  await test('原有排期状态不变', () => {
    const s = verifyDb.prepare('SELECT status FROM schedules WHERE id = ?').get(before.scheduleIds[0]) as { status: string };
    assert.strictEqual(s.status, before.firstScheduleStatus);
  });

  await test('回滚后外键完整性检查零错误', () => {
    const issues = verifyDb.pragma('foreign_key_check', { simple: false }) as unknown[];
    assert.strictEqual(issues.length, 0, `发现外键问题: ${JSON.stringify(issues)}`);
  });

  await test('清除障碍后可重新成功执行迁移', async () => {
    const fixDb = new Database(rollbackDbPath);
    fixDb.exec('DROP TABLE IF EXISTS schedules_new');

    const beforeCount = (fixDb.prepare('SELECT COUNT(*) as c FROM schedules').get() as { c: number }).c;
    fixDb.close();

    const { initDatabase } = await import('./models/init.js');
    initDatabase();

    const checkDb = new Database(rollbackDbPath);
    const schedCount = (checkDb.prepare('SELECT COUNT(*) as c FROM schedules').get() as { c: number }).c;
    assert.strictEqual(schedCount, beforeCount, `迁移后应有 ${beforeCount} 条排期，实际 ${schedCount} 条`);

    const schedRow = checkDb.prepare("SELECT sql FROM sqlite_master WHERE name='schedules'").get() as { sql: string };
    assert.ok(schedRow.sql.includes('pending_review'), '迁移应成功添加 pending_review');

    const frRow = checkDb.prepare("SELECT sql FROM sqlite_master WHERE name='failure_reviews'").get() as { sql: string };
    assert.ok(frRow.sql.includes('reschedule'), 'failure_reviews 应支持 reschedule');
    assert.ok(!frRow.sql.includes('NOT NULL') || frRow.sql.includes('publish_record_id INTEGER,'), 'publish_record_id 应为可空');
    checkDb.close();
  });

  console.log(`\n=== 回滚测试结果: ${passed} 通过, ${failed} 失败 ===\n`);

  for (const f of [rollbackDbPath, rollbackDbPath + '-wal', rollbackDbPath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
