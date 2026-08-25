import { useState } from 'react';
import { FileText, Video, Image, Save, Send, X, Calendar, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ContentType, Channel } from '../../shared/types';

const mockChannels: Channel[] = [
  { id: 1, name: '微信公众号', type: 'wechat', status: 'active' },
  { id: 2, name: '微博', type: 'weibo', status: 'active' },
  { id: 3, name: '抖音', type: 'douyin', status: 'active' },
  { id: 4, name: '小红书', type: 'xiaohongshu', status: 'active' },
];

const tabs: { key: ContentType; label: string; icon: typeof FileText }[] = [
  { key: 'article', label: '文章', icon: FileText },
  { key: 'video', label: '短视频', icon: Video },
  { key: 'poster', label: '海报', icon: Image },
];

export default function ContentCreate() {
  const [type, setType] = useState<ContentType>('article');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSaveDraft = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setSaving(false);
    alert('草稿保存成功！');
  };

  const handleSubmitSchedule = async () => {
    if (!selectedChannel || !scheduleTime) {
      alert('请选择渠道和排期时间');
      return;
    }
    setSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSubmitting(false);
    setShowScheduleModal(false);
    alert('排期提交成功，等待复核！');
  };

  const selectedChannelInfo = mockChannels.find(c => c.id === selectedChannel);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">创建内容</h1>
          <p className="text-gray-500 mt-1">创建新的内容并提交排期</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setType(tab.key)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-medium transition-all',
                  type === tab.key
                    ? 'bg-white text-[#1e3a5f] shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                )}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">标题</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`请输入${tabs.find(t => t.key === type)?.label}标题`}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">内容</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`请输入${tabs.find(t => t.key === type)?.label}内容...`}
                rows={10}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none resize-none"
              />
              <p className="text-xs text-gray-400 mt-2">{content.length} 字符</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">缩略图URL（可选）</label>
              <input
                type="url"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
              />
              {thumbnailUrl && (
                <div className="mt-3 rounded-lg overflow-hidden border border-gray-200">
                  <img src={thumbnailUrl} alt="缩略图预览" className="w-full h-48 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleSaveDraft}
            disabled={saving || !title.trim() || !content.trim()}
            className={cn(
              'flex-1 py-3 px-6 rounded-lg font-medium transition-all flex items-center justify-center gap-2',
              'border-2 border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/5',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Save className="w-5 h-5" />
            {saving ? '保存中...' : '保存草稿'}
          </button>
          <button
            onClick={() => setShowScheduleModal(true)}
            disabled={!title.trim() || !content.trim()}
            className={cn(
              'flex-1 py-3 px-6 rounded-lg font-medium text-white transition-all flex items-center justify-center gap-2',
              'bg-[#1e3a5f] hover:bg-[#2d4a6f] active:scale-[0.98]',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Send className="w-5 h-5" />
            提交排期
          </button>
        </div>
      </div>

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">提交排期</h3>
              <button onClick={() => setShowScheduleModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择渠道</label>
                <button
                  type="button"
                  onClick={() => setShowChannelDropdown(!showChannelDropdown)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-left flex items-center justify-between focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                >
                  <span className={selectedChannelInfo ? 'text-gray-900' : 'text-gray-400'}>
                    {selectedChannelInfo?.name || '请选择发布渠道'}
                  </span>
                  <ChevronDown className={cn('w-5 h-5 text-gray-400 transition-transform', showChannelDropdown && 'rotate-180')} />
                </button>
                {showChannelDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                    {mockChannels.map(channel => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => { setSelectedChannel(channel.id); setShowChannelDropdown(false); }}
                        className={cn(
                          'w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors',
                          selectedChannel === channel.id && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        )}
                      >
                        {channel.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">排期时间</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 py-2.5 px-4 rounded-lg font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmitSchedule}
                disabled={submitting || !selectedChannel || !scheduleTime}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-all',
                  'bg-[#1e3a5f] hover:bg-[#2d4a6f]',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {submitting ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </div>
      )}

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
