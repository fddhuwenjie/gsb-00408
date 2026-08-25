import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import StatusBadge from './StatusBadge';
import type { Schedule } from '../../shared/types';

type ViewMode = 'month' | 'week';

interface CalendarProps {
  schedules: Schedule[];
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onEventClick?: (schedule: Schedule) => void;
  onEventDrop?: (scheduleId: number, newDate: string) => void;
}

export default function Calendar({
  schedules,
  viewMode: initialViewMode = 'month',
  onViewModeChange,
  onEventClick,
  onEventDrop,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [draggedEvent, setDraggedEvent] = useState<number | null>(null);

  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const getMonthDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    const endPadding = 42 - days.length;
    for (let i = 1; i <= endPadding; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  };

  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = formatDate(date);
    return schedules.filter((schedule) => {
      const scheduleDate = schedule.schedule_time.split('T')[0];
      return scheduleDate === dateStr;
    });
  };

  const navigateDate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + direction);
    } else {
      newDate.setDate(newDate.getDate() + direction * 7);
    }
    setCurrentDate(newDate);
  };

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    onViewModeChange?.(mode);
  };

  const handleDragStart = (scheduleId: number) => {
    setDraggedEvent(scheduleId);
  };

  const handleDragEnd = () => {
    setDraggedEvent(null);
  };

  const handleDrop = (date: Date) => {
    if (draggedEvent !== null && onEventDrop) {
      const newDate = formatDate(date);
      const schedule = schedules.find((s) => s.id === draggedEvent);
      if (schedule) {
        const timePart = schedule.schedule_time.split('T')[1] || '09:00:00';
        onEventDrop(draggedEvent, `${newDate}T${timePart}`);
      }
    }
    setDraggedEvent(null);
  };

  const displayDays = useMemo(() => {
    return viewMode === 'month' ? getMonthDays(currentDate) : getWeekDays(currentDate);
  }, [currentDate, viewMode]);

  const headerTitle = useMemo(() => {
    if (viewMode === 'month') {
      return `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月`;
    }
    const weekStart = getWeekDays(currentDate)[0];
    const weekEnd = getWeekDays(currentDate)[6];
    return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 - ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
  }, [currentDate, viewMode]);

  const today = new Date();
  const todayStr = formatDate(today);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigateDate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              今天
            </button>
            <button
              onClick={() => navigateDate(1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{headerTitle}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => handleViewModeChange('month')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                viewMode === 'month'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              月
            </button>
            <button
              onClick={() => handleViewModeChange('week')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                viewMode === 'week'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              周
            </button>
          </div>
          <CalendarIcon className="w-5 h-5 text-gray-400" />
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDays.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-semibold text-gray-600 bg-gray-50"
          >
            {day}
          </div>
        ))}
      </div>

      <div className={cn('grid grid-cols-7', viewMode === 'week' ? 'min-h-[600px]' : '')}>
        {displayDays.map((date, index) => {
          const dateStr = formatDate(date);
          const isToday = dateStr === todayStr;
          const isCurrentMonth = date.getMonth() === currentDate.getMonth();
          const events = getEventsForDate(date);
          const isDropTarget = draggedEvent !== null;

          return (
            <div
              key={index}
              className={cn(
                'border-b border-r border-gray-100 p-1',
                viewMode === 'month' ? 'min-h-[120px]' : 'min-h-[600px]',
                !isCurrentMonth && 'bg-gray-50',
                isDropTarget && 'bg-blue-50'
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(date)}
            >
              <div
                className={cn(
                  'flex items-center justify-center w-7 h-7 mb-1 text-sm rounded-full',
                  isToday && 'bg-blue-600 text-white font-semibold',
                  !isToday && !isCurrentMonth && 'text-gray-400',
                  !isToday && isCurrentMonth && 'text-gray-700'
                )}
              >
                {date.getDate()}
              </div>
              <div className="space-y-1">
                {events.slice(0, viewMode === 'month' ? 3 : undefined).map((schedule) => (
                  <div
                    key={schedule.id}
                    draggable
                    onDragStart={() => handleDragStart(schedule.id)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onEventClick?.(schedule)}
                    className={cn(
                      'px-2 py-1 rounded text-xs cursor-move transition-all hover:opacity-80',
                      'bg-blue-100 text-blue-800 border border-blue-200',
                      draggedEvent === schedule.id && 'opacity-50'
                    )}
                  >
                    <div className="font-medium truncate">
                      {schedule.content?.title || `内容 #${schedule.content_id}`}
                    </div>
                    {viewMode === 'week' && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-blue-600">
                          {new Date(schedule.schedule_time).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <StatusBadge status={schedule.status} />
                      </div>
                    )}
                  </div>
                ))}
                {viewMode === 'month' && events.length > 3 && (
                  <div className="text-xs text-gray-500 pl-2">
                    +{events.length - 3} 更多
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
