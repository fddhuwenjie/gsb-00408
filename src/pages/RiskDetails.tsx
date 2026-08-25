import { useState } from 'react';
import { Filter, Download, FileText, AlertTriangle, CheckCircle, Clock, Search, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ScanRecord, SensitiveWord, Content } from '../../shared/types';

const mockScanRecords: (ScanRecord & { word?: SensitiveWord; content?: Content })[] = [
  { id: 1, content_id: 1, word_id: 1, version: 1, matched_text: '敏感政治词汇1', position: 50, created_at: '2024-01-15 10:30', word: { id: 1, word: '敏感政治词汇1', category: '政治', version: 1, is_active: true, created_at: '' }, content: { id: 1, title: '2024年度产品发布会预告', type: 'article', status: 'pending_review', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
  { id: 2, content_id: 1, word_id: 3, version: 1, matched_text: '色情词汇1', position: 120, created_at: '2024-01-15 10:30', word: { id: 3, word: '色情词汇1', category: '色情', version: 1, is_active: true, created_at: '' }, content: { id: 1, title: '2024年度产品发布会预告', type: 'article', status: 'pending_review', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
  { id: 3, content_id: 3, word_id: 5, version: 1, matched_text: '暴力词汇1', position: 30, created_at: '2024-01-14 16:45', word: { id: 5, word: '暴力词汇1', category: '暴力', version: 1, is_active: true, created_at: '' }, content: { id: 3, title: '春节活动海报设计', type: 'poster', status: 'scheduled', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
  { id: 4, content_id: 4, word_id: 1, version: 1, matched_text: '敏感政治词汇1', position: 80, created_at: '2024-01-14 14:20', word: { id: 1, word: '敏感政治词汇1', category: '政治', version: 1, is_active: true, created_at: '' }, content: { id: 4, title: '客户案例分享文章', type: 'article', status: 'published', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
  { id: 5, content_id: 4, word_id: 2, version: 1, matched_text: '敏感政治词汇2', position: 150, created_at: '2024-01-14 14:20', word: { id: 2, word: '敏感政治词汇2', category: '政治', version: 1, is_active: true, created_at: '' }, content: { id: 4, title: '客户案例分享文章', type: 'article', status: 'published', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
  { id: 6, content_id: 4, word_id: 6, version: 1, matched_text: '广告词汇1', position: 200, created_at: '2024-01-14 14:20', word: { id: 6, word: '广告词汇1', category: '广告', version: 1, is_active: true, created_at: '' }, content: { id: 4, title: '客户案例分享文章', type: 'article', status: 'published', creator_id: 1, content: '', scan_version: 1, created_at: '', updated_at: '' } },
];

const contents = ['全部内容', '2024年度产品发布会预告', '新品上市短视频宣传', '春节活动海报设计', '客户案例分享文章'];
const sensitiveWords = ['全部敏感词', '敏感政治词汇1', '敏感政治词汇2', '色情词汇1', '暴力词汇1', '广告词汇1'];
const versions = ['全部版本', 'v1', 'v2'];

type ProcessStatus = 'pending' | 'handled' | 'ignored';

const statusConfig: Record<ProcessStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '待处理', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  handled: { label: '已处理', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  ignored: { label: '已忽略', color: 'bg-gray-100 text-gray-600', icon: CheckCircle },
};

const categoryColors: Record<string, string> = {
  '政治': 'bg-red-100 text-red-700',
  '色情': 'bg-pink-100 text-pink-700',
  '暴力': 'bg-orange-100 text-orange-700',
  '广告': 'bg-yellow-100 text-yellow-700',
  '其他': 'bg-gray-100 text-gray-700',
};

export default function RiskDetails() {
  const [contentFilter, setContentFilter] = useState('全部内容');
  const [wordFilter, setWordFilter] = useState('全部敏感词');
  const [versionFilter, setVersionFilter] = useState('全部版本');
  const [search, setSearch] = useState('');
  const [showContentDropdown, setShowContentDropdown] = useState(false);
  const [showWordDropdown, setShowWordDropdown] = useState(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  const processStatuses: Record<number, ProcessStatus> = {
    1: 'pending', 2: 'handled', 3: 'pending', 4: 'ignored', 5: 'handled', 6: 'pending',
  };

  const filteredRecords = mockScanRecords.filter(item => {
    const matchSearch = item.matched_text.toLowerCase().includes(search.toLowerCase()) ||
                        item.content?.title.toLowerCase().includes(search.toLowerCase());
    const matchContent = contentFilter === '全部内容' || item.content?.title === contentFilter;
    const matchWord = wordFilter === '全部敏感词' || item.word?.word === wordFilter;
    const matchVersion = versionFilter === '全部版本' || `v${item.version}` === versionFilter;
    return matchSearch && matchContent && matchWord && matchVersion;
  });

  const handleExport = () => {
    alert('导出功能已触发，正在生成导出文件...');
  };

  const DropdownButton = ({ label, value, onClick, show }: { label: string; value: string; onClick: () => void; show: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
    >
      <Filter className="w-4 h-4 text-gray-500" />
      <span className="hidden sm:inline text-gray-600">{label}:</span>
      <span className="font-medium text-gray-900">{value}</span>
      <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', show && 'rotate-180')} />
    </button>
  );

  const DropdownMenu = ({ options, onSelect, show }: { options: string[]; onSelect: (v: string) => void; show: boolean }) => show && (
    <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[160px] max-h-48 overflow-auto">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
        >
          {opt}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">风险词明细</h1>
            <p className="text-gray-500 mt-1">查看敏感词扫描命中记录</p>
          </div>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
          >
            <Download className="w-5 h-5" />
            导出
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索命中词或内容标题..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="relative">
                <DropdownButton
                  label="内容"
                  value={contentFilter}
                  onClick={() => { setShowContentDropdown(!showContentDropdown); setShowWordDropdown(false); setShowVersionDropdown(false); }}
                  show={showContentDropdown}
                />
                <DropdownMenu
                  options={contents}
                  onSelect={(v) => { setContentFilter(v); setShowContentDropdown(false); }}
                  show={showContentDropdown}
                />
              </div>
              <div className="relative">
                <DropdownButton
                  label="敏感词"
                  value={wordFilter}
                  onClick={() => { setShowWordDropdown(!showWordDropdown); setShowContentDropdown(false); setShowVersionDropdown(false); }}
                  show={showWordDropdown}
                />
                <DropdownMenu
                  options={sensitiveWords}
                  onSelect={(v) => { setWordFilter(v); setShowWordDropdown(false); }}
                  show={showWordDropdown}
                />
              </div>
              <div className="relative">
                <DropdownButton
                  label="版本"
                  value={versionFilter}
                  onClick={() => { setShowVersionDropdown(!showVersionDropdown); setShowContentDropdown(false); setShowWordDropdown(false); }}
                  show={showVersionDropdown}
                />
                <DropdownMenu
                  options={versions}
                  onSelect={(v) => { setVersionFilter(v); setShowVersionDropdown(false); }}
                  show={showVersionDropdown}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">命中词</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">分类</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">内容标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">命中位置</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">扫描版本</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">处理状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRecords.map((item) => {
                  const status = processStatuses[item.id] || 'pending';
                  const statusInfo = statusConfig[status];
                  const StatusIcon = statusInfo.icon;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-500" />
                          <span className="text-gray-900 font-medium">{item.matched_text}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium', categoryColors[item.word?.category || '其他'])}>
                          {item.word?.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700 truncate max-w-xs">{item.content?.title}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">第 {item.position} 字符</td>
                      <td className="px-6 py-4">
                        <span className="text-gray-600 font-medium">v{item.version}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5', statusInfo.color)}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusInfo.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无扫描记录</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
