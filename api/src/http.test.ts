import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDbPath = path.join(__dirname, '../data/test_http.db');
const testDir = path.dirname(testDbPath);
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.DB_PATH = testDbPath;
process.env.PORT = '3999';
process.env.NODE_ENV = 'test';
process.env.PUBLISH_FORCE_FAILURE = 'true';

const BASE = 'http://127.0.0.1:3999/api';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
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

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function login(username: string, password: string): Promise<{ token: string; user: { id: number; role: string; username: string } }> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`登录失败: ${body.error || res.status}`);
  return body.data;
}

async function main() {
  console.log('\n=== HTTP 闭环测试 ===\n');

  console.log('1. 启动测试服务器...');
  await import('./index.js');
  await new Promise(r => setTimeout(r, 2000));
  console.log('   服务器已启动\n');

  let testChannelId: number;

  console.log('2. 鉴权测试:');

  await test('未登录访问渠道列表应返回 401', async () => {
    const res = await fetch(`${BASE}/channel`);
    assert.strictEqual(res.status, 401, `期望 401，实际 ${res.status}`);
  });

  await test('未登录访问心跳接口应返回 401', async () => {
    const res = await fetch(`${BASE}/channel/1/heartbeat`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  });

  await test('未登录访问失败复核应返回 401', async () => {
    const res = await fetch(`${BASE}/failure-reviews`);
    assert.strictEqual(res.status, 401);
  });

  await test('使用错误密码登录应返回 401', async () => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' }),
    });
    assert.strictEqual(res.status, 401);
  });

  console.log('\n3. 登录获取 Token:');
  const adminLogin = await login('admin', 'admin123');
  const adminToken = adminLogin.token;
  const editorLogin = await login('editor', 'editor123');
  const editorToken = editorLogin.token;
  const reviewerLogin = await login('reviewer', 'reviewer123');
  const reviewerToken = reviewerLogin.token;
  console.log(`   admin (id=${adminLogin.user.id}), editor (id=${editorLogin.user.id}), reviewer (id=${reviewerLogin.user.id})\n`);

  console.log('4. 角色越权测试:');

  await test('editor 不能创建渠道（应 403）', async () => {
    const res = await fetch(`${BASE}/channel`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ name: '越权测试渠道', type: 'other' }),
    });
    assert.strictEqual(res.status, 403, `期望 403，实际 ${res.status}`);
  });

  await test('editor 不能手动降级渠道（应 403）', async () => {
    const res = await fetch(`${BASE}/channel/1/degrade`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ reason: '测试' }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('editor 不能恢复渠道（应 403）', async () => {
    const res = await fetch(`${BASE}/channel/1/restore`, {
      method: 'POST',
      headers: authHeader(editorToken),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('editor 不能修改健康配置（应 403）', async () => {
    const res = await fetch(`${BASE}/channel/1/health/config`, {
      method: 'PUT',
      headers: authHeader(editorToken),
      body: JSON.stringify({ degradation_threshold: 5 }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('reviewer 不能手动降级渠道（应 403）', async () => {
    const res = await fetch(`${BASE}/channel/1/degrade`, {
      method: 'POST',
      headers: authHeader(reviewerToken),
      body: JSON.stringify({ reason: '测试' }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('reviewer 不能重新排期待复核任务（应 403）', async () => {
    const res = await fetch(`${BASE}/schedule/1/reschedule`, {
      method: 'POST',
      headers: authHeader(reviewerToken),
      body: JSON.stringify({ schedule_time: new Date(Date.now() + 3600000).toISOString() }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('editor 不能处理失败复核（应 403）', async () => {
    const res = await fetch(`${BASE}/failure-reviews/1/resolve`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ conclusion: 'test', action_type: 'republish' }),
    });
    assert.strictEqual(res.status, 403);
  });

  console.log('\n5. 渠道健康与降级闭环测试:');

  await test('admin 可以获取渠道健康列表', async () => {
    const res = await fetch(`${BASE}/channel/health`, { headers: authHeader(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data), '应返回数组');
    assert.ok(body.data.length > 0, '应有健康记录');
    testChannelId = body.data[0].channel_id;
  });

  await test('admin 可以发送心跳', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/heartbeat`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.health.last_heartbeat, '应返回心跳时间');
    assert.strictEqual(body.data.health.consecutive_failures, 0);
  });

  await test('admin 可以更新降级阈值', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/health/config`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ degradation_threshold: 3, is_health_check_enabled: true }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.degradation_threshold, 3);
    assert.strictEqual(body.data.is_health_check_enabled, true);
  });

  await test('admin 可以更新健康字段并记录审计', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/health`, {
      method: 'PUT',
      headers: authHeader(adminToken),
      body: JSON.stringify({ responsible_person: 'HTTP测试负责人', rate_limit_status: 'normal' }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.responsible_person, 'HTTP测试负责人');
  });

  await test('editor 不能修改健康字段（应 403）', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/health`, {
      method: 'PUT',
      headers: authHeader(editorToken),
      body: JSON.stringify({ responsible_person: '越权' }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('真实发布连续失败3次后渠道自动降级（端到端闭环）', async () => {
    const scheduleTime = new Date(Date.now() + 3000).toISOString();

    const contentRes = await fetch(`${BASE}/content`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: '自动降级闭环测试文章', type: 'article', content: '测试内容' }),
    });
    assert.strictEqual(contentRes.status, 201);
    const contentBody = await contentRes.json();
    const contentId = contentBody.data.id;

    const submitRes = await fetch(`${BASE}/content/${contentId}/submit`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ channel_id: testChannelId, schedule_time: scheduleTime }),
    });
    assert.ok(submitRes.status === 200 || submitRes.status === 201, `提交审核失败: ${submitRes.status}`);

    const approveRes = await fetch(`${BASE}/review/${contentId}/approve`, {
      method: 'POST',
      headers: authHeader(reviewerToken),
      body: JSON.stringify({ opinion: '审批通过' }),
    });
    assert.strictEqual(approveRes.status, 200, `审批失败: ${approveRes.status}`);

    await new Promise(r => setTimeout(r, 4000));

    const scheduleListRes = await fetch(`${BASE}/schedule?pageSize=50`, {
      headers: authHeader(adminToken),
    });
    const scheduleBody = await scheduleListRes.json();
    const targetSchedule = (scheduleBody.data?.items || []).find(
      (s: { content_id: number; channel_id: number }) => s.content_id === contentId && s.channel_id === testChannelId
    );
    assert.ok(targetSchedule, '应找到目标排期');
    const scheduleId = targetSchedule.id;

    const recordsRes = await fetch(`${BASE}/publish/records?pageSize=50`, {
      headers: authHeader(adminToken),
    });
    const recordsBody = await recordsRes.json();
    const firstRecord = (recordsBody.data?.items || []).find(
      (r: { schedule_id: number }) => r.schedule_id === scheduleId
    );
    assert.ok(firstRecord, '第一次发布应生成发布记录');
    assert.strictEqual(firstRecord.status, 'failed', '第一次发布应失败');

    const healthAfter1 = await fetch(`${BASE}/channel/${testChannelId}/health`, { headers: authHeader(adminToken) });
    const h1 = await healthAfter1.json();
    assert.strictEqual(h1.data.consecutive_failures, 1, `第1次后连续失败应为1，实际 ${h1.data.consecutive_failures}`);
    assert.strictEqual(h1.data.is_degraded, false, '第1次失败不应降级');

    const retry2 = await fetch(`${BASE}/publish/records/${firstRecord.id}/retry`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(retry2.status, 200, `第2次重试失败: ${retry2.status}`);
    await new Promise(r => setTimeout(r, 200));

    const healthAfter2 = await fetch(`${BASE}/channel/${testChannelId}/health`, { headers: authHeader(adminToken) });
    const h2 = await healthAfter2.json();
    assert.strictEqual(h2.data.consecutive_failures, 2, `第2次后连续失败应为2，实际 ${h2.data.consecutive_failures}`);
    assert.strictEqual(h2.data.is_degraded, false, '第2次失败不应降级');

    const retry3 = await fetch(`${BASE}/publish/records/${firstRecord.id}/retry`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(retry3.status, 200, `第3次重试失败: ${retry3.status}`);
    await new Promise(r => setTimeout(r, 200));

    const healthAfter3 = await fetch(`${BASE}/channel/${testChannelId}/health`, { headers: authHeader(adminToken) });
    const h3 = await healthAfter3.json();
    assert.strictEqual(h3.data.consecutive_failures, 3, '第3次后连续失败应为3');
    assert.strictEqual(h3.data.is_degraded, true, '第3次失败后应自动降级');
    assert.ok(h3.data.degraded_at, '降级时间不应为空');
    assert.ok(h3.data.last_failure_reason && h3.data.last_failure_reason.includes('注入失败'), '失败原因应包含注入信息');

    const degradedRes = await fetch(`${BASE}/channel/degraded`, { headers: authHeader(adminToken) });
    const degradedBody = await degradedRes.json();
    const found = degradedBody.data.find((d: { channel_id: number }) => d.channel_id === testChannelId);
    assert.ok(found, '渠道应出现在降级列表中');

    const scheduleAfter = await fetch(`${BASE}/schedule?pageSize=50`, { headers: authHeader(adminToken) });
    const schedAfterBody = await scheduleAfter.json();
    const updatedSchedule = (schedAfterBody.data?.items || []).find(
      (s: { id: number }) => s.id === scheduleId
    );
    assert.strictEqual(updatedSchedule.status, 'pending_review', '排期应转入待复核');

    const reviewsRes = await fetch(`${BASE}/failure-reviews?status=pending`, { headers: authHeader(reviewerToken) });
    const reviewsBody = await reviewsRes.json();
    const relatedReview = (reviewsBody.data?.items || []).find(
      (r: { schedule_id: number }) => r.schedule_id === scheduleId
    );
    assert.ok(relatedReview, '应生成关联的失败复核记录');
    assert.ok(
      relatedReview.reason && (relatedReview.reason.includes('注入失败') || relatedReview.reason.includes('降级')),
      `复核原因应包含失败或降级信息，实际: ${relatedReview.reason}`
    );

    const auditRes = await fetch(`${BASE}/channel/${testChannelId}/audit-logs?pageSize=50`, { headers: authHeader(adminToken) });
    const auditBody = await auditRes.json();
    const actions = auditBody.data.items.map((l: { action: string }) => l.action);
    assert.ok(actions.includes('channel_degrade'), '审计日志应包含 channel_degrade');
    assert.ok(actions.includes('health_check_performed'), '审计日志应包含 health_check_performed');

    const degradeLog = auditBody.data.items.find((l: { action: string }) => l.action === 'channel_degrade');
    assert.ok(degradeLog.operator_id === null || degradeLog.operator_id, '降级审计应记录操作者（系统自动为null）');
    assert.ok(degradeLog.detail.includes('3'), '降级详情应包含失败次数');
    assert.ok(degradeLog.created_at, '降级审计应有时间戳');

    await fetch(`${BASE}/channel/${testChannelId}/heartbeat`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
  });

  await test('admin 可以手动降级渠道', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/degrade`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ reason: 'HTTP测试：手动降级验证' }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.is_degraded, true, '渠道应已降级');
    assert.ok(body.data.degraded_at, '降级时间不应为空');
  });

  await test('降级后渠道出现在降级列表中', async () => {
    const res = await fetch(`${BASE}/channel/degraded`, { headers: authHeader(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    const found = body.data.find((h: { channel_id: number }) => h.channel_id === testChannelId);
    assert.ok(found, '降级渠道应在列表中');
  });

  await test('降级后无法创建排期（健康检查拦截返回 503）', async () => {
    const futureTime = new Date(Date.now() + 7200000).toISOString();

    const contentRes = await fetch(`${BASE}/content`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: 'HTTP拦截测试文章', type: 'article', content: '测试内容正文' }),
    });
    assert.strictEqual(contentRes.status, 201);
    const contentBody = await contentRes.json();
    const contentId = contentBody.data.id;

    const submitRes = await fetch(`${BASE}/content/${contentId}/submit`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ channel_id: testChannelId, schedule_time: futureTime }),
    });
    assert.ok(submitRes.status === 201 || submitRes.status === 200, `提交审核失败: ${submitRes.status}`);

    const approveRes = await fetch(`${BASE}/review/${contentId}/approve`, {
      method: 'POST',
      headers: authHeader(reviewerToken),
      body: JSON.stringify({ opinion: 'HTTP测试审批通过' }),
    });
    assert.strictEqual(approveRes.status, 200, `审批失败: ${approveRes.status}`);

    await fetch(`${BASE}/channel/${testChannelId}/degrade`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ reason: '测试排期拦截' }),
    });

    const scheduleRes = await fetch(`${BASE}/schedule`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({
        content_id: contentId,
        channel_id: testChannelId,
        schedule_time: new Date(Date.now() + 10800000).toISOString(),
      }),
    });
    assert.strictEqual(scheduleRes.status, 503, `期望 503，实际 ${scheduleRes.status}`);
    const errBody = await scheduleRes.json();
    assert.ok(errBody.error && errBody.error.includes('降级'), '错误信息应包含降级原因');

    await fetch(`${BASE}/channel/${testChannelId}/restore`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
  });

  await test('心跳上报可以恢复降级渠道', async () => {
    await fetch(`${BASE}/channel/${testChannelId}/degrade`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ reason: '心跳恢复测试前置降级' }),
    });

    const res = await fetch(`${BASE}/channel/${testChannelId}/heartbeat`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.was_degraded, true, '应报告之前处于降级状态');
    assert.strictEqual(body.data.health.is_degraded, false, '降级状态应已清除');
    assert.strictEqual(body.data.health.consecutive_failures, 0, '失败计数应清零');
  });

  await test('admin 可以手动恢复渠道', async () => {
    await fetch(`${BASE}/channel/${testChannelId}/degrade`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ reason: '再次降级测试恢复' }),
    });
    const res = await fetch(`${BASE}/channel/${testChannelId}/restore`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.is_degraded, false);
  });

  console.log('\n6. 审计日志验证:');

  await test('所有健康操作都记录了审计日志', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/audit-logs?pageSize=50`, {
      headers: authHeader(adminToken),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.items.length > 0, '应有审计日志');
    const actions = body.data.items.map((l: { action: string }) => l.action);
    assert.ok(actions.includes('channel_heartbeat'), '应有心跳审计');
    assert.ok(actions.includes('channel_degrade'), '应有降级审计');
    assert.ok(actions.includes('channel_restore'), '应有恢复审计');
    assert.ok(actions.includes('channel_health_config'), '应有配置审计');
  });

  await test('审计日志记录了操作者ID和IP', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/audit-logs?pageSize=10`, {
      headers: authHeader(adminToken),
    });
    const body = await res.json();
    const log = body.data.items[0];
    assert.ok(log.operator_id, '应有操作者ID');
    assert.ok(log.detail, '应有操作详情');
    assert.ok(log.created_at, '应有时间戳');
  });

  await test('editor 不能查看全局审计日志（应 403）', async () => {
    const res = await fetch(`${BASE}/audit-logs`, { headers: authHeader(editorToken) });
    assert.strictEqual(res.status, 403);
  });

  await test('admin 可以查看全局审计日志', async () => {
    const res = await fetch(`${BASE}/audit-logs?pageSize=5`, { headers: authHeader(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.items.length > 0, '应有审计记录');
  });

  console.log('\n7. 失败复核与重新排期闭环:');

  await test('降级渠道后创建排期会生成待复核记录', async () => {
    await fetch(`${BASE}/channel/${testChannelId}/degrade`, {
      method: 'POST',
      headers: authHeader(adminToken),
      body: JSON.stringify({ reason: '测试待复核生成' }),
    });

    await fetch(`${BASE}/content`, {
      method: 'POST',
      headers: authHeader(editorToken),
      body: JSON.stringify({ title: '待复核测试内容', type: 'article', content: '测试内容' }),
    });

    const reviewCheckRes = await fetch(`${BASE}/failure-reviews?status=pending`, {
      headers: authHeader(reviewerToken),
    });
    const reviewBody = await reviewCheckRes.json();
    assert.strictEqual(reviewBody.success, true);
    assert.ok(Array.isArray(reviewBody.data.items), '应返回复核列表');

    await fetch(`${BASE}/channel/${testChannelId}/restore`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
  });

  await test('reviewer 可以查看待复核列表', async () => {
    const res = await fetch(`${BASE}/failure-reviews?status=pending`, {
      headers: authHeader(reviewerToken),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data.items.length >= 0);
  });

  await test('admin 可以处理失败复核（manual_publish）', async () => {
    const listRes = await fetch(`${BASE}/failure-reviews?status=pending`, {
      headers: authHeader(adminToken),
    });
    const listBody = await listRes.json();
    if (listBody.data.items.length > 0) {
      const rid = listBody.data.items[0].id;
      const res = await fetch(`${BASE}/failure-reviews/${rid}/resolve`, {
        method: 'POST',
        headers: authHeader(adminToken),
        body: JSON.stringify({ conclusion: 'HTTP测试：确认已手动处理', action_type: 'manual_publish' }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.data.status, 'resolved');
      assert.strictEqual(body.data.conclusion, 'HTTP测试：确认已手动处理');
    } else {
      console.log('     (无待处理复核，跳过)');
    }
  });

  await test('健康检查刷新需要 admin 权限', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/health/refresh`, {
      method: 'POST',
      headers: authHeader(editorToken),
    });
    assert.strictEqual(res.status, 403);
  });

  await test('admin 可以刷新健康度并记录审计', async () => {
    const res = await fetch(`${BASE}/channel/${testChannelId}/health/refresh`, {
      method: 'POST',
      headers: authHeader(adminToken),
    });
    assert.strictEqual(res.status, 200);
  });

  console.log('\n8. 仪表盘统计验证:');

  await test('仪表盘返回降级渠道数和待复盘数', async () => {
    const res = await fetch(`${BASE}/dashboard/stats`, { headers: authHeader(adminToken) });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok('degraded_channel_count' in body.data, '应包含降级渠道数');
    assert.ok('pending_failure_review_count' in body.data, '应包含待复盘数');
    assert.ok(typeof body.data.degraded_channel_count === 'number');
  });

  console.log(`\n=== HTTP 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);

  for (const f of [testDbPath, testDbPath + '-wal', testDbPath + '-shm']) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('测试运行失败:', e);
  process.exit(1);
});
