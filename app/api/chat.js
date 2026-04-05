/**
 * /api/chat.js — Vercel serverless proxy for The Vault AI assistant.
 *
 * Accepts a fully-formed Anthropic messages request from the client
 * (system prompt + messages array built client-side in src/ai/).
 * Proxies to Anthropic and returns the response.
 */

export const config = {
  api: { bodyParser: { sizeLimit: "64kb" } },
};

const ALLOWED_MODELS = ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022"];
const DEFAULT_MAX_TOKENS = 2000;
const MAX_TOKENS_CEILING = 2500;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Anthropic API key not configured" });
  }

  const { system, messages, model, max_tokens } = req.body ?? {};

  // Basic validation
  if (!system || typeof system !== "string") {
    return res.status(400).json({ error: "system prompt is required" });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }

  // Sanitise messages: only allow role/content strings, no image blocks in chat
  const cleanMessages = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content.slice(0, 8000) : "",
  }));

  const resolvedModel = ALLOWED_MODELS.includes(model) ? model : ALLOWED_MODELS[0];
  const resolvedTokens = Math.min(
    typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : DEFAULT_MAX_TOKENS,
    MAX_TOKENS_CEILING
  );

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: resolvedTokens,
      system,
      messages: cleanMessages,
    }),
  });

  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
