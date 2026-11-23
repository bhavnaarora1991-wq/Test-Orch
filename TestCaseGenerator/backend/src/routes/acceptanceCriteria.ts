import { Router, Request, Response } from 'express';
import multer from 'multer';
import { generateWithGroq } from '../services/groqService';
import { generateWithOpenAI } from '../services/openaiService';
import { generateWithAnthropic } from '../services/anthropicService';
import { generateWithGemini } from '../services/geminiService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function buildACPrompt(description: string, imageCount: number): string {
  const imageNote = imageCount > 0
    ? `The user has provided ${imageCount} wireframe image(s) along with the description. Analyze both the description and the visual wireframes carefully.`
    : 'No wireframe images were provided — use the description only.';

  return `You are a senior Business Analyst and QA Lead specializing in writing high-level Acceptance Criteria.

${imageNote}

FEATURE DESCRIPTION:
${description}

INSTRUCTIONS:
- Generate 8–15 high-level Acceptance Criteria (AC) based on the wireframes and description.
- Each AC should cover a distinct functional or non-functional requirement visible in the wireframes or implied by the description.
- Cover: happy paths, validations, error states, accessibility, and edge cases where applicable.
- Do NOT generate test cases — generate ACCEPTANCE CRITERIA only.

OUTPUT FORMAT — Respond with ONLY a valid JSON array. No markdown, no explanation, no extra text.

[
  {
    "id": "AC-001",
    "category": "Functional",
    "title": "Short descriptive title",
    "description": "Given [context], When [action], Then [expected outcome].",
    "priority": "High"
  }
]

Valid categories: "Functional" | "Validation" | "UI/UX" | "Security" | "Performance" | "Accessibility" | "Navigation" | "Data"
Valid priorities: "High" | "Medium" | "Low"

Output the JSON array now:`;
}

router.post('/', upload.array('wireframes', 10), async (req: Request, res: Response): Promise<void> => {
  try {
    const { description, provider, model, apiKey } = req.body;
    const files = req.files as Express.Multer.File[] | undefined;

    if (!description?.trim()) {
      res.status(400).json({ error: 'Feature description is required.' });
      return;
    }

    const imageCount = files?.length ?? 0;
    console.log(`[AC] Generating for ${imageCount} image(s). Provider: ${provider}`);

    // Build prompt (for vision-capable models, images are sent inline)
    const prompt = buildACPrompt(description.trim(), imageCount);

    let rawContent: string;

    // ── OpenAI Vision (supports image uploads natively) ──────────────────────
    if (provider === 'openai' && apiKey && imageCount > 0) {
      const imageMessages: any[] = files!.map((f) => ({
        type: 'image_url',
        image_url: {
          url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
          detail: 'low'
        }
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                ...imageMessages
              ]
            }
          ],
          max_tokens: 3000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const err: any = await response.json();
        throw new Error(err.error?.message || 'OpenAI vision request failed');
      }
      const data: any = await response.json();
      rawContent = data.choices[0]?.message?.content || '';

    // ── Gemini Vision ─────────────────────────────────────────────────────────
    } else if (provider === 'gemini' && apiKey && imageCount > 0) {
      const parts: any[] = [{ text: prompt }];
      for (const f of files!) {
        parts.push({
          inlineData: {
            mimeType: f.mimetype,
            data: f.buffer.toString('base64')
          }
        });
      }

      const geminiModel = model || 'gemini-1.5-flash';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] })
        }
      );

      if (!response.ok) {
        const err: any = await response.json();
        throw new Error(err.error?.message || 'Gemini vision request failed');
      }
      const data: any = await response.json();
      rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // ── Anthropic Claude Vision ───────────────────────────────────────────────
    } else if (provider === 'anthropic' && apiKey && imageCount > 0) {
      const contentParts: any[] = [{ type: 'text', text: prompt }];
      for (const f of files!) {
        contentParts.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: f.mimetype,
            data: f.buffer.toString('base64')
          }
        });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-latest',
          max_tokens: 3000,
          messages: [{ role: 'user', content: contentParts }]
        })
      });

      if (!response.ok) {
        const err: any = await response.json();
        throw new Error(err.error?.message || 'Anthropic vision request failed');
      }
      const data: any = await response.json();
      rawContent = data.content?.[0]?.text || '';

    // ── Groq / Ollama / text-only fallback ───────────────────────────────────
    } else {
      // For Groq (and any text-only provider), pass description only
      const textPrompt = buildACPrompt(description.trim(), 0);

      if (provider === 'groq' && apiKey) {
        rawContent = await generateWithGroq(textPrompt, model, apiKey, 'cases') as unknown as string;
        // generateWithGroq returns parsed test cases for 'cases' type — re-call with raw approach
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: textPrompt }],
            temperature: 0.1,
            max_tokens: 3000,
            stream: false
          })
        });
        if (!response.ok) {
          const err: any = await response.json();
          throw new Error(err.error?.message || 'Groq request failed');
        }
        const data: any = await response.json();
        rawContent = data.choices[0]?.message?.content || '';
      } else if (provider === 'openai' && apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: textPrompt }],
            max_tokens: 3000,
            temperature: 0.1
          })
        });
        const data: any = await response.json();
        rawContent = data.choices?.[0]?.message?.content || '';
      } else {
        // Ollama fallback
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model || 'llama3', prompt: textPrompt, stream: false })
        });
        const data: any = await response.json();
        rawContent = data.response || '';
      }
    }

    // ── Parse JSON array from raw content ────────────────────────────────────
    let criteria: any[] = [];
    try {
      const start = rawContent.indexOf('[');
      const end = rawContent.lastIndexOf(']');
      if (start !== -1 && end !== -1) {
        criteria = JSON.parse(rawContent.slice(start, end + 1));
      } else {
        throw new Error('No JSON array found in response');
      }
    } catch (parseErr) {
      console.error('[AC] Parse error:', parseErr, '\nRaw:', rawContent.slice(0, 300));
      res.status(500).json({ error: 'Failed to parse acceptance criteria from AI response. Please try again.' });
      return;
    }

    // Normalize & add sequential IDs
    criteria = criteria.map((ac: any, idx: number) => ({
      id: `AC-${String(idx + 1).padStart(3, '0')}`,
      category: ac.category || 'Functional',
      title: ac.title || '',
      description: ac.description || '',
      priority: ac.priority || 'Medium'
    }));

    console.log(`[AC] Generated ${criteria.length} acceptance criteria.`);
    res.json({ criteria, count: criteria.length });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AC] Error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
