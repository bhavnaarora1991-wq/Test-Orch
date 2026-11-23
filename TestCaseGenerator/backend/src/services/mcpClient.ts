import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── Read Jira credentials from mcp_config.json ──────────────────────────────
function getJiraConfig(): { url: string; username: string; token: string } | null {
  try {
    const configPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
    if (!fs.existsSync(configPath)) return null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const env = config?.mcpServers?.['mcp-atlassian']?.env;
    if (env?.JIRA_URL && env?.JIRA_USERNAME && env?.JIRA_API_TOKEN) {
      return { url: env.JIRA_URL, username: env.JIRA_USERNAME, token: env.JIRA_API_TOKEN };
    }
  } catch (e) {
    console.error('[Jira] Failed to read mcp_config.json:', e);
  }
  return null;
}

/** Recursively extract plain text from Atlassian Document Format (ADF) nodes */
function extractAdfText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  
  let text = '';
  if (node.content && Array.isArray(node.content)) {
    text = node.content.map(extractAdfText).join('');
  }

  if (node.type === 'paragraph' || node.type === 'hardBreak') {
    return text + '\n';
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return text + '\n';
  }
  if (node.type === 'listItem') {
    return '• ' + text + '\n';
  }
  
  return text;
}

/** Fetch Jira story details directly via REST API (no MCP subprocess) */
export async function fetchJiraStory(issueKey: string): Promise<string> {
  const jira = getJiraConfig();
  if (!jira) throw new Error('Jira credentials not found in mcp_config.json');

  const auth = Buffer.from(`${jira.username}:${jira.token}`).toString('base64');
  const url = `${jira.url}/rest/api/3/issue/${issueKey}`;

  console.log(`[Jira] Fetching via REST API: ${url}`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Jira API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data: any = await response.json();
  const fields = data.fields || {};
  const summary = fields.summary || 'Not specified';

  // Extract description (ADF or plain)
  let descriptionText = '';
  if (fields.description) {
    const d = fields.description;
    if (typeof d === 'string') {
      descriptionText = d.trim();
    } else if (d.type === 'doc' || d.content) {
      descriptionText = extractAdfText(d);
    }
  }

  // Try multiple acceptance criteria custom fields
  const acCandidates = [
    fields.customfield_10016, fields.customfield_10014,
    fields.customfield_10015, fields.customfield_10020,
    fields.acceptanceCriteria
  ].filter(Boolean);

  let acText = '';
  for (const ac of acCandidates) {
    if (typeof ac === 'string' && ac.trim()) { acText = ac.trim(); break; }
    if (ac?.type === 'doc' || ac?.content) { acText = extractAdfText(ac); break; }
  }

  let details = `Jira Story ID: ${issueKey}\nSummary: ${summary}\n`;
  if (descriptionText) {
    details += `\nDESCRIPTION AND REQUIREMENTS:\n${descriptionText.trim()}\n`;
  }
  if (acText) {
    details += `\nACCEPTANCE CRITERIA:\n${acText.trim()}\n`;
  }
  
  if (!descriptionText && !acText) {
    details += '\n(No detailed description or acceptance criteria found. Using summary as the primary requirement.)';
  }

  return details.slice(0, 10000); // Allow much more context
}

let mcpClient: Client | null = null;
let mcpTransport: StdioClientTransport | null = null;

let mcpConfig: any = null;

export async function getMcpClient() {
  if (mcpClient) return mcpClient;

  let injectedEnv = { ...(process.env as Record<string, string>) };
  let command = 'uvx';
  let args = ['mcp-atlassian'];

  try {
    const configPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp_config.json');
    if (fs.existsSync(configPath)) {
      const configStr = fs.readFileSync(configPath, 'utf8');
      mcpConfig = JSON.parse(configStr);
      const atlassianConfig = mcpConfig?.mcpServers?.['mcp-atlassian'];
      if (atlassianConfig) {
        if (atlassianConfig.env) {
           injectedEnv = { ...injectedEnv, ...atlassianConfig.env };
        }
        if (atlassianConfig.command) {
           command = atlassianConfig.command;
        }
        if (atlassianConfig.args) {
           args = atlassianConfig.args;
        }
      }
    }
  } catch (e) {
    console.error('[MCP] Failed to load mcp_config.json:', e);
  }

  console.log(`[MCP] Connecting to Atlassian MCP using command: ${command} ${args.join(' ')}`);

  // Initialize the MCP client
  mcpTransport = new StdioClientTransport({
    command: command,
    args: args,
    env: injectedEnv
  });

  mcpClient = new Client(
    { name: 'test-case-generator', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await mcpClient.connect(mcpTransport);
    console.log('[MCP] Successfully connected to Atlassian MCP');
  } catch (err) {
    console.error('[MCP] Connection failed:', err);
    // Fallback attempt with npx if uvx fails
    if (command === 'uvx') {
      console.log('[MCP] Retrying with npx fallback...');
      mcpTransport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-atlassian'],
        env: injectedEnv
      });
      await mcpClient.connect(mcpTransport);
      console.log('[MCP] Successfully connected via npx fallback');
    } else {
      throw err;
    }
  }
  
  return mcpClient;
}

export async function uploadTestCaseToJira(testCase: any, storyId?: string) {
  const client = await getMcpClient();
  
  // Create a Jira issue via MCP
  const result = await client.callTool({
    name: "jira_create_issue",
    arguments: {
      project_key: storyId ? storyId.split('-')[0] : "PROJ",
      summary: testCase.summary || `Test Case: ${testCase.testCaseId}`,
      issue_type: "Test",
      description: `*Description:* ${testCase.description}\n\n*Preconditions:*\n${testCase.preconditions}\n\n*Steps:*\n${testCase.steps}\n\n*Expected Result:*\n${testCase.expectedResult}`,
      additional_fields: storyId ? JSON.stringify({ parent: storyId }) : undefined
    }
  });

  return result;
}

export async function createJiraBug(params: any) {
  const client = await getMcpClient();
  
  console.log(`[Jira] Attempting to create bug in project: ${params.projectKey}`);
  
  try {
    const result = await client.callTool({
      name: "jira_create_issue",
      arguments: {
        project_key: params.projectKey || "PROJ",
        summary: params.summary || "Bug found during testing",
        issue_type: "Bug",
        description: params.description || "",
        additional_fields: JSON.stringify({
          priority: { name: params.priority || "Medium" }
        })
      }
    });

    console.log('[Jira] Bug created successfully:', result);
    return result;
  } catch (error: any) {
    console.error('[Jira] Bug creation failed. Error details:', error);
    throw error;
  }
}


