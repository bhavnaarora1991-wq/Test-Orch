import { TestCase } from '../types/testCase';
import { parseTestCases } from '../utils/parser';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

function buildPrompt(requirement: string): string {
  return `You are a senior QA engineer.

Given the requirement below, generate EXACTLY 15 detailed test cases as a JSON array.

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

export async function testGroqConnection(apiKey: string): Promise<boolean> {
  console.log('[Groq] Testing connection...');
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      }),
    });
    console.log('[Groq] Test connection status:', response.status);
    return response.ok;
  } catch (err) {
    console.error('[Groq] Test connection error:', err);
    return false;
  }
}

export async function generateWithGroq(
  requirement: string,
  model: string,
  apiKey: string
): Promise<TestCase[]> {
  const prompt = buildPrompt(requirement);
  const targetModel = model || 'llama-3.3-70b-versatile';

  console.log(`[Groq] Starting generation with model: ${targetModel}`);
  
  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const err: any = await response.json();
      console.error('[Groq] Generation failed:', err);
      throw new Error(`Groq error: ${err.error?.message || response.statusText}`);
    }

    const data: any = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    console.log(`[Groq] Generation complete. Content length: ${content.length}`);
    
    if (!content.trim().startsWith('[')) {
      console.warn('[Groq] Response does not start with "[", attempting extraction...');
    }

    return parseTestCases(content);
  } catch (err) {
    console.error('[Groq] Generation error:', err);
    throw err;
  }
}
