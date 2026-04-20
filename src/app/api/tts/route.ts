import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Voice IDs per agent — every agent gets a unique voice.
// All voice IDs sourced from your ElevenLabs account.
const AGENT_VOICES: Record<string, string> = {
  // ── Leadership ──────────────────────────────────────────────────────────────
  ceo:                      "onwK4e9ZLuTAKqWW03F9", // Daniel — Steady Broadcaster (british male)
  cto:                      "nPczCjzI2devNBz1zQrb", // Brian — Deep, Resonant
  cmo:                      "FGY2WhTYpPnrIDTdsKH5", // Laura — Enthusiast, Quirky
  "chief-of-staff":         "pqHfZKP75CvOlQylNhV4", // Bill — Wise, Mature, Balanced
  "chief-product-architect":"JBFqnCBsd6RMkjVDRZzb", // George — Warm Storyteller (british)

  // ── Engineering ─────────────────────────────────────────────────────────────
  "founding-engineer":      "IKne3meq5aSn9XLyUdCD", // Charlie — Deep, Confident (australian)
  "claude-sonnet-engineer": "cjVigY5qzO86Huf0OWal", // Eric — Smooth, Trustworthy
  "gemini-senior-engineer": "pNInz6obpgDQGcFmaJgB", // Adam — Dominant, Firm
  "qwen-engineer":          "XGBggQY3AOOJuqNeTzdt", // homey — custom voice
  "codex-cli-agent":        "bIHbv24MWmeRgasZH58o", // Will — Relaxed Optimist
  "cursor-ide-agent":       "iP95p4xoKVk53GoZ742B", // Chris — Charming, Down-to-Earth

  // ── Marketing & Growth ──────────────────────────────────────────────────────
  "growth-strategist":      "TX3LPaxmHKxFdv7VOQHJ", // Liam — Energetic Creator
  "content-creator":        "EST9Ui6982FZPSi7gCHi", // Elise — Warm, Natural
  copywriter:               "XrExE9yKIg1WjnnlVkGX", // Matilda — Knowledgeable, Professional
  "seo-specialist":         "EXAVITQu4vr4xnSDxMaL", // Sarah — Mature, Confident
  "social-media-manager":   "cgSgspJ2msm6clMCkdW9", // Jessica — Playful, Bright, Warm
  "marketing-qa":           "hpp4J3VqNfWAUOO0d1Us", // Bella — Professional, Bright
  "marketing-analyst":      "xbiBdmKZawukYRB1IuEc", // Katie — Great for Narration

  // ── Creative & Design ───────────────────────────────────────────────────────
  "graphic-designer":       "pFZP5JQG7iQjIQuC4Bku", // Lily — Velvety Actress (british)
  "video-producer":         "hVcZZGM9Eziug8b1rHSa", // Ivy's Allure
  "visual-director":        "JqVqHLh5OOp7yvhYZD7U", // Jarvis — Voice Clone
  "ux-designer":            "Xb7hH8MSUJpSbSDYk0k2", // Alice — Clear, Engaging (british)
  "ux-designer-2":          "SAz9YHcvj6GT2YYXdXww", // River — Relaxed, Neutral

  // ── Special Agents ──────────────────────────────────────────────────────────
  gwen:                     "GdCfF60VCho1SPjCkVw0", // margy — custom voice clone
  "sophia-openclaw":        "SOYHLrjzK2X1ezoPC6cr", // Harry — Fierce (openclaw orchestrator)
  alba:                     "CwhRBWXzGAHq8TQ4Fs17", // Roger — Laid-Back (async ops)
  lucia:                    "N2lVS1w4EtoT3dr4eOWO", // Callum — Husky
  "lucia-kilo-claw":        "Xb7hH8MSUJpSbSDYk0k2", // Alice — Clear, Engaging (kilo variant)
  paperclip:                "SAz9YHcvj6GT2YYXdXww", // River — Neutral (platform agent)

  // ── Other Companies ─────────────────────────────────────────────────────────
  growthalchemy:            "TX3LPaxmHKxFdv7VOQHJ", // Liam — Energetic (growth company)
  handdrawn:                "pFZP5JQG7iQjIQuC4Bku", // Lily — Velvety (creative brand)

  // ── Fallback ────────────────────────────────────────────────────────────────
  default:                  "pNInz6obpgDQGcFmaJgB", // Adam — Dominant, Firm
};

function getVoiceId(agentId: string): string {
  return AGENT_VOICES[agentId] ?? AGENT_VOICES.default;
}

export async function POST(req: NextRequest) {
  const { text, agentId = "default" } = await req.json() as { text: string; agentId?: string };

  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: "text required" }), { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not set" }), { status: 500 });
  }

  const voiceId = getVoiceId(agentId);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_turbo_v2_5",   // fast + high quality
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.2 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), { status: res.status });
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-cache",
    },
  });
}
