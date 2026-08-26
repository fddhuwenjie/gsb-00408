import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDbPath = path.join(__dirname, '../data/test_health.db');

const testDir = path.dirname(testDbPath);
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.DB_PATH = testDbPath;

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

async function main() {
  console.log('\n=== 渠道健康检查与自动降级 测试 ===\n');

  const { initDatabase } = await import('./models/init.js');
  const { seedData } = await import('./models/seed.js');
  const ChannelHealthModel = (await import('./models/ChannelHealth.js')).default;
  const ChannelModel = (await import('./models/Channel.js')).default;
  const AuditLogModel = (await import('./models/AuditLog.js')).default;
  const FailureReviewModel = (await import('./models/FailureReview.js')).default;
  const ScheduleModel = (await import('./models/Schedule.js')).default;
  const ContentModel = (await import('./models/Content.js')).default;
  const HealthCheckService = await import('./services/HealthCheckService.js');

  initDatabase();
  seedData();
  console.log('  ✓ 数据库初始化和种子数据完成\n');

  const channels = await ChannelModel.findActiveChannels();
  assert.ok(channels.length > 0, '应该有种子渠道');
  const testChannelId = channels[0].id;

  console.log('渠道健康模型测试:');

  await test('初始化时应创建健康记录', async () => {
    let health = await ChannelHealthModel.findByChannelId(testChannelId);
    if (!health) {
      health = await ChannelHealthModel.create({ channel_id: testChannelId });
    }
    assert.ok(health, '健康记录应存在');
    assert.strictEqual(health.consecutive_failures, 0, '初始连续失败次数应为0');
    assert.strictEqual(health.is_degraded, false, '初始不应为降级状态');
    assert.strictEqual(health.degradation_threshold, 3, '默认阈值应为3');
    assert.strictEqual(health.is_health_check_enabled, true, '健康检查应默认启用');
    assert.ok(health.last_heartbeat, '初始心跳时间不应为空');
  });

  await test('心跳上报应更新心跳时间并重置失败计数', async () => {
    await ChannelHealthModel.recordFailure(testChannelId, '预先失败');
    const health = await ChannelHealthModel.recordHeartbeat(testChannelId);
    assert.ok(health, '应返回健康记录');
    assert.ok(health.last_heartbeat, '心跳时间不应为空');
    assert.strictEqual(health.consecutive_failures, 0, '连续失败应重置为0');
    assert.strictEqual(health.is_degraded, false, '不应为降级状态');
  });

  await test('记录失败应增加连续失败计数', async () => {
    const health = await ChannelHealthModel.recordFailure(testChannelId, '测试失败1');
    assert.strictEqual(health.consecutive_failures, 1, '连续失败应为1');
    assert.strictEqual(health.last_failure_reason, '测试失败1', '失败原因应正确');
  });

  await test('连续失败达到阈值应自动降级', async () => {
    await ChannelHealthModel.recordFailure(testChannelId, '测试失败2');
    const health = await ChannelHealthModel.recordFailure(testChannelId, '测试失败3');
    assert.strictEqual(health.consecutive_failures, 3, '连续失败应为3');
    assert.strictEqual(health.is_degraded, true, '应自动降级');
    assert.ok(health.degraded_at, '降级时间不应为空');
  });

  await test('恢复渠道应清除降级状态', async () => {
    const health = await ChannelHealthModel.restoreChannel(testChannelId);
    assert.strictEqual(health.is_degraded, false, '不应为降级状态');
    assert.strictEqual(health.consecutive_failures, 0, '连续失败应重置');
    assert.strictEqual(health.degraded_at, null, '降级时间应为空');
  });

  await test('发布成功应重置连续失败计数', async () => {
    await ChannelHealthModel.recordFailure(testChannelId, '失败');
    let health = await ChannelHealthModel.findByChannelId(testChannelId);
    assert.strictEqual(health!.consecutive_failures, 1);
    health = await ChannelHealthModel.recordSuccess(testChannelId);
    assert.strictEqual(health.consecutive_failures, 0, '成功后失败计数应清零');
    assert.strictEqual(health.last_failure_reason, null, '失败原因应清除');
  });

  await test('降级渠道列表应正确返回', async () => {
    await ChannelHealthModel.recordFailure(testChannelId, 'A');
    await ChannelHealthModel.recordFailure(testChannelId, 'B');
    await ChannelHealthModel.recordFailure(testChannelId, 'C');
    const degraded = await ChannelHealthModel.findDegradedChannels();
    assert.ok(degraded.length >= 1, '应有降级渠道');
    const found = degraded.find(h => h.channel_id === testChannelId);
    assert.ok(found, '测试渠道应在降级列表中');
    await ChannelHealthModel.restoreChannel(testChannelId);
  });

  await test('更新降级阈值应生效', async () => {
    const health = await ChannelHealthModel.updateByChannelId(testChannelId, {
      degradation_threshold: 5,
    });
    assert.strictEqual(health!.degradation_threshold, 5, '阈值应更新为5');
    await ChannelHealthModel.updateByChannelId(testChannelId, {
      degradation_threshold: 3,
    });
  });

  await test('禁用健康检查后不应自动降级', async () => {
    await ChannelHealthModel.updateByChannelId(testChannelId, {
      is_health_check_enabled: false,
    });
    await ChannelHealthModel.recordFailure(testChannelId, '禁用-1');
    await ChannelHealthModel.recordFailure(testChannelId, '禁用-2');
    await ChannelHealthModel.recordFailure(testChannelId, '禁用-3');
    const health = await ChannelHealthModel.findByChannelId(testChannelId);
    assert.strictEqual(health!.consecutive_failures, 3, '失败计数应增加');
    assert.strictEqual(health!.is_degraded, false, '健康检查禁用时不应自动降级');
    await ChannelHealthModel.updateByChannelId(testChannelId, {
      is_health_check_enabled: true,
    });
    await ChannelHealthModel.restoreChannel(testChannelId);
  });

  console.log('\n健康检查服务测试:');

  await test('发布前健康检查应允许正常渠道', async () => {
    const result = await HealthCheckService.checkChannelHealthBeforePublish(testChannelId);
    assert.strictEqual(result.allowed, true, '正常渠道应允许发布');
  });

  await test('发布前健康检查应阻止降级渠道', async () => {
    await HealthCheckService.recordPublishFailure(testChannelId, '失败1');
    await HealthCheckService.recordPublishFailure(testChannelId, '失败2');
    await HealthCheckService.recordPublishFailure(testChannelId, '失败3');
    const result = await HealthCheckService.checkChannelHealthBeforePublish(testChannelId);
    assert.strictEqual(result.allowed, false, '降级渠道应阻止发布');
    assert.ok(result.reason, '应返回阻止原因');
    await HealthCheckService.recordHeartbeat(testChannelId, 1);
  });

  await test('心跳恢复后应允许发布', async () => {
    const result = await HealthCheckService.checkChannelHealthBeforePublish(testChannelId);
    assert.strictEqual(result.allowed, true, '心跳恢复后应允许发布');
  });

  await test('手动降级应创建审计日志并转移排期', async () => {
    const content = await ContentModel.create({
      creator_id: 1,
      type: 'article',
      title: '测试健康检查文章',
      content: '测试内容',
      status: 'review_approved',
    });
    const schedule = await ScheduleModel.create({
      content_id: content.id,
      channel_id: testChannelId,
      schedule_time: new Date(Date.now() + 3600000).toISOString(),
      status: 'scheduled',
    });

    const beforeLogs = (await AuditLogModel.findAll({ page: 1, pageSize: 100 })).total;
    await HealthCheckService.degradeChannelManually(testChannelId, '手动测试降级', 1, '127.0.0.1');
    const afterLogs = (await AuditLogModel.findAll({ page: 1, pageSize: 100 })).total;
    assert.ok(afterLogs > beforeLogs, '应创建审计日志');

    const logs = await AuditLogModel.findByResource('channel', testChannelId, { page: 1, pageSize: 50 });
    const degradeLog = logs.items.find(l => l.action === 'channel_degrade');
    assert.ok(degradeLog, '应有降级审计日志');
    assert.strictEqual(degradeLog.operator_id, 1, '操作者ID应为1');
    assert.ok(degradeLog.detail!.includes('手动测试降级'), '日志应包含降级原因');

    const updatedSchedule = await ScheduleModel.findById(schedule.id);
    assert.strictEqual(updatedSchedule!.status, 'pending_review', '排期应转入待复核');

    const pendingReview = await FailureReviewModel.findPendingByScheduleId(schedule.id);
    assert.ok(pendingReview, '应创建失败复核记录');
    assert.ok(pendingReview.reason!.includes('降级'), '复核原因应包含降级');

    await HealthCheckService.restoreChannel(testChannelId, 1);
  });

  await test('心跳上报应记录审计日志', async () => {
    const logs = await AuditLogModel.findByResource('channel', testChannelId, { page: 1, pageSize: 50 });
    const heartbeatLog = logs.items.find(l => l.action === 'channel_heartbeat');
    assert.ok(heartbeatLog, '应有心跳审计日志');
  });

  await test('健康配置更新应记录审计日志', async () => {
    await HealthCheckService.updateHealthConfig(testChannelId, {
      degradation_threshold: 5,
    }, 1);
    const logs = await AuditLogModel.findByResource('channel', testChannelId, { page: 1, pageSize: 50 });
    const configLog = logs.items.find(l => l.action === 'channel_health_config');
    assert.ok(configLog, '应有配置更新审计日志');
    assert.ok(configLog.detail!.includes('5'), '日志应包含新阈值');
    await HealthCheckService.updateHealthConfig(testChannelId, {
      degradation_threshold: 3,
    }, 1);
  });

  await test('无效阈值应被拒绝', async () => {
    try {
      await HealthCheckService.updateHealthConfig(testChannelId, {
        degradation_threshold: 0,
      }, 1);
      assert.fail('应拒绝阈值0');
    } catch (e) {
      assert.ok((e as Error).message.includes('1-100'), '应提示范围错误');
    }
    try {
      await HealthCheckService.updateHealthConfig(testChannelId, {
        degradation_threshold: 101,
      }, 1);
      assert.fail('应拒绝阈值101');
    } catch (e) {
      assert.ok((e as Error).message.includes('1-100'), '应提示范围错误');
    }
  });

  console.log('\n失败复核模型测试:');

  await test('应能创建无发布记录的失败复核（发布前拦截）', async () => {
    const content = await ContentModel.create({
      creator_id: 1,
      type: 'article',
      title: '测试复核文章',
      content: '测试内容',
      status: 'review_approved',
    });
    const schedule = await ScheduleModel.create({
      content_id: content.id,
      channel_id: testChannelId,
      schedule_time: new Date(Date.now() + 7200000).toISOString(),
      status: 'scheduled',
    });
    const review = await FailureReviewModel.create({
      schedule_id: schedule.id,
      reason: '渠道降级，发布前拦截',
    });
    assert.ok(review.id, '应返回复核ID');
    assert.strictEqual(review.publish_record_id, null, '发布记录ID应为空');
    assert.strictEqual(review.status, 'pending', '状态应为待处理');
    assert.strictEqual(review.reason, '渠道降级，发布前拦截', '原因应正确');
  });

  await test('应能查询待处理复核列表（含关联数据）', async () => {
    const result = await FailureReviewModel.findAllPendingWithRelations({ page: 1, pageSize: 10 });
    assert.ok(result.items.length >= 1, '应至少有1条待处理复核');
    const review = result.items[0];
    assert.strictEqual(review.status, 'pending', '状态应为待处理');
  });

  await test('应能处理复核并记录结论', async () => {
    const content = await ContentModel.create({
      creator_id: 1,
      type: 'poster',
      title: '测试处理复核文章',
      content: '测试内容',
      status: 'review_approved',
    });
    const schedule = await ScheduleModel.create({
      content_id: content.id,
      channel_id: testChannelId,
      schedule_time: new Date(Date.now() + 10800000).toISOString(),
      status: 'scheduled',
    });
    const newReview = await FailureReviewModel.create({
      schedule_id: schedule.id,
      reason: '测试处理复核',
    });
    const resolved = await FailureReviewModel.resolve(
      newReview.id, 1, '已确认问题并修复', 'manual_publish'
    );
    assert.strictEqual(resolved!.status, 'resolved', '状态应为已处理');
    assert.strictEqual(resolved!.handler_id, 1, '处理人应为1');
    assert.strictEqual(resolved!.conclusion, '已确认问题并修复', '结论应正确');
    assert.ok(resolved!.resolved_at, '处理时间不应为空');
  });

  console.log('\n数据完整性测试:');

  await test('所有渠道都应有健康记录', async () => {
    const allChannels = await ChannelModel.findActiveChannels();
    for (const ch of allChannels) {
      const health = await ChannelHealthModel.findByChannelId(ch.id);
      assert.ok(health, `渠道 ${ch.name} 应有健康记录`);
    }
  });

  await test('审计日志应支持按操作类型筛选', async () => {
    const result = await AuditLogModel.findAll({
      page: 1,
      pageSize: 10,
      action: 'channel_degrade',
    });
    assert.ok(result.items.length > 0, '应能查到降级操作日志');
    result.items.forEach(log => {
      assert.strictEqual(log.action, 'channel_degrade', '所有日志应为降级操作');
    });
  });

  await test('审计日志应记录IP地址', async () => {
    const logs = await AuditLogModel.findByResource('channel', testChannelId, { page: 1, pageSize: 50 });
    const logWithIp = logs.items.find(l => l.ip_address === '127.0.0.1');
    assert.ok(logWithIp, '应有记录IP地址的审计日志');
  });

  await test('降级渠道数量统计应正确', async () => {
    await ChannelHealthModel.recordFailure(testChannelId, 'X');
    await ChannelHealthModel.recordFailure(testChannelId, 'Y');
    await ChannelHealthModel.recordFailure(testChannelId, 'Z');
    const count = await ChannelHealthModel.countDegraded();
    assert.ok(count >= 1, '至少应有1个降级渠道');
    await ChannelHealthModel.restoreChannel(testChannelId);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);

  for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
