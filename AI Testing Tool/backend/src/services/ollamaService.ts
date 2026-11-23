import { TestCase } from '../types/testCase';
import { parseTestCases } from '../utils/parser';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
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

function buildPrompt(requirement: string): string {
  return `You are a senior QA engineer.

Given the requirement below, generate EXACTLY 15 test cases as a JSON array.

REQUIREMENT:
${requirement}

GUIDANCE: 
Focus on: UI flows, navigation, form validation, API endpoints, status codes, error handling, performance, and security.

RULES:
- Exactly 15 test cases total
- At least 11 Functional, at least 4 Non-Functional (performance, security, usability)  
- Cover: positive, negative, edge cases, boundary values, error handling
- Output ONLY raw JSON array — no markdown, no explanation, no extra text

EXACT FORMAT (follow precisely):
[{"id":"TC-001","summary":"...","preconditions":"...","testSteps":"1. Step\\n2. Step\\n3. Step","expectedResult":"...","testType":"Functional","priority":"High","category":"Functional"},{"id":"TC-002","summary":"...","preconditions":"...","testSteps":"1. Step\\n2. Step","expectedResult":"...","testType":"Non-Functional","priority":"Medium","category":"Performance"}]

Valid values — testType: "Functional"|"Non-Functional", priority: "High"|"Medium"|"Low"

Output the JSON array now:`;
}

export async function generateTestCases(
  requirement: string,
  model: string
): Promise<TestCase[]> {
  const prompt = buildPrompt(requirement);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);

  let fullResponse = '';

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: true, // streaming so we collect chunks and don't drop the connection
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 8192,
        },
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errText}`);
    }

    // Read the streaming NDJSON response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      // Each line is a JSON object
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as OllamaStreamChunk;
          fullResponse += parsed.response;
          if (parsed.done) break;
        } catch {
          // Partial line — will be completed in next chunk
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  console.log('[ollamaService] Raw response length:', fullResponse.length);
  console.log('[ollamaService] Raw response preview:', fullResponse.slice(0, 300));

  return parseTestCases(fullResponse);
}
