import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Using centralized prompts

function buildMessages(requirement: string, type: 'cases' | 'plan') {
  let systemContent = type === 'plan' ? buildEnhancedPlanPrompt(requirement) : buildEnhancedPrompt(requirement);
  let userPrompt = '';

  if (requirement.includes('Jira Story:')) {
    const lines = requirement.split('\n');
    const jiraIdLine = lines.find(l => l.startsWith('Jira Story:'));
    const summaryLine = lines.find(l => l.startsWith('Summary:'));
    
    const jiraId = jiraIdLine ? jiraIdLine.replace('Jira Story:', '').trim() : 'Documented Feature';
    const summary = summaryLine ? summaryLine.replace('Summary:', '').trim() : 'specified requirements';
    const jiraUrl = `https://bhavnaarora1991.atlassian.net/browse/${jiraId}`;

    systemContent = systemContent.split('[FEATURE]').join(summary);
    
    userPrompt = `TASK: Generate test cases for ${summary}.
REQUIREMENTS URL: ${jiraUrl}

FULL REQUIREMENTS DETAILS:
${requirement}

Generate the output now:`;
  } else {
    systemContent = systemContent.split('[FEATURE]').join('the provided requirements');
    userPrompt = `REQUIREMENTS:\n${requirement}\n\nGenerate the output now:`;
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userPrompt }
  ];
}

async function makeRequest(model: string, messages: any[], apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); 

  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 4096
      }),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateWithOpenAI(
  requirement: string,
  model: string,
  apiKey: string,
  type: 'cases' | 'plan' = 'cases'
) {
  const messages = buildMessages(requirement, type);
  const response = await makeRequest(model, messages, apiKey);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI error ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  const content = data.choices[0].message.content;

  if (type === 'plan') return content;
  return parseTestCases(content);
}

export async function testOpenAIConnection(apiKey: string): Promise<boolean> {
  try {
    console.log('[openaiService] Testing connection...');
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 5
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      console.error(`[openaiService] Connection test failed with status ${response.status}:`, err);
    } else {
      console.log('[openaiService] Connection test successful.');
    }
    
    return response.ok;
  } catch (error) {
    console.error('[openaiService] Connection test error:', error);
    return false;
  }
}
