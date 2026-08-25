import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Calendar,
  CheckSquare,
  AlertTriangle,
  List,
  History,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '../../shared/types';
import { useAuthStore } from '@/store/useAuthStore';

interface MenuItem {
  path: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

const menuItems: MenuItem[] = [
  {
    path: '/dashboard',
    label: '仪表盘',
    icon: LayoutDashboard,
    roles: ['editor', 'reviewer', 'admin'],
  },
  {
    path: '/contents',
    label: '内容管理',
    icon: FileText,
    roles: ['editor', 'reviewer', 'admin'],
  },
  {
    path: '/calendar',
    label: '内容日历',
    icon: Calendar,
    roles: ['editor', 'reviewer', 'admin'],
  },
  {
    path: '/review',
    label: '待复核队列',
    icon: CheckSquare,
    roles: ['reviewer', 'admin'],
  },
  {
    path: '/sensitive-words',
    label: '敏感词管理',
    icon: AlertTriangle,
    roles: ['admin'],
  },
  {
    path: '/risk-words',
    label: '风险词明细',
    icon: List,
    roles: ['reviewer', 'admin'],
  },
  {
    path: '/publish-records',
    label: '发布记录',
    icon: History,
    roles: ['editor', 'reviewer', 'admin'],
  },
  {
    path: '/channels',
    label: '渠道管理',
    icon: Settings,
    roles: ['admin'],
  },
];

export default function Sidebar() {
  const { user } = useAuthStore();

  const visibleItems = menuItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-full">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-900">内容管理系统</h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
