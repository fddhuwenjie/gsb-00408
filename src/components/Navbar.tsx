import { useLocation } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const pageTitles: Record<string, string> = {
  '/dashboard': '仪表盘',
  '/contents': '内容管理',
  '/contents/new': '新建内容',
  '/calendar': '内容日历',
  '/review': '待复核队列',
  '/sensitive-words': '敏感词管理',
  '/risk-words': '风险词明细',
  '/publish-records': '发布记录',
  '/channels': '渠道管理',
};

const roleLabels: Record<string, string> = {
  editor: '编辑',
  reviewer: '复核员',
  admin: '管理员',
};

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const getPageTitle = () => {
    const path = location.pathname;
    if (pageTitles[path]) return pageTitles[path];
    const matchedPath = Object.keys(pageTitles).find(
      (key) => path.startsWith(key) && key !== '/'
    );
    return matchedPath ? pageTitles[matchedPath] : '内容管理系统';
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h2 className="text-lg font-semibold text-gray-900">{getPageTitle()}</h2>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{user?.username}</p>
            <p className="text-xs text-gray-500">{user ? roleLabels[user.role] : ''}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="退出登录"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
