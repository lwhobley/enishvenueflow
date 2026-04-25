import { Router } from "express";
import { generateJson, isGeminiConfigured } from "../lib/gemini";

const router = Router();

interface Insights {
  cosmicInsight: string;
  inspiration: string;
  joke: string;
}

interface InsightsResponse extends Insights {
  generatedAt: string;
  cached: boolean;
  source: "gemini" | "fallback";
}

// Curated fallbacks. Used when Gemini isn't configured or the call fails —
// the dashboard widget should never look broken.
const FALLBACKS: Insights[] = [
  {
    cosmicInsight: "Every atom in your guests' wine glass was forged inside a star that died billions of years ago. Tonight, you serve them stardust.",
    inspiration: "Hospitality is the art of making strangers feel like they were expected.",
    joke: "Why did the chef quit astronomy? Too many black holes in the soufflé.",
  },
  {
    cosmicInsight: "Light from the Andromeda galaxy left home 2.5 million years ago — about the same time humans first cooked food over fire. It only just arrived.",
    inspiration: "A great service isn't remembered for what was served, but for how it felt to be there.",
    joke: "I asked the sommelier for something light. He brought me a candle.",
  },
  {
    cosmicInsight: "If the sun were a grain of sand, the nearest star would be six miles away. Yet here we are, sharing one little restaurant on one rare planet.",
    inspiration: "The best teams move like a kitchen at full speed — chaotic from the outside, precise from within.",
    joke: "Two waiters walked into a bar. The third one ducked.",
  },
];

function pickFallback(): InsightsResponse {
  const i = Math.floor(Math.random() * FALLBACKS.length);
  return {
    ...FALLBACKS[i],
    generatedAt: new Date().toISOString(),
    cached: false,
    source: "fallback",
  };
}

const SCHEMA = {
  type: "object",
  properties: {
    cosmicInsight: { type: "string" },
    inspiration: { type: "string" },
    joke: { type: "string" },
  },
  required: ["cosmicInsight", "inspiration", "joke"],
} as const;

const PROMPT = `Generate a fresh trio of dashboard content for a fine-dining restaurant employee app.

Return strict JSON with three fields:
- cosmicInsight: 1-2 sentences. A wonder-inducing fact about the universe, stars, deep time, or our place in the cosmos. Awe, not preachy.
- inspiration: 1 sentence. A grounded, non-cheesy thought about hospitality, craft, service, or working as a team. Avoid generic motivational quotes.
- joke: 1-2 sentences. Clean, witty, restaurant- or food-themed when it works naturally. Make it actually funny — wordplay or a real punchline, not a riddle.

Be original each time. Do not repeat common quotes. Do not address the reader directly. No emojis. No hashtags.`;

interface CacheEntry {
  value: InsightsResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const cache = new Map<string, CacheEntry>();

router.get("/ai/cosmic-insights", async (req, res) => {
  const venueId = req.auth?.venueId ?? "anon";
  const refresh = req.query.refresh === "true" || req.query.refresh === "1";
  const now = Date.now();

  if (!refresh) {
    const hit = cache.get(venueId);
    if (hit && hit.expiresAt > now) {
      return res.json({ ...hit.value, cached: true });
    }
  }

  if (!isGeminiConfigured()) {
    const fallback = pickFallback();
    cache.set(venueId, { value: fallback, expiresAt: now + CACHE_TTL_MS });
    return res.json(fallback);
  }

  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12_000);
    const result = await generateJson<Insights>({
      prompt: PROMPT,
      schema: SCHEMA,
      temperature: 1.1,
      signal: ac.signal,
    });
    clearTimeout(timeout);

    const value: InsightsResponse = {
      cosmicInsight: result.cosmicInsight.trim(),
      inspiration: result.inspiration.trim(),
      joke: result.joke.trim(),
      generatedAt: new Date(now).toISOString(),
      cached: false,
      source: "gemini",
    };
    cache.set(venueId, { value, expiresAt: now + CACHE_TTL_MS });
    return res.json(value);
  } catch (err) {
    req.log.warn({ err }, "Gemini cosmic-insights call failed; serving fallback");
    const fallback = pickFallback();
    // Cache the fallback briefly so a flapping API key doesn't hammer Gemini.
    cache.set(venueId, { value: fallback, expiresAt: now + 30 * 60 * 1000 });
    return res.json(fallback);
  }
});

export default router;
