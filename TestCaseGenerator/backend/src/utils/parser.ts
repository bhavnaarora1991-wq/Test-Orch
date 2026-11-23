import { TestCase } from '../types/testCase';

export function parseTestCases(rawResponse: string): TestCase[] {
  // 1. Strip <think> blocks and markdown code fences
  let cleaned = rawResponse
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?[\r\n]*/gi, '')
    .replace(/```[\r\n]*/g, '')
    .trim();

  // 2. Try to find the JSON array boundaries
  let start = cleaned.indexOf('[');
  let end = cleaned.lastIndexOf(']');

  // Check if it's a single object instead of an array
  if (start === -1) {
    const singleStart = cleaned.indexOf('{');
    const singleEnd = cleaned.lastIndexOf('}');
    if (singleStart !== -1 && singleEnd !== -1 && singleEnd > singleStart) {
      console.log('[parser] Found single object, wrapping in array.');
      cleaned = `[${cleaned.slice(singleStart, singleEnd + 1)}]`;
      start = 0;
      end = cleaned.length - 1;
    }
  }

  if (start === -1 || end === -1 || end <= start) {
    console.error('[parser] No JSON found. Raw preview:', rawResponse.slice(0, 500));
    throw new Error(
      'Model did not return a valid JSON array or object. Please try a more capable model (like GPT-4o or Claude 3.5) or re-run the generation.'
    );
  }

  cleaned = cleaned.slice(start, end + 1);

  // 3. Fix common LLM JSON mistakes
  // Remove trailing commas before ] or }
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    // 4. If still failing, try to recover by finding each object
    console.error('[parser] JSON.parse failed, attempting object-by-object recovery.');
    const objects: string[] = [];
    let depth = 0;
    let objStart = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          objects.push(cleaned.slice(objStart, i + 1));
        }
      }
    }
    if (objects.length === 0) {
      throw new Error('Failed to parse any test cases from model response.');
    }
    const recovered: any[] = [];
    for (const obj of objects) {
      try {
        recovered.push(JSON.parse(obj));
      } catch {
        // Skip malformed objects
      }
    }
    if (recovered.length === 0) {
      throw new Error('Model response was unreadable.');
    }
    return normalizeAll(recovered);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Unexpected response format from model.');
  }

  return normalizeAll(parsed as any[]);
}

function normalizeAll(items: any[]): TestCase[] {
  const validPriorities = ['High', 'Medium', 'Low'];
  return items.map((tc, i) => ({
    id: String(tc['id'] || `TC-${String(i + 1).padStart(3, '0')}`),
    summary: String(tc['summary'] || '(no summary)'),
    preconditions: String(tc['preconditions'] || ''),
    testSteps: String(tc['testSteps'] || tc['steps'] || ''),
    expectedResult: String(tc['expectedResult'] || tc['expected'] || ''),
    testType: (tc['testType'] === 'Non-Functional' ? 'Non-Functional' : 'Functional') as
      | 'Functional'
      | 'Non-Functional',
    priority: (validPriorities.includes(String(tc['priority']))
      ? tc['priority']
      : 'Medium') as 'High' | 'Medium' | 'Low',
    category: String(tc['category'] || ''),
  }));
}
