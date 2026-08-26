import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDbPath = path.join(__dirname, '../data/test_migration.db');
const testDir = path.dirname(testDbPath);
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
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

interface OldDataRefs {
  userIds: number[];
  channelIds: number[];
  contentIds: number[];
  scheduleIds: number[];
  publishRecordIds: number[];
}

function createOldDatabase(): OldDataRefs {
  const oldDb = new Database(testDbPath);
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
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      config TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('article', 'video', 'poster')),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      thumbnail_url TEXT,
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'success', 'failed', 'withdrawn')),
      result TEXT,
      withdraw_reason TEXT,
      publish_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id)
    );

    CREATE TABLE channel_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL UNIQUE,
      success_rate REAL NOT NULL DEFAULT 1.0,
      last_failure_reason TEXT,
      rate_limit_status TEXT NOT NULL DEFAULT 'normal' CHECK(rate_limit_status IN ('normal', 'limited', 'blocked')),
      responsible_person TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (channel_id) REFERENCES channels(id)
    );

    CREATE TABLE failure_reviews (
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
  `);

  const hash = bcrypt.hashSync('test123', 10);
  const now = new Date().toISOString();

  const insertUser = oldDb.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)');
  const user1 = insertUser.run('editor1', hash, 'editor');
  const user2 = insertUser.run('admin1', hash, 'admin');

  const insertChannel = oldDb.prepare('INSERT INTO channels (name, type, status) VALUES (?, ?, ?)');
  const ch1 = insertChannel.run('旧版微信', 'wechat', 'active');
  const ch2 = insertChannel.run('旧版微博', 'weibo', 'active');

  const insertContent = oldDb.prepare('INSERT INTO contents (creator_id, type, title, content, status) VALUES (?, ?, ?, ?, ?)');
  const c1 = insertContent.run(user1.lastInsertRowid, 'article', '历史文章1', '内容1', 'review_approved');
  const c2 = insertContent.run(user1.lastInsertRowid, 'video', '历史视频2', '内容2', 'scheduled');
  const c3 = insertContent.run(user1.lastInsertRowid, 'poster', '历史海报3', '内容3', 'published');

  const insertSchedule = oldDb.prepare('INSERT INTO schedules (content_id, channel_id, schedule_time, status) VALUES (?, ?, ?, ?)');
  const s1 = insertSchedule.run(c1.lastInsertRowid, ch1.lastInsertRowid, now, 'scheduled');
  const s2 = insertSchedule.run(c2.lastInsertRowid, ch2.lastInsertRowid, now, 'scheduled');
  const s3 = insertSchedule.run(c3.lastInsertRowid, ch1.lastInsertRowid, now, 'published');

  const insertPublish = oldDb.prepare('INSERT INTO publish_records (schedule_id, status, result, publish_time) VALUES (?, ?, ?, ?)');
  const pr1 = insertPublish.run(s1.lastInsertRowid, 'failed', '旧版失败原因', now);
  insertPublish.run(s3.lastInsertRowid, 'success', '发布成功', now);

  oldDb.prepare('INSERT INTO channel_health (channel_id, success_rate, last_failure_reason, rate_limit_status, responsible_person) VALUES (?, ?, ?, ?, ?)')
    .run(ch1.lastInsertRowid, 0.5, '旧版失败', 'limited', '张三');
  oldDb.prepare('INSERT INTO channel_health (channel_id, success_rate, rate_limit_status) VALUES (?, ?, ?)')
    .run(ch2.lastInsertRowid, 1.0, 'normal');

  oldDb.prepare('INSERT INTO failure_reviews (publish_record_id, schedule_id, handler_id, conclusion, action_type, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(pr1.lastInsertRowid, s1.lastInsertRowid, user2.lastInsertRowid, '已处理', 'manual_publish', 'resolved');

  oldDb.close();
  return {
    userIds: [user1.lastInsertRowid as number, user2.lastInsertRowid as number],
    channelIds: [ch1.lastInsertRowid as number, ch2.lastInsertRowid as number],
    contentIds: [c1.lastInsertRowid as number, c2.lastInsertRowid as number, c3.lastInsertRowid as number],
    scheduleIds: [s1.lastInsertRowid as number, s2.lastInsertRowid as number, s3.lastInsertRowid as number],
    publishRecordIds: [pr1.lastInsertRowid as number],
  };
}

async function main() {
  console.log('\n=== 数据库升级迁移测试（带历史关联数据） ===\n');

  console.log('1. 创建旧版数据库...');
  const oldData = createOldDatabase();
  console.log(`   插入 ${oldData.scheduleIds.length} 条排期, ${oldData.publishRecordIds.length} 条发布记录, 1 条失败复核\n`);

  console.log('2. 设置 DB_PATH 并运行迁移...');
  process.env.DB_PATH = testDbPath;

  const { initDatabase } = await import('./models/init.js');
  initDatabase();
  console.log('   迁移完成\n');

  const verifyDb = new Database(testDbPath);
  verifyDb.pragma('foreign_keys = ON');

  console.log('3. 验证数据完整性:');

  await test('所有排期记录完整保留', () => {
    const count = (verifyDb.prepare('SELECT COUNT(*) as c FROM schedules').get() as { c: number }).c;
    assert.strictEqual(count, 3, `应有3条排期，实际${count}条`);
    for (const id of oldData.scheduleIds) {
      const row = verifyDb.prepare('SELECT id, status FROM schedules WHERE id = ?').get(id) as { id: number; status: string };
      assert.ok(row, `排期 ${id} 应存在`);
    }
  });

  await test('排期状态支持 pending_review（CHECK约束已更新）', () => {
    verifyDb.prepare("UPDATE schedules SET status = 'pending_review' WHERE id = ?").run(oldData.scheduleIds[1]);
    const row = verifyDb.prepare('SELECT status FROM schedules WHERE id = ?').get(oldData.scheduleIds[1]) as { status: string };
    assert.strictEqual(row.status, 'pending_review');
    verifyDb.prepare("UPDATE schedules SET status = 'scheduled' WHERE id = ?").run(oldData.scheduleIds[1]);
  });

  await test('原有排期状态值正确保留', () => {
    const s1 = verifyDb.prepare('SELECT status FROM schedules WHERE id = ?').get(oldData.scheduleIds[0]) as { status: string };
    const s3 = verifyDb.prepare('SELECT status FROM schedules WHERE id = ?').get(oldData.scheduleIds[2]) as { status: string };
    assert.strictEqual(s1.status, 'scheduled');
    assert.strictEqual(s3.status, 'published');
  });

  await test('发布记录外键关系完整保留', () => {
    const rows = verifyDb.prepare(`
      SELECT pr.id, pr.schedule_id, pr.status, pr.result, s.id as s_id, s.status as s_status
      FROM publish_records pr
      JOIN schedules s ON pr.schedule_id = s.id
      WHERE pr.schedule_id = ?
    `).all(oldData.scheduleIds[0]) as { id: number; schedule_id: number; status: string; result: string }[];
    assert.ok(rows.length > 0, '应能通过JOIN查到关联的发布记录');
    assert.strictEqual(rows[0].status, 'failed');
    assert.strictEqual(rows[0].result, '旧版失败原因');
  });

  await test('失败复核记录完整保留且 publish_record_id 可为空', () => {
    const count = (verifyDb.prepare('SELECT COUNT(*) as c FROM failure_reviews').get() as { c: number }).c;
    assert.strictEqual(count, 1, '应有1条失败复核');

    const row = verifyDb.prepare('SELECT * FROM failure_reviews WHERE id = 1').get() as {
      publish_record_id: number | null;
      schedule_id: number;
      conclusion: string;
      action_type: string;
      status: string;
      reason: string | null;
    };
    assert.strictEqual(row.publish_record_id, oldData.publishRecordIds[0]);
    assert.strictEqual(row.conclusion, '已处理');
    assert.strictEqual(row.action_type, 'manual_publish');
    assert.strictEqual(row.status, 'resolved');

    verifyDb.prepare("INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status) VALUES (NULL, ?, '发布前拦截测试', 'pending')")
      .run(oldData.scheduleIds[1]);
    const newRow = verifyDb.prepare('SELECT * FROM failure_reviews WHERE publish_record_id IS NULL').get() as { id: number; reason: string };
    assert.ok(newRow, '应能插入 publish_record_id 为 NULL 的记录');
    assert.strictEqual(newRow.reason, '发布前拦截测试');
  });

  await test('失败复核 action_type 支持 reschedule', () => {
    verifyDb.prepare("UPDATE failure_reviews SET action_type = 'reschedule' WHERE id = 1").run();
    const row = verifyDb.prepare('SELECT action_type FROM failure_reviews WHERE id = 1').get() as { action_type: string };
    assert.strictEqual(row.action_type, 'reschedule');
  });

  await test('channel_health 新增字段有正确默认值', () => {
    const h1 = verifyDb.prepare('SELECT * FROM channel_health WHERE channel_id = ?').get(oldData.channelIds[0]) as Record<string, unknown>;
    assert.strictEqual(h1.is_health_check_enabled, 1, '健康检查应默认启用');
    assert.ok(h1.last_heartbeat, '新数据库应有心跳时间');
    assert.strictEqual(h1.consecutive_failures, 0, '连续失败默认为0');
    assert.strictEqual(h1.degradation_threshold, 3, '默认阈值为3');
    assert.strictEqual(h1.is_degraded, 0, '默认未降级');
    assert.strictEqual(h1.degraded_at, null, '降级时间为空');
    assert.strictEqual(h1.responsible_person, '张三', '原有负责人保留');
    assert.strictEqual(h1.success_rate, 0.5, '原有成功率保留');
    assert.strictEqual(h1.rate_limit_status, 'limited', '原有限流状态保留');
  });

  await test('audit_logs 表已创建', () => {
    const tableExists = verifyDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'").get();
    assert.ok(tableExists, 'audit_logs 表应存在');
    verifyDb.prepare("INSERT INTO audit_logs (operator_id, action, resource_type, resource_id, detail, ip_address) VALUES (?, ?, ?, ?, ?, ?)")
      .run(oldData.userIds[1], 'channel_degrade', 'channel', oldData.channelIds[0], '测试审计', '127.0.0.1');
    const log = verifyDb.prepare('SELECT * FROM audit_logs WHERE action = ?').get('channel_degrade') as { detail: string; ip_address: string };
    assert.strictEqual(log.detail, '测试审计');
    assert.strictEqual(log.ip_address, '127.0.0.1');
  });

  await test('外键完整性检查通过（无孤立记录）', () => {
    const fkIssues = verifyDb.pragma('foreign_key_check', { simple: false }) as unknown[];
    assert.strictEqual(fkIssues.length, 0, `外键检查应无问题，发现: ${JSON.stringify(fkIssues)}`);
  });

  await test('可正常设置渠道为 pending_review 状态并创建关联复核', () => {
    verifyDb.prepare("UPDATE schedules SET status = 'pending_review' WHERE id = ?").run(oldData.scheduleIds[0]);
    const s = verifyDb.prepare('SELECT status FROM schedules WHERE id = ?').get(oldData.scheduleIds[0]) as { status: string };
    assert.strictEqual(s.status, 'pending_review');

    const fr = verifyDb.prepare("INSERT INTO failure_reviews (publish_record_id, schedule_id, reason, status) VALUES (NULL, ?, '迁移后自动降级', 'pending')")
      .run(oldData.scheduleIds[0]);
    assert.ok(fr.lastInsertRowid, '应能创建复核记录');

    verifyDb.prepare("UPDATE schedules SET status = 'scheduled' WHERE id = ?").run(oldData.scheduleIds[0]);
  });

  verifyDb.close();

  console.log(`\n=== 迁移测试结果: ${passed} 通过, ${failed} 失败 ===\n`);

  for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
