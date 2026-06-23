import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import type { Request, Response } from "express";

const router = Router();

const CACHE_TTL_MS = 24 * 60 * 60_000;
const serverCache = new Map<string, { translations: Record<string, string>; ts: number }>();

const LANG_NAMES: Record<string, string> = {
  it: "Italian", fr: "French", de: "German", es: "Spanish", pt: "Portuguese",
  nl: "Dutch", pl: "Polish", cs: "Czech", sk: "Slovak", hr: "Croatian",
  ro: "Romanian", hu: "Hungarian", sl: "Slovenian", da: "Danish", sv: "Swedish",
  fi: "Finnish", no: "Norwegian", el: "Greek", tr: "Turkish", ar: "Arabic",
  zh: "Chinese (Simplified)", ja: "Japanese", ko: "Korean", ru: "Russian", uk: "Ukrainian",
};

router.post("/translations/batch", async (req: Request, res: Response) => {
  const { locale, strings, version } = req.body as {
    locale?: string;
    strings?: Record<string, string>;
    version?: string;
  };

  if (!locale || typeof locale !== "string") {
    res.status(400).json({ error: "locale required" }); return;
  }

  if (locale.startsWith("en")) {
    res.json({ locale, translations: strings ?? {}, cached: false }); return;
  }

  if (!strings || typeof strings !== "object" || Array.isArray(strings)) {
    res.status(400).json({ error: "strings object required" }); return;
  }

  const keys = Object.keys(strings);
  if (keys.length === 0) { res.json({ locale, translations: {}, cached: false }); return; }
  if (keys.length > 500) { res.status(400).json({ error: "Max 500 strings per request" }); return; }

  const cacheKey = `${locale}:${version ?? "default"}`;
  const cached = serverCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.json({ locale, translations: cached.translations, cached: true }); return;
  }

  const langName = LANG_NAMES[locale.toLowerCase().slice(0, 2)] ?? locale;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a professional mobile app translator. Translate the following English UI strings to ${langName}.
Rules:
- Keep placeholders like {name}, {count}, {org}, {date}, {amount} etc. UNCHANGED
- These are short UI labels, buttons, tab names, toast messages — keep them concise
- Return ONLY valid JSON with the same keys and translated string values
- Use natural, professional ${langName} — no literal or robotic translations
- Keep proper nouns (Stride, QR, ID) unchanged
- Do NOT add any JSON key that was not in the input`,
      },
      { role: "user", content: JSON.stringify(strings, null, 0) },
    ],
    temperature: 0.15,
    max_tokens: 8000,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let translations: Record<string, string>;
  try { translations = JSON.parse(raw) as Record<string, string>; }
  catch { translations = {}; }

  serverCache.set(cacheKey, { translations, ts: Date.now() });
  res.json({ locale, translations, cached: false });
});

export default router;
