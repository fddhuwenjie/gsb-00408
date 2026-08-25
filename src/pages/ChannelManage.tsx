import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Eye, X, CheckCircle, XCircle, Calendar, Activity, AlertTriangle, Shield, User, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getChannelStatus,
  addChannel,
  updateChannel,
  deleteChannel as deleteChannelApi,
  getChannelHealthList,
  updateChannelHealth,
  refreshChannelHealth as refreshChannelHealthApi,
} from '../api/channel';
import type { Channel, ChannelHealth } from '../../shared/types';

const channelTypes = [
  { value: 'wechat', label: '微信公众号', color: 'bg-green-500' },
  { value: 'weibo', label: '微博', color: 'bg-red-500' },
  { value: 'douyin', label: '抖音', color: 'bg-pink-500' },
  { value: 'xiaohongshu', label: '小红书', color: 'bg-orange-500' },
  { value: 'bilibili', label: 'B站', color: 'bg-blue-500' },
  { value: 'other', label: '其他', color: 'bg-gray-500' },
];

const getChannelTypeInfo = (type: string) => {
  return channelTypes.find(t => t.value === type) || channelTypes[channelTypes.length - 1];
};

export default function ChannelManage() {
  const [channels, setChannels] = useState<(Channel & { today_schedule_count: number })[]>([]);
  const [channelHealthData, setChannelHealthData] = useState<Record<number, ChannelHealth>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [healthChannelId, setHealthChannelId] = useState<number | null>(null);
  const [editingResponsible, setEditingResponsible] = useState(false);
  const [responsibleInput, setResponsibleInput] = useState('');
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('wechat');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [config, setConfig] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statusData, healthList] = await Promise.all([
        getChannelStatus(),
        getChannelHealthList(),
      ]);
      setChannels(statusData.channels);
      const healthMap: Record<number, ChannelHealth> = {};
      healthList.forEach(h => { healthMap[h.channel_id] = h; });
      setChannelHealthData(healthMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenModal = (channel?: Channel) => {
    if (channel) {
      setEditingChannel(channel);
      setName(channel.name);
      setType(channel.type);
      setStatus(channel.status);
      setConfig(channel.config || '');
    } else {
      setEditingChannel(null);
      setName('');
      setType('wechat');
      setStatus('active');
      setConfig('');
    }
    setShowModal(true);
  };

  const handleOpenDetail = (channel: Channel) => {
    setSelectedChannel(channel);
    setShowDetailModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      alert('请输入渠道名称');
      return;
    }
    setSaving(true);
    try {
      if (editingChannel) {
        const updated = await updateChannel(editingChannel.id, { name, type, status, config });
        setChannels(channels.map(c => c.id === editingChannel.id ? { ...updated, today_schedule_count: c.today_schedule_count } : c));
      } else {
        const created = await addChannel({ name, type, status, config });
        setChannels([...channels, { ...created, today_schedule_count: 0 }]);
      }
      setShowModal(false);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, nameStr: string) => {
    if (!confirm(`确定要删除渠道"${nameStr}"吗？`)) return;
    try {
      await deleteChannelApi(id);
      setChannels(channels.filter(c => c.id !== id));
      const next = { ...channelHealthData };
      delete next[id];
      setChannelHealthData(next);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const toggleStatus = async (id: number) => {
    const ch = channels.find(c => c.id === id);
    if (!ch) return;
    try {
      const newStatus = ch.status === 'active' ? 'inactive' : 'active';
      await updateChannel(id, { status: newStatus });
      setChannels(channels.map(c => c.id === id ? { ...c, status: newStatus } : c));
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleSaveResponsible = async () => {
    if (!healthChannelId) return;
    const health = channelHealthData[healthChannelId];
    if (!health) return;
    try {
      const updated = await updateChannelHealth(healthChannelId, { responsible_person: responsibleInput || undefined });
      setChannelHealthData({ ...channelHealthData, [healthChannelId]: updated });
      setEditingResponsible(false);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleRefreshHealth = async () => {
    if (!healthChannelId) return;
    try {
      const updated = await refreshChannelHealthApi(healthChannelId);
      setChannelHealthData({ ...channelHealthData, [healthChannelId]: updated });
    } catch (e) {
      alert((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#1e3a5f]/30 border-t-[#1e3a5f] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">渠道管理</h1>
            <p className="text-gray-500 mt-1">管理内容发布渠道</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
          >
            <Plus className="w-5 h-5" />
            新增渠道
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {channels.map((channel) => {
            const typeInfo = getChannelTypeInfo(channel.type);
            return (
              <div
                key={channel.id}
                className="bg-white rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', typeInfo.color)}>
                      <span className="text-white font-bold text-lg">{channel.name.charAt(0)}</span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{channel.name}</h3>
                      <p className="text-sm text-gray-500">{typeInfo.label}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleStatus(channel.id)}
                    className={cn(
                      'p-1.5 rounded-lg transition-colors',
                      channel.status === 'active' ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
                    )}
                    title={channel.status === 'active' ? '已启用，点击停用' : '已停用，点击启用'}
                  >
                    {channel.status === 'active' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </button>
                </div>

                <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-600">今日排期</span>
                  </div>
                  <span className="ml-auto text-xl font-bold text-[#1e3a5f]">{channel.today_schedule_count}</span>
                </div>

                {channelHealthData[channel.id] && (() => {
                  const health = channelHealthData[channel.id];
                  const healthColor = health.success_rate >= 0.8 ? 'text-green-600' : health.success_rate >= 0.5 ? 'text-yellow-600' : 'text-red-600';
                  const rateLimitBadge = health.rate_limit_status === 'normal' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700"><Shield className="w-3 h-3" />正常</span>
                  ) : health.rate_limit_status === 'limited' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700"><AlertTriangle className="w-3 h-3" />限流中</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3 h-3" />已阻断</span>
                  );
                  return (
                    <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => { setHealthChannelId(channel.id); setShowHealthModal(true); }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-gray-400" />
                          <span className="text-sm text-gray-600">健康度</span>
                        </div>
                        <span className={cn('text-sm font-bold', healthColor)}>{(health.success_rate * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {rateLimitBadge}
                        {health.responsible_person && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <User className="w-3 h-3" />
                            {health.responsible_person}
                          </span>
                        )}
                      </div>
                      {health.last_failure_reason && (
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="truncate">{health.last_failure_reason}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2">
                  <span className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium flex-1 text-center',
                    channel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  )}>
                    {channel.status === 'active' ? '已启用' : '已停用'}
                  </span>
                  <button
                    onClick={() => handleOpenDetail(channel)}
                    className="p-2 rounded-lg text-gray-500 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                    title="查看详情"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleOpenModal(channel)}
                    className="p-2 rounded-lg text-gray-500 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                    title="编辑"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(channel.id, channel.name)}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingChannel ? '编辑渠道' : '新增渠道'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">渠道名称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入渠道名称"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">渠道类型</label>
                <div className="grid grid-cols-3 gap-2">
                  {channelTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={cn(
                        'px-3 py-2 rounded-lg text-sm font-medium transition-all border-2',
                        type === t.value
                          ? 'border-[#1e3a5f] bg-[#1e3a5f]/5 text-[#1e3a5f]'
                          : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStatus('active')}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border-2',
                      status === 'active'
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    )}
                  >
                    <CheckCircle className="w-4 h-4" />
                    启用
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus('inactive')}
                    className={cn(
                      'flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 border-2',
                      status === 'inactive'
                        ? 'border-gray-500 bg-gray-100 text-gray-700'
                        : 'border-gray-200 bg-gray-50 text-gray-600'
                    )}
                  >
                    <XCircle className="w-4 h-4" />
                    停用
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">配置信息（可选）</label>
                <textarea
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                  placeholder="请输入渠道配置信息，如API密钥等..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-all',
                  'bg-[#1e3a5f] hover:bg-[#2d4a6f]',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {saving ? '保存中...' : (editingChannel ? '保存修改' : '添加')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDetailModal && selectedChannel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">渠道详情</h3>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center', getChannelTypeInfo(selectedChannel.type).color)}>
                  <span className="text-white font-bold text-xl">{selectedChannel.name.charAt(0)}</span>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-lg">{selectedChannel.name}</h4>
                  <p className="text-sm text-gray-500">{getChannelTypeInfo(selectedChannel.type).label}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">状态</p>
                  <span className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-medium',
                    selectedChannel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  )}>
                    {selectedChannel.status === 'active' ? '已启用' : '已停用'}
                  </span>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-1">今日排期</p>
                  <p className="text-2xl font-bold text-[#1e3a5f]">{channels.find(c => c.id === selectedChannel.id)?.today_schedule_count || 0}</p>
                </div>
              </div>

              {selectedChannel.config && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500 mb-2">配置信息</p>
                  <p className="text-gray-700 text-sm font-mono break-all">{selectedChannel.config}</p>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => { setShowDetailModal(false); handleOpenModal(selectedChannel); }}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors"
              >
                编辑渠道
              </button>
            </div>
          </div>
        </div>
      )}

      {showHealthModal && healthChannelId && (() => {
        const healthChannel = channels.find(c => c.id === healthChannelId);
        const health = channelHealthData[healthChannelId];
        if (!healthChannel || !health) return null;
        const healthColor = health.success_rate >= 0.8 ? 'text-green-600' : health.success_rate >= 0.5 ? 'text-yellow-600' : 'text-red-600';
        const barColor = health.success_rate >= 0.8 ? 'bg-green-500' : health.success_rate >= 0.5 ? 'bg-yellow-500' : 'bg-red-500';
        const rateLimitBadge = health.rate_limit_status === 'normal' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700"><Shield className="w-3.5 h-3.5" />正常</span>
        ) : health.rate_limit_status === 'limited' ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700"><AlertTriangle className="w-3.5 h-3.5" />限流中</span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700"><XCircle className="w-3.5 h-3.5" />已阻断</span>
        );
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">渠道健康度</h3>
                <button onClick={() => { setShowHealthModal(false); setEditingResponsible(false); }} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center', getChannelTypeInfo(healthChannel.type).color)}>
                    <span className="text-white font-bold text-xl">{healthChannel.name.charAt(0)}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-lg">{healthChannel.name}</h4>
                    <p className="text-sm text-gray-500">{getChannelTypeInfo(healthChannel.type).label}</p>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">成功率</span>
                    </div>
                    <span className={cn('text-lg font-bold', healthColor)}>{(health.success_rate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div className={cn('h-2.5 rounded-full transition-all', barColor)} style={{ width: `${health.success_rate * 100}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">限流状态</p>
                    {rateLimitBadge}
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">负责人</p>
                    {editingResponsible ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={responsibleInput}
                          onChange={(e) => setResponsibleInput(e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] outline-none"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveResponsible}
                          className="text-xs text-[#1e3a5f] font-medium hover:underline"
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <span
                        className="flex items-center gap-1 text-sm text-gray-700 cursor-pointer hover:text-[#1e3a5f]"
                        onClick={() => { setEditingResponsible(true); setResponsibleInput(health.responsible_person || ''); }}
                      >
                        <User className="w-3.5 h-3.5" />
                        {health.responsible_person || '未设置'}
                      </span>
                    )}
                  </div>
                </div>

                {health.last_failure_reason && (
                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700">最近失败原因</span>
                    </div>
                    <p className="text-sm text-red-600 ml-6">{health.last_failure_reason}</p>
                  </div>
                )}

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">更新时间</p>
                  <p className="text-sm text-gray-700 mt-1">{health.updated_at}</p>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={handleRefreshHealth}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新健康度
                </button>
                <button
                  onClick={() => { setShowHealthModal(false); setEditingResponsible(false); }}
                  className="flex-1 py-2.5 px-4 rounded-lg font-medium bg-[#1e3a5f] text-white hover:bg-[#2d4a6f] transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
      `}</style>
    </div>
  );
}
