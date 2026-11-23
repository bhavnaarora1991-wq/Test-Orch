import { cleanOrgUrl, getAuthHeaders, AdoConfig } from './adoService';
import { addHistoricalBugs, HistoricalBug } from './ragService';

/**
 * Fetch recently closed or active Bugs from Azure DevOps using WIQL (Work Item Query Language)
 */
export async function syncAdoBugsToRag(config: AdoConfig, maxCount = 50): Promise<{ count: number; bugs: HistoricalBug[] }> {
  const org = cleanOrgUrl(config.orgUrl);
  if (!org || !config.pat || !config.project) {
    throw new Error('ADO Organization URL, Project, and PAT are required.');
  }

  // 1. Execute WIQL query to find Bug IDs in the project
  const wiqlUrl = `${org}/${encodeURIComponent(config.project)}/_apis/wit/wiql?api-version=7.1`;
  const wiqlQuery = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Bug' ORDER BY [System.ChangedDate] DESC`
  };

  console.log(`[RAG-ADO] Executing WIQL query: ${wiqlUrl}`);
  const res = await fetch(wiqlUrl, {
    method: 'POST',
    headers: getAuthHeaders(config.pat),
    body: JSON.stringify(wiqlQuery)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to query ADO bugs (${res.status}): ${errText.slice(0, 150)}`);
  }

  const queryResult: any = await res.json();
  const workItemRefs = (queryResult.workItems || []).slice(0, maxCount);
  if (!workItemRefs.length) {
    return { count: 0, bugs: [] };
  }

  const ids = workItemRefs.map((w: any) => w.id);
  console.log(`[RAG-ADO] Found ${ids.length} bug IDs. Fetching full details in batch...`);

  // 2. Batch fetch work item details
  const batchUrl = `${org}/_apis/wit/workitemsbatch?api-version=7.1`;
  const batchRes = await fetch(batchUrl, {
    method: 'POST',
    headers: getAuthHeaders(config.pat),
    body: JSON.stringify({
      ids,
      fields: [
        'System.Id',
        'System.Title',
        'System.Description',
        'Microsoft.VSTS.TCM.ReproSteps',
        'System.AreaPath',
        'Microsoft.VSTS.Common.Severity',
        'System.State'
      ]
    })
  });

  if (!batchRes.ok) {
    const errText = await batchRes.text();
    throw new Error(`Failed to batch fetch ADO bug details (${batchRes.status}): ${errText.slice(0, 150)}`);
  }

  const batchData: any = await batchRes.json();
  const items = batchData.value || [];

  const stripHtml = (html: string) => html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';

  const parsedBugs: HistoricalBug[] = items.map((item: any) => {
    const f = item.fields || {};
    const title = f['System.Title'] || `Bug #${item.id}`;
    const desc = stripHtml(f['Microsoft.VSTS.TCM.ReproSteps'] || f['System.Description'] || '');
    return {
      id: `ADO-${item.id}`,
      title,
      source: 'ado' as const,
      area: f['System.AreaPath'] || config.project,
      severity: f['Microsoft.VSTS.Common.Severity'] || 'Medium',
      description: desc || title,
      syncedAt: new Date().toISOString()
    };
  });

  const added = addHistoricalBugs(parsedBugs);
  return { count: added, bugs: parsedBugs };
}
