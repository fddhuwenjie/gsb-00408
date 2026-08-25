import { useState, useEffect } from 'react';
import { Clock, Calendar, AlertTriangle, TrendingUp, FileText, ChevronRight, Eye, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getDashboardStats, getDashboardPending, getDashboardRecentSchedules } from '../api/dashboard';
import type { DashboardStats, Content, Schedule, ContentType } from '../../shared/types';

const typeLabels: Record<ContentType, string> = {
  article: '文章',
  video: '视频',
  poster: '海报',
};

const typeColors: Record<ContentType, string> = {
  article: 'bg-blue-100 text-blue-700',
  video: 'bg-purple-100 text-purple-700',
  poster: 'bg-orange-100 text-orange-700',
};

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pending, setPending] = useState<Content[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, p, sch] = await Promise.all([
          getDashboardStats(),
          getDashboardPending(),
          getDashboardRecentSchedules(),
        ]);
        setStats(s);
        setPending(p);
        setSchedules(sch);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = stats ? [
    { title: '待复核数量', value: stats.pending_review_count, icon: Clock, color: 'from-orange-400 to-orange-600', suffix: '条' },
    { title: '今日排期', value: stats.today_schedule_count, icon: Calendar, color: 'from-blue-400 to-blue-600', suffix: '条' },
    { title: '敏感词命中', value: stats.sensitive_hit_count, icon: AlertTriangle, color: 'from-red-400 to-red-600', suffix: '次' },
    { title: '发布成功率', value: stats.publish_success_rate, icon: TrendingUp, color: 'from-green-400 to-green-600', suffix: '%' },
    { title: '高风险渠道', value: stats.high_risk_channel_count, icon: AlertTriangle, color: 'from-red-500 to-red-700', suffix: '个' },
    { title: '待复盘', value: stats.pending_failure_review_count, icon: Clock, color: 'from-yellow-500 to-yellow-700', suffix: '条' },
  ] : [];

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
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">仪表盘</h1>
          <p className="text-gray-500 mt-1">欢迎回来，查看今日运营数据</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6 mb-8">
          {statCards.map((card, index) => (
            <div
              key={card.title}
              className={cn(
                'bg-white rounded-xl shadow-sm p-6 relative overflow-hidden',
                'transform transition-all duration-500 hover:shadow-lg hover:-translate-y-1',
                'animate-fade-in-up'
              )}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={cn('absolute top-0 right-0 w-24 h-24 bg-gradient-to-br', card.color, 'opacity-10 rounded-bl-full')} />
              <div className="relative">
                <div className={cn('w-12 h-12 rounded-lg bg-gradient-to-br', card.color, 'flex items-center justify-center mb-4')}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
                <p className="text-gray-500 text-sm">{card.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {card.value.toLocaleString()}<span className="text-lg text-gray-500 font-normal">{card.suffix}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl shadow-sm p-6 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-[#1e3a5f]" />
                最近待复核
              </h2>
              <button className="text-[#1e3a5f] text-sm font-medium hover:underline flex items-center gap-1">
                查看全部 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {pending.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors',
                    'animate-fade-in'
                  )}
                  style={{ animationDelay: `${500 + index * 100}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={cn('px-2 py-1 rounded-md text-xs font-medium shrink-0', typeColors[item.type])}>
                      {typeLabels[item.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-gray-900 font-medium truncate">{item.title}</p>
                      <p className="text-gray-400 text-xs">{item.created_at}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                      <Check className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {pending.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-sm">暂无待复核内容</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#1e3a5f]" />
                最近排期
              </h2>
              <button className="text-[#1e3a5f] text-sm font-medium hover:underline flex items-center gap-1">
                查看全部 <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {schedules.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors',
                    'animate-fade-in'
                  )}
                  style={{ animationDelay: `${600 + index * 100}ms` }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-[#1e3a5f]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-gray-900 font-medium truncate">{item.content?.title || `内容#${item.content_id}`}</p>
                      <p className="text-gray-400 text-xs">{item.schedule_time}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 shrink-0">
                    已排期
                  </span>
                </div>
              ))}
              {schedules.length === 0 && (
                <div className="text-center text-gray-400 py-8 text-sm">暂无排期</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in-up {
          opacity: 0;
          animation: fade-in-up 0.5s ease-out forwards;
        }
        .animate-fade-in {
          opacity: 0;
          animation: fade-in 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
