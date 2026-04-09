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
      setFlash(`Saved - ${result.regenerated} agent files regenerated`);
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
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-up flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--c-text)' }}>Configuration</h1>
          <p className="mono text-xs mt-1" style={{ color: 'var(--c-text-muted)' }}>Agent identity and operational parameters</p>
        </div>
        <div className="flex items-center gap-2">
          {flash && <span className="mono text-[11px] px-3 py-1 rounded-full animate-fade-up" style={{ color: 'var(--c-teal)', background: 'var(--c-teal-glow)' }}>{flash}</span>}
          {saveError && <span className="mono text-[11px] px-3 py-1 rounded-full" style={{ color: 'var(--c-red)', background: 'rgba(248,113,113,0.08)' }}>{saveError}</span>}
          {editing ? (
            <>
              <Btn onClick={cancel} dim>Cancel</Btn>
              <Btn onClick={save} accent loading={saving}>Save</Btn>
            </>
          ) : (
            <Btn onClick={startEditing}>Edit</Btn>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Identity */}
        <div className="animate-fade-up stagger-1 panel noise">
          <div className="panel-header">// Identity</div>
          <div className="p-5 space-y-0">
            <EditField label="Name" value={d.name} editing={editing} onChange={(v) => update((x) => { x.name = v; })} />
            <EditField label="Display" value={d.display_name} editing={editing} onChange={(v) => update((x) => { x.display_name = v; })} />
            <EditField label="Role" value={d.role} editing={editing} onChange={(v) => update((x) => { x.role = v; })} />
            <EditField label="Headline" value={d.headline} editing={editing} onChange={(v) => update((x) => { x.headline = v; })} />
            <EditField label="Bio" value={d.bio} editing={editing} multiline onChange={(v) => update((x) => { x.bio = v; })} />
            <EditField label="Tagline" value={d.brand_tagline} editing={editing} accent onChange={(v) => update((x) => { x.brand_tagline = v; })} />
          </div>
        </div>

        {/* Professional */}
        <div className="animate-fade-up stagger-2 panel noise">
          <div className="panel-header">// Professional Context</div>
          <div className="p-5 space-y-0">
            <EditField label="Certs" value={d.certifications.join(', ')} editing={editing} onChange={(v) => update((x) => { x.certifications = v.split(',').map(s => s.trim()).filter(Boolean); })} />
            <EditField label="Events" value={d.conference_mentions.join(', ')} editing={editing} onChange={(v) => update((x) => { x.conference_mentions = v.split(',').map(s => s.trim()).filter(Boolean); })} />
            <EditField label="Hooks" value={d.experience_hooks.join(', ')} editing={editing} multiline onChange={(v) => update((x) => { x.experience_hooks = v.split(',').map(s => s.trim()).filter(Boolean); })} />
          </div>

          {/* Pillars */}
          <div className="px-5 pb-5">
            <div className="mono text-[10px] uppercase tracking-wider mb-3 pt-3 flex items-center justify-between" style={{ color: 'var(--c-text-muted)', borderTop: '1px solid var(--c-border-dim)' }}>
              <span>Content Pillars</span>
              {editing && (
                <button onClick={() => update((x) => { x.pillars.push({ name: '', topics: [], mention_templates: [], target_percentage: 0 }); })} className="mono text-[10px] px-2 py-0.5 rounded transition-colors" style={{ color: 'var(--c-teal-dim)', border: '1px solid var(--c-border-dim)' }}>
                  + add
                </button>
              )}
            </div>
            <div className="space-y-2">
              {d.pillars.map((p, i) => (
                <div key={i} className="rounded-lg p-3 relative" style={{ background: 'rgba(45, 212, 191, 0.03)', border: '1px solid var(--c-border-dim)' }}>
                  {editing ? (
                    <div className="space-y-2">
                      <input value={p.name} onChange={(e) => update((x) => { x.pillars[i].name = e.target.value; })} placeholder="Pillar name" className="mono text-xs w-full bg-transparent outline-none" style={{ color: 'var(--c-text-dim)', borderBottom: '1px solid var(--c-border-dim)' }} />
                      <input value={p.topics.join(', ')} onChange={(e) => update((x) => { x.pillars[i].topics = e.target.value.split(',').map(s => s.trim()).filter(Boolean); })} placeholder="Topics (comma-separated)" className="mono text-[10px] w-full bg-transparent outline-none" style={{ color: 'var(--c-text-muted)', borderBottom: '1px solid var(--c-border-dim)' }} />
                      {d.pillars.length > 1 && (
                        <button onClick={() => update((x) => { x.pillars.splice(i, 1); })} className="mono text-[9px] absolute top-2 right-2" style={{ color: 'var(--c-red)' }}>remove</button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="text-xs font-semibold" style={{ color: 'var(--c-text-dim)' }}>{p.name}</div>
                      <div className="mono text-[10px] mt-1" style={{ color: 'var(--c-text-muted)' }}>{p.topics.join(', ')}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Schedule + Voice */}
      <div className="animate-fade-up stagger-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="panel noise">
          <div className="panel-header">// Schedule</div>
          <div className="p-5 space-y-0">
            <EditField label="Timezone" value={d.timezone} editing={editing} onChange={(v) => update((x) => { x.timezone = v; })} />
            <EditField label="Start hour" value={String(d.active_hours.start)} editing={editing} type="number" onChange={(v) => update((x) => { x.active_hours.start = parseInt(v) || 8; })} />
            <EditField label="End hour" value={String(d.active_hours.end)} editing={editing} type="number" onChange={(v) => update((x) => { x.active_hours.end = parseInt(v) || 23; })} />
            <EditField label="Pipeline" value={d.pipeline_enabled ? 'ON' : 'OFF'} editing={false} accent={d.pipeline_enabled} />
            {editing && (
              <div className="flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                <span className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Pipeline</span>
                <Toggle checked={d.pipeline_enabled} onChange={(v) => update((x) => { x.pipeline_enabled = v; })} />
              </div>
            )}
          </div>
        </div>
        <div className="panel noise">
          <div className="panel-header">// Voice</div>
          <div className="p-5 space-y-0">
            {editing ? (
              <div className="flex justify-between items-center py-2.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
                <span className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--c-text-muted)' }}>Tone</span>
                <select value={d.voice.formality} onChange={(e) => update((x) => { x.voice.formality = e.target.value; })} className="mono text-xs bg-transparent outline-none px-2 py-1 rounded" style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }}>
                  <option value="casual">casual</option>
                  <option value="balanced">balanced</option>
                  <option value="professional">professional</option>
                </select>
              </div>
            ) : (
              <EditField label="Tone" value={d.voice.formality} editing={false} />
            )}
            <EditField label="Language" value={d.voice.language} editing={editing} onChange={(v) => update((x) => { x.voice.language = v; })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, editing, onChange, multiline, accent, type = 'text' }: {
  label: string; value: string; editing: boolean; onChange?: (v: string) => void;
  multiline?: boolean; accent?: boolean; type?: string;
}) {
  return (
    <div className="flex justify-between items-start py-2.5" style={{ borderBottom: '1px solid var(--c-border-dim)' }}>
      <span className="mono text-[10px] uppercase tracking-wider shrink-0 pt-1" style={{ color: 'var(--c-text-muted)' }}>{label}</span>
      {editing && onChange ? (
        multiline ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="mono text-xs text-right bg-transparent outline-none resize-none w-[65%] rounded px-2 py-1 transition-colors" style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'} />
        ) : (
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mono text-xs text-right bg-transparent outline-none w-[55%] rounded px-2 py-1 transition-colors" style={{ color: 'var(--c-text-dim)', border: '1px solid var(--c-border-dim)' }} onFocus={(e) => e.currentTarget.style.borderColor = 'var(--c-teal-dim)'} onBlur={(e) => e.currentTarget.style.borderColor = 'var(--c-border-dim)'} />
        )
      ) : (
        <span className={`text-right ${multiline ? 'max-w-[65%]' : ''}`} style={{ color: accent ? 'var(--c-teal)' : 'var(--c-text-dim)', fontFamily: multiline ? 'Outfit, sans-serif' : 'JetBrains Mono, monospace', fontSize: multiline ? 13 : 12 }}>
          {value || '-'}
        </span>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="w-9 h-5 rounded-full relative transition-colors duration-200" style={{ background: checked ? 'var(--c-teal-dim)' : 'var(--c-border)' }}>
      <div className="w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all duration-200" style={{ background: checked ? 'var(--c-teal)' : 'var(--c-text-muted)', left: checked ? '18px' : '3px' }} />
    </button>
  );
}

function Btn({ children, onClick, dim, accent, loading: isLoading, disabled }: { children: React.ReactNode; onClick: () => void; dim?: boolean; accent?: boolean; loading?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={isLoading || disabled} className="mono text-[11px] px-3 py-1.5 rounded-md font-medium transition-all duration-200 disabled:opacity-50" style={{
      background: accent ? 'var(--c-teal-glow)' : 'transparent',
      color: dim ? 'var(--c-text-muted)' : accent ? 'var(--c-teal)' : 'var(--c-text-dim)',
      border: dim ? '1px solid var(--c-border-dim)' : accent ? '1px solid rgba(45,212,191,0.25)' : '1px solid var(--c-border-dim)',
    }}>
      {isLoading ? 'Saving...' : children}
    </button>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center justify-center h-48 mono text-xs animate-pulse" style={{ color: 'var(--c-teal-dim)' }}>{text}</div>;
}
