import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import html2canvas from 'html2canvas';
import AdGateModal from './AdGateModal.jsx';
import { useTrackerState } from './useTrackerState.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const COLLECTIONS = [
  { id: '2025-26-bowman-basketball', name: '2025-26 Bowman Basketball' },
  { id: '2025-26-topps-cosmic-chrome-basketball', name: '2025-26 Topps Cosmic Chrome Basketball' },
];
const BREAK_TYPES = ['PYT', 'PYP', 'Random Team'];
const PLATFORMS = ['Whatnot', 'Fanatics'];

function defaultBreakInfo() {
  const now = new Date();
  return {
    breakerName: '',
    breakType: 'PYT',
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    platform: 'Whatnot',
    collection: '2025-26-bowman-basketball',
  };
}

const BREAK_INFO_KEY = 'vault.tracker.breakInfo';

function useBreakInfo() {
  const [info, setInfo] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(BREAK_INFO_KEY)) || defaultBreakInfo();
    } catch {
      return defaultBreakInfo();
    }
  });
  const update = useCallback((field, value) => {
    setInfo(prev => {
      const next = { ...prev, [field]: value };
      localStorage.setItem(BREAK_INFO_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [info, update];
}

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Break Info Form ──────────────────────────────────────────────────────────
function BreakInfoForm({ info, onChange }) {
  const [collapsed, setCollapsed] = useState(false);

  const inputStyle = {
    width: '100%', background: 'var(--input)', border: '1px solid var(--b)',
    borderRadius: 9, padding: '7px 10px', color: 'var(--t)', fontSize: 12,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 10, color: 'var(--tg)', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, display: 'block' };

  const collapsedSummary = [
    info.breakerName || 'Unnamed Breaker',
    info.breakType,
    info.platform,
    info.date,
  ].join(' · ');

  return (
    <div style={{ margin: '0 0 0 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Toggle row */}
      <button
        onClick={() => setCollapsed(c => !c)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 11, color: '#ff6b35', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 0 }}>Break Info</span>
        {collapsed && (
          <span style={{ fontSize: 11, color: 'var(--tg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            {collapsedSummary}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--tg)', fontSize: 12, flexShrink: 0, transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)' }}>▾</span>
      </button>

      {/* Fields */}
      {!collapsed && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Breaker's Name */}
          <div>
            <label style={labelStyle}>Breaker's Name</label>
            <input
              type="text"
              value={info.breakerName}
              onChange={e => onChange('breakerName', e.target.value)}
              placeholder="e.g. SabazBreaks"
              style={inputStyle}
            />
          </div>

          {/* Break Type + Platform */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Break Type</label>
              <select value={info.breakType} onChange={e => onChange('breakType', e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                {BREAK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Platform</label>
              <select value={info.platform} onChange={e => onChange('platform', e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Date + Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={info.date} onChange={e => onChange('date', e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Time</label>
              <input type="time" value={info.time} onChange={e => onChange('time', e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Collection */}
          <div>
            <label style={labelStyle}>Collection</label>
            <select value={info.collection} onChange={e => onChange('collection', e.target.value)} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
              {COLLECTIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Target Toggle ─────────────────────────────────────────────────────────────
const TargetToggle = memo(function TargetToggle({ active, onToggle }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      title={active ? 'Remove from break' : 'Target this player'}
      style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${active ? '#ff6b35' : 'rgba(255,255,255,0.15)'}`,
        background: active ? 'rgba(255,107,53,0.18)' : 'transparent',
        color: active ? '#ff6b35' : 'rgba(255,255,255,0.3)',
        cursor: 'pointer', fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s',
      }}
    >
      {active ? '🎯' : '○'}
    </button>
  );
});

// ── Player Select Row ─────────────────────────────────────────────────────────
const PlayerSelectRow = memo(function PlayerSelectRow({ player, isTargeted, onToggle, indent }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: indent ? '9px 14px 9px 28px' : '9px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
      onClick={() => onToggle(player.slug)}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <TargetToggle active={isTargeted} onToggle={() => onToggle(player.slug)} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 14, fontWeight: 700,
            color: isTargeted ? '#ff6b35' : 'var(--t)',
            fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transition: 'color 0.15s',
          }}>{player.name}</span>
          {player.isRC && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,107,53,0.12)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', fontWeight: 700, flexShrink: 0 }}>RC</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--tg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.team}
        </div>
      </div>
    </div>
  );
});

// ── Team Select Row ───────────────────────────────────────────────────────────
function TeamSelectRow({ team, players, isTargeted, onToggle, onTargetAll, onUntargetAll }) {
  const [expanded, setExpanded] = useState(false);
  const teamPlayers = useMemo(() => players.filter(p => p.team === team.name), [players, team.name]);
  const targetedCount = teamPlayers.filter(p => isTargeted(p.slug)).length;
  const allTargeted = targetedCount === teamPlayers.length && teamPlayers.length > 0;

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', cursor: 'pointer',
          background: expanded ? 'rgba(255,107,53,0.03)' : 'transparent',
          transition: 'background 0.1s',
        }}
        onClick={() => setExpanded(x => !x)}
        onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
        onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{
          fontSize: 10, color: 'var(--tg)', width: 10, flexShrink: 0,
          display: 'inline-block', transition: 'transform 0.2s',
          transform: expanded ? 'rotate(90deg)' : 'none',
        }}>▶</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {team.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg)' }}>
            {targetedCount > 0
              ? <span style={{ color: '#ff6b35', fontWeight: 600 }}>{targetedCount}/{teamPlayers.length} targeted</span>
              : `${teamPlayers.length} player${teamPlayers.length !== 1 ? 's' : ''}`
            }
          </div>
        </div>
        <button
          onClick={e => {
            e.stopPropagation();
            allTargeted
              ? onUntargetAll(teamPlayers.map(p => p.slug))
              : onTargetAll(teamPlayers.map(p => p.slug));
          }}
          style={{
            fontSize: 10, padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
            border: allTargeted ? '1px solid rgba(255,100,100,0.3)' : '1px solid rgba(255,107,53,0.3)',
            background: allTargeted ? 'rgba(255,100,100,0.08)' : 'rgba(255,107,53,0.08)',
            color: allTargeted ? '#ff6464' : '#ff6b35',
            fontWeight: 600, flexShrink: 0, transition: 'all 0.15s',
          }}
        >
          {allTargeted ? 'Untarget All' : 'Target All'}
        </button>
      </div>
      {expanded && (
        <div style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {teamPlayers.map(p => (
            <PlayerSelectRow key={p.slug} player={p} isTargeted={isTargeted(p.slug)} onToggle={onToggle} indent />
          ))}
        </div>
      )}
    </div>
  );
}

// ── SELECT PHASE ──────────────────────────────────────────────────────────────
function SelectPhase({ checklist, tracker, onStartBreak, onClose, breakInfo, onBreakInfoChange }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 200);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('vault.tracker.prefs.view') || 'player');
  const [showReset, setShowReset] = useState(false);
  const { isTargeted, toggleTarget, targetPlayers, untargetPlayers, targetedCount, clearAll } = tracker;

  useEffect(() => { localStorage.setItem('vault.tracker.prefs.view', viewMode); }, [viewMode]);

  const filteredPlayers = useMemo(() => {
    if (!checklist) return [];
    if (!debouncedSearch) return checklist.players;
    const q = debouncedSearch.toLowerCase();
    return checklist.players.filter(p =>
      p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)
    );
  }, [checklist, debouncedSearch]);

  const filteredTeams = useMemo(() => {
    if (!checklist) return [];
    if (!debouncedSearch) return checklist.teams;
    const q = debouncedSearch.toLowerCase();
    return checklist.teams.filter(t => t.name.toLowerCase().includes(q));
  }, [checklist, debouncedSearch]);

  const listEmpty = (viewMode === 'player' ? filteredPlayers : filteredTeams).length === 0;

  return (
    <>
      {/* Header */}
      <div style={{
        background: 'var(--hbg)', borderBottom: '1px solid var(--hb)',
        padding: '12px 14px', backdropFilter: 'blur(20px)',
        flexShrink: 0, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--tg)', fontSize: 16 }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1 }}>
              {checklist?.set?.name || '2025-26 Bowman Basketball'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--tg)', letterSpacing: 0.5 }}>Select players you're chasing</div>
          </div>
          {targetedCount > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowReset(r => !r)}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '4px 8px', color: 'var(--tg)', fontSize: 11, cursor: 'pointer' }}
              >⋯</button>
              {showReset && (
                <>
                  <div onClick={() => setShowReset(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 10, padding: 6, zIndex: 101, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    <button
                      onClick={() => { clearAll(); setShowReset(false); }}
                      style={{ width: '100%', background: 'none', border: 'none', color: '#ff4444', fontSize: 12, fontWeight: 600, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}
                    >🗑 Clear all selections</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Search + view toggle */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--tg)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={viewMode === 'player' ? 'Search players or teams…' : 'Search teams…'}
              style={{ width: '100%', background: 'var(--input)', border: '1px solid var(--b)', borderRadius: 10, padding: '7px 10px 7px 32px', color: 'var(--t)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tg)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
            )}
          </div>
          <div style={{ display: 'flex', background: 'var(--deep)', border: '1px solid var(--b)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
            {[['player', '👤'], ['team', '🏀']].map(([mode, icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 10px', border: 'none', cursor: 'pointer', fontSize: 14,
                  background: viewMode === mode ? 'rgba(255,107,53,0.12)' : 'transparent',
                  color: viewMode === mode ? '#ff6b35' : 'var(--tg)',
                  borderRight: mode === 'player' ? '1px solid var(--b)' : 'none',
                  transition: 'all 0.12s',
                }}
              >{icon}</button>
            ))}
          </div>
        </div>

        {targetedCount > 0 && (
          <div style={{ marginTop: 8, fontSize: 11, color: '#ff6b35', fontWeight: 600 }}>
            🎯 {targetedCount} player{targetedCount !== 1 ? 's' : ''} selected
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <BreakInfoForm info={breakInfo} onChange={onBreakInfoChange} />
        {viewMode === 'player' && filteredPlayers.map(p => (
          <PlayerSelectRow key={p.slug} player={p} isTargeted={isTargeted(p.slug)} onToggle={toggleTarget} />
        ))}
        {viewMode === 'team' && filteredTeams.map(t => (
          <TeamSelectRow
            key={t.name} team={t} players={checklist.players}
            isTargeted={isTargeted} onToggle={toggleTarget}
            onTargetAll={targetPlayers} onUntargetAll={untargetPlayers}
          />
        ))}
        {listEmpty && debouncedSearch && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tg)', fontSize: 13 }}>
            No results for "{debouncedSearch}"
          </div>
        )}
        <div style={{ height: targetedCount > 0 ? 90 : 60 }} />
      </div>

      {/* CTA */}
      {targetedCount > 0 ? (
        <div style={{ padding: '12px 14px', background: 'linear-gradient(to top, var(--bg) 70%, transparent)', flexShrink: 0 }}>
          <button
            onClick={onStartBreak}
            style={{
              width: '100%', padding: '14px 20px',
              background: 'linear-gradient(135deg, #ff6b35, #e84d1e)',
              border: 'none', borderRadius: 14, cursor: 'pointer',
              color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
              boxShadow: '0 4px 20px rgba(255,107,53,0.4)',
            }}
          >
            LET'S DO THIS · {targetedCount} PLAYER{targetedCount !== 1 ? 'S' : ''} →
          </button>
        </div>
      ) : (
        !debouncedSearch && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, var(--bg) 60%, transparent)', padding: '30px 20px 24px', textAlign: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 11, color: 'var(--tg)', lineHeight: 1.8 }}>
              Tap a player to target them<br />
              Switch to 🏀 Team view to target all players from a team at once
            </div>
          </div>
        )
      )}
    </>
  );
}

// ── Hit Picker Dropdown ───────────────────────────────────────────────────────
function HitPickerDropdown({ variants, onSelect, onClose, anchorRect }) {
  const ref = useRef();
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const pos = {};
  if (anchorRect) {
    const DROPDOWN_W = 260;
    const PADDING = 8;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    // Prefer left-align to button; if it overflows right edge, right-align to button's right edge
    if (anchorRect.left + DROPDOWN_W + PADDING > window.innerWidth) {
      pos.left = Math.max(PADDING, anchorRect.right - DROPDOWN_W);
    } else {
      pos.left = anchorRect.left;
    }
    if (spaceBelow > 220) { pos.top = anchorRect.bottom + 6; }
    else { pos.bottom = window.innerHeight - anchorRect.top + 6; }
  } else {
    pos.top = '50%'; pos.left = '50%'; pos.transform = 'translate(-50%,-50%)';
  }

  return (
    <div ref={ref} style={{
      position: 'fixed', zIndex: 300,
      background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 10,
      padding: 6, boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
      minWidth: 190, maxWidth: 260, maxHeight: 300, overflowY: 'auto',
      ...pos,
    }}>
      <div style={{ fontSize: 10, color: 'var(--tg)', padding: '4px 8px 6px', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Which variant?
      </div>
      {variants.map(v => (
        <button
          key={v.id || 'base'}
          onClick={() => { onSelect(v); onClose(); }}
          style={{
            width: '100%', textAlign: 'left', background: 'none', border: 'none',
            borderRadius: 7, padding: '7px 10px', cursor: 'pointer', fontSize: 12,
            color: 'var(--t)', display: 'flex', alignItems: 'center', gap: 6,
            transition: 'background 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,107,53,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ flex: 1, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: 0.3 }}>
            {v.isBase ? 'Base' : v.name}
          </span>
          {v.printRun && <span style={{ fontSize: 10, color: 'var(--tg)', fontWeight: 600 }}>/{v.printRun}</span>}
          {v.exclusive && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(156,39,176,0.12)', color: '#ce93d8', border: '1px solid rgba(156,39,176,0.25)', fontWeight: 700 }}>{v.exclusive}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Card Slot ─────────────────────────────────────────────────────────────────
function CardSlot({ appearance, player, tracker }) {
  const { subset, card, variants } = appearance;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const btnRef = useRef();

  const slotHits = tracker.getHitsForCard(player.slug, subset.id, card.number);

  const handleAddHit = useCallback(e => {
    e.stopPropagation();
    setAnchorRect(btnRef.current?.getBoundingClientRect() || null);
    setPickerOpen(true);
  }, []);

  const handleSelect = useCallback(variant => {
    tracker.addHit({
      playerSlug: player.slug,
      subsetId: subset.id,
      cardNumber: card.number,
      parallelId: variant.id || 'base',
      variantName: variant.isBase ? 'Base' : variant.name,
    });
  }, [tracker, player.slug, subset.id, card.number]);

  return (
    <div style={{
      minWidth: 148, maxWidth: 190, flexShrink: 0,
      background: slotHits.length > 0 ? 'rgba(76,175,80,0.07)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${slotHits.length > 0 ? 'rgba(76,175,80,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 10, padding: '8px 10px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: "'Barlow Condensed', sans-serif" }}>
            {subset.name}
          </span>
          {card.isRC && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,107,53,0.12)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', fontWeight: 700 }}>RC</span>}
          {card.isDualAuto && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(100,181,246,0.1)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.25)', fontWeight: 700 }}>DUAL</span>}
          {subset.isAuto && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(240,192,64,0.1)', color: '#f0c040', border: '1px solid rgba(240,192,64,0.25)', fontWeight: 700 }}>AUTO</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--tg)' }}>#{card.number} · {variants.length} var{variants.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Recorded hits */}
      {slotHits.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {slotHits.map(hit => (
            <div key={hit.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(76,175,80,0.13)', border: '1px solid rgba(76,175,80,0.3)',
              borderRadius: 6, padding: '3px 6px',
            }}>
              <span style={{ fontSize: 10, color: '#4caf50', fontWeight: 600, flex: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>
                ✅ {hit.variantName}
              </span>
              <button
                onClick={e => { e.stopPropagation(); tracker.removeHit(hit.id); }}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1, flexShrink: 0 }}
                title="Remove hit"
              >×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add hit */}
      <button
        ref={btnRef}
        onClick={handleAddHit}
        style={{
          background: 'rgba(255,107,53,0.08)', border: '1px dashed rgba(255,107,53,0.35)',
          borderRadius: 6, padding: '5px 8px', color: '#ff6b35', fontSize: 11, fontWeight: 600,
          cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,107,53,0.16)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,107,53,0.08)'; }}
      >
        + HIT! (Pending Arrival)
      </button>

      {pickerOpen && (
        <HitPickerDropdown
          variants={variants}
          onSelect={handleSelect}
          onClose={() => setPickerOpen(false)}
          anchorRect={anchorRect}
        />
      )}
    </div>
  );
}

// ── Player Live Card ──────────────────────────────────────────────────────────
function PlayerLiveCard({ player, appearances, loading, tracker }) {
  const playerHits = tracker.getHitsForPlayer(player.slug);
  const hitCount = playerHits.length;

  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: hitCount > 0 ? 'rgba(76,175,80,0.03)' : 'transparent',
    }}>
      {/* Player header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>{player.name}</span>
            {player.isRC && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,107,53,0.12)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', fontWeight: 700 }}>RC</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tg)' }}>{player.team}</div>
        </div>
        {hitCount > 0 && (
          <div style={{ background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.35)', borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: '#4caf50' }}>
            🏆 {hitCount} HIT{hitCount !== 1 ? 'S' : ''}
          </div>
        )}
      </div>

      {/* Horizontal card slots */}
      <div style={{ overflowX: 'auto', display: 'flex', gap: 8, padding: '8px 14px 12px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tg)', fontSize: 12, padding: '8px 0' }}>
            <div style={{ width: 10, height: 10, border: '2px solid #ff6b35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            Loading cards…
          </div>
        ) : appearances?.length > 0 ? (
          appearances.map((app, i) => (
            <CardSlot
              key={`${app.subset.id}-${app.card.number}-${i}`}
              appearance={app}
              player={player}
              tracker={tracker}
            />
          ))
        ) : (
          <div style={{ fontSize: 12, color: 'var(--tg)', padding: '8px 0' }}>No card data available.</div>
        )}
      </div>
    </div>
  );
}

// ── Break Summary Modal ───────────────────────────────────────────────────────
function BreakSummaryModal({ hits, targetedPlayers, setName, breakInfo, onClose, onNewBreak, user, onSignUpPrompt }) {
  const cardRef = useRef();
  const [screenshotting, setScreenshotting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [adGate, setAdGate] = useState(null); // null | 'csv' | 'screenshot'

  // Group hits by player
  const grouped = useMemo(() => {
    const map = {};
    for (const hit of hits) {
      if (!map[hit.playerSlug]) map[hit.playerSlug] = [];
      map[hit.playerSlug].push(hit);
    }
    // Sort players by hit count desc
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [hits]);

  const playerName = slug =>
    targetedPlayers.find(p => p.slug === slug)?.name || slug;
  const playerTeam = slug =>
    targetedPlayers.find(p => p.slug === slug)?.team || '';

  // ── CSV export ──────────────────────────────────────────────────────────────
  const downloadCSV = useCallback(() => {
    const bi = breakInfo || {};
    const rows = [
      ['Breaker', 'Break Type', 'Platform', 'Date', 'Time', 'Set', 'Player', 'Team', 'Subset', 'Card #', 'Variant', 'Recorded At'],
      ...hits.map(h => [
        bi.breakerName || '',
        bi.breakType || '',
        bi.platform || '',
        bi.date || '',
        bi.time || '',
        setName,
        playerName(h.playerSlug),
        playerTeam(h.playerSlug),
        h.subsetId,
        h.cardNumber,
        h.variantName,
        new Date(h.timestamp).toLocaleString(),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `break-hits-${setName.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('CSV downloaded!');
    setTimeout(() => setExportMsg(''), 2500);
  }, [hits, setName, breakInfo]);

  // ── Screenshot export ────────────────────────────────────────────────────────
  const downloadScreenshot = useCallback(async () => {
    if (!cardRef.current) return;
    setScreenshotting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#07070f',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `break-summary-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setExportMsg('Screenshot saved!');
      setTimeout(() => setExportMsg(''), 2500);
    } catch {
      setExportMsg('Screenshot failed — try CSV instead.');
      setTimeout(() => setExportMsg(''), 3000);
    } finally {
      setScreenshotting(false);
    }
  }, []);

  // ── Ad-gated export triggers ────────────────────────────────────────────────
  const handleExportClick = useCallback((type) => {
    setAdGate(type);
  }, []);

  const handleAdWatched = useCallback(() => {
    const type = adGate;
    setAdGate(null);
    if (type === 'csv') downloadCSV();
    if (type === 'screenshot') downloadScreenshot();
  }, [adGate, downloadCSV, downloadScreenshot]);

  return (
    <>
    {adGate && (
      <AdGateModal
        title="Unlock Export"
        description="Watch a short ad to download your break summary."
        rewardLine={adGate === 'csv' ? 'Download CSV' : 'Save Image'}
        isDismissable
        onWatched={handleAdWatched}
        onUpgrade={() => setAdGate(null)}
        onDismiss={() => setAdGate(null)}
      />
    )}
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflowY: 'auto', padding: '24px 16px 40px',
    }}>
      {/* Sign-up prompt (unauthenticated users) */}
      {!user && (
        <div style={{
          width: '100%', maxWidth: 480, marginBottom: 14,
          background: 'linear-gradient(135deg, rgba(255,107,53,0.14), rgba(255,107,53,0.06))',
          border: '1px solid rgba(255,107,53,0.3)', borderRadius: 14,
          padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.4 }}>
              Save your breaks forever 🏆
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              Create a free account to sync your hit history across devices.
            </div>
          </div>
          <button
            onClick={onSignUpPrompt}
            style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg, #ff6b35, #e84d1e)',
              border: 'none', color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1,
              boxShadow: '0 2px 10px rgba(255,107,53,0.4)',
            }}
          >
            Sign Up Free
          </button>
        </div>
      )}

      {/* Screenshottable card */}
      <div ref={cardRef} style={{
        width: '100%', maxWidth: 480,
        background: '#07070f',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,107,53,0.18), rgba(255,107,53,0.06))',
          borderBottom: '1px solid rgba(255,107,53,0.2)',
          padding: '16px 20px',
        }}>
          <div style={{ fontSize: 11, color: '#ff6b35', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>Break Summary</div>
          <div style={{ fontSize: 22, fontWeight: 400, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>{setName}</div>
          {breakInfo?.breakerName && (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5, marginTop: 4 }}>
              {breakInfo.breakerName}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {breakInfo?.breakType && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,107,53,0.12)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.25)', fontWeight: 700, letterSpacing: 0.5 }}>{breakInfo.breakType}</span>
            )}
            {breakInfo?.platform && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'rgba(100,181,246,0.1)', color: '#64b5f6', border: '1px solid rgba(100,181,246,0.2)', fontWeight: 700, letterSpacing: 0.5 }}>{breakInfo.platform}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>
            {breakInfo?.date
              ? new Date(breakInfo.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
              : new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            {breakInfo?.time && <>&nbsp;·&nbsp;{breakInfo.time}</>}
            &nbsp;·&nbsp;{hits.length} hit{hits.length !== 1 ? 's' : ''} across {grouped.length} player{grouped.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Hits grouped by player */}
        <div style={{ padding: '8px 0' }}>
          {hits.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              No hits recorded this break.
            </div>
          ) : (
            grouped.map(([slug, playerHits]) => (
              <div key={slug} style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {/* Player header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5 }}>
                      {playerName(slug)}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{playerTeam(slug)}</div>
                  </div>
                  <div style={{
                    background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.3)',
                    borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700, color: '#4caf50',
                  }}>
                    🏆 {playerHits.length}
                  </div>
                </div>
                {/* Hit chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {playerHits.map(hit => (
                    <div key={hit.id} style={{
                      background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.25)',
                      borderRadius: 8, padding: '4px 8px',
                      fontSize: 11, color: '#a5d6a7',
                      fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600,
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10 }}>#{hit.cardNumber}</span>
                      <span>{hit.variantName}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer brand */}
        <div style={{ padding: '10px 20px 14px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: "'Bebas Neue', sans-serif" }}>
            myvaults.io · Break Hit Tracker
          </div>
        </div>
      </div>

      {/* Export buttons */}
      <div style={{ width: '100%', maxWidth: 480, marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          onClick={() => handleExportClick('screenshot')}
          disabled={screenshotting}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.3)',
            color: '#ff6b35', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: screenshotting ? 0.6 : 1,
          }}
        >
          {screenshotting ? '…' : '📸 Save Image'}
        </button>
        <button
          onClick={() => handleExportClick('csv')}
          style={{
            flex: 1, padding: '12px 0', borderRadius: 12,
            background: 'rgba(76,175,80,0.1)', border: '1px solid rgba(76,175,80,0.3)',
            color: '#4caf50', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          📋 Download CSV
        </button>
      </div>

      {exportMsg && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#4caf50', fontWeight: 600 }}>{exportMsg}</div>
      )}

      {/* Action buttons */}
      <div style={{ width: '100%', maxWidth: 480, marginTop: 14, display: 'flex', gap: 8 }}>
        <button
          onClick={onNewBreak}
          style={{
            flex: 1, padding: '13px 0', borderRadius: 12,
            background: 'linear-gradient(135deg, #ff6b35, #e84d1e)',
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5,
            boxShadow: '0 4px 16px rgba(255,107,53,0.35)',
          }}
        >
          START NEW BREAK
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '13px 18px', borderRadius: 12,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
    </>
  );
}

// ── LIVE PHASE ────────────────────────────────────────────────────────────────
function LivePhase({ checklist, tracker, onBack, onNewBreak, breakInfo, activeSetId, user, onSignUpPrompt }) {
  const targetedSlugs = tracker.getTargetedSlugs();
  const targetedPlayers = useMemo(
    () => checklist.players.filter(p => targetedSlugs.includes(p.slug)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checklist.players, targetedSlugs.join(',')]
  );

  const [playerDetails, setPlayerDetails] = useState({});
  const [loadingSet, setLoadingSet] = useState(() => new Set(targetedSlugs));
  const [showSummary, setShowSummary] = useState(false);
  const totalHits = tracker.hits.length;

  useEffect(() => {
    if (targetedSlugs.length === 0) return;
    Promise.allSettled(
      targetedSlugs.map(slug =>
        fetch(`${API_BASE}/api/sets-player?setId=${activeSetId}&player=${encodeURIComponent(slug)}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => ({ slug, data }))
      )
    ).then(results => {
      const updates = {};
      for (const r of results) {
        if (r.status === 'fulfilled') updates[r.value.slug] = r.value.data;
      }
      setPlayerDetails(updates);
      setLoadingSet(new Set());
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {showSummary && (
        <BreakSummaryModal
          hits={tracker.hits}
          targetedPlayers={targetedPlayers}
          setName={checklist?.set?.name || '2025-26 Bowman Basketball'}
          breakInfo={breakInfo}
          onClose={() => setShowSummary(false)}
          onNewBreak={onNewBreak}
          user={user}
          onSignUpPrompt={onSignUpPrompt}
        />
      )}

      {/* Header */}
      <div style={{
        background: 'var(--hbg)', borderBottom: '1px solid var(--hb)',
        padding: '12px 14px', backdropFilter: 'blur(20px)',
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: 'var(--tg)', fontSize: 16, flexShrink: 0 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 400, color: '#ff6b35', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, lineHeight: 1 }}>
            {checklist?.set?.name || '2025-26 Bowman Basketball'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--tg)', letterSpacing: 0.5 }}>Break is live · {targetedPlayers.length} player{targetedPlayers.length !== 1 ? 's' : ''}</span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4caf50', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        {totalHits > 0 && (
          <div style={{ background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.35)', borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#4caf50' }}>
            🏆 {totalHits}
          </div>
        )}
        <button
          onClick={() => setShowSummary(true)}
          style={{
            background: totalHits > 0
              ? 'linear-gradient(135deg, #ff6b35, #e84d1e)'
              : 'rgba(255,255,255,0.05)',
            border: totalHits > 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '6px 11px', cursor: 'pointer',
            color: '#fff', fontSize: 11, fontWeight: 700,
            fontFamily: totalHits > 0 ? "'Bebas Neue', sans-serif" : 'inherit',
            letterSpacing: totalHits > 0 ? 1 : 0,
            flexShrink: 0,
            boxShadow: totalHits > 0 ? '0 2px 10px rgba(255,107,53,0.4)' : 'none',
          }}
        >
          {totalHits > 0 ? 'END BREAK' : 'End Break'}
        </button>
      </div>

      {/* Player cards */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {targetedPlayers.map(player => (
          <PlayerLiveCard
            key={player.slug}
            player={player}
            appearances={playerDetails[player.slug]?.appearances}
            loading={loadingSet.has(player.slug)}
            tracker={tracker}
          />
        ))}
        <div style={{ height: 40 }} />
      </div>
    </>
  );
}

// ── Main BreakTracker ─────────────────────────────────────────────────────────
export default function BreakTracker({ user, onClose, onSignUpPrompt }) {
  const [checklist, setChecklist] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [checklistError, setChecklistError] = useState(null);
  const [phase, setPhase] = useState('select');

  const [breakInfo, updateBreakInfo] = useBreakInfo();
  const activeSetId = breakInfo.collection || '2025-26-bowman-basketball';

  const tracker = useTrackerState(activeSetId);

  const fetchChecklist = useCallback(() => {
    setLoadingChecklist(true);
    setChecklistError(null);
    fetch(`${API_BASE}/api/sets-checklist?setId=${activeSetId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setChecklist(data); setLoadingChecklist(false); })
      .catch(e => { setChecklistError(e.message); setLoadingChecklist(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSetId]);

  // Reset to select phase and reload checklist when set changes
  useEffect(() => {
    setPhase('select');
    fetchChecklist();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSetId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {loadingChecklist && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, color: 'var(--tg)' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #ff6b35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span style={{ fontSize: 12 }}>Loading checklist…</span>
        </div>
      )}

      {checklistError && !loadingChecklist && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, flex: 1, padding: '40px 20px', textAlign: 'center', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 16, left: 14, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg)', fontSize: 16 }}>←</button>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <div style={{ fontSize: 13, color: 'var(--ts)' }}>Could not load checklist</div>
          <div style={{ fontSize: 11, color: 'var(--tg)' }}>{checklistError}</div>
          <button onClick={fetchChecklist} style={{ background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.3)', color: '#ff6b35', borderRadius: 10, padding: '8px 20px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {!loadingChecklist && !checklistError && checklist && (
        phase === 'select'
          ? <SelectPhase checklist={checklist} tracker={tracker} onStartBreak={() => setPhase('live')} onClose={onClose} breakInfo={breakInfo} onBreakInfoChange={updateBreakInfo} />
          : <LivePhase
              checklist={checklist}
              tracker={tracker}
              onBack={() => setPhase('select')}
              onNewBreak={() => { tracker.clearAll(); setPhase('select'); }}
              breakInfo={breakInfo}
              activeSetId={activeSetId}
              user={user}
              onSignUpPrompt={onSignUpPrompt}
            />
      )}
    </div>
  );
}
