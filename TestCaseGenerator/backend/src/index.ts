import express from 'express';
import cors from 'cors';
import generateRouter from './routes/generate';
import modelsRouter from './routes/models';
import acceptanceCriteriaRouter from './routes/acceptanceCriteria';
import ragRouter from './routes/rag';
import { testGroqConnection } from './services/groqService';
import { testCopilotConnection } from './services/copilotService';
import { testAdoConnection, fetchAdoWorkItem, createAdoBug } from './services/adoService';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/generate', generateRouter);
app.use('/api/models', modelsRouter);
app.use('/api/acceptance-criteria', acceptanceCriteriaRouter);
app.use('/api/rag', ragRouter);

app.post('/api/test-groq', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  const success = await testGroqConnection(apiKey);
  res.json({ success });
});

app.post('/api/test-copilot', async (req, res) => {
  const { apiKey, endpoint, model } = req.body;
  if (!apiKey) {
    return res.status(400).json({ success: false, message: 'API key / token is required' });
  }
  const result = await testCopilotConnection(apiKey, endpoint, model);
  res.json(result);
});

app.post('/api/test-ado', async (req, res) => {
  const { orgUrl, project, pat } = req.body;
  if (!orgUrl || !pat) {
    return res.status(400).json({ success: false, message: 'Org URL and PAT are required' });
  }
  const result = await testAdoConnection({ orgUrl, project: project || '', pat });
  res.json(result);
});

app.post('/api/ado-workitem', async (req, res) => {
  try {
    const { id, orgUrl, project, pat } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Work Item ID is required' });
    }
    const result = await fetchAdoWorkItem(id, { orgUrl, project, pat });
    res.json({ success: true, workItem: result });
  } catch (error: any) {
    console.error('[ADO] Error fetching work item:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch ADO Work Item' });
  }
});

app.post('/api/log-ado-bug', async (req, res) => {
  try {
    const { summary, description, priority, orgUrl, project, pat } = req.body;
    const result = await createAdoBug({
      summary,
      description,
      priority,
      config: { orgUrl, project, pat }
    });
    res.json(result);
  } catch (error: any) {
    console.error('[ADO] Bug creation error:', error);
    res.status(500).json({ error: error.message || 'Failed to create ADO Bug' });
  }
});

app.post('/api/upload-jira', async (req, res) => {
  try {
    const { testCases, storyId } = req.body;
    // We will dynamically import the mcpClient module to avoid top-level issues
    const { uploadTestCaseToJira } = await import('./services/mcpClient');
    
    // Process test cases concurrently or sequentially
    const results = [];
    for (const testCase of testCases) {
      const result = await uploadTestCaseToJira(testCase, storyId);
      results.push(result);
    }
    
    res.json({ success: true, results });
  } catch (error: any) {
    console.error('Error uploading to Jira:', error);
    res.status(500).json({ error: error.message || 'Failed to upload to Jira' });
  }
});

app.get('/api/jira-story/:issueKey', async (req, res) => {
  try {
    const { issueKey } = req.params;
    if (!issueKey || !/^[A-Za-z]+-\d+$/.test(issueKey)) {
      return res.status(400).json({ error: 'Invalid Jira issue key format (e.g., PROJ-123)' });
    }
    const { fetchJiraStory } = await import('./services/mcpClient');
    const details = await fetchJiraStory(issueKey.toUpperCase());
    res.json({ success: true, issueKey: issueKey.toUpperCase(), details });
  } catch (error: any) {
    console.error('[Jira] Error fetching story:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch Jira story' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 TestCase Generator backend running on http://localhost:${PORT}`);
  console.log(`   Ollama endpoint: http://localhost:11434`);
});

server.timeout = 300000;
