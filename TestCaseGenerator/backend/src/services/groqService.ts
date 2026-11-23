import { TestCase } from '../types/testCase';
import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Using centralized prompts from ../utils/prompt

function buildMessages(requirement: string, type: 'cases' | 'plan') {
  let systemContent = type === 'plan' ? buildEnhancedPlanPrompt(requirement) : buildEnhancedPrompt(requirement);
  let userPrompt = '';

  // Try to extract Feature/Jira ID to personalize the TASK in the system prompt
  if (requirement.includes('Jira Story:')) {
    const lines = requirement.split('\n');
    const jiraIdLine = lines.find(l => l.startsWith('Jira Story:'));
    const summaryLine = lines.find(l => l.startsWith('Summary:'));
    
    const jiraId = jiraIdLine ? jiraIdLine.replace('Jira Story:', '').trim() : 'Documented Feature';
    const summary = summaryLine ? summaryLine.replace('Summary:', '').trim() : 'specified requirements';
    const jiraUrl = `https://bhavnaarora1991.atlassian.net/browse/${jiraId}`;

    // Use split/join for safer replacement of strings with special chars
    systemContent = systemContent.split('[FEATURE]').join(summary);
    
    userPrompt = `TASK: Generate test cases for ${summary}.
REQUIREMENTS URL: ${jiraUrl}

FULL REQUIREMENTS DETAILS:
${requirement}

Generate the JSON array now:`;
  } else {
    systemContent = systemContent.replace('[FEATURE]', 'the provided requirements');
    userPrompt = `REQUIREMENTS:\n${requirement}\n\nGenerate the output now:`;
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt }
  ];
}

function buildPlanPrompt(requirement: string): string {
  return `You are a senior QA engineer.

Given the requirement below, generate a comprehensive Test Plan document in Markdown format.

REQUIREMENT:
${requirement}

GUIDANCE:
Include the following sections:
1. Introduction & Scope
2. Test Strategy & Approach
3. Test Environment & Prerequisites
4. Resource Allocation
5. Risks & Mitigation
6. Schedule & Milestones

Output ONLY the Markdown content. Do not output JSON.`;
}

export async function testGroqConnection(apiKey: string): Promise<boolean> {
  console.log('[Groq] Testing connection...');
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    console.log('[Groq] Test connection status:', response.status);
    if (response.ok) {
      const data: any = await response.json();
      const models = data?.data?.map((m: any) => m.id) || [];
      console.log('[Groq] Available models:', models.join(', '));
      return true;
    }
    return false;
  } catch (err) {
    console.error('[Groq] Test connection error:', err);
    return false;
  }
}

export async function generateWithGroq(
  requirement: string,
  model: string,
  apiKey: string,
  generateType: 'plan' | 'cases' = 'cases'
): Promise<any> {
  const messages = buildMessages(requirement, generateType);
  const targetModel = model || 'openai/gpt-oss-120b';

  console.log(`[Groq] Starting generation with model: ${targetModel}`);
  
  const makeRequest = async (useModel: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout
    try {
      return await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: useModel,
          messages,
          temperature: 0.1,
          max_tokens: 4000,
          stream: false,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    console.log(`[Groq] Sending request to Groq API...`);
    const response = await makeRequest(targetModel);
    console.log(`[Groq] Received response. Status: ${response.status}`);

    if (response.status === 429) {
      const rateLimitBody: any = await response.json().catch(() => ({}));
      const retryAfter = response.headers.get('retry-after') || '60';
      throw new Error(
        `Groq rate limit reached for model '${targetModel}'. ` +
        `Please wait ${retryAfter}s and try again, or switch to a different model in Settings. ` +
        `(Detail: ${rateLimitBody?.error?.message?.slice(0, 120) || 'Too many tokens per minute'})`
      );
    }

    if (!response.ok) {
      const err: any = await response.json();
      console.error('[Groq] Generation failed:', err);
      throw new Error(`Groq error: ${err.error?.message || response.statusText}`);
    }

    const data: any = await response.json();
    console.log(`[Groq] JSON parsed successfully.`);
    const content = data.choices[0]?.message?.content || '';
    
    console.log(`[Groq] Generation complete. Content length: ${content.length}`);
    
    if (generateType === 'plan') {
      return content;
    }

    console.log(`[Groq] Parsing test cases...`);
    const parsed = parseTestCases(content);
    console.log(`[Groq] Parsing successful. ${parsed.length} test cases found.`);
    return parsed;
  } catch (err) {
    console.error('[Groq] Generation error:', err);
    throw err;
  }
}
