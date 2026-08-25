import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Clock, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Schedule, Content, Channel } from '../../shared/types';

const mockChannels: Channel[] = [
  { id: 1, name: '微信公众号', type: 'wechat', status: 'active' },
  { id: 2, name: '微博', type: 'weibo', status: 'active' },
  { id: 3, name: '抖音', type: 'douyin', status: 'active' },
  { id: 4, name: '小红书', type: 'xiaohongshu', status: 'active' },
];

const channelColors: Record<number, string> = {
  1: 'bg-green-500',
  2: 'bg-red-500',
  3: 'bg-pink-500',
  4: 'bg-orange-500',
};

const generateMockSchedules = (): Schedule[] => {
  const schedules: Schedule[] = [];
  const today = new Date();
  const titles = ['产品发布预告', '新品介绍', '活动宣传', '用户故事', '品牌故事', '促销活动'];
  
  for (let i = -5; i < 25; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    const count = Math.floor(Math.random() * 4);
    for (let j = 0; j < count; j++) {
      const channelId = Math.floor(Math.random() * 4) + 1;
      const hour = 9 + Math.floor(Math.random() * 10);
      schedules.push({
        id: schedules.length + 1,
        content_id: schedules.length + 1,
        channel_id: channelId,
        schedule_time: `${dateStr} ${String(hour).padStart(2, '0')}:${['00', '30'][Math.floor(Math.random() * 2)]}`,
        status: 'scheduled',
        created_at: '',
        updated_at: '',
        content: {
          id: schedules.length + 1,
          title: titles[Math.floor(Math.random() * titles.length)],
          type: ['article', 'video', 'poster'][Math.floor(Math.random() * 3)] as Content['type'],
        } as Content,
        channel: mockChannels.find(c => c.id === channelId),
      });
    }
  }
  return schedules;
};

const mockSchedules = generateMockSchedules();

export default function ContentCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const { days } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const days: (number | null)[] = [];
    
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return { days };
  }, [year, month]);

  const getSchedulesForDate = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return mockSchedules.filter(s => s.schedule_time.startsWith(dateStr));
  };

  const handleDateClick = (day: number) => {
    const date = new Date(year, month, day);
    setSelectedDate(date);
    setShowDetailModal(true);
  };

  const selectedDateSchedules = selectedDate 
    ? getSchedulesForDate(selectedDate.getDate())
    : [];

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  };

  const isToday = (day: number) => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">内容日历</h1>
          <p className="text-gray-500 mt-1">查看和管理内容排期</p>
        </div>

        <div className="flex flex-wrap gap-4 mb-6">
          {mockChannels.map(channel => (
            <div key={channel.id} className="flex items-center gap-2">
              <span className={cn('w-3 h-3 rounded-full', channelColors[channel.id])} />
              <span className="text-sm text-gray-600">{channel.name}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-4 md:p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h2 className="text-xl font-semibold text-gray-900">
              {year}年{month + 1}月
            </h2>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const daySchedules = getSchedulesForDate(day);
              const today = isToday(day);

              return (
                <button
                  key={day}
                  onClick={() => handleDateClick(day)}
                  className={cn(
                    'aspect-square p-1 rounded-lg border-2 transition-all hover:border-[#1e3a5f]/30',
                    'text-left overflow-hidden group',
                    today ? 'border-[#1e3a5f] bg-[#1e3a5f]/5' : 'border-transparent hover:bg-gray-50'
                  )}
                >
                  <span className={cn(
                    'text-sm font-medium',
                    today ? 'text-[#1e3a5f]' : 'text-gray-700'
                  )}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {daySchedules.slice(0, 3).map((schedule, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'w-full h-1.5 rounded-full',
                          channelColors[schedule.channel_id]
                        )}
                      />
                    ))}
                    {daySchedules.length > 3 && (
                      <span className="text-xs text-gray-400">+{daySchedules.length - 3}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {showDetailModal && selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate)} 排期详情
              </h3>
              <button 
                onClick={() => setShowDetailModal(false)} 
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {selectedDateSchedules.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>当日暂无排期</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedDateSchedules.map(schedule => (
                    <div
                      key={schedule.id}
                      className="p-4 rounded-lg bg-gray-50 border border-gray-100"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                          channelColors[schedule.channel_id]
                        )}>
                          <FileText className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {schedule.content?.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              'w-2 h-2 rounded-full',
                              channelColors[schedule.channel_id]
                            )} />
                            <span className="text-sm text-gray-500">
                              {schedule.channel?.name}
                            </span>
                            <span className="text-sm text-gray-400">·</span>
                            <span className="text-sm text-gray-500">
                              {schedule.schedule_time.split(' ')[1]}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
