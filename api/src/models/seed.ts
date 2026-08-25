import bcrypt from 'bcryptjs';
import db from '../db/index.js';
import type { UserRole } from '../../../shared/types.js';

interface SeedUser {
  username: string;
  password: string;
  role: UserRole;
}

interface SeedChannel {
  name: string;
  type: string;
  status: 'active' | 'inactive';
}

interface SeedSensitiveWord {
  word: string;
  category: string;
  version: number;
  is_active: boolean;
}

const users: SeedUser[] = [
  { username: 'editor', password: 'editor123', role: 'editor' },
  { username: 'reviewer', password: 'reviewer123', role: 'reviewer' },
  { username: 'admin', password: 'admin123', role: 'admin' },
];

const channels: SeedChannel[] = [
  { name: '微信公众号', type: 'wechat', status: 'active' },
  { name: '微博', type: 'weibo', status: 'active' },
  { name: '抖音', type: 'douyin', status: 'active' },
  { name: '小红书', type: 'xiaohongshu', status: 'active' },
];

const sensitiveWords: SeedSensitiveWord[] = [
  { word: '敏感政治词汇1', category: '政治', version: 1, is_active: true },
  { word: '敏感政治词汇2', category: '政治', version: 1, is_active: true },
  { word: '敏感政治词汇3', category: '政治', version: 1, is_active: true },
  { word: '敏感政治词汇4', category: '政治', version: 1, is_active: true },
  { word: '敏感政治词汇5', category: '政治', version: 1, is_active: true },
  { word: '色情词汇1', category: '色情', version: 1, is_active: true },
  { word: '色情词汇2', category: '色情', version: 1, is_active: true },
  { word: '色情词汇3', category: '色情', version: 1, is_active: true },
  { word: '色情词汇4', category: '色情', version: 1, is_active: true },
  { word: '色情词汇5', category: '色情', version: 1, is_active: true },
  { word: '暴力词汇1', category: '暴力', version: 1, is_active: true },
  { word: '暴力词汇2', category: '暴力', version: 1, is_active: true },
  { word: '暴力词汇3', category: '暴力', version: 1, is_active: true },
  { word: '暴力词汇4', category: '暴力', version: 1, is_active: true },
  { word: '暴力词汇5', category: '暴力', version: 1, is_active: true },
  { word: '广告词汇1', category: '广告', version: 1, is_active: true },
  { word: '广告词汇2', category: '广告', version: 1, is_active: true },
  { word: '广告词汇3', category: '广告', version: 1, is_active: true },
  { word: '广告词汇4', category: '广告', version: 1, is_active: true },
  { word: '广告词汇5', category: '广告', version: 1, is_active: true },
];

export function seedData(): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)'
  );
  const insertChannel = db.prepare(
    'INSERT OR IGNORE INTO channels (name, type, status) VALUES (?, ?, ?)'
  );
  const insertSensitiveWord = db.prepare(
    'INSERT OR IGNORE INTO sensitive_words (word, category, version, is_active) VALUES (?, ?, ?, ?)'
  );
  const insertChannelHealth = db.prepare(
    'INSERT OR IGNORE INTO channel_health (channel_id, success_rate, rate_limit_status, responsible_person, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
  );

  const transaction = db.transaction(() => {
    for (const user of users) {
      const passwordHash = bcrypt.hashSync(user.password, 10);
      insertUser.run(user.username, passwordHash, user.role);
    }

    for (const channel of channels) {
      insertChannel.run(channel.name, channel.type, channel.status);
    }

    for (const word of sensitiveWords) {
      insertSensitiveWord.run(word.word, word.category, word.version, word.is_active ? 1 : 0);
    }

    const channelRows = db.prepare('SELECT id FROM channels').all() as { id: number }[];
    for (const row of channelRows) {
      insertChannelHealth.run(row.id, 1.0, 'normal', null);
    }
  });

  transaction();
}

export default seedData;
