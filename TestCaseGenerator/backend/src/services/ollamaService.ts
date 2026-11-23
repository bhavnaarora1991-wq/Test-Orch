import { TestCase } from '../types/testCase';
import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

interface OllamaStreamChunk {
  response: string;
  done: boolean;
}

export async function getAvailableModels(): Promise<string[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  if (!response.ok) {
    throw new Error(
      'Cannot connect to Ollama. Make sure Ollama is installed and running on port 11434.'
    );
  }
  const data = (await response.json()) as OllamaTagsResponse;
  return data.models.map((m) => m.name);
}

export async function testOllamaConnection(): Promise<boolean> {
  try {
    console.log(`[ollamaService] Testing connection to ${OLLAMA_BASE_URL}...`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (response.ok) {
      console.log('[ollamaService] Connection successful.');
    } else {
      console.error(`[ollamaService] Connection failed with status ${response.status}`);
    }
    return response.ok;
  } catch (err) {
    console.error('[ollamaService] Connection error:', err);
    return false;
  }
}
// Retired local prompt builders in favor of centralized backend/src/utils/prompt.ts

export async function generateTestCases(
  requirement: string,
  model: string,
  generateType: 'plan' | 'cases' = 'cases'
): Promise<any> {
  const prompt = generateType === 'plan' ? buildEnhancedPlanPrompt(requirement) : buildEnhancedPrompt(requirement);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  let fullResponse = '';

  try {
    console.log(`[ollamaService] Requesting model: ${model}`);
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 8192,
        },
      }),
    });
    console.log(`[ollamaService] Response status: ${response.status}`);

    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errText}`);
    }

    // Read the streaming NDJSON response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let remainder = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = (remainder + chunk).split('\n');
      remainder = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as OllamaStreamChunk;
          fullResponse += parsed.response;
          if (parsed.done) break;
        } catch (e) {
          console.warn('[ollamaService] JSON parse error in stream, skipping partial line');
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  console.log('[ollamaService] Raw response length:', fullResponse.length);
  console.log('[ollamaService] Raw response preview:', fullResponse.slice(0, 300));

  if (generateType === 'plan') {
    return fullResponse;
  }

  console.log('[ollamaService] Parsing test cases...');
  const parsed = parseTestCases(fullResponse);
  console.log(`[ollamaService] Parsing successful. ${parsed.length} test cases found.`);
  return parsed;
}
