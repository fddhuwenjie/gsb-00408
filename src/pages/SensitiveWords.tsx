import { useState } from 'react';
import { Plus, Edit2, Trash2, AlertTriangle, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SensitiveWord } from '../../shared/types';

const mockSensitiveWords: SensitiveWord[] = [
  { id: 1, word: '敏感政治词汇1', category: '政治', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 2, word: '敏感政治词汇2', category: '政治', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 3, word: '色情词汇1', category: '色情', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 4, word: '色情词汇2', category: '色情', version: 1, is_active: false, created_at: '2024-01-01 10:00' },
  { id: 5, word: '暴力词汇1', category: '暴力', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 6, word: '广告词汇1', category: '广告', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 7, word: '敏感政治词汇3', category: '政治', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
  { id: 8, word: '暴力词汇2', category: '暴力', version: 1, is_active: true, created_at: '2024-01-01 10:00' },
];

const categories = ['政治', '色情', '暴力', '广告', '其他'];

export default function SensitiveWords() {
  const [words, setWords] = useState<SensitiveWord[]>(mockSensitiveWords);
  const [showModal, setShowModal] = useState(false);
  const [editingWord, setEditingWord] = useState<SensitiveWord | null>(null);
  const [word, setWord] = useState('');
  const [category, setCategory] = useState('政治');
  const [currentVersion] = useState(1);

  const handleOpenModal = (item?: SensitiveWord) => {
    if (item) {
      setEditingWord(item);
      setWord(item.word);
      setCategory(item.category);
    } else {
      setEditingWord(null);
      setWord('');
      setCategory('政治');
    }
    setShowModal(true);
  };

  const handleSave = () => {
    if (!word.trim()) {
      alert('请输入敏感词');
      return;
    }
    if (editingWord) {
      setWords(words.map(w => w.id === editingWord.id ? { ...w, word, category } : w));
    } else {
      const newWord: SensitiveWord = {
        id: Math.max(...words.map(w => w.id)) + 1,
        word,
        category,
        version: currentVersion + 1,
        is_active: true,
        created_at: new Date().toLocaleString('zh-CN'),
      };
      setWords([newWord, ...words]);
    }
    setShowModal(false);
  };

  const handleToggleActive = (id: number) => {
    setWords(words.map(w => w.id === id ? { ...w, is_active: !w.is_active } : w));
  };

  const handleDelete = (id: number, wordText: string) => {
    if (confirm(`确定要删除敏感词"${wordText}"吗？`)) {
      setWords(words.filter(w => w.id !== id));
    }
  };

  const categoryColors: Record<string, string> = {
    '政治': 'bg-red-100 text-red-700',
    '色情': 'bg-pink-100 text-pink-700',
    '暴力': 'bg-orange-100 text-orange-700',
    '广告': 'bg-yellow-100 text-yellow-700',
    '其他': 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">敏感词管理</h1>
            <p className="text-gray-500 mt-1">管理内容审核的敏感词库</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <span className="text-gray-600">当前版本：</span>
              <span className="font-bold text-[#1e3a5f]">v{currentVersion}</span>
            </div>
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-lg font-medium hover:bg-[#2d4a6f] transition-colors"
            >
              <Plus className="w-5 h-5" />
              新增敏感词
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">词语</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">分类</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden sm:table-cell">版本</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">状态</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden md:table-cell">创建时间</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {words.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-gray-900 font-medium">{item.word}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('px-2.5 py-1 rounded-md text-xs font-medium', categoryColors[item.category] || categoryColors['其他'])}>
                        {item.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm hidden sm:table-cell">v{item.version}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(item.id)}
                        className={cn(
                          'flex items-center gap-2 text-sm font-medium transition-colors',
                          item.is_active ? 'text-green-600' : 'text-gray-400'
                        )}
                      >
                        {item.is_active ? (
                          <><ToggleRight className="w-5 h-5" /> 启用</>
                        ) : (
                          <><ToggleLeft className="w-5 h-5" /> 停用</>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-sm hidden md:table-cell">{item.created_at}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenModal(item)}
                          className="p-2 rounded-lg text-gray-500 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.word)}
                          className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingWord ? '编辑敏感词' : '新增敏感词'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">敏感词</label>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="请输入敏感词"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] transition-all outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">分类</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                        category === cat
                          ? 'bg-[#1e3a5f] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
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
                disabled={!word.trim()}
                className={cn(
                  'flex-1 py-2.5 px-4 rounded-lg font-medium text-white transition-all',
                  'bg-[#1e3a5f] hover:bg-[#2d4a6f]',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {editingWord ? '保存修改' : '添加'}
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
