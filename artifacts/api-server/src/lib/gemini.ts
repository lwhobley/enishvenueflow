// Minimal Gemini REST client. We don't use @google/generative-ai because
// we only need one prompt-and-go call with structured JSON output, and
// pulling the SDK doubles cold-start time on Railway for no benefit.

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MODEL = "gemini-2.5-flash";

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
}

type JsonSchema = Record<string, unknown>;

export interface GenerateJsonOpts {
  prompt: string;
  schema: JsonSchema;
  temperature?: number;
  signal?: AbortSignal;
}

export async function generateJson<T>(opts: GenerateJsonOpts): Promise<T> {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) throw new Error("AI_INTEGRATIONS_GEMINI_API_KEY is not set");

  const base = (process.env.AI_INTEGRATIONS_GEMINI_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
  const url = `${base}/models/${MODEL}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 1,
        responseMimeType: "application/json",
        responseSchema: opts.schema,
      },
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no text");

  return JSON.parse(text) as T;
}
