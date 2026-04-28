import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useTrackerState } from './useTrackerState.js';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const ACTIVE_SET_ID = '2025-26-bowman-basketball';

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
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
function SelectPhase({ checklist, tracker, onStartBreak, onClose }) {
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
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    pos.left = Math.min(anchorRect.left, window.innerWidth - 270);
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

// ── LIVE PHASE ────────────────────────────────────────────────────────────────
function LivePhase({ checklist, tracker, onBack }) {
  const targetedSlugs = tracker.getTargetedSlugs();
  const targetedPlayers = useMemo(
    () => checklist.players.filter(p => targetedSlugs.includes(p.slug)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checklist.players, targetedSlugs.join(',')]
  );

  const [playerDetails, setPlayerDetails] = useState({});
  const [loadingSet, setLoadingSet] = useState(() => new Set(targetedSlugs));
  const totalHits = tracker.hits.length;

  useEffect(() => {
    if (targetedSlugs.length === 0) return;
    Promise.allSettled(
      targetedSlugs.map(slug =>
        fetch(`${API_BASE}/api/sets-player?setId=${ACTIVE_SET_ID}&player=${encodeURIComponent(slug)}`)
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
          <div style={{ background: 'rgba(76,175,80,0.15)', border: '1px solid rgba(76,175,80,0.35)', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, color: '#4caf50' }}>
            🏆 {totalHits} HIT{totalHits !== 1 ? 'S' : ''}
          </div>
        )}
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

  const tracker = useTrackerState(ACTIVE_SET_ID);

  const fetchChecklist = useCallback(() => {
    setLoadingChecklist(true);
    setChecklistError(null);
    fetch(`${API_BASE}/api/sets-checklist?setId=${ACTIVE_SET_ID}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { setChecklist(data); setLoadingChecklist(false); })
      .catch(e => { setChecklistError(e.message); setLoadingChecklist(false); });
  }, []);

  useEffect(() => { fetchChecklist(); }, [fetchChecklist]);

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
          ? <SelectPhase checklist={checklist} tracker={tracker} onStartBreak={() => setPhase('live')} onClose={onClose} />
          : <LivePhase checklist={checklist} tracker={tracker} onBack={() => setPhase('select')} />
      )}
    </div>
  );
}
