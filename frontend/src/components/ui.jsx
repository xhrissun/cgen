// frontend/src/components/ui.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitives — drop-in loading states, toasts, empty states.
// Zero logic changes required in any consumer; just import and render.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react';

// ─── Spinner ─────────────────────────────────────────────────────────────────
// Usage: <Spinner /> <Spinner size="sm" /> <Spinner size="lg" color="white" />
export function Spinner({ size = 'md', color = 'blue', className = '' }) {
  const sizes = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-9 h-9 border-[3px]', xl: 'w-12 h-12 border-4' };
  const colors = { blue: 'border-blue-200 border-t-blue-600', white: 'border-white/30 border-t-white', gray: 'border-gray-200 border-t-gray-500', green: 'border-green-200 border-t-green-600' };
  return (
    <div
      className={`${sizes[size]} ${colors[color]} rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

// ─── Button with built-in loading state ──────────────────────────────────────
// Usage: <LoadingButton loading={saving} onClick={handleSave}>Save</LoadingButton>
export function LoadingButton({ loading, children, disabled, className = '', spinnerColor = 'white', ...props }) {
  return (
    <button
      disabled={loading || disabled}
      className={`relative inline-flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" color={spinnerColor} />}
      <span className={loading ? 'opacity-80' : ''}>{children}</span>
    </button>
  );
}

// ─── Skeleton primitives ──────────────────────────────────────────────────────
export function SkeletonLine({ width = 'w-full', height = 'h-4' }) {
  return <div className={`${width} ${height} bg-gray-200 rounded animate-pulse`} />;
}

// One full table row of skeleton cells
export function SkeletonRow({ cols = 5 }) {
  const widths = ['w-8', 'w-32', 'w-24', 'w-20', 'w-16', 'w-24', 'w-20'];
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className={`h-4 ${widths[i % widths.length]} bg-gray-200 rounded animate-pulse`} />
        </td>
      ))}
    </tr>
  );
}

// Multiple skeleton rows for table loading
export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </>
  );
}

// Stat card skeleton for dashboard overview
export function SkeletonStatCard() {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse" />
        <div className="w-16 h-5 bg-gray-200 rounded-full animate-pulse" />
      </div>
      <div className="w-16 h-8 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="w-24 h-3 bg-gray-200 rounded animate-pulse" />
    </div>
  );
}

// Generic content card skeleton
export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="card space-y-3">
      <div className="w-1/3 h-5 bg-gray-200 rounded animate-pulse" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`h-4 bg-gray-200 rounded animate-pulse ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

// ─── Full-page loader (tab/section switching) ─────────────────────────────────
// Usage: if (loading) return <PageLoader />
export function PageLoader({ message = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-4 border-blue-100 animate-pulse" />
        <Spinner size="xl" color="blue" className="absolute inset-0" />
      </div>
      <p className="text-sm text-gray-500 font-medium animate-pulse">{message}</p>
    </div>
  );
}

// ─── Inline section loader (inside a card/panel) ─────────────────────────────
export function SectionLoader({ message = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10 text-gray-400">
      <Spinner size="md" color="gray" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
// Usage: <EmptyState icon="📄" title="No contracts yet" description="Create your first contract to get started." />
export function EmptyState({ icon = '📭', title = 'Nothing here yet', description = '', action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p className="text-gray-700 font-semibold text-lg mb-1">{title}</p>
      {description && <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Toast notification system ────────────────────────────────────────────────
// 1. Wrap your app (or a section) with <ToastProvider>
// 2. Call useToast() to get { toast } and fire toasts anywhere
//
// toast.success('Saved!') | toast.error('Something went wrong') | toast.info('Note')

const TOAST_DURATION = 4000;

let _addToast = null;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = TOAST_DURATION) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
    return id;
  }, []);

  // Expose globally so non-hook consumers can call it
  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const styles = {
    success: 'bg-white border-l-4 border-emerald-500 text-gray-800 shadow-lg shadow-emerald-100/50',
    error:   'bg-white border-l-4 border-red-500   text-gray-800 shadow-lg shadow-red-100/50',
    warning: 'bg-white border-l-4 border-amber-500 text-gray-800 shadow-lg shadow-amber-100/50',
    info:    'bg-white border-l-4 border-blue-500  text-gray-800 shadow-lg shadow-blue-100/50',
  };

  return (
    <>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg min-w-[260px] max-w-[360px] animate-slideUp ${styles[t.type]}`}
          >
            <span className="text-base mt-0.5 flex-shrink-0">{icons[t.type]}</span>
            <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors leading-none text-lg font-bold mt-0.5"
              aria-label="Dismiss"
            >×</button>
          </div>
        ))}
      </div>
    </>
  );
}

// Hook — use inside components wrapped by ToastProvider
export function useToast() {
  const add = useCallback((message, type, duration) => {
    if (_addToast) _addToast(message, type, duration);
    else console.warn('useToast: ToastProvider not mounted');
  }, []);

  return {
    toast: {
      success: (msg, dur) => add(msg, 'success', dur),
      error:   (msg, dur) => add(msg, 'error',   dur),
      warning: (msg, dur) => add(msg, 'warning',  dur),
      info:    (msg, dur) => add(msg, 'info',     dur),
    }
  };
}

// ─── Convenience: replace alert() calls with this ────────────────────────────
// Direct call without hook: toast.success('Done') from anywhere after ToastProvider mounts
export const toast = {
  success: (msg, dur) => _addToast?.(msg, 'success', dur),
  error:   (msg, dur) => _addToast?.(msg, 'error',   dur),
  warning: (msg, dur) => _addToast?.(msg, 'warning',  dur),
  info:    (msg, dur) => _addToast?.(msg, 'info',     dur),
};