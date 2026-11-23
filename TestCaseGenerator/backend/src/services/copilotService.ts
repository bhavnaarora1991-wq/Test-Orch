import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

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

function resolveCopilotUrl(endpoint: string, model: string, apiVersion = '2024-08-01-preview'): { url: string; isAzure: boolean } {
  let cleanEndpoint = (endpoint || '').trim().replace(/\/+$/, '');
  if (!cleanEndpoint) {
    cleanEndpoint = 'https://models.inference.ai.azure.com';
  }

  // If user entered a full chat completions URL, use as-is
  if (cleanEndpoint.includes('/chat/completions')) {
    return { url: cleanEndpoint, isAzure: cleanEndpoint.includes('.openai.azure.com') };
  }

  // If Azure OpenAI domain, construct Azure endpoint: /openai/deployments/{model}/chat/completions?api-version=...
  if (cleanEndpoint.includes('.openai.azure.com')) {
    return {
      url: `${cleanEndpoint}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
      isAzure: true
    };
  }

  // Standard OpenAI-compatible endpoint (e.g. GitHub Models / custom gateway)
  if (cleanEndpoint.endsWith('/v1')) {
    return { url: `${cleanEndpoint}/chat/completions`, isAzure: false };
  }
  return { url: `${cleanEndpoint}/chat/completions`, isAzure: false };
}

function buildHeaders(apiKey: string, isAzure: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (isAzure) {
    // Azure supports api-key header or Bearer token
    headers['api-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function generateWithCopilot(
  requirement: string,
  model: string,
  apiKey: string,
  endpoint: string,
  type: 'cases' | 'plan' = 'cases'
) {
  const messages = buildMessages(requirement, type);
  const { url, isAzure } = resolveCopilotUrl(endpoint, model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const payload: any = {
      messages,
      temperature: 0.1,
      max_tokens: 4096
    };
    if (!isAzure) {
      payload.model = model;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(apiKey, isAzure),
      signal: controller.signal,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Copilot error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (type === 'plan') return content;
    return parseTestCases(content);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testCopilotConnection(
  apiKey: string,
  endpoint: string,
  model = 'gpt-4o'
): Promise<{ success: boolean; message?: string }> {
  try {
    const { url, isAzure } = resolveCopilotUrl(endpoint, model);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const payload: any = {
      messages: [{ role: 'user', content: 'Ping' }],
      max_tokens: 5
    };
    if (!isAzure) {
      payload.model = model;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(apiKey, isAzure),
        signal: controller.signal,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, message: `Status ${response.status}: ${errText.slice(0, 200)}` };
      }

      return { success: true };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error: any) {
    return { success: false, message: error?.message || 'Connection failed' };
  }
}
