import { useState } from 'react';
import { useApi, useMutation } from '../hooks/useApi.ts';

interface ConfigData {
  name: string;
  display_name: string;
  headline: string;
  bio: string;
  brand_tagline: string;
  role: string;
  certifications: string[];
  conference_mentions: string[];
  experience_hooks: string[];
  pillars: Array<{ name: string; topics: string[]; mention_templates: string[]; target_percentage: number }>;
  platforms: Array<{
    platform: string; handle: string; profile_url: string; enabled: boolean;
    limits: { daily: Record<string, { limit: number }>; weekly?: Record<string, { limit: number }> };
  }>;
  voice: { formality: string; language: string };
  timezone: string;
  active_hours: { start: number; end: number };
  pipeline_enabled: boolean;
  pipeline_start_hour: number;
}

export function Config() {
  const { data: config, loading, refetch } = useApi<ConfigData>('/api/config');
  const { mutate: saveConfig, loading: saving, error: saveError } = useMutation<Partial<ConfigData>>('/api/config');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ConfigData | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (loading) return <Loading text="Loading configuration..." />;
  if (!config) return <Loading text="No config loaded" />;

  const d = editing && draft ? draft : config;

  const startEditing = () => { setDraft(JSON.parse(JSON.stringify(config))); setEditing(true); setFlash(null); };
  const cancel = () => { setDraft(null); setEditing(false); };
  const save = async () => {
    if (!draft) return;
    const result = await saveConfig(draft) as { ok?: boolean; regenerated?: number } | null;
    if (result?.ok) {
      setEditing(false);
      setDraft(null);
      setFlash(`Saved · ${result.regenerated} agent files regenerated`);
      refetch();
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const update = (fn: (d: ConfigData) => void) => {
    if (!draft) return;
    const next = JSON.parse(JSON.stringify(draft));
    fn(next);
    setDraft(next);
  };

  return (
    <div className="space-y-8">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="animate-fade-up flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Configuration</h1>
          <p className="mono text-sm mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
            Agent identity, voice, and operational parameters
          </p>
        </div>
        <div className="flex items-center gap-3">
          {flash && (
            <span className="mono text-[13px] px-3 py-1.5 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>
              {flash}
            </span>
          )}
          {saveError && (
            <span className="mono text-[13px] px-3 py-1.5 rounded-full" style={{ color: 'var(--c-red)', background: 'rgba(248,113,113,0.08)' }}>
              {saveError}
            </span>
          )}
          {editing ? (
            <>
              <button
                onClick={cancel}
                className="px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)', background: 'transparent' }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all disabled:opacity-60"
                style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.3)' }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              onClick={startEditing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
              style={{ color: 'var(--c-text)', background: 'var(--c-panel)', border: '1px solid var(--c-border-dim)' }}
            >
              ✎ Edit
            </button>
          )}
        </div>
      </div>

      {/* Edit mode indicator */}
      {editing && (
        <div className="animate-fade-up flex items-center gap-3 px-4 py-3 rounded-lg" style={{
          background: 'rgba(45,212,191,0.06)',
          border: '1px solid rgba(45,212,191,0.2)',
        }}>
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--c-teal)' }} />
          <span className="text-sm" style={{ color: 'var(--c-teal)' }}>Edit mode · unsaved changes</span>
          <span className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>
            Saving will regenerate agent files
          </span>
        </div>
      )}

      {/* ── Identity ───────────────────────────────────────────── */}
      <div className="animate-fade-up stagger-1">
        <div className="section-title mb-4">Identity</div>
        <div className="panel noise p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Full name" value={d.name} editing={editing} onChange={(v) => update((x) => { x.name = v; })} placeholder="Jane Doe" />
            <Field label="Display name" value={d.display_name} editing={editing} onChange={(v) => update((x) => { x.display_name = v; })} placeholder="Jane" />
            <Field label="Role" value={d.role} editing={editing} onChange={(v) => update((x) => { x.role = v; })} placeholder="Director of Engineering" />
            <Field label="Brand tagline" value={d.brand_tagline} editing={editing} accent onChange={(v) => update((x) => { x.brand_tagline = v; })} placeholder="The AI-Native Engineer" />
          </div>
          <Field label="Headline" value={d.headline} editing={editing} onChange={(v) => update((x) => { x.headline = v; })} placeholder="Director of Engineering | Building AI-native tools" />
          <Field label="Bio" value={d.bio} editing={editing} multiline onChange={(v) => update((x) => { x.bio = v; })} placeholder="Short bio — 2–3 sentences about what you do" />
        </div>
      </div>

      {/* ── Professional context ───────────────────────────────── */}
      <div className="animate-fade-up stagger-2">
        <div className="section-title mb-4">Professional Context</div>
        <div className="panel noise p-6 space-y-5">
          <TagField
            label="Certifications"
            values={d.certifications}
            editing={editing}
            placeholder="AWS SA, CKA, PMP"
            onChange={(v) => update((x) => { x.certifications = v; })}
          />
          <TagField
            label="Conferences"
            values={d.conference_mentions}
            editing={editing}
            placeholder="KubeCon, re:Invent, QCon"
            onChange={(v) => update((x) => { x.conference_mentions = v; })}
          />
          <TagField
            label="Experience hooks"
            values={d.experience_hooks}
            editing={editing}
            placeholder="Things that make you stand out"
            onChange={(v) => update((x) => { x.experience_hooks = v; })}
          />
        </div>
      </div>

      {/* ── Content pillars ────────────────────────────────────── */}
      <div className="animate-fade-up stagger-3">
        <div className="flex items-center justify-between mb-4">
          <div className="section-title">Content Pillars</div>
          {editing && (
            <button
              onClick={() => update((x) => { x.pillars.push({ name: '', topics: [], mention_templates: [], target_percentage: 0 }); })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)', border: '1px solid rgba(45,212,191,0.3)' }}
            >
              + Add pillar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {d.pillars.length === 0 ? (
            <div className="col-span-full panel noise py-10 text-center">
              <div className="text-sm" style={{ color: 'var(--c-text-dim)' }}>No pillars configured</div>
              <div className="mono text-[12px] mt-1.5" style={{ color: 'var(--c-text-muted)' }}>
                Pillars define what topics your agents engage on
              </div>
            </div>
          ) : d.pillars.map((p, i) => (
            <div key={i} className="panel noise relative group">
              <div className="p-4">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      value={p.name}
                      onChange={(e) => update((x) => { x.pillars[i].name = e.target.value; })}
                      placeholder="Pillar name"
                      className="w-full bg-transparent outline-none text-base font-semibold px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
                    />
                    <input
                      value={p.topics.join(', ')}
                      onChange={(e) => update((x) => { x.pillars[i].topics = e.target.value.split(',').map(s => s.trim()).filter(Boolean); })}
                      placeholder="Topics (comma-separated)"
                      className="mono text-sm w-full bg-transparent outline-none px-2 py-1 rounded transition-colors"
                      style={{ color: 'var(--c-text-muted)', border: '1px solid var(--c-border-dim)' }}
                      onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                      onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
                    />
                    {d.pillars.length > 1 && (
                      <button
                        onClick={() => update((x) => { x.pillars.splice(i, 1); })}
                        className="mono text-[12px] absolute top-3 right-3 px-2 py-0.5 rounded opacity-50 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--c-red)', border: '1px solid rgba(248,113,113,0.2)' }}
                      >
                        remove
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-base font-semibold" style={{ color: 'var(--c-text)' }}>{p.name || 'Unnamed pillar'}</div>
                    {p.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {p.topics.map((t, ti) => (
                          <span
                            key={ti}
                            className="mono text-[12px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(45,212,191,0.06)', color: 'var(--c-text-muted)', border: '1px solid var(--c-border-dim)' }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Schedule + Voice + Pipeline ────────────────────────── */}
      <div className="animate-fade-up stagger-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Voice */}
        <div className="panel noise">
          <div className="panel-header">// Voice</div>
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Formality</div>
              {editing ? (
                <div className="flex gap-1 flex-wrap">
                  {(['casual', 'balanced', 'professional'] as const).map((f) => {
                    const isActive = d.voice.formality === f;
                    return (
                      <button
                        key={f}
                        onClick={() => update((x) => { x.voice.formality = f; })}
                        className="px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize flex-1"
                        style={{
                          background: isActive ? 'var(--c-panel)' : 'transparent',
                          color: isActive ? 'var(--c-text)' : 'var(--c-text-dim)',
                          border: `1px solid ${isActive ? 'var(--c-teal-dim)' : 'var(--c-border-dim)'}`,
                        }}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-base capitalize font-medium" style={{ color: 'var(--c-text)' }}>{d.voice.formality}</div>
              )}
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Language</div>
              {editing ? (
                <input
                  value={d.voice.language}
                  onChange={(e) => update((x) => { x.voice.language = e.target.value; })}
                  className="w-full bg-transparent outline-none text-base px-3 py-2 rounded-lg transition-colors"
                  style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
                />
              ) : (
                <div className="text-base uppercase font-medium tabular-nums" style={{ color: 'var(--c-text)' }}>{d.voice.language}</div>
              )}
            </div>
          </div>
        </div>

        {/* Schedule */}
        <div className="panel noise">
          <div className="panel-header">// Schedule</div>
          <div className="p-5 space-y-5">
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Timezone</div>
              {editing ? (
                <input
                  value={d.timezone}
                  onChange={(e) => update((x) => { x.timezone = e.target.value; })}
                  className="mono w-full bg-transparent outline-none text-sm px-3 py-2 rounded-lg transition-colors"
                  style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
                />
              ) : (
                <div className="mono text-sm" style={{ color: 'var(--c-text)' }}>{d.timezone}</div>
              )}
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Active window</div>
              {editing ? (
                <div className="flex items-center gap-2">
                  <HourInput
                    value={d.active_hours.start}
                    onChange={(v) => update((x) => { x.active_hours.start = v; })}
                  />
                  <span className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>→</span>
                  <HourInput
                    value={d.active_hours.end}
                    onChange={(v) => update((x) => { x.active_hours.end = v; })}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="mono text-xl font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                    {String(d.active_hours.start).padStart(2, '0')}:00
                  </div>
                  <span className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>→</span>
                  <div className="mono text-xl font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                    {String(d.active_hours.end).padStart(2, '0')}:00
                  </div>
                </div>
              )}
              <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
                {d.active_hours.end - d.active_hours.start} hours/day
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline */}
        <div className="panel noise">
          <div className="panel-header">// Content Pipeline</div>
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-1" style={{ color: 'var(--c-text-muted)' }}>Status</div>
                <div className="text-base font-semibold" style={{
                  color: d.pipeline_enabled ? 'var(--c-green)' : 'var(--c-text-muted)',
                }}>
                  {d.pipeline_enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              {editing ? (
                <Toggle checked={d.pipeline_enabled} onChange={(v) => update((x) => { x.pipeline_enabled = v; })} />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full" style={{
                  background: d.pipeline_enabled ? 'var(--c-green)' : 'var(--c-text-muted)',
                  boxShadow: d.pipeline_enabled ? '0 0 12px rgba(52,211,153,0.4)' : undefined,
                }} />
              )}
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>Start hour</div>
              {editing ? (
                <HourInput
                  value={d.pipeline_start_hour}
                  onChange={(v) => update((x) => { x.pipeline_start_hour = v; })}
                />
              ) : (
                <div className="mono text-xl font-semibold tabular-nums" style={{ color: 'var(--c-text)' }}>
                  {String(d.pipeline_start_hour).padStart(2, '0')}:00
                </div>
              )}
              <div className="mono text-[12px] mt-2" style={{ color: 'var(--c-text-muted)' }}>
                Daily content generation time
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

function Field({ label, value, editing, onChange, multiline, accent, placeholder }: {
  label: string;
  value: string;
  editing: boolean;
  onChange?: (v: string) => void;
  multiline?: boolean;
  accent?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-[0.12em] font-medium mb-2" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
      {editing && onChange ? (
        multiline ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="w-full bg-transparent outline-none resize-y rounded-lg px-3 py-2 text-sm transition-colors leading-relaxed"
            style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent outline-none rounded-lg px-3 py-2 text-base transition-colors"
            style={{
              color: accent ? 'var(--c-teal)' : 'var(--c-text)',
              border: '1px solid var(--c-border-dim)',
              fontWeight: accent ? 500 : 400,
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
          />
        )
      ) : (
        <div
          className="text-base leading-relaxed break-words"
          style={{
            color: accent ? 'var(--c-teal)' : 'var(--c-text)',
            fontWeight: accent ? 500 : 400,
            fontStyle: value ? 'normal' : 'italic',
          }}
        >
          {value || <span style={{ color: 'var(--c-text-muted)' }}>{placeholder || '—'}</span>}
        </div>
      )}
    </div>
  );
}

function TagField({ label, values, editing, placeholder, onChange }: {
  label: string;
  values: string[];
  editing: boolean;
  placeholder: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[12px] uppercase tracking-[0.12em] font-medium" style={{ color: 'var(--c-text-muted)' }}>{label}</div>
        {values.length > 0 && !editing && (
          <div className="mono text-[12px]" style={{ color: 'var(--c-text-muted)' }}>{values.length}</div>
        )}
      </div>
      {editing ? (
        <input
          value={values.join(', ')}
          onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none rounded-lg px-3 py-2 text-sm transition-colors"
          style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
          onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
          onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
        />
      ) : values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <span
              key={i}
              className="mono text-[13px] px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(45,212,191,0.05)', color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}
            >
              {v}
            </span>
          ))}
        </div>
      ) : (
        <div className="mono text-[13px] italic" style={{ color: 'var(--c-text-muted)' }}>none configured</div>
      )}
    </div>
  );
}

function HourInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={0}
        max={23}
        onChange={(e) => onChange(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
        className="mono text-xl font-semibold tabular-nums w-14 bg-transparent outline-none text-center rounded-lg px-2 py-1.5 transition-colors"
        style={{ color: 'var(--c-text)', border: '1px solid var(--c-border-dim)' }}
        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'}
        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'}
      />
      <span className="mono text-sm" style={{ color: 'var(--c-text-muted)' }}>:00</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="w-11 h-6 rounded-full relative transition-colors duration-200"
      style={{ background: checked ? 'rgba(52,211,153,0.25)' : 'var(--c-border)', border: `1px solid ${checked ? 'rgba(52,211,153,0.4)' : 'var(--c-border-dim)'}` }}
    >
      <div
        className="w-4 h-4 rounded-full absolute top-[3px] transition-all duration-200"
        style={{
          background: checked ? 'var(--c-green)' : 'var(--c-text-muted)',
          left: checked ? '23px' : '3px',
          boxShadow: checked ? '0 0 8px rgba(52,211,153,0.4)' : undefined,
        }}
      />
    </button>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-48 mono text-sm animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>{text}</div>;
}
