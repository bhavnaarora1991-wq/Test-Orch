import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Using centralized prompts

function buildMessages(requirement: string, type: 'cases' | 'plan') {
  let userPrompt = '';

  if (requirement.includes('Jira Story:')) {
    const lines = requirement.split('\n');
    const jiraIdLine = lines.find(l => l.startsWith('Jira Story:'));
    const summaryLine = lines.find(l => l.startsWith('Summary:'));
    
    const jiraId = jiraIdLine ? jiraIdLine.replace('Jira Story:', '').trim() : 'Documented Feature';
    const summary = summaryLine ? summaryLine.replace('Summary:', '').trim() : 'specified requirements';
    const jiraUrl = `https://bhavnaarora1991.atlassian.net/browse/${jiraId}`;
    
    userPrompt = `TASK: Generate test cases for ${summary}.
REQUIREMENTS URL: ${jiraUrl}

FULL REQUIREMENTS DETAILS:
${requirement}

Generate the output now:`;
  } else {
    userPrompt = `REQUIREMENTS:\n${requirement}\n\nGenerate the output now:`;
  }

  return userPrompt;
}

async function makeRequest(model: string, userMessage: string, apiKey: string, type: 'cases' | 'plan') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); 

  const systemContent = type === 'plan' ? buildEnhancedPlanPrompt('') : buildEnhancedPrompt('');

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        system: systemContent.split('[FEATURE]').join('the requirements'),
        messages: [{ role: 'user', content: userMessage }],
        max_tokens: 4096,
        temperature: 0.1
      }),
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function generateWithAnthropic(
  requirement: string,
  model: string,
  apiKey: string,
  type: 'cases' | 'plan' = 'cases'
) {
  const userMessage = buildMessages(requirement, type);
  const response = await makeRequest(model, userMessage, apiKey, type);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic error ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  const content = data.content[0].text;

  if (type === 'plan') return content;
  return parseTestCases(content);
}

export async function testAnthropicConnection(apiKey: string): Promise<boolean> {
  try {
    console.log('[anthropicService] Testing connection...');
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: 'Ping' }],
        max_tokens: 5
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[anthropicService] Connection test failed with status ${response.status}:`, err);
    } else {
      console.log('[anthropicService] Connection test successful.');
    }

    return response.ok;
  } catch (error) {
    console.error('[anthropicService] Connection test error:', error);
    return false;
  }
}
