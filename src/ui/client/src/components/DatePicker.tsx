import { useEffect, useRef, useState } from 'react';

interface DatePickerProps {
  value: string;            // YYYY-MM-DD
  onChange: (value: string) => void;
  max?: string;             // optional YYYY-MM-DD upper bound (defaults to today)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayStr(): string {
  return fmt(new Date());
}

// Format the trigger label as DD.MM.YYYY for compact display.
function displayLabel(s: string): string {
  if (!s) return '';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

export function DatePicker({ value, onChange, max = todayStr() }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parse(value || todayStr()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parse(value || todayStr()).getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep view month/year in sync when external value changes
  useEffect(() => {
    if (!value) return;
    const d = parse(value);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }, [value]);

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Build the 6×7 day grid for the current view month (Monday-first).
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const firstDow = (firstOfMonth.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, daysInPrev - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(viewYear, viewMonth, d), inMonth: true });
  }
  while (cells.length < 42) {
    const idx = cells.length - firstDow - daysInMonth + 1;
    cells.push({ date: new Date(viewYear, viewMonth + 1, idx), inMonth: false });
  }

  const maxDate = parse(max);
  const selectedStr = value;
  const todayKey = todayStr();

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const pick = (d: Date) => {
    onChange(fmt(d));
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mono px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
        style={{
          background: 'var(--c-panel)',
          border: `1px solid ${open ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
          color: 'var(--c-text)',
          minWidth: 130,
        }}
      >
        <span className="flex-1 text-left">{displayLabel(value) || 'Select date'}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--c-teal)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 rounded-lg shadow-2xl"
          style={{
            background: 'var(--c-panel)',
            border: '1px solid var(--c-border-dim)',
            padding: 12,
            minWidth: 260,
          }}
        >
          {/* Header: month/year + arrows */}
          <div className="flex items-center justify-between mb-3">
            <div className="mono text-sm font-semibold" style={{ color: 'var(--c-text)' }}>
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={goPrevMonth}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: 'var(--c-text-muted)' }}
                aria-label="Previous month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-white/5"
                style={{ color: 'var(--c-text-muted)' }}
                aria-label="Next month"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          </div>

          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="mono text-[11px] text-center py-1"
                style={{ color: 'var(--c-text-muted)' }}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              const k = fmt(cell.date);
              const isSelected = k === selectedStr;
              const isToday = k === todayKey;
              const isFuture = cell.date.getTime() > maxDate.getTime();
              const dim = !cell.inMonth || isFuture;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isFuture}
                  onClick={() => !isFuture && pick(cell.date)}
                  className="mono text-xs w-8 h-8 rounded flex items-center justify-center transition-colors"
                  style={{
                    background: isSelected ? 'var(--c-teal)' : 'transparent',
                    color: isSelected ? '#000' : dim ? 'var(--c-text-muted)' : 'var(--c-text)',
                    opacity: isFuture ? 0.3 : 1,
                    cursor: isFuture ? 'not-allowed' : 'pointer',
                    fontWeight: isSelected || isToday ? 600 : 400,
                    border: isToday && !isSelected ? '1px solid var(--c-teal-dim)' : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected && !isFuture) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer: Today shortcut */}
          <div className="flex justify-between items-center mt-3 pt-3" style={{ borderTop: '1px solid var(--c-border-dim)' }}>
            <button
              type="button"
              onClick={() => { onChange(todayKey); setOpen(false); }}
              className="mono text-[12px] px-2 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-teal)' }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mono text-[12px] px-2 py-1 rounded transition-colors hover:bg-white/5"
              style={{ color: 'var(--c-text-muted)' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
