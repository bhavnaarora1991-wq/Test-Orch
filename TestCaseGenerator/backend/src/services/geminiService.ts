import { parseTestCases } from '../utils/parser';
import { buildEnhancedPrompt, buildEnhancedPlanPrompt } from '../utils/prompt';

// Using centralized prompts

function buildPrompt(requirement: string, type: 'cases' | 'plan') {
  let systemContent = type === 'plan' ? buildEnhancedPlanPrompt(requirement) : buildEnhancedPrompt(requirement);
  let userPrompt = '';

  if (requirement.includes('Jira Story:')) {
    const lines = requirement.split('\n');
    const jiraIdLine = lines.find(l => l.startsWith('Jira Story:'));
    const summaryLine = lines.find(l => l.startsWith('Summary:'));
    
    const jiraId = jiraIdLine ? jiraIdLine.replace('Jira Story:', '').trim() : 'Feature';
    const summary = summaryLine ? summaryLine.replace('Summary:', '').trim() : 'specified requirements';
    
    systemContent = systemContent.split('[FEATURE]').join(summary);
    userPrompt = `Generate test cases for Jira Story ${jiraId}: ${summary}.\n\nRequirements:\n${requirement}`;
  } else {
    systemContent = systemContent.split('[FEATURE]').join('the requirements');
    userPrompt = `Requirements:\n${requirement}`;
  }

  return `${systemContent}\n\n${userPrompt}`;
}

export async function generateWithGemini(
  requirement: string,
  model: string,
  apiKey: string,
  type: 'cases' | 'plan' = 'cases'
) {
  const promptText = buildPrompt(requirement, type);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: type === 'plan' ? 'text/plain' : 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error ${response.status}: ${errText}`);
  }

  const data: any = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (type === 'plan') return content;
  return parseTestCases(content);
}

export async function testGeminiConnection(apiKey: string): Promise<boolean> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  try {
    console.log('[geminiService] Testing connection...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Ping' }] }]
      }),
    });
    
    if (!response.ok) {
      const err = await response.text();
      console.error(`[geminiService] Connection test failed with status ${response.status}:`, err);
    } else {
      console.log('[geminiService] Connection test successful.');
    }
    
    return response.ok;
  } catch (error) {
    console.error('[geminiService] Connection test error:', error);
    return false;
  }
}
