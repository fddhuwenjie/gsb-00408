import React, { useState } from 'react';
import { Search, Filter, Edit2, Trash2, Send, Plus, FileText, Video, Image } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Content, ContentType, ContentStatus } from '../../shared/types';

const mockContents: Content[] = [
  { id: 1, title: '2024年度产品发布会预告', type: 'article', status: 'draft', created_at: '2024-01-15 10:30', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-15 10:30' },
  { id: 2, title: '新品上市短视频宣传', type: 'video', status: 'pending_review', created_at: '2024-01-15 09:15', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-15 09:15' },
  { id: 3, title: '春节活动海报设计', type: 'poster', status: 'scheduled', created_at: '2024-01-14 16:45', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-14 16:45' },
  { id: 4, title: '客户案例分享文章', type: 'article', status: 'published', created_at: '2024-01-14 14:20', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-14 14:20' },
  { id: 5, title: '品牌日活动宣传视频', type: 'video', status: 'review_rejected', created_at: '2024-01-14 11:00', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-14 11:00' },
  { id: 6, title: '年终总结海报', type: 'poster', status: 'draft', created_at: '2024-01-13 15:30', creator_id: 1, content: '', scan_version: 1, updated_at: '2024-01-13 15:30' },
];

const typeOptions: { value: ContentType | 'all'; label: string; icon: typeof FileText }[] = [
  { value: 'all', label: '全部类型', icon: FileText },
  { value: 'article', label: '文章', icon: FileText },
  { value: 'video', label: '视频', icon: Video },
  { value: 'poster', label: '海报', icon: Image },
];

const statusOptions: { value: ContentStatus | 'all'; label: string; color: string }[] = [
  { value: 'all', label: '全部状态', color: 'bg-gray-100 text-gray-700' },
  { value: 'draft', label: '草稿', color: 'bg-gray-100 text-gray-700' },
  { value: 'pending_review', label: '待复核', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'review_approved', label: '复核通过', color: 'bg-blue-100 text-blue-700' },
  { value: 'review_rejected', label: '已驳回', color: 'bg-red-100 text-red-700' },
  { value: 'scheduled', label: '已排期', color: 'bg-purple-100 text-purple-700' },
  { value: 'published', label: '已发布', color: 'bg-green-100 text-green-700' },
];

export default function ContentList() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const filteredContents = mockContents.filter(item => {
    const matchSearch = item.title.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchSearch && matchType && matchStatus;
  });

  const getStatusColor = (status: ContentStatus) => {
    return statusOptions.find(s => s.value === status)?.color || 'bg-gray-100 text-gray-700';
  };

  const getStatusLabel = (status: ContentStatus) => {
    return statusOptions.find(s => s.value === status)?.label || status;
  };

  const handleDelete = (id: number, title: string) => {
    if (confirm(`确定要删除"${title}"吗？`)) {
      alert('删除成功');
    }
  };

  const handleSubmitSchedule = (id: number, title: string) => {
    alert(`提交"${title}"排期`);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">内容列表</h1>
            <p className="text-gray-500 mt-1">管理所有内容</p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors">
            <Plus className="w-5 h-5" />
            新建内容
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
                placeholder="搜索内容标题..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
              />
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <button
                  onClick={() => { setShowTypeDropdown(!showTypeDropdown); setShowStatusDropdown(false); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Filter className="w-4 h-4 text-gray-500" />
                  <span className="hidden sm:inline">{typeOptions.find(t => t.value === typeFilter)?.label}</span>
                </button>
                {showTypeDropdown && (
                  <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                    {typeOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => { setTypeFilter(option.value); setShowTypeDropdown(false); }}
                        className={cn(
                          'w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-2',
                          typeFilter === option.value && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        )}
                      >
                        <option.icon className="w-4 h-4" />
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => { setShowStatusDropdown(!showStatusDropdown); setShowTypeDropdown(false); }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className={cn('w-2 h-2 rounded-full', statusFilter === 'all' ? 'bg-gray-400' : getStatusColor(statusFilter as ContentStatus).split(' ')[0])} />
                  <span className="hidden sm:inline">{statusOptions.find(s => s.value === statusFilter)?.label}</span>
                </button>
                {showStatusDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[140px]">
                    {statusOptions.map(option => (
                      <button
                        key={option.value}
                        onClick={() => { setStatusFilter(option.value); setShowStatusDropdown(false); }}
                        className={cn(
                          'w-full px-4 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-2',
                          statusFilter === option.value && 'bg-[#1e3a5f]/5 text-[#1e3a5f]'
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full', option.color.split(' ')[0])} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">标题</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">类型</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">创建时间</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredContents.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-gray-900 font-medium truncate max-w-xs">{item.title}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {typeOptions.find(t => t.value === item.type)?.icon && (
                          <span className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center',
                            item.type === 'article' && 'bg-blue-100 text-blue-600',
                            item.type === 'video' && 'bg-purple-100 text-purple-600',
                            item.type === 'poster' && 'bg-orange-100 text-orange-600'
                          )}>
                            {typeOptions.find(t => t.value === item.type)?.icon && React.createElement(typeOptions.find(t => t.value === item.type)!.icon, { className: 'w-4 h-4' })}
                          </span>
                        )}
                        <span className="text-gray-700">{typeOptions.find(t => t.value === item.type)?.label}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium', getStatusColor(item.status))}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">{item.created_at}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-2 rounded-lg text-gray-500 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors" title="编辑">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="提交排期"
                          onClick={() => handleSubmitSchedule(item.id, item.title)}
                          disabled={item.status === 'published' || item.status === 'scheduled' || item.status === 'pending_review'}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="删除"
                          onClick={() => handleDelete(item.id, item.title)}
                          disabled={item.status === 'published'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>暂无内容</p>
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
