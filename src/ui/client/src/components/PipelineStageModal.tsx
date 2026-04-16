import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';

interface StageFile {
  name: string;
  content: string;
  truncated: boolean;
}

interface Props {
  stageId: string;
  stageLabel: string;
  date: string;
  onClose: () => void;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function isJson(name: string): boolean {
  return name.endsWith('.json');
}

function isMarkdown(name: string): boolean {
  return name.endsWith('.md');
}

function prettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

export function PipelineStageModal({ stageId, stageLabel, date, onClose }: Props) {
  const [files, setFiles] = useState<StageFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Fetch files on mount.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/pipeline/stage/${stageId}/files?date=${date}`)
      .then((r) => r.json())
      .then((data: { files?: StageFile[]; error?: string }) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setFiles(data.files || []);
      })
      .catch((err) => { if (!cancelled) setError(String(err)); });
    return () => { cancelled = true; };
  }, [stageId, date]);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const active = files?.[activeTab];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${stageLabel} outputs`}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl flex flex-col"
        style={{
          background: 'var(--c-panel)',
          border: '1px solid var(--c-border-dim)',
          width: 'min(1080px, 95vw)',
          height: 'min(800px, 92vh)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
          <div>
            <div className="text-lg font-semibold" style={{ color: 'var(--c-text)' }}>{stageLabel}</div>
            <div className="mono text-[12px] mt-0.5" style={{ color: 'var(--c-text-muted)' }}>
              outputs for <span style={{ color: 'var(--c-teal-dim)' }}>{date}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ color: 'var(--c-text-muted)' }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs (only if more than one file) */}
        {files && files.length > 1 && (
          <div className="px-5 pt-3 flex flex-wrap gap-1" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
            {files.map((f, i) => {
              const isActive = i === activeTab;
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className="mono text-[12px] px-3 py-2 transition-colors"
                  style={{
                    color: isActive ? 'var(--c-teal)' : 'var(--c-text-muted)',
                    borderBottom: `2px solid ${isActive ? 'var(--c-teal)' : 'transparent'}`,
                    marginBottom: -1,
                  }}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-auto p-5">
          {error && (
            <div className="mono text-sm py-8 text-center" style={{ color: 'var(--c-red)' }}>
              Failed to load: {error}
            </div>
          )}
          {!error && files === null && (
            <div className="mono text-sm py-8 text-center animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>
              Loading outputs…
            </div>
          )}
          {!error && files && files.length === 0 && (
            <div className="text-center py-12">
              <div className="text-base" style={{ color: 'var(--c-text-dim)' }}>No outputs for this date</div>
              <div className="mono text-[13px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
                The stage may not have run yet on {date}, or it writes outputs elsewhere.
              </div>
            </div>
          )}
          {!error && active && (
            <>
              {/* Single-file label (when no tabs are shown) */}
              {files!.length === 1 && (
                <div className="mono text-[12px] mb-3 flex items-center justify-between" style={{ color: 'var(--c-text-muted)' }}>
                  <span>{active.name}</span>
                  <span>{fmtBytes(active.content.length)}{active.truncated && ' · truncated'}</span>
                </div>
              )}
              {files!.length > 1 && active.truncated && (
                <div className="mono text-[11px] mb-2" style={{ color: 'var(--c-amber, #fbbf24)' }}>
                  ⚠ truncated to first 200 KB
                </div>
              )}
              {isMarkdown(active.name) ? (
                <div
                  className="md-body p-5 rounded-lg"
                  style={{
                    color: 'var(--c-text)',
                    background: 'var(--c-void)',
                    border: '1px solid var(--c-border-dim)',
                  }}
                >
                  <ReactMarkdown>{active.content}</ReactMarkdown>
                </div>
              ) : (
                <pre
                  className="mono text-[12.5px] p-4 rounded-lg whitespace-pre-wrap break-words leading-relaxed"
                  style={{
                    color: 'var(--c-text-dim)',
                    background: 'var(--c-void)',
                    border: '1px solid var(--c-border-dim)',
                    margin: 0,
                  }}
                >
                  {isJson(active.name) ? prettyJson(active.content) : active.content}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
