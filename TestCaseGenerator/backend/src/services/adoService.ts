/**
 * Azure DevOps (ADO) REST API Service
 * Handles Work Item retrieval (User Stories / Requirements) and Bug creation.
 */

export interface AdoConfig {
  orgUrl: string;       // e.g. https://dev.azure.com/myorg
  project: string;      // e.g. MyProject
  pat: string;          // Personal Access Token
}

export function cleanOrgUrl(url: string): string {
  let cleaned = (url || '').trim().replace(/\/+$/, '');
  // If user pasted a full ADO workitem or project URL, extract the base org URL
  // e.g. https://dev.azure.com/myorg/myproject/_workitems/... -> https://dev.azure.com/myorg
  const devAzureMatch = cleaned.match(/^(https?:\/\/dev\.azure\.com\/[^\/]+)/i);
  if (devAzureMatch) {
    return devAzureMatch[1];
  }
  // e.g. https://myorg.visualstudio.com/... -> https://myorg.visualstudio.com
  const vsMatch = cleaned.match(/^(https?:\/\/[^\/]+\.visualstudio\.com)/i);
  if (vsMatch) {
    return vsMatch[1];
  }
  return cleaned;
}

export function getAuthHeaders(pat: string): Record<string, string> {
  const cleanPat = (pat || '').trim();
  // ADO Basic Auth uses `:{PAT}` base64 encoded.
  // We also send standard Basic auth and Bearer fallback
  const basicAuth = `Basic ${Buffer.from(`:${cleanPat}`).toString('base64')}`;
  return {
    'Authorization': basicAuth,
    'X-TFS-FedAuthRedirect': 'Suppress', // Crucial: Prevents Azure DevOps from redirecting to Microsoft login HTML
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
}

/** Test ADO connection by querying project info */
export async function testAdoConnection(config: AdoConfig): Promise<{ success: boolean; message?: string }> {
  try {
    const org = cleanOrgUrl(config.orgUrl);
    if (!org) return { success: false, message: 'Organization URL is required' };
    if (!config.pat) return { success: false, message: 'Personal Access Token is required' };

    // In Azure DevOps Core API:
    // GET {org}/_apis/projects/{projectName}?api-version=7.1 (if project specified)
    // GET {org}/_apis/projects?api-version=7.1 (if no project specified)
    const url = config.project
      ? `${org}/_apis/projects/${encodeURIComponent(config.project)}?api-version=7.1`
      : `${org}/_apis/projects?api-version=7.1`;

    console.log(`[ADO] Testing connection to: ${url}`);
    const res = await fetch(url, {
      headers: getAuthHeaders(config.pat)
    });

    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('json')) {
      const err = await res.text();
      if (err.includes('<!DOCTYPE') || err.includes('<html') || res.status === 203) {
        return { success: false, message: `ADO returned authentication error (${res.status}). Please ensure PAT was created in 'GlobalPSS' with 'Work Items: Read' or 'Full access'.` };
      }
      return { success: false, message: `ADO Error (${res.status}): ${err.slice(0, 150)}` };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Connection failed' };
  }
}

/** Fetch an ADO Work Item by numeric ID (e.g. 12345) */
export async function fetchAdoWorkItem(id: string | number, config: AdoConfig): Promise<{
  id: number;
  title: string;
  type: string;
  details: string;
}> {
  const org = cleanOrgUrl(config.orgUrl);
  if (!org || !config.pat) {
    throw new Error('ADO credentials (Organization URL and PAT) are required.');
  }

  const numericId = String(id).replace(/[^0-9]/g, '');
  if (!numericId) {
    throw new Error(`Invalid ADO Work Item ID: ${id}`);
  }

  // Note: ADO Work Item IDs are globally unique across an entire organization.
  // Querying at the Org level (_apis/wit/workitems/{id}) avoids 404/redirect HTML pages if the project path differs.
  const url = `${org}/_apis/wit/workitems/${numericId}?$expand=all&api-version=7.1`;

  console.log(`[ADO] Fetching Work Item ${numericId} from: ${url}`);
  const res = await fetch(url, {
    headers: getAuthHeaders(config.pat)
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('json')) {
    const rawText = await res.text();
    if (rawText.includes('<!DOCTYPE') || rawText.includes('<html') || res.status === 203) {
      throw new Error(`Azure DevOps authentication failed (Status: ${res.status}). Please verify that your PAT is valid, not expired, and has 'Work Items: Read' permissions in GlobalPSS.`);
    }
    throw new Error(`Failed to fetch ADO Work Item ${numericId} (Status: ${res.status}): ${rawText.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const fields = data.fields || {};

  const title = fields['System.Title'] || `Work Item #${numericId}`;
  const type = fields['System.WorkItemType'] || 'Work Item';
  const rawDescription = fields['System.Description'] || '';
  const acceptanceCriteria = fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '';
  const state = fields['System.State'] || 'Unknown';
  const assignedTo = fields['System.AssignedTo']?.displayName || 'Unassigned';

  // Comprehensive HTML to plain-text converter for ADO rich-text (preserves lists, bullets, line breaks)
  const formatAdoHtml = (html: string) => {
    if (!html) return '';
    return html
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<div[^>]*>/gi, '\n')
      .replace(/<\/div>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/<[^>]*>/g, '') // remove remaining tags
      .replace(/\n{3,}/g, '\n\n') // collapse multiple blank lines
      .trim();
  };

  const cleanDesc = formatAdoHtml(rawDescription);
  const cleanAc = formatAdoHtml(acceptanceCriteria);

  let details = `Jira Story: ADO-${numericId}\n`;
  details += `Summary: ${title}\n`;
  details += `Work Item Type: ${type}\n`;
  details += `Status: ${state} | Assigned: ${assignedTo}\n`;
  if (cleanDesc) {
    details += `\nDescription:\n${cleanDesc}\n`;
  }
  if (cleanAc) {
    details += `\nAcceptance Criteria:\n${cleanAc}\n`;
  }

  return {
    id: data.id,
    title,
    type,
    details
  };
}

/** Create a Bug work item in ADO */
export async function createAdoBug(params: {
  summary: string;
  description: string;
  priority?: string;
  config: AdoConfig;
}): Promise<{ success: boolean; id?: number; url?: string }> {
  const { config, summary, description, priority } = params;
  const org = cleanOrgUrl(config.orgUrl);
  if (!org || !config.pat || !config.project) {
    throw new Error('ADO Organization URL, Project, and PAT are required to create a bug.');
  }

  const url = `${org}/${encodeURIComponent(config.project)}/_apis/wit/workitems/$Bug?api-version=7.1`;

  // ADO uses JSON Patch format: [ { op: 'add', path: '/fields/...', value: '...' } ]
  const patchOperations = [
    {
      op: 'add',
      path: '/fields/System.Title',
      value: summary
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.ReproSteps',
      value: `<pre>${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: priority === 'Highest' || priority === 'High' ? 1 : priority === 'Low' ? 3 : 2
    }
  ];

  console.log(`[ADO] Creating Bug in project ${config.project}: ${summary}`);
  const authHeaders = getAuthHeaders(config.pat);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json-patch+json'
    },
    body: JSON.stringify(patchOperations)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create ADO Bug (${res.status}): ${err.slice(0, 200)}`);
  }

  const data: any = await res.json();
  const webUrl = `${org}/${encodeURIComponent(config.project)}/_workitems/edit/${data.id}`;
  return {
    success: true,
    id: data.id,
    url: webUrl
  };
}
