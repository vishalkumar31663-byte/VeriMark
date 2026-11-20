import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ExamMode, ExamScheduleRecord } from '../../../shared/v2Types';
import { ExamModeBadge } from './ExamModeAndCountdown';

export function ExamScheduleCalendar({
  schedules,
  onSelectSchedule,
}: {
  schedules: ExamScheduleRecord[];
  onSelectSchedule?: (schedule: ExamScheduleRecord) => void;
}) {
  const initialDate = useMemo(() => {
    const first = schedules[0]?.examDate;
    if (first && /^\d{4}-\d{2}-\d{2}$/.test(first)) {
      const [y, m] = first.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }, [schedules]);

  const [monthCursor, setMonthCursor] = useState<Date>(initialDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(
    schedules[0]?.examDate ?? null
  );

  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();
  const monthLabel = monthCursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDate = useMemo(() => {
    const map = new Map<string, ExamScheduleRecord[]>();
    for (const s of schedules) {
      const list = map.get(s.examDate) ?? [];
      list.push(s);
      map.set(s.examDate, list);
    }
    return map;
  }, [schedules]);

  const cells: Array<{ iso: string | null; day: number | null }> = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ iso: null, day: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, day });
  }

  const selectedExams = selectedDate ? byDate.get(selectedDate) ?? [] : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
            {monthLabel}
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(year, month - 1, 1))}
              aria-label="Previous month"
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonthCursor(new Date(year, month + 1, 1))}
              aria-label="Next month"
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold text-slate-500">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, idx) => {
            if (!cell.iso || !cell.day) {
              return <div key={`empty-${idx}`} className="h-20 rounded-lg" />;
            }
            const dayExams = byDate.get(cell.iso) ?? [];
            const isSelected = selectedDate === cell.iso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate(cell.iso)}
                className={`h-20 p-1.5 rounded-lg border text-left flex flex-col justify-between transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40'
                    : dayExams.length > 0
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-[#0B1120] hover:border-indigo-400'
                    : 'border-slate-100 dark:border-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {cell.day}
                </span>
                {dayExams.length > 0 && (
                  <div className="space-y-0.5 overflow-hidden">
                    {dayExams.slice(0, 2).map((ex) => (
                      <div
                        key={ex.id}
                        className={`text-[10px] font-mono font-semibold truncate px-1 py-0.5 rounded ${
                          ex.mode === ExamMode.ONLINE
                            ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300'
                            : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300'
                        }`}
                      >
                        {ex.subjectCode}
                      </div>
                    ))}
                    {dayExams.length > 2 && (
                      <span className="text-[10px] text-slate-500">
                        +{dayExams.length - 2} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 font-semibold">
            {selectedDate || 'Select a date'}
          </p>
          <h3 className="font-display font-bold text-base text-slate-900 dark:text-white mt-0.5">
            Scheduled Examinations
          </h3>
        </div>

        {selectedExams.length === 0 ? (
          <p className="text-xs text-slate-500 py-6">
            No examinations scheduled on this date. Click a highlighted calendar date to view details.
          </p>
        ) : (
          <div className="space-y-3">
            {selectedExams.map((ex) => (
              <div
                key={ex.id}
                onClick={() => onSelectSchedule?.(ex)}
                className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {ex.subjectCode}
                  </span>
                  <ExamModeBadge mode={ex.mode} />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {ex.subjectTitle}
                </p>
                <p className="text-xs font-mono text-slate-500">
                  {ex.startTime}–{ex.endTime} ({ex.timezone})
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {ex.mode === ExamMode.ONLINE
                    ? 'Authorized Online Exam Portal'
                    : `${ex.building || 'Campus'} · Room ${ex.studentRoom || ex.room || 'TBA'}${
                        ex.studentSeatNumber ? ` · Seat ${ex.studentSeatNumber}` : ''
                      }`}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
