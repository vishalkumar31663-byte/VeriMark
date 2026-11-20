import React, { useRef } from 'react';
import { AlertTriangle, FileUp, Paperclip, X } from 'lucide-react';

export function formatEnumLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(diffSec) || diffSec < 0) return 'Just now';
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function LoadingSkeleton({
  rows = 3,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={`space-y-3 animate-pulse ${className}`}
      role="status"
      aria-label="Loading content"
    >
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="h-16 rounded-xl bg-slate-200/70 dark:bg-slate-800/70"
        />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl px-6 py-12 text-center space-y-3">
      <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800/80 mx-auto flex items-center justify-center text-slate-500 dark:text-slate-400">
        <Icon className="w-5 h-5" aria-hidden="true" />
      </div>
      <div className="space-y-1 max-w-md mx-auto">
        <h3 className="font-display font-semibold text-base text-slate-900 dark:text-white">
          {title}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function ConfirmationDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4">
        <div className="flex items-start gap-3">
          {tone === 'danger' && (
            <AlertTriangle
              className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}
          <div className="space-y-1">
            <h3
              id="confirm-dialog-title"
              className="font-display font-bold text-base text-slate-900 dark:text-white"
            >
              {title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg text-white disabled:opacity-60 ${
              tone === 'danger'
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface SelectedAttachment {
  originalName: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
}

export function FileAttachmentInput({
  value,
  onChange,
  label = 'Supporting Evidence (Optional)',
}: {
  value: SelectedAttachment | null;
  onChange: (att: SelectedAttachment | null) => void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      onChange({
        originalName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: base64,
        sizeBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain"
        onChange={handleFileChange}
        className="hidden"
      />
      {value ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 text-xs">
          <span className="inline-flex items-center gap-2 min-w-0">
            <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" aria-hidden="true" />
            <span className="truncate font-medium text-slate-800 dark:text-slate-200">
              {value.originalName}
            </span>
            <span className="text-slate-500 shrink-0">({formatBytes(value.sizeBytes)})</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            aria-label="Remove attachment"
            className="p-1 rounded text-slate-400 hover:text-red-500"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <FileUp className="w-4 h-4" aria-hidden="true" />
          <span>Attach PDF, PNG, JPEG, or TXT (max 2 MB)</span>
        </button>
      )}
    </div>
  );
}
