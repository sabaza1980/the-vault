import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { resolveCollectionCards } from './useCollectionsSync';

const API_BASE = Capacitor.isNativePlatform() ? 'https://app.myvaults.io' : '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 20,
      background: `${color}18`, color, border: `1px solid ${color}35`,
      fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
    }}>{label}</span>
  );
}

function Input({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--td)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: 'var(--input)', border: '1px solid var(--b)',
          borderRadius: 8, color: 'var(--t)', fontSize: 13,
          padding: '8px 12px', outline: 'none', width: '100%',
        }}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
    >
      <div style={{
        width: 34, height: 20, borderRadius: 10, position: 'relative',
        background: checked ? '#ff6b35' : 'var(--b)', transition: 'background 0.15s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 2, left: checked ? 16 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
      </div>
      <span style={{ fontSize: 12, color: 'var(--ts)', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// TagInput — multi-value text input (Enter/comma adds a tag)
function TagInput({ label, values, onChange, placeholder, suggestions = [] }) {
  const [draft, setDraft] = useState('');
  const [showSugg, setShowSugg] = useState(false);
  const inputRef = useRef(null);

  const addTag = (val) => {
    const v = val.trim();
    if (!v || values.includes(v)) { setDraft(''); return; }
    onChange([...values, v]);
    setDraft('');
    setShowSugg(false);
  };

  const removeTag = (idx) => onChange(values.filter((_, i) => i !== idx));

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(draft); }
    if (e.key === 'Backspace' && !draft && values.length) removeTag(values.length - 1);
  };

  const filtered = suggestions.filter(s => s.toLowerCase().includes(draft.toLowerCase()) && !values.includes(s)).slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--td)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</label>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
          background: 'var(--input)', border: `1px solid ${values.length ? '#ff6b3560' : 'var(--b)'}`,
          borderRadius: 8, padding: '6px 10px', minHeight: 38, cursor: 'text',
        }}
      >
        {values.map((v, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,107,53,0.15)', color: '#ff6b35',
            border: '1px solid rgba(255,107,53,0.35)', borderRadius: 14,
            fontSize: 11, fontWeight: 700, padding: '2px 8px',
          }}>
            {v}
            <button onClick={e => { e.stopPropagation(); removeTag(i); }} style={{ background: 'none', border: 'none', color: '#ff6b3580', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={e => { setDraft(e.target.value); setShowSugg(true); }}
          onKeyDown={handleKey}
          onBlur={() => { setTimeout(() => setShowSugg(false), 150); if (draft.trim()) addTag(draft); }}
          placeholder={values.length ? '' : placeholder}
          style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--t)', fontSize: 13, minWidth: 80, flex: 1 }}
        />
      </div>
      {showSugg && filtered.length > 0 && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--b)', borderRadius: 8,
          overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        }}>
          {filtered.map(s => (
            <div key={s} onMouseDown={() => addTag(s)} style={{
              padding: '7px 12px', fontSize: 12, color: 'var(--ts)', cursor: 'pointer',
              borderBottom: '1px solid var(--b)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--deep)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
      {values.length === 0 && <span style={{ fontSize: 10, color: 'var(--td)' }}>Press Enter or comma to add multiple</span>}
    </div>
  );
}

// ── Insert combobox — options driven by user's cards, filtered by sport+brand ─

function InsertCombobox({ value, onChange, options }) {
  const listId = 'insert-options-list';
  const hasOptions = options.length > 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, color: 'var(--td)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Insert Name
        {hasOptions && <span style={{ marginLeft: 6, color: '#ff6b35', fontWeight: 700 }}>({options.length} in vault)</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          list={listId}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={hasOptions ? 'Select or type insert…' : 'e.g. Express Lane'}
          style={{
            background: 'var(--input)', border: `1px solid ${value ? '#ff6b3560' : 'var(--b)'}`,
            borderRadius: 8, color: 'var(--t)', fontSize: 13,
            padding: '8px 12px', outline: 'none', width: '100%',
          }}
        />
        {value && (
          <button onClick={() => onChange('')} style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--td)', cursor: 'pointer', fontSize: 14, padding: 2,
          }}>×</button>
        )}
      </div>
      {hasOptions && (
        <datalist id={listId}>
          {options.map(o => <option key={o} value={o} />)}
        </datalist>
      )}
      {hasOptions && !value && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
          {options.slice(0, 8).map(o => (
            <button key={o} onClick={() => onChange(o)} style={{
              padding: '2px 9px', borderRadius: 20, border: '1px solid var(--b)',
              background: 'transparent', color: 'var(--ts)', cursor: 'pointer',
              fontSize: 10, fontWeight: 600,
            }}>{o}</button>
          ))}
          {options.length > 8 && (
            <span style={{ fontSize: 10, color: 'var(--td)', alignSelf: 'center' }}>+{options.length - 8} more</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── AI collection builder ─────────────────────────────────────────────────────

function buildVaultSummary(allCards) {
  if (!allCards.length) return 'Vault is empty.';
  const sports   = [...new Set(allCards.map(c => c.sport).filter(Boolean))].slice(0, 8);
  const brands   = [...new Set(allCards.map(c => c.brand).filter(Boolean))].slice(0, 8);
  const inserts  = [...new Set(allCards.map(c => c.insertName).filter(Boolean))].slice(0, 20);
  const players  = [...new Set(allCards.map(c => c.playerName).filter(Boolean))].slice(0, 12);
  const leagues  = [...new Set(allCards.map(c => c.league).filter(Boolean))].slice(0, 6);
  const years    = [...new Set(allCards.map(c => c.year).filter(Boolean))].sort();
  const yearRange = years.length ? `${years[0]}–${years[years.length - 1]}` : 'unknown';
  return [
    `Vault: ${allCards.length} cards, years ${yearRange}.`,
    sports.length  ? `Sports: ${sports.join(', ')}.`     : '',
    leagues.length ? `Leagues: ${leagues.join(', ')}.`   : '',
    brands.length  ? `Brands: ${brands.join(', ')}.`     : '',
    inserts.length ? `Inserts tagged: ${inserts.join(', ')}.` : '',
    players.length ? `Players (sample): ${players.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

const AI_SYSTEM = (vaultSummary) => `You are a collection-builder assistant inside The Vault, a trading card app. Help the user define a named collection using the criteria schema below. Be brief and conversational.

VAULT CONTEXT: ${vaultSummary}

COLLECTION CRITERIA FIELDS (only include relevant ones):
- playerName: string OR string[]  — e.g. "LeBron James" or ["LeBron James","Michael Jordan"] for multiple players
- brand: string OR string[]       — e.g. "Panini" or ["Panini","Topps"] for multiple brands
- series: string                  — e.g. "Prizm", "Optic"
- insertName: string              — e.g. "Express Lane", "Fast Break"
- league: string                  — e.g. "NBA", "NFL"
- sport: string                   — e.g. "Basketball", "American Football"
- team: string                    — e.g. "Lakers"
- cardCategory: string            — one of: Basketball, American Football, Baseball, Soccer, Hockey, Pokemon, MTG, Yu-Gi-Oh, Other TCG, Stamps, Coins, Other
- yearFrom: string                — e.g. "2020"
- yearTo: string                  — e.g. "2024"
- isRookie: true
- hasAutograph: true
- hasPatch: true
- isNumbered: true
- isGraded: true

IMPORTANT:
- If the user mentions multiple players or brands, use an array: ["Player A", "Player B"]
- Correct any typos in player names, brands, or set names using the VAULT CONTEXT above — always output the correctly spelled name
- Match player names to what's in the vault context where possible (e.g. "Wemby" → "Victor Wembanyama", "LBJ" → "LeBron James")

RULES:
1. When you have enough info, respond with a JSON block (and nothing else after it — a short sentence before is fine):
\`\`\`json
{
  "name": "Collection Name",
  "description": "Short description or null",
  "criteria": { ... only the relevant fields ... }
}
\`\`\`
2. If you need ONE clarifying question, ask it briefly (no JSON yet).
3. Never ask more than one question per turn.
4. If the user's request is clear from the vault context, go straight to JSON.`;

function AiCreatorChat({ allCards, onApply, onSwitchManual }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Describe the collection you want to create — I\'ll set up the criteria for you. For example: "All my Panini Optic Express Lane inserts" or "My NBA rookie autos from 2021 onwards".' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          system: AI_SYSTEM(buildVaultSummary(allCards)),
          messages: next.filter(m => m.role !== 'assistant' || next.indexOf(m) > 0),
          max_tokens: 1200,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `API error ${res.status}`);
      }

      const data = await res.json();
      const reply = data?.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim()
        || 'Sorry, I couldn\'t generate a response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      // Parse JSON if present
      const match = reply.match(/```json\s*([\s\S]+?)\s*```/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.name && parsed.criteria) onApply(parsed);
        } catch { /* malformed JSON — leave chat open */ }
      }
    } catch (err) {
      console.error('AI creator error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: `Something went wrong: ${err.message || 'Unknown error'}. Please try again.` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, allCards, onApply]);

  const handleKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Chat history */}
      <div style={{
        background: 'var(--deep)', borderRadius: 12, padding: 12,
        maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
            {m.role === 'assistant' && (
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12,
              }}>✦</div>
            )}
            <div style={{
              maxWidth: '78%', padding: '8px 11px', borderRadius: 10,
              background: m.role === 'user' ? '#ff6b3520' : 'var(--card)',
              border: `1px solid ${m.role === 'user' ? '#ff6b3540' : 'var(--b)'}`,
              fontSize: 12, color: 'var(--t)', lineHeight: 1.5,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {m.content.replace(/```json[\s\S]*?```/g, '✓ Criteria ready — switching to form…')}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
            }}>✦</div>
            <div style={{ display: 'flex', gap: 4, padding: '8px 12px', background: 'var(--card)', borderRadius: 10, border: '1px solid var(--b)' }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%', background: '#ff6b35',
                  animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe your collection…"
          disabled={loading}
          style={{
            flex: 1, background: 'var(--input)', border: '1px solid var(--b)',
            borderRadius: 10, color: 'var(--t)', fontSize: 13, padding: '9px 12px',
            outline: 'none',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || loading}
          style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: input.trim() && !loading ? 'linear-gradient(135deg, #ff6b35, #f7c59f)' : 'var(--b)',
            color: input.trim() && !loading ? '#fff' : 'var(--td)',
            fontSize: 13, fontWeight: 800, cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
          }}
        >→</button>
      </div>

      <button
        onClick={onSwitchManual}
        style={{ background: 'none', border: 'none', color: 'var(--td)', fontSize: 11, cursor: 'pointer', alignSelf: 'center', textDecoration: 'underline', padding: 0 }}
      >Switch to manual form instead</button>

      <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  );
}

// ── Collection Creator Modal ──────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  'Basketball', 'American Football', 'Baseball', 'Soccer', 'Hockey',
  'Pokemon', 'MTG', 'Yu-Gi-Oh', 'Other TCG', 'Stamps', 'Coins', 'Other',
];

export function CollectionCreatorModal({ existing, allCards, onSave, onClose }) {
  const isEdit = !!existing;

  // 'ai' | 'manual' — new collections default to AI mode
  const [creationMode, setCreationMode] = useState(isEdit ? 'manual' : 'ai');

  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [type, setType] = useState(existing?.type || 'smart');

  // Smart criteria
  const initCr = existing?.criteria || {};
  // playerName and brand support multi-value arrays
  const toArr = (v) => !v ? [] : Array.isArray(v) ? v : [v];
  const [crPlayer, setCrPlayer] = useState(toArr(initCr.playerName));
  const [crBrand, setCrBrand] = useState(toArr(initCr.brand));
  const [crSeries, setCrSeries] = useState(initCr.series || '');
  const [crInsert, setCrInsert] = useState(initCr.insertName || '');
  const [crLeague, setCrLeague] = useState(initCr.league || '');
  const [crSport, setCrSport] = useState(initCr.sport || '');
  const [crTeam, setCrTeam] = useState(initCr.team || '');
  const [crCategory, setCrCategory] = useState(initCr.cardCategory || '');
  const [crYearFrom, setCrYearFrom] = useState(initCr.yearFrom || '');
  const [crYearTo, setCrYearTo] = useState(initCr.yearTo || '');
  const [crRookie, setCrRookie] = useState(initCr.isRookie || false);
  const [crAuto, setCrAuto] = useState(initCr.hasAutograph || false);
  const [crPatch, setCrPatch] = useState(initCr.hasPatch || false);
  const [crNumbered, setCrNumbered] = useState(initCr.isNumbered || false);
  const [crGraded, setCrGraded] = useState(initCr.isGraded || false);

  // Manual card selection (start from existing if editing a manual collection)
  const [selectedIds, setSelectedIds] = useState(
    new Set((existing?.cardIds || []).map(String))
  );
  const [manualSearch, setManualSearch] = useState('');

  // Player + brand suggestions from vault
  const playerSuggestions = useMemo(() => [...new Set(allCards.map(c => c.playerName).filter(Boolean))].sort(), [allCards]);
  const brandSuggestions = useMemo(() => [...new Set(allCards.map(c => c.brand).filter(Boolean))].sort(), [allCards]);

  // Preview — live match count for smart
  const previewCriteria = useMemo(() => ({
    playerName: crPlayer.length ? crPlayer : undefined,
    brand: crBrand.length ? crBrand : undefined,
    series: crSeries || undefined,
    insertName: crInsert || undefined,
    league: crLeague || undefined,
    sport: crSport || undefined,
    team: crTeam || undefined,
    cardCategory: crCategory || undefined,
    yearFrom: crYearFrom || undefined,
    yearTo: crYearTo || undefined,
    isRookie: crRookie || undefined,
    hasAutograph: crAuto || undefined,
    hasPatch: crPatch || undefined,
    isNumbered: crNumbered || undefined,
    isGraded: crGraded || undefined,
  }), [crPlayer, crBrand, crSeries, crInsert, crLeague, crSport, crTeam, crCategory, crYearFrom, crYearTo, crRookie, crAuto, crPatch, crNumbered, crGraded]);

  const previewCards = useMemo(() => {
    if (type !== 'smart') return [];
    const hasCriteria = Object.values(previewCriteria).some(v => v !== undefined && v !== false);
    if (!hasCriteria) return [];
    return resolveCollectionCards({ type: 'smart', criteria: previewCriteria }, allCards);
  }, [type, previewCriteria, allCards]);

  // Manual — filtered card list
  const manualFiltered = useMemo(() => {
    const q = manualSearch.toLowerCase();
    if (!q) return allCards;
    return allCards.filter(c =>
      (c.playerName || '').toLowerCase().includes(q) ||
      (c.fullCardName || '').toLowerCase().includes(q) ||
      (c.series || '').toLowerCase().includes(q) ||
      (c.insertName || '').toLowerCase().includes(q)
    );
  }, [allCards, manualSearch]);

  // Insert dropdown options — filtered by current sport+brand selection
  const insertOptions = useMemo(() => {
    const opts = new Set();
    allCards.forEach(c => {
      if (!c.insertName) return;
      const sportMatch = !crSport || (c.sport || '').toLowerCase().includes(crSport.toLowerCase());
      const brandMatch = crBrand.length === 0 || crBrand.some(b => (c.brand || '').toLowerCase().includes(b.toLowerCase()));
      if (sportMatch && brandMatch) opts.add(c.insertName);
    });
    return [...opts].sort();
  }, [allCards, crSport, crBrand]);

  // AI → populate form fields
  const handleAiApply = useCallback((parsed) => {
    if (parsed.name) setName(parsed.name);
    if (parsed.description) setDescription(parsed.description);
    const cr = parsed.criteria || {};
    if (cr.playerName  !== undefined) setCrPlayer(cr.playerName ? (Array.isArray(cr.playerName) ? cr.playerName : [cr.playerName]) : []);
    if (cr.brand       !== undefined) setCrBrand(cr.brand ? (Array.isArray(cr.brand) ? cr.brand : [cr.brand]) : []);
    if (cr.series      !== undefined) setCrSeries(cr.series || '');
    if (cr.insertName  !== undefined) setCrInsert(cr.insertName || '');
    if (cr.league      !== undefined) setCrLeague(cr.league || '');
    if (cr.sport       !== undefined) setCrSport(cr.sport || '');
    if (cr.team        !== undefined) setCrTeam(cr.team || '');
    if (cr.cardCategory !== undefined) setCrCategory(cr.cardCategory || '');
    if (cr.yearFrom    !== undefined) setCrYearFrom(String(cr.yearFrom || ''));
    if (cr.yearTo      !== undefined) setCrYearTo(String(cr.yearTo || ''));
    if (cr.isRookie    !== undefined) setCrRookie(!!cr.isRookie);
    if (cr.hasAutograph !== undefined) setCrAuto(!!cr.hasAutograph);
    if (cr.hasPatch    !== undefined) setCrPatch(!!cr.hasPatch);
    if (cr.isNumbered  !== undefined) setCrNumbered(!!cr.isNumbered);
    if (cr.isGraded    !== undefined) setCrGraded(!!cr.isGraded);
    setType('smart');
    setCreationMode('manual');
  }, []);

  const toggleCard = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(String(id))) next.delete(String(id));
      else next.add(String(id));
      return next;
    });
  };

  const canSave = name.trim().length > 0 && (
    type === 'manual' ? selectedIds.size > 0 :
    Object.values(previewCriteria).some(v => v !== undefined && v !== false)
  );

  const handleSave = () => {
    const now = new Date().toISOString();
    const criteria = type === 'smart' ? Object.fromEntries(
      Object.entries(previewCriteria).filter(([, v]) => v !== undefined && v !== false)
    ) : null;

    // Cover image: first card image
    let coverImageUrl = null;
    if (type === 'smart' && previewCards.length > 0) {
      coverImageUrl = previewCards[0]?.imageUrl || null;
    } else if (type === 'manual' && selectedIds.size > 0) {
      const firstId = [...selectedIds][0];
      const firstCard = allCards.find(c => String(c.id) === firstId);
      coverImageUrl = firstCard?.imageUrl || null;
    }

    onSave({
      id: existing?.id || String(Date.now()),
      name: name.trim(),
      description: description.trim() || null,
      type,
      criteria,
      cardIds: type === 'manual' ? [...selectedIds] : [],
      coverImageUrl,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--card)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 680, maxHeight: '90vh',
        overflow: 'auto', padding: '20px 18px 32px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5 }}>
            {isEdit ? 'Edit Collection' : 'New Collection'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--tm)', fontSize: 22, cursor: 'pointer', padding: '2px 6px' }}>×</button>
        </div>

        {/* AI / Manual toggle — only for new collections */}
        {!isEdit && (
          <div style={{ display: 'flex', background: 'var(--deep)', borderRadius: 10, padding: 3, marginBottom: 16 }}>
            {[['ai', '✦ Ask AI'], ['manual', '✋ Manual']].map(([m, label]) => (
              <button key={m} onClick={() => setCreationMode(m)} style={{
                flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                background: creationMode === m ? 'var(--card)' : 'transparent',
                color: creationMode === m ? (m === 'ai' ? '#ff6b35' : 'var(--t)') : 'var(--ts)',
                fontSize: 12, fontWeight: 800, cursor: 'pointer',
                boxShadow: creationMode === m ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── AI mode pane ── */}
          {creationMode === 'ai' && (
            <AiCreatorChat
              allCards={allCards}
              onApply={handleAiApply}
              onSwitchManual={() => setCreationMode('manual')}
            />
          )}

          {/* ── Manual form ── */}
          {creationMode === 'manual' && (
            <>
          <Input label="Collection Name" value={name} onChange={setName} placeholder="e.g. My LeBron Collection" />
          <Input label="Description (optional)" value={description} onChange={setDescription} placeholder="What's in this collection?" />

          {/* Type toggle */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--td)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Collection Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['smart', '✦ Smart', 'Auto-updates from criteria'], ['manual', '✋ Manual', 'Hand-pick cards']].map(([v, label, sub]) => (
                <button key={v} onClick={() => setType(v)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${type === v ? '#ff6b35' : 'var(--b)'}`,
                  background: type === v ? '#ff6b3515' : 'var(--deep)',
                  color: type === v ? '#ff6b35' : 'var(--ts)',
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{label}</div>
                  <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Smart criteria */}
          {type === 'smart' && (
            <div style={{ background: 'var(--deep)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--td)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Criteria — cards matching ALL filled fields are included
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TagInput label="Player Name" values={crPlayer} onChange={setCrPlayer} placeholder="e.g. LeBron James" suggestions={playerSuggestions} />
                <TagInput label="Brand" values={crBrand} onChange={setCrBrand} placeholder="e.g. Panini, Topps" suggestions={brandSuggestions} />
                <Input label="Set / Series" value={crSeries} onChange={setCrSeries} placeholder="e.g. Prizm, Optic" />
                <InsertCombobox value={crInsert} onChange={setCrInsert} options={insertOptions} />
                <Input label="League" value={crLeague} onChange={setCrLeague} placeholder="e.g. NBA, NFL" />
                <Input label="Team" value={crTeam} onChange={setCrTeam} placeholder="e.g. Lakers" />
                <Input label="Year From" value={crYearFrom} onChange={setCrYearFrom} placeholder="e.g. 2020" />
                <Input label="Year To" value={crYearTo} onChange={setCrYearTo} placeholder="e.g. 2024" />
              </div>

              {/* Category */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--td)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Category</div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {['', ...CATEGORY_OPTIONS].map(cat => (
                    <button key={cat} onClick={() => setCrCategory(cat)} style={{
                      padding: '3px 10px', borderRadius: 20, border: '1px solid',
                      borderColor: crCategory === cat ? '#ff6b35' : 'var(--b)',
                      background: crCategory === cat ? '#ff6b3515' : 'transparent',
                      color: crCategory === cat ? '#ff6b35' : 'var(--ts)',
                      cursor: 'pointer', fontSize: 11, fontWeight: 600,
                    }}>{cat || 'Any'}</button>
                  ))}
                </div>
              </div>

              {/* Boolean toggles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Toggle label="Rookie Cards Only" checked={crRookie} onChange={setCrRookie} />
                <Toggle label="Autographs Only" checked={crAuto} onChange={setCrAuto} />
                <Toggle label="Patch / Mem Only" checked={crPatch} onChange={setCrPatch} />
                <Toggle label="Numbered Only" checked={crNumbered} onChange={setCrNumbered} />
                <Toggle label="Graded Only" checked={crGraded} onChange={setCrGraded} />
              </div>

              {/* Live preview */}
              <div style={{
                background: 'var(--card)', borderRadius: 10, padding: '10px 14px',
                border: '1px solid var(--b)',
              }}>
                <span style={{ fontSize: 12, color: previewCards.length > 0 ? '#4caf50' : 'var(--td)', fontWeight: 700 }}>
                  {previewCards.length > 0
                    ? `✓ ${previewCards.length} card${previewCards.length !== 1 ? 's' : ''} match these criteria`
                    : Object.values(previewCriteria).some(v => v !== undefined && v !== false)
                    ? 'No cards match yet — try broadening the criteria'
                    : 'Fill in criteria above to preview matches'}
                </span>
              </div>
            </div>
          )}

          {/* Manual card picker */}
          {type === 'manual' && (
            <div style={{ background: 'var(--deep)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--td)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Select Cards ({selectedIds.size} selected)
              </div>
              <input
                type="text"
                placeholder="Search cards…"
                value={manualSearch}
                onChange={e => setManualSearch(e.target.value)}
                style={{
                  background: 'var(--input)', border: '1px solid var(--b)',
                  borderRadius: 8, color: 'var(--t)', fontSize: 13,
                  padding: '7px 12px', outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                {manualFiltered.map(c => {
                  const sel = selectedIds.has(String(c.id));
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleCard(c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                        background: sel ? '#ff6b3512' : 'transparent',
                        border: `1px solid ${sel ? '#ff6b3540' : 'var(--b)'}`,
                        transition: 'all 0.1s',
                      }}
                    >
                      {c.imageUrl && (
                        <img src={c.imageUrl} alt="" style={{ width: 32, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.playerName || 'Unknown'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--td)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[c.year, c.brand, c.series, c.insertName].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${sel ? '#ff6b35' : 'var(--b)'}`,
                        background: sel ? '#ff6b35' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, color: '#fff',
                      }}>{sel ? '✓' : ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '13px', borderRadius: 12, border: 'none',
              background: canSave ? 'linear-gradient(135deg, #ff6b35, #f7c59f)' : 'var(--b)',
              color: canSave ? '#fff' : 'var(--td)',
              fontSize: 14, fontWeight: 800, cursor: canSave ? 'pointer' : 'not-allowed',
              letterSpacing: 0.5,
            }}
          >
            {isEdit ? 'Save Changes' : 'Create Collection'}
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collection Detail View ────────────────────────────────────────────────────

export function CollectionDetailView({ col, allCards, onBack, onEdit, onShare, onDelete, onUpdate }) {
  const [addMode, setAddMode] = useState(false);
  const [addSearch, setAddSearch] = useState('');

  const cards = useMemo(() => resolveCollectionCards(col, allCards), [col, allCards]);

  const totalValue = cards.reduce((s, c) => s + (c.estimatedValue || 0), 0);
  const rookies = cards.filter(c => c.isRookie).length;
  const autos = cards.filter(c => c.hasAutograph).length;

  const addableCards = useMemo(() => {
    if (!addMode) return [];
    const existing = new Set((col.cardIds || []).map(String));
    const q = addSearch.toLowerCase();
    return allCards.filter(c => {
      if (existing.has(String(c.id))) return false;
      if (!q) return true;
      return (
        (c.playerName || '').toLowerCase().includes(q) ||
        (c.fullCardName || '').toLowerCase().includes(q) ||
        (c.series || '').toLowerCase().includes(q)
      );
    });
  }, [addMode, addSearch, allCards, col.cardIds]);

  const handleRemoveCard = (cardId) => {
    if (col.type !== 'manual') return;
    onUpdate({ ...col, cardIds: (col.cardIds || []).filter(id => String(id) !== String(cardId)), updatedAt: new Date().toISOString() });
  };

  const handleAddCard = (cardId) => {
    if (col.type !== 'manual') return;
    const next = [...new Set([...(col.cardIds || []), String(cardId)])];
    const card = allCards.find(c => String(c.id) === String(cardId));
    onUpdate({
      ...col,
      cardIds: next,
      coverImageUrl: col.coverImageUrl || card?.imageUrl || null,
      updatedAt: new Date().toISOString(),
    });
  };

  const criteriaLabels = col.criteria ? Object.entries(col.criteria)
    .filter(([, v]) => v !== undefined && v !== false)
    .map(([k, v]) => {
      const labels = {
        playerName: 'Player', brand: 'Brand', series: 'Set', insertName: 'Insert',
        league: 'League', sport: 'Sport', team: 'Team', cardCategory: 'Category',
        yearFrom: 'From', yearTo: 'To', isRookie: 'RC Only', hasAutograph: 'Auto Only',
        hasPatch: 'Patch Only', isNumbered: 'Numbered Only', isGraded: 'Graded Only',
      };
      if (typeof v === 'boolean') return labels[k] || k;
      return `${labels[k] || k}: ${v}`;
    }) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--tm)', fontSize: 20, cursor: 'pointer', padding: '2px 6px', lineHeight: 1 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {col.name}
          </h2>
          {col.description && <div style={{ fontSize: 12, color: 'var(--ts)', marginTop: 2 }}>{col.description}</div>}
        </div>
        <button onClick={onEdit} style={{ background: 'none', border: '1px solid var(--b)', color: 'var(--ts)', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>Edit</button>
        <button
          onClick={() => onShare(col, cards)}
          style={{ background: '#ff6b3515', border: '1px solid rgba(255,107,53,0.3)', color: '#ff6b35', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
        >Share ↑</button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Cards', value: cards.length },
          { label: 'Value', value: totalValue > 0 ? (totalValue >= 1000 ? `$${(totalValue / 1000).toFixed(1)}k` : `$${Math.round(totalValue)}`) : '—' },
          { label: 'RCs', value: rookies },
          { label: 'Autos', value: autos },
          { label: col.type === 'smart' ? 'Smart' : 'Manual', value: '', accent: true },
        ].map(({ label, value, accent }) => (
          <div key={label} style={{
            padding: '6px 12px', borderRadius: 10,
            background: accent ? '#ff6b3515' : 'var(--deep)',
            border: `1px solid ${accent ? 'rgba(255,107,53,0.3)' : 'var(--b)'}`,
            color: accent ? '#ff6b35' : 'var(--ts)',
            fontSize: 11, fontWeight: 700,
          }}>
            {value ? <><span style={{ color: 'var(--t)', fontSize: 13 }}>{value}</span> {label}</> : label}
          </div>
        ))}
      </div>

      {/* Smart criteria chips */}
      {criteriaLabels.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {criteriaLabels.map(l => <Badge key={l} label={l} color="#ff6b35" />)}
        </div>
      )}

      {/* Manual: add cards button */}
      {col.type === 'manual' && (
        <button
          onClick={() => setAddMode(!addMode)}
          style={{
            alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 10,
            border: '1px solid var(--b)', background: 'var(--deep)',
            color: 'var(--ts)', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', marginBottom: 12,
          }}
        >{addMode ? '✕ Close Picker' : '+ Add Cards'}</button>
      )}

      {/* Add card picker */}
      {addMode && (
        <div style={{ background: 'var(--deep)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search cards to add…"
            value={addSearch}
            onChange={e => setAddSearch(e.target.value)}
            style={{
              width: '100%', background: 'var(--input)', border: '1px solid var(--b)',
              borderRadius: 8, color: 'var(--t)', fontSize: 13, padding: '7px 12px',
              outline: 'none', marginBottom: 8,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
            {addableCards.slice(0, 40).map(c => (
              <div key={c.id}
                onClick={() => { handleAddCard(c.id); setAddSearch(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--b)', background: 'var(--card)',
                }}
              >
                {c.imageUrl && <img src={c.imageUrl} alt="" style={{ width: 28, height: 38, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.playerName || 'Unknown'}</div>
                  <div style={{ fontSize: 10, color: 'var(--td)' }}>{[c.year, c.brand, c.series].filter(Boolean).join(' · ')}</div>
                </div>
                <span style={{ fontSize: 10, color: '#4caf50', fontWeight: 700 }}>+ Add</span>
              </div>
            ))}
            {addableCards.length === 0 && <div style={{ fontSize: 12, color: 'var(--td)', textAlign: 'center', padding: '10px 0' }}>No cards to add</div>}
          </div>
        </div>
      )}

      {/* Card grid */}
      {cards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 13, color: 'var(--tf)' }}>
            {col.type === 'smart' ? 'No cards match these criteria yet' : 'No cards in this collection yet'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cards.map(c => {
            const rColor = { Common: '#555', Uncommon: '#4caf50', Rare: '#2196f3', 'Very Rare': '#9c27b0', 'Ultra Rare': '#ff9800', Legendary: '#f44336' }[c.rarity] || '#555';
            const setLabel = c.fullCardName || [c.year, c.brand, c.series].filter(Boolean).join(' ') || 'Unknown Set';
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 12,
                background: 'linear-gradient(160deg, var(--card) 0%, var(--card2) 100%)',
                border: `1px solid var(--bs)`,
              }}>
                {c.imageUrl && (
                  <img src={c.imageUrl} alt="" style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `1px solid ${rColor}30` }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--tl)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {setLabel}{c.insertName ? ` · ${c.insertName}` : ''}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1 }}>{c.playerName || 'Unknown'}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                    {c.isRookie && <Badge label="RC" color="#ff6b35" />}
                    {c.hasAutograph && <Badge label="AUTO" color="#f0c040" />}
                    {c.serialNumber && <Badge label={c.serialNumber} color="#ce93d8" />}
                    {c.parallel && c.parallel !== 'Base' && <Badge label={c.parallel} color="#64b5f6" />}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  {c.estimatedValue > 0 && (
                    <span style={{ fontSize: 12, color: '#4caf50', fontWeight: 700 }}>${c.estimatedValue.toFixed(2)}</span>
                  )}
                  {col.type === 'manual' && (
                    <button
                      onClick={() => handleRemoveCard(c.id)}
                      title="Remove from collection"
                      style={{ background: 'none', border: 'none', color: 'var(--tf)', cursor: 'pointer', fontSize: 14, padding: 2 }}
                    >✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete */}
      <button
        onClick={() => { if (window.confirm(`Delete "${col.name}"?`)) onDelete(col.id); }}
        style={{
          marginTop: 20, padding: '8px', borderRadius: 10,
          border: '1px solid rgba(255,68,68,0.2)', background: 'transparent',
          color: '#ff4444', fontSize: 12, cursor: 'pointer', fontWeight: 600,
        }}
      >Delete Collection</button>
    </div>
  );
}

// ── Collections Grid View ─────────────────────────────────────────────────────

export default function CollectionsView({ collections, allCards, onCreateNew, onSelect, onShare }) {
  const withCounts = useMemo(() =>
    collections.map(col => ({
      col,
      count: resolveCollectionCards(col, allCards).length,
      value: resolveCollectionCards(col, allCards).reduce((s, c) => s + (c.estimatedValue || 0), 0),
    })),
    [collections, allCards]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t)', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1.5 }}>My Collections</h2>
          <div style={{ fontSize: 12, color: 'var(--ts)' }}>{collections.length} collection{collections.length !== 1 ? 's' : ''}</div>
        </div>
        <button
          onClick={onCreateNew}
          style={{
            padding: '8px 16px', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
            color: '#fff', fontSize: 12, fontWeight: 800,
            cursor: 'pointer', letterSpacing: 0.5,
          }}
        >+ New</button>
      </div>

      {/* Empty state */}
      {collections.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📚</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t)', marginBottom: 6 }}>No Collections Yet</div>
          <div style={{ fontSize: 12, color: 'var(--ts)', marginBottom: 20 }}>
            Create smart collections that auto-populate by criteria,<br />or hand-pick cards for a manual collection.
          </div>
          <button
            onClick={onCreateNew}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #ff6b35, #f7c59f)',
              color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >Create your first collection</button>
        </div>
      )}

      {/* Grid */}
      {withCounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {withCounts.map(({ col, count, value }) => (
            <div
              key={col.id}
              onClick={() => onSelect(col)}
              style={{
                borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                border: '1px solid var(--bs)', position: 'relative',
                background: 'var(--deep)',
                transition: 'transform 0.12s, box-shadow 0.12s',
                aspectRatio: '3/4',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {/* Cover image */}
              {col.coverImageUrl ? (
                <img src={col.coverImageUrl} alt={col.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>📂</div>
              )}

              {/* Overlay */}
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.1) 60%)',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: '0 8px 8px',
              }}>
                {/* Type badge */}
                <div style={{
                  position: 'absolute', top: 7, right: 7,
                  fontSize: 8, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 8,
                  background: col.type === 'smart' ? 'rgba(255,107,53,0.85)' : 'rgba(100,181,246,0.85)',
                  color: '#fff',
                }}>{col.type === 'smart' ? '✦ Smart' : '✋ Manual'}</div>

                {/* Share button */}
                <button
                  onClick={e => { e.stopPropagation(); onShare(col, resolveCollectionCards(col, allCards)); }}
                  style={{
                    position: 'absolute', top: 7, left: 7,
                    background: 'rgba(0,0,0,0.5)', border: 'none',
                    borderRadius: 6, color: 'rgba(255,107,53,0.8)',
                    cursor: 'pointer', padding: '3px 6px', fontSize: 12,
                  }}
                >↑</button>

                <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{col.name}</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{count} card{count !== 1 ? 's' : ''}{value > 0 ? ` · ${value >= 1000 ? `$${(value / 1000).toFixed(1)}k` : `$${Math.round(value)}`}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
