import { useState, useRef, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { ALL_PERSONAS, getPersona } from "./ai/personas.js";
import { buildSystemPrompt } from "./ai/systemPrompt.js";
import { buildCollectionContext } from "./ai/collectionContext.js";
import AdGateModal from "./AdGateModal.jsx";

const CHAT_MODEL = "claude-sonnet-4-20250514";
const API_BASE = Capacitor.isNativePlatform() ? "https://app.myvaults.io" : "";

// ─────────────────────────────────────────────────────────────────────────────
// PersonaSelector
// ─────────────────────────────────────────────────────────────────────────────

function PersonaCard({ persona, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={() => onSelect(persona.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        background: hovered ? `${persona.accentColor}10` : "var(--card)",
        border: `1px solid ${hovered ? persona.accentColor + "50" : "var(--bs)"}`,
        borderRadius: 14,
        padding: "18px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.18s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img
          src={persona.avatarImage}
          alt={persona.avatarName}
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            objectFit: "cover",
            border: `2px solid ${persona.accentColor}50`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 15,
            fontWeight: 800,
            color: persona.accentColor,
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 1.5,
          }}
        >
          {persona.avatarName}
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ts)", lineHeight: 1.5 }}>{persona.tagline}</div>
      <div style={{ fontSize: 11, color: "var(--tg)", lineHeight: 1.5 }}>{persona.bio}</div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubble
// ─────────────────────────────────────────────────────────────────────────────

function MessageBubble({ msg, persona }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: 10,
        animation: "fadeIn 0.2s ease",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            overflow: "hidden",
            border: `1px solid ${persona.accentColor}40`,
            flexShrink: 0,
            marginRight: 8,
            alignSelf: "flex-end",
          }}
        >
          <img src={persona.avatarImage} alt={persona.avatarName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <div
        style={{
          maxWidth: "82%",
          padding: "10px 14px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? `${persona.accentColor}18` : "var(--card)",
          border: `1px solid ${isUser ? persona.accentColor + "30" : "var(--b)"}`,
          fontSize: 13,
          color: "var(--t)",
          lineHeight: 1.65,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypingIndicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator({ persona }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingLeft: 36 }}>
      <span style={{ fontSize: 11, color: "var(--tg)" }}>{persona.avatarName} is thinking…</span>
      <div style={{ display: "flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: persona.accentColor,
              opacity: 0.6,
              animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestedPrompts
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS_WITH_COLLECTION = [
  "What's the total value of my collection?",
  "Which cards should I consider getting graded?",
  "What are my top 5 most valuable cards?",
  "How many rookie cards do I have?",
  "Which cards in my collection are the most scarce?",
  "What brands make up my collection?",
];

const SUGGESTED_PROMPTS_GENERAL = [
  "What makes a Prizm Rookie Card valuable?",
  "Explain the difference between PSA and BGS grading",
  "What is the junk wax era?",
  "Why do on-card autos matter more than sticker autos?",
  "What is a 1/1 card and why does it matter?",
  "How do I know if a parallel is rare?",
];

function SuggestedPrompts({ hasCollection, onSelect, accentColor }) {
  const prompts = hasCollection ? SUGGESTED_PROMPTS_WITH_COLLECTION : SUGGESTED_PROMPTS_GENERAL;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 10px" }}>
      {prompts.slice(0, 4).map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          style={{
            background: "var(--input)",
            border: `1px solid var(--b)`,
            borderRadius: 20,
            padding: "5px 12px",
            fontSize: 11,
            color: "var(--ts)",
            cursor: "pointer",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = accentColor + "50";
            e.currentTarget.style.color = accentColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--b)";
            e.currentTarget.style.color = "var(--ts)";
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main VaultChat component
// ─────────────────────────────────────────────────────────────────────────────

export default function VaultChat({ cards, isOpen, onClose, user, isPro, aiSessionActive, startAISession, onUpgradeClick }) {
  const [personaId, setPersonaId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // AI chat gate state
  const [chatGateVisible, setChatGateVisible] = useState(false);
  const pendingPersonaIdRef = useRef(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const systemPromptRef = useRef(null);

  const persona = personaId ? getPersona(personaId) : null;
  const hasCollection = cards && cards.length > 0;

  // Rebuild system prompt when persona or collection changes
  useEffect(() => {
    if (!personaId) return;
    const collectionCtx = hasCollection ? buildCollectionContext(cards) : "";
    systemPromptRef.current = buildSystemPrompt(personaId, collectionCtx);
  }, [personaId, cards, hasCollection]);

  // Auto-scroll messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  // Focus input when chat opens with a persona
  useEffect(() => {
    if (isOpen && personaId && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, personaId]);

  const selectPersona = useCallback(
    (id) => {
      // Gate: free-tier users need to watch an ad to start each chat session
      if (user && !isPro && !aiSessionActive) {
        pendingPersonaIdRef.current = id;
        setChatGateVisible(true);
        return;
      }
      const p = getPersona(id);
      setPersonaId(id);
      setMessages([{ role: "assistant", content: p.welcomeMessage }]);
      setError(null);
    },
    [user, isPro, aiSessionActive]
  );

  const sendMessage = useCallback(
    async (text) => {
      const trimmed = (text || input).trim();
      if (!trimmed || loading || !personaId) return;

      setInput("");
      setError(null);

      const userMsg = { role: "user", content: trimmed };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setLoading(true);

      try {
        // Build the messages array for Anthropic (exclude the welcome message)
        const conversationMessages = nextMessages
          .filter((m) => !(m.role === "assistant" && m.isWelcome))
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: CHAT_MODEL,
            max_tokens: 800,
            system: systemPromptRef.current,
            messages: conversationMessages,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `API error ${res.status}`);
        }

        const data = await res.json();
        const replyText = data.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("")
          .trim();

        if (!replyText) throw new Error("Empty response from AI");

        setMessages((prev) => [...prev, { role: "assistant", content: replyText }]);
      } catch (err) {
        console.error("Chat error:", err);
        setError(err.message || "Something went wrong. Try again.");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, personaId, messages]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const resetPersona = useCallback(() => {
    setPersonaId(null);
    setMessages([]);
    setInput("");
    setError(null);
  }, []);

  const handleChatAdWatched = useCallback(async () => {
    setChatGateVisible(false);
    await startAISession?.();
    const id = pendingPersonaIdRef.current;
    pendingPersonaIdRef.current = null;
    if (id) {
      const p = getPersona(id);
      setPersonaId(id);
      setMessages([{ role: "assistant", content: p.welcomeMessage }]);
      setError(null);
    }
  }, [startAISession]);

  const handleChatAdDismiss = useCallback(() => {
    setChatGateVisible(false);
    pendingPersonaIdRef.current = null;
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 90,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(2px)",
          display: "none",
        }}
        className="vault-chat-backdrop"
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 390,
          maxHeight: "82vh",
          zIndex: 100,
          background: "var(--surface)",
          border: "1px solid var(--b)",
          borderRadius: 20,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)",
          animation: "chatSlideUp 0.22s ease",
          overflow: "hidden",
        }}
      >
        <style>{`
          @keyframes chatSlideUp {
            from { opacity: 0; transform: translateY(16px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
          @keyframes chatDot {
            0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
            40%            { transform: scale(1);   opacity: 1;   }
          }
          @media (max-width: 460px) {
            .vault-chat-panel {
              bottom: 0 !important;
              right: 0 !important;
              left: 0 !important;
              width: 100% !important;
              border-radius: 20px 20px 0 0 !important;
              max-height: 88vh !important;
            }
            .vault-chat-backdrop { display: block !important; }
          }
        `}</style>

        {/* Panel header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 16px 12px",
            borderBottom: "1px solid var(--bf)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {persona && (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: `1px solid ${persona.accentColor}50`,
                  flexShrink: 0,
                }}
              >
                <img src={persona.avatarImage} alt={persona.avatarName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: persona ? persona.accentColor : "var(--t)",
                  fontFamily: "'Bebas Neue', sans-serif",
                  letterSpacing: 1.2,
                }}
              >
                {persona ? persona.avatarName : "The Vault AI"}
              </div>
              {persona && (
                <div style={{ fontSize: 9, color: "var(--tg)", marginTop: 1 }}>
                  {persona.tagline}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {persona && (
              <button
                onClick={resetPersona}
                title="Switch persona"
                style={{
                  background: "var(--gbg)",
                  border: "1px solid var(--gb)",
                  color: "var(--gc)",
                  borderRadius: 8,
                  padding: "3px 9px",
                  fontSize: 10,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Switch
              </button>
            )}
            <button
              onClick={onClose}
              title="Close"
              style={{
                background: "var(--gbg)",
                border: "1px solid var(--gb)",
                color: "var(--gc)",
                borderRadius: 8,
                padding: "3px 9px",
                fontSize: 14,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        {!persona ? (
          // ── Persona selector ──────────────────────────────────────────────
          <div style={{ padding: "20px 16px", overflowY: "auto" }}>
            <img
              src="/toppsyandpanini.png"
              alt="PJ and Toppsy"
              style={{
                width: "100%",
                borderRadius: 12,
                objectFit: "cover",
                marginBottom: 16,
                display: "block",
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: "var(--tg)",
                textTransform: "uppercase",
                letterSpacing: 1,
                fontWeight: 700,
                marginBottom: 14,
              }}
            >
              Choose your expert
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {ALL_PERSONAS.map((p) => (
                <PersonaCard key={p.id} persona={p} onSelect={selectPersona} />
              ))}
            </div>
            {hasCollection && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 11,
                  color: "var(--ts)",
                  background: "var(--card)",
                  border: "1px solid var(--b)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  lineHeight: 1.6,
                }}
              >
                <span style={{ color: "#4caf50", marginRight: 5 }}>✓</span>
                Your collection ({cards.length} cards) is loaded. Your expert can answer questions about it.
              </div>
            )}
            {!hasCollection && (
              <div
                style={{
                  marginTop: 16,
                  fontSize: 11,
                  color: "var(--tg)",
                  lineHeight: 1.6,
                }}
              >
                No cards in your vault yet — your expert can answer general hobby questions right now. Add cards to unlock collection analysis.
              </div>
            )}
          </div>
        ) : (
          // ── Chat interface ────────────────────────────────────────────────
          <>
            {/* Messages */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "14px 14px 4px",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }}
            >
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} persona={persona} />
              ))}
              {loading && <TypingIndicator persona={persona} />}
              {error && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#ff6666",
                    background: "#ff444412",
                    border: "1px solid #ff444430",
                    borderRadius: 8,
                    padding: "8px 12px",
                    marginBottom: 8,
                  }}
                >
                  {error}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested prompts (only show after welcome, before any user message) */}
            {messages.length === 1 && !loading && (
              <SuggestedPrompts
                hasCollection={hasCollection}
                onSelect={sendMessage}
                accentColor={persona.accentColor}
              />
            )}

            {/* Input */}
            <div
              style={{
                padding: "10px 12px 12px",
                borderTop: "1px solid var(--bf)",
                display: "flex",
                gap: 8,
                alignItems: "flex-end",
                flexShrink: 0,
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${persona.avatarName} anything…`}
                rows={1}
                disabled={loading}
                style={{
                  flex: 1,
                  background: "var(--input)",
                  border: `1px solid var(--b)`,
                  borderRadius: 12,
                  color: "var(--t)",
                  fontSize: 13,
                  padding: "9px 12px",
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                  maxHeight: 100,
                  overflowY: "auto",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = persona.accentColor + "60")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--b)")}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                style={{
                  background: input.trim() && !loading ? persona.accentColor : "var(--input)",
                  border: `1px solid ${input.trim() && !loading ? persona.accentColor : "var(--b)"}`,
                  borderRadius: 12,
                  padding: "9px 14px",
                  color: input.trim() && !loading ? "#fff" : "var(--td)",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1,
                  transition: "all 0.15s",
                  flexShrink: 0,
                }}
              >
                ↑
              </button>
            </div>
          </>
        )}
      </div>

      {/* AI chat ad gate */}
      {chatGateVisible && (
        <AdGateModal
          title="Chat with The Vault AI"
          description="Watch a short ad to start an AI session. Your session stays active for as long as the chat is open."
          rewardLine="Unlock AI Chat Session"
          isDismissable={true}
          onWatched={handleChatAdWatched}
          onUpgrade={() => { handleChatAdDismiss(); onUpgradeClick?.(); }}
          onDismiss={handleChatAdDismiss}
        />
      )}
    </>
  );
}
