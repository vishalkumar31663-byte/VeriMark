import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { ExamMode, ExamScheduleRecord } from '../../../shared/v2Types';

export function ExamModeBadge({ mode }: { mode: ExamMode }) {
  const isOnline = mode === ExamMode.ONLINE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-tight ${
        isOnline
          ? 'text-sky-700 dark:text-sky-400'
          : 'text-indigo-700 dark:text-indigo-400'
      }`}
    >
      {isOnline ? (
        <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Building2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      )}
      <span>{isOnline ? 'Online Exam' : 'Offline In-Person'}</span>
    </span>
  );
}

export interface CountdownState {
  phase: 'UPCOMING' | 'STARTED' | 'COMPLETED';
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  canLaunchOnline: boolean;
}

export function computeCountdown(schedule: ExamScheduleRecord, nowMs: number): CountdownState {
  // Parse schedule date & time using local/timezone-safe ISO reference
  const startMs = new Date(`${schedule.examDate}T${schedule.startTime}:00`).getTime();
  const endMs = new Date(`${schedule.examDate}T${schedule.endTime}:00`).getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return {
      phase: 'UPCOMING',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      canLaunchOnline: false,
    };
  }

  if (nowMs >= endMs) {
    return {
      phase: 'COMPLETED',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      canLaunchOnline: false,
    };
  }

  if (nowMs >= startMs) {
    const rem = Math.max(0, Math.floor((endMs - nowMs) / 1000));
    return {
      phase: 'STARTED',
      days: Math.floor(rem / 86400),
      hours: Math.floor((rem % 86400) / 3600),
      minutes: Math.floor((rem % 3600) / 60),
      seconds: rem % 60,
      canLaunchOnline: true,
    };
  }

  const diffSec = Math.max(0, Math.floor((startMs - nowMs) / 1000));
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;
  // Allow online launch access window 15 minutes before start
  const canLaunchOnline = startMs - nowMs <= 15 * 60 * 1000;

  return {
    phase: 'UPCOMING',
    days,
    hours,
    minutes,
    seconds,
    canLaunchOnline,
  };
}

export function ExamCountdownCard({
  schedule,
  compact = false,
}: {
  schedule: ExamScheduleRecord;
  compact?: boolean;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const cd = useMemo(() => computeCountdown(schedule, nowMs), [schedule, nowMs]);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
              {schedule.subjectCode}
            </span>
            <ExamModeBadge mode={schedule.mode} />
            <span className="text-xs text-slate-500 font-mono">
              {schedule.examinationId}
            </span>
          </div>
          <h3 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate">
            {schedule.subjectTitle}
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {schedule.examDate} · {schedule.startTime}–{schedule.endTime} ({schedule.timezone}) ·{' '}
            {schedule.course} Sem {schedule.semester}
          </p>
        </div>

        <div className="shrink-0">
          {cd.phase === 'UPCOMING' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upcoming</span>
            </span>
          ) : cd.phase === 'STARTED' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Exam Started</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Exam Completed</span>
            </span>
          )}
        </div>
      </div>

      {/* Live Countdown Blocks */}
      {cd.phase === 'UPCOMING' && (
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { label: 'Days', value: pad(cd.days) },
            { label: 'Hours', value: pad(cd.hours) },
            { label: 'Minutes', value: pad(cd.minutes) },
            { label: 'Seconds', value: pad(cd.seconds) },
          ].map((unit) => (
            <div
              key={unit.label}
              className="rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 py-3 px-2 text-center"
            >
              <p className="font-mono font-bold text-xl sm:text-2xl tabular-nums text-slate-900 dark:text-white">
                {unit.value}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">{unit.label}</p>
            </div>
          ))}
        </div>
      )}

      {cd.phase === 'STARTED' && (
        <div className="rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Exam Started — Session is currently in progress
          </p>
          <p className="font-mono text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {pad(cd.hours)}:{pad(cd.minutes)}:{pad(cd.seconds)} remaining
          </p>
        </div>
      )}

      {cd.phase === 'COMPLETED' && (
        <div className="rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
          Exam Completed — Scheduled window has closed. Official results will appear in your portal once anchored to the ledger.
        </div>
      )}

      {!compact && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {schedule.mode === ExamMode.ONLINE ? (
            <>
              <div className="space-y-0.5 min-w-0">
                <p className="font-semibold text-slate-700 dark:text-slate-200">
                  Authorized Online Examination Portal
                </p>
                <p className="text-slate-500 truncate">
                  {schedule.accessInstructions ||
                    'Access opens 15 minutes prior to start time via authorized university portal.'}
                </p>
              </div>
              {schedule.onlineUrl && (
                <a
                  href={schedule.onlineUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold shrink-0 transition-colors ${
                    cd.canLaunchOnline
                      ? 'bg-sky-600 hover:bg-sky-500 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    {cd.canLaunchOnline
                      ? 'Open Authorized Exam Portal'
                      : 'Portal Link (Opens 15m Prior)'}
                  </span>
                </a>
              )}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
                <span>
                  {schedule.campus || 'Main Campus'} · {schedule.building || 'Block A'} · Room{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {schedule.studentRoom || schedule.room || 'TBA'}
                  </strong>
                </span>
              </span>
              {schedule.studentSeatNumber && (
                <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  Seat {schedule.studentSeatNumber}
                </span>
              )}
              {schedule.reportingTime && (
                <span>Reporting: {schedule.reportingTime}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
