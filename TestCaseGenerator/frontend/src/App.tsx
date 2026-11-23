import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  ListChecks, 
  Settings, 
  UploadCloud, 
  ChevronDown, 
  Play,
  Download,
  PlayCircle,
  Bug,
  TestTubes,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  CloudUpload,
  Database
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { TestCase } from './types/testCase';
import TestCaseTable from './components/TestCaseTable';
import ExecutionPanel from './components/ExecutionPanel';
import BugPanel from './components/BugPanel';
import KnowledgeBasePanel from './components/KnowledgeBasePanel';

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Extract a Jira issue key from either a plain ID or a full Atlassian URL */
function extractJiraKey(input: string): string | null {
  const trimmed = input.trim();
  // Match a bare key like PROJ-123
  const bareMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_]+-\d+)$/);
  if (bareMatch) return bareMatch[1].toUpperCase();
  // Match from a URL like https://company.atlassian.net/browse/PROJ-123
  const urlMatch = trimmed.match(/\/browse\/([A-Za-z][A-Za-z0-9_]+-\d+)/);
  if (urlMatch) return urlMatch[1].toUpperCase();
  return null;
}

/** Extract an Azure DevOps Work Item ID from a plain number or full ADO URL */
function extractAdoId(input: string): string | null {
  const trimmed = input.trim();
  // 1. Full ADO Work Item URL: .../_workitems/edit/12345 or .../workitems/edit/12345
  const editUrlMatch = trimmed.match(/workitems\/edit\/(\d+)/i);
  if (editUrlMatch) return editUrlMatch[1];

  // 2. ADO short URL or query URL: ...?workitem=12345 or ...&id=12345
  const paramMatch = trimmed.match(/[?&](?:workitem|id)=(\d+)/i);
  if (paramMatch) return paramMatch[1];

  // 3. Visualstudio.com legacy URL: https://org.visualstudio.com/project/_workitems#_a=edit&id=12345
  const vsUrlMatch = trimmed.match(/visualstudio\.com.*[#&?]id=(\d+)/i);
  if (vsUrlMatch) return vsUrlMatch[1];

  // 4. Any dev.azure.com URL with trailing ID: https://dev.azure.com/.../12345
  const generalAdoUrlMatch = trimmed.match(/dev\.azure\.com\/.*\/(\d+)/i);
  if (generalAdoUrlMatch) return generalAdoUrlMatch[1];

  // 5. Bare numeric format: #12345 or 12345 (2 to 10 digits)
  const bareMatch = trimmed.match(/^#?(\d{2,10})$/);
  if (bareMatch) return bareMatch[1];

  return null;
}

// Default QA prompt template
const DEFAULT_QA_PROMPT = `You are a QA engineer.

Generate test cases ONLY based on the provided acceptance criteria.
Do NOT assume any functionality that is not explicitly mentioned.

For each acceptance criterion:
- Create at least 2 test cases
- Include:
  - Test Case ID
  - Title
  - Preconditions
  - Steps
  - Expected Result

If acceptance criteria are unclear or missing, say:
"Insufficient information to generate test cases."

Every test case must explicitly reference the acceptance criterion it is derived from.

Check if each test case is strictly derived from the acceptance criteria.
Flag any that introduce new functionality.`;

type ActiveMenu = 'dashboard' | 'plan' | 'cases' | 'execute' | 'bugs' | 'knowledge' | 'settings';
type ActivePanel = 'file' | 'instructions' | null;

const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'qwen/qwen3.8-27b',
  'allam-2-7b'
];

const COPILOT_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'o1',
  'o3-mini'
];

const OPENAI_MODELS = [
  'o1',
  'o3-mini',
  'gpt-4.5-preview',
  'gpt-4o',
  'gpt-4o-mini'
];

const ANTHROPIC_MODELS = [
  'claude-3-7-sonnet-latest',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
  'claude-3-opus-latest'
];

const GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro'
];

export default function App() {
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(() => {
    const saved = localStorage.getItem('activeMenu') as ActiveMenu;
    if (saved && ['dashboard', 'plan', 'cases', 'execute', 'bugs', 'knowledge', 'settings'].includes(saved)) {
      return saved;
    }
    return 'dashboard';
  });
  const [activePanel, setActivePanel] = useState<ActivePanel>('file');

  const [storyId, setStoryId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testPlanContent, setTestPlanContent] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  // Jira Integration States
  const [jiraUrl, setJiraUrl] = useState(localStorage.getItem('jira_url') || '');
  const [jiraProjectKey, setJiraProjectKey] = useState(localStorage.getItem('jira_project_key') || '');
  const [showJiraModal, setShowJiraModal] = useState(false);

  // Azure DevOps (ADO) Integration States
  const [adoOrgUrl, setAdoOrgUrl] = useState(localStorage.getItem('ado_org_url') || '');
  const [adoProject, setAdoProject] = useState(localStorage.getItem('ado_project') || '');
  const [adoPat, setAdoPat] = useState(localStorage.getItem('ado_pat') || '');
  const [adoStatus, setAdoStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [adoErrorMsg, setAdoErrorMsg] = useState('');

  // Story fetch state (supports Jira or ADO)
  type StoryFetchStatus = 'idle' | 'fetching' | 'success' | 'error';
  const [jiraFetchStatus, setJiraFetchStatus] = useState<StoryFetchStatus>('idle');
  const [jiraStoryPreview, setJiraStoryPreview] = useState<{ key: string; details: string; source?: 'jira' | 'ado' } | null>(null);
  const [jiraFetchError, setJiraFetchError] = useState('');

  const [provider, setProvider] = useState<'ollama' | 'groq' | 'copilot' | 'openai' | 'anthropic' | 'gemini'>(
    (localStorage.getItem('provider') as any) || 'groq'
  );

  const [copilotKey, setCopilotKey] = useState(localStorage.getItem('copilot_key') || '');
  const [copilotEndpoint, setCopilotEndpoint] = useState(localStorage.getItem('copilot_endpoint') || 'https://models.inference.ai.azure.com');
  const [selectedCopilotModel, setSelectedCopilotModel] = useState(
    localStorage.getItem('copilot_model') || COPILOT_MODELS[0]
  );
  const [copilotStatus, setCopilotStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [copilotErrorMsg, setCopilotErrorMsg] = useState('');

  const [groqKey, setGroqKey] = useState(localStorage.getItem('groq_key') || '');
  const [groqStatus, setGroqStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [selectedGroqModel, setSelectedGroqModel] = useState(
    localStorage.getItem('groq_model') || GROQ_MODELS[0]
  );

  const [openaiKey, setOpenaiKey] = useState(localStorage.getItem('openai_key') || '');
  const [openaiStatus, setOpenaiStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [selectedOpenaiModel, setSelectedOpenaiModel] = useState(
    localStorage.getItem('openai_model') || OPENAI_MODELS[0]
  );

  const [anthropicKey, setAnthropicKey] = useState(localStorage.getItem('anthropic_key') || '');
  const [anthropicStatus, setAnthropicStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [selectedAnthropicModel, setSelectedAnthropicModel] = useState(
    localStorage.getItem('anthropic_model') || ANTHROPIC_MODELS[0]
  );

  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_key') || '');
  const [geminiStatus, setGeminiStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');
  const [selectedGeminiModel, setSelectedGeminiModel] = useState(
    localStorage.getItem('gemini_model') || GEMINI_MODELS[0]
  );

  const [ollamaModel, setOllamaModel] = useState('llama3');
  const [ollamaStatus, setOllamaStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle');

  const [executionResults, setExecutionResults] = useState<Record<string, any>>(
    JSON.parse(localStorage.getItem('execution_results') || '{}')
  );

  interface HistoryItem {
    type: 'plan' | 'cases';
    title: string;
    count: number;
    timestamp: string;
  }

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('generation_history');
    return saved ? JSON.parse(saved) : [];
  });

  React.useEffect(() => {
    localStorage.setItem('generation_history', JSON.stringify(history));
  }, [history]);

  // Modal temporary states for Jira
  const [modalJiraUrl, setModalJiraUrl] = useState(jiraUrl);
  const [modalProjectKey, setModalProjectKey] = useState(jiraProjectKey);
  const [modalStoryId, setModalStoryId] = useState('');

  // Safety: Reset model if the saved one has been decommissioned
  React.useEffect(() => {
    if (!GROQ_MODELS.includes(selectedGroqModel)) {
      setSelectedGroqModel(GROQ_MODELS[0]);
    }
  }, [selectedGroqModel]);

  const handleTestGroq = async () => {
    if (!groqKey) return;
    setGroqStatus('testing');
    try {
      const res = await fetch('http://localhost:3001/api/test-groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: groqKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGroqStatus('valid');
        localStorage.setItem('groq_key', groqKey);
      } else {
        setGroqStatus('invalid');
      }
    } catch {
      setGroqStatus('invalid');
    }
  };

  const handleTestCopilot = async () => {
    if (!copilotKey) return;
    setCopilotStatus('testing');
    setCopilotErrorMsg('');
    try {
      const res = await fetch('http://localhost:3001/api/test-copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: copilotKey,
          endpoint: copilotEndpoint,
          model: selectedCopilotModel
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCopilotStatus('valid');
        localStorage.setItem('copilot_key', copilotKey);
        localStorage.setItem('copilot_endpoint', copilotEndpoint);
        localStorage.setItem('copilot_model', selectedCopilotModel);
      } else {
        setCopilotStatus('invalid');
        setCopilotErrorMsg(data.message || 'Connection failed');
      }
    } catch (e: any) {
      setCopilotStatus('invalid');
      setCopilotErrorMsg(e?.message || 'Connection failed');
    }
  };

  const handleTestOpenAI = async () => {
    if (!openaiKey) return;
    setOpenaiStatus('testing');
    try {
      const res = await fetch('http://localhost:3001/api/test-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: openaiKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOpenaiStatus('valid');
        localStorage.setItem('openai_key', openaiKey);
      } else {
        setOpenaiStatus('invalid');
      }
    } catch {
      setOpenaiStatus('invalid');
    }
  };

  const handleTestAnthropic = async () => {
    if (!anthropicKey) return;
    setAnthropicStatus('testing');
    try {
      const res = await fetch('http://localhost:3001/api/test-anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: anthropicKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAnthropicStatus('valid');
        localStorage.setItem('anthropic_key', anthropicKey);
      } else {
        setAnthropicStatus('invalid');
      }
    } catch {
      setAnthropicStatus('invalid');
    }
  };

  const handleTestGemini = async () => {
    if (!geminiKey) return;
    setGeminiStatus('testing');
    try {
      const res = await fetch('http://localhost:3001/api/test-gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: geminiKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGeminiStatus('valid');
        localStorage.setItem('gemini_key', geminiKey);
      } else {
        setGeminiStatus('invalid');
      }
    } catch {
      setGeminiStatus('invalid');
    }
  };

  const handleTestOllama = async () => {
    setOllamaStatus('testing');
    try {
      const res = await fetch('http://localhost:3001/api/test-ollama', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOllamaStatus('valid');
      } else {
        setOllamaStatus('invalid');
      }
    } catch {
      setOllamaStatus('invalid');
    }
  };

  React.useEffect(() => {
    localStorage.setItem('provider', provider);
  }, [provider]);

  React.useEffect(() => {
    localStorage.setItem('groq_model', selectedGroqModel);
  }, [selectedGroqModel]);

  React.useEffect(() => {
    localStorage.setItem('activeMenu', activeMenu);
  }, [activeMenu]);

  React.useEffect(() => {
    localStorage.setItem('openai_key', openaiKey);
  }, [openaiKey]);

  React.useEffect(() => {
    localStorage.setItem('openai_model', selectedOpenaiModel);
  }, [selectedOpenaiModel]);

  React.useEffect(() => {
    localStorage.setItem('anthropic_key', anthropicKey);
  }, [anthropicKey]);

  React.useEffect(() => {
    localStorage.setItem('anthropic_model', selectedAnthropicModel);
  }, [selectedAnthropicModel]);

  React.useEffect(() => {
    localStorage.setItem('gemini_key', geminiKey);
  }, [geminiKey]);

  React.useEffect(() => {
    localStorage.setItem('gemini_model', selectedGeminiModel);
  }, [selectedGeminiModel]);

  React.useEffect(() => {
    localStorage.setItem('jira_url', jiraUrl);
  }, [jiraUrl]);

  React.useEffect(() => {
    localStorage.setItem('jira_project_key', jiraProjectKey);
  }, [jiraProjectKey]);

  React.useEffect(() => {
    localStorage.setItem('execution_results', JSON.stringify(executionResults));
  }, [executionResults]);

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  // ─── Jira / ADO smart input ─────────────────────────────────────────────
  const handleStoryIdChange = (raw: string) => {
    setStoryId(raw);
    // Reset preview whenever the user edits the field
    if (jiraFetchStatus !== 'idle') {
      setJiraFetchStatus('idle');
      setJiraStoryPreview(null);
      setJiraFetchError('');
    }
  };

  const handleStoryIdBlur = async () => {
    const raw = storyId.trim();
    if (!raw) return;

    // 1. Try matching ADO Work Item (numeric ID or ADO URL)
    const adoId = extractAdoId(raw);
    if (adoId) {
      setStoryId(`#${adoId}`);
      setJiraFetchStatus('fetching');
      setJiraStoryPreview(null);
      setJiraFetchError('');
      try {
        const res = await fetch('http://localhost:3001/api/ado-workitem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: adoId,
            orgUrl: adoOrgUrl,
            project: adoProject,
            pat: adoPat
          })
        });
        const data = await res.json();
        if (res.ok && data.success && data.workItem) {
          setJiraStoryPreview({
            key: `ADO #${data.workItem.id}: ${data.workItem.title}`,
            details: data.workItem.details,
            source: 'ado'
          });
          setJiraFetchStatus('success');
        } else {
          setJiraFetchError(data.error || 'Could not fetch ADO work item. Ensure ADO is configured in Settings.');
          setJiraFetchStatus('error');
        }
      } catch {
        setJiraFetchError('Backend unreachable. Work Item ID will still be used.');
        setJiraFetchStatus('error');
      }
      return;
    }

    // 2. Try matching Jira issue (e.g. PROJ-123 or Jira URL)
    const key = extractJiraKey(raw);
    if (key) {
      setStoryId(key);
      setJiraFetchStatus('fetching');
      setJiraStoryPreview(null);
      setJiraFetchError('');
      try {
        const res = await fetch(`http://localhost:3001/api/jira-story/${key}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setJiraStoryPreview({ key: data.issueKey, details: data.details, source: 'jira' });
          setJiraFetchStatus('success');
        } else {
          setJiraFetchError(data.error || 'Could not fetch Jira story details.');
          setJiraFetchStatus('error');
        }
      } catch {
        setJiraFetchError('Backend unreachable. Story ID will still be used for generation.');
        setJiraFetchStatus('error');
      }
      return;
    }
  };

  const handleGenerate = async (mode: 'story' | 'instructions') => {
    if (mode === 'instructions' && !instructions.trim()) {
      setMessage({ text: 'Please enter instructions.', type: 'error' });
      return;
    }
    if (mode === 'story' && !storyId.trim() && !uploadedFile) {
      setMessage({ text: 'Please enter a Jira Story ID or upload a file.', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });
    
    try {
      let requirementText = '';

      if (mode === 'instructions') {
        requirementText = instructions;
      } else {
        // If user provided a Jira / ADO link or ID and details are not yet fetched, fetch right now!
        let details = jiraStoryPreview?.details;

        if (!details && storyId.trim()) {
          const raw = storyId.trim();
          const adoId = extractAdoId(raw);
          if (adoId) {
            try {
              const res = await fetch('http://localhost:3001/api/ado-workitem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: adoId, orgUrl: adoOrgUrl, project: adoProject, pat: adoPat })
              });
              const data = await res.json();
              if (res.ok && data.success && data.workItem) {
                details = data.workItem.details || '';
                setJiraStoryPreview({ key: `ADO #${data.workItem.id}: ${data.workItem.title}`, details: details || '', source: 'ado' });
                setJiraFetchStatus('success');
              }
            } catch (e) {
              console.warn('[ADO] On-demand fetch failed:', e);
            }
          } else {
            const key = extractJiraKey(raw);
            if (key) {
              try {
                const res = await fetch(`http://localhost:3001/api/jira-story/${key}`);
                const data = await res.json();
                if (res.ok && data.success) {
                  details = data.details || '';
                  setJiraStoryPreview({ key: data.issueKey, details: details || '', source: 'jira' });
                  setJiraFetchStatus('success');
                }
              } catch (e) {
                console.warn('[Jira] On-demand fetch failed:', e);
              }
            }
          }
        }

        if (details) {
          requirementText = details;
        } else if (storyId.trim()) {
          // If fetch failed, stop and warn the user instead of sending an empty stub to the AI
          setLoading(false);
          setMessage({
            text: `Cannot generate test cases: Could not fetch requirements for ${storyId}. Please resolve the error shown above or paste the requirements manually in 'Enter Instructions'.`,
            type: 'error'
          });
          return;
        }
      }

      const formData = new FormData();
      if (requirementText) {
        formData.append('requirement', requirementText);
        formData.append('jiraDetails', requirementText);
      }
      if (uploadedFile) formData.append('file', uploadedFile);

      let currentModel = ollamaModel;
      let currentKey = '';
      let currentEndpoint = '';

      if (provider === 'copilot') {
        currentModel = selectedCopilotModel;
        currentKey = copilotKey;
        currentEndpoint = copilotEndpoint;
      } else if (provider === 'groq') {
        currentModel = selectedGroqModel;
        currentKey = groqKey;
      } else if (provider === 'openai') {
        currentModel = selectedOpenaiModel;
        currentKey = openaiKey;
      } else if (provider === 'anthropic') {
        currentModel = selectedAnthropicModel;
        currentKey = anthropicKey;
      } else if (provider === 'gemini') {
        currentModel = selectedGeminiModel;
        currentKey = geminiKey;
      }

      formData.append('model', currentModel);
      formData.append('provider', provider);
      if (currentKey) formData.append('apiKey', currentKey);
      if (currentEndpoint) formData.append('endpoint', currentEndpoint);
      formData.append('type', activeMenu);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const res = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      
      let count = 0;
      if (activeMenu === 'plan') {
        setTestPlanContent(data.testPlan);
        setTestCases([]);
        count = 1;
      } else {
        // Re-index test cases sequentially with TC_ prefix
        const sequentialCases = (data.testCases || []).map((tc: any, idx: number) => ({
          ...tc,
          id: `TC_${String(idx + 1).padStart(3, '0')}`
        }));
        setTestCases(sequentialCases);
        setTestPlanContent('');
        count = sequentialCases.length;
      }

      // Save to history
      const newHistoryItem: HistoryItem = {
        type: activeMenu === 'plan' ? 'plan' : 'cases',
        title: storyId || (uploadedFile ? uploadedFile.name : 'Custom Instructions'),
        count: count,
        timestamp: new Date().toISOString()
      };
      setHistory(prev => [newHistoryItem, ...prev]);

      const outputType = activeMenu === 'plan' ? 'Test Plan' : 'Test Cases';
      setMessage({ 
        text: activeMenu === 'plan' 
          ? 'Test plan generated successfully!' 
          : `Generated ${count} test cases successfully!`, 
        type: 'success' 
      });
    } catch (e: any) {
      setMessage({ text: e.message || 'An error occurred.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const [uploadLoading, setUploadLoading] = useState(false);

  const handleUploadToJira = () => {
    setModalJiraUrl(jiraUrl);
    setModalProjectKey(jiraProjectKey);
    setModalStoryId(storyId);
    setShowJiraModal(true);
  };

  const confirmJiraUpload = async () => {
    if (!modalJiraUrl || !modalProjectKey || !modalStoryId) {
      setMessage({ text: 'Please fill in all JIRA details', type: 'error' });
      return;
    }

    // Save to persistence
    setJiraUrl(modalJiraUrl);
    setJiraProjectKey(modalProjectKey);
    setStoryId(modalStoryId);

    setUploadLoading(true);
    setShowJiraModal(false);
    try {
      const res = await fetch('http://localhost:3001/api/upload-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jiraUrl: modalJiraUrl,
          projectKey: modalProjectKey,
          storyId: modalStoryId,
          testCases
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: `Successfully uploaded ${testCases.length} test cases to JIRA! Redirecting...`, type: 'success' });
        
        // Construct the full JIRA story URL and open in new tab
        const fullUrl = `${modalJiraUrl.replace(/\/$/, '')}/browse/${modalStoryId}`;
        window.open(fullUrl, '_blank');
      } else {
        setMessage({ text: data.error || 'Failed to upload to JIRA', type: 'error' });
      }
    } catch {
      setMessage({ text: 'Connection error while uploading to JIRA', type: 'error' });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRefresh = () => {
    setStoryId('');
    setInstructions('');
    setUploadedFile(null);
    setTestCases([]);
    setTestPlanContent('');
    setMessage({ text: '', type: '' });
    setActivePanel('file');
    setJiraFetchStatus('idle');
    setJiraStoryPreview(null);
    setJiraFetchError('');
    // activeMenu is NOT changed, ensuring focus remains on current screen
  };

  const handleDownload = () => {
    if (activeMenu === 'cases' && testCases.length > 0) {
      try {
        const headers = ['ID', 'Summary', 'Preconditions', 'Test Steps', 'Expected Result', 'Type', 'Category'];
        const csvContent = [
          headers.join(','),
          ...testCases.map(tc => {
            return [
              `"${(tc.id || '').replace(/"/g, '""')}"`,
              `"${(tc.summary || '').replace(/"/g, '""')}"`,
              `"${(tc.preconditions || '').replace(/"/g, '""')}"`,
              `"${(tc.testSteps || '').replace(/"/g, '""')}"`,
              `"${(tc.expectedResult || '').replace(/"/g, '""')}"`,
              `"${(tc.testType || '').replace(/"/g, '""')}"`,
              `"${(tc.category || '').replace(/"/g, '""')}"`
            ].join(',');
          })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `test_cases_${storyId || 'export'}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setMessage({ text: 'Test cases downloaded successfully as CSV!', type: 'success' });
      } catch (e: any) {
        setMessage({ text: 'Failed to download CSV.', type: 'error' });
      }
    } else if (activeMenu === 'plan' && testPlanContent) {
      try {
        const blob = new Blob([testPlanContent], { type: 'text/markdown;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `test_plan.md`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setMessage({ text: 'Test plan downloaded successfully!', type: 'success' });
      } catch (e: any) {
        setMessage({ text: 'Failed to download Test Plan.', type: 'error' });
      }
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <TestTubes size={32} color="var(--primary)" strokeWidth={2.5} />
          <div className="sidebar-branding">
            <span className="brand-title">AI Powered</span>
            <span className="brand-subtitle">Test Orchestrator</span>
          </div>
        </div>
        <nav className="sidebar-menu">
          <button 
            className={`menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveMenu('dashboard')}
          >
            <LayoutDashboard size={20} /> Dashboard
          </button>
          <button 
            className={`menu-item ${activeMenu === 'plan' ? 'active' : ''}`}
            onClick={() => setActiveMenu('plan')}
          >
            <FileText size={20} /> Create Test Plan
          </button>
          <button 
            className={`menu-item ${activeMenu === 'cases' ? 'active' : ''}`}
            onClick={() => setActiveMenu('cases')}
          >
            <ListChecks size={20} /> Create Test Cases
          </button>
          <button 
            className={`menu-item ${activeMenu === 'execute' ? 'active' : ''}`}
            onClick={() => setActiveMenu('execute')}
          >
            <PlayCircle size={20} /> Execute Test Cases
          </button>
          <button 
            className={`menu-item ${activeMenu === 'bugs' ? 'active' : ''}`}
            onClick={() => setActiveMenu('bugs')}
          >
            <Bug size={20} /> Create Bugs
          </button>
          <button 
            className={`menu-item ${activeMenu === 'knowledge' ? 'active' : ''}`}
            onClick={() => setActiveMenu('knowledge')}
          >
            <Database size={20} /> Knowledge Base (RAG)
          </button>
          <button 
            className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveMenu('settings')}
          >
            <Settings size={20} /> Settings
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {activeMenu !== 'dashboard' && (
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1>
                {activeMenu === 'plan' ? 'Create Test Plan'
                 : activeMenu === 'settings' ? 'Settings'
                 : activeMenu === 'execute' ? 'Execute Test Cases'
                 : activeMenu === 'bugs' ? 'Create Bugs'
                 : activeMenu === 'knowledge' ? 'Knowledge Base (RAG)'
                 : 'Create Test Cases'}
              </h1>
              <p>
                {activeMenu === 'settings' ? 'Configure your AI provider, API keys, and connection preferences.'
                 : activeMenu === 'execute' ? 'Run and manage execution of your generated test cases.'
                 : activeMenu === 'bugs' ? 'Report and track software defects in Jira or Azure DevOps.'
                 : activeMenu === 'knowledge' ? 'Manage reference documents, company QA guidelines, and historical bugs to augment test generation.'
                 : 'Leverage AI to automatically generate comprehensive test scenarios from Jira, ADO, or requirements.'}
              </p>
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={handleRefresh} 
              title="Refresh Screen"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
            >
              <RefreshCw size={18} />
              <span>Refresh</span>
            </button>
          </div>
        )}

        {message.text && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: 8, background: message.type === 'error' ? '#fdecea' : message.type === 'success' ? '#eafdf1' : '#eaf4fd', color: message.type === 'error' ? '#c0392b' : message.type === 'success' ? '#27ae60' : '#2980b9' }}>
            {message.text}
          </div>
        )}

        {activeMenu === 'settings' ? (
          <div className="settings-panel" style={{ background: 'var(--surface)', padding: 32, borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <h2 style={{ marginBottom: 24, color: 'var(--secondary)' }}>API Configuration</h2>
            
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🔌 Provider</label>
              <div style={{ display: 'flex', gap: 12 }}>
                {[
                  { id: 'groq', label: 'Groq (Cloud)' },
                  { id: 'copilot', label: 'Copilot (Cloud)' },
                  { id: 'openai', label: 'OpenAI (Cloud)' },
                  { id: 'anthropic', label: 'Anthropic (Cloud)' },
                  { id: 'gemini', label: 'Gemini (Cloud)' },
                  { id: 'ollama', label: 'Local (Ollama)' }
                ].map(p => (
                  <button 
                    key={p.id}
                    onClick={() => {
                      setProvider(p.id as any);
                      localStorage.setItem('provider', p.id);
                    }}
                    style={{ 
                      flex: 1, 
                      padding: 12, 
                      borderRadius: 8, 
                      border: `1.5px solid ${provider === p.id ? 'var(--primary)' : 'var(--border)'}`, 
                      background: provider === p.id ? 'rgba(75, 108, 183, 0.08)' : 'transparent', 
                      color: provider === p.id ? 'var(--primary)' : 'var(--text)', 
                      fontWeight: 600, 
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {provider === 'copilot' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>
                    🔗 Copilot Endpoint / Resource URL
                  </label>
                  <input 
                    type="text" 
                    placeholder="https://<resource>.openai.azure.com or https://models.inference.ai.azure.com" 
                    value={copilotEndpoint}
                    onChange={(e) => {
                      setCopilotEndpoint(e.target.value);
                      localStorage.setItem('copilot_endpoint', e.target.value);
                      setCopilotStatus('idle');
                    }}
                  />
                  <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    Supports Azure OpenAI endpoints or GitHub Copilot / Azure AI Models (<code style={{ background: '#eee', padding: '2px 4px', borderRadius: 4 }}>https://models.inference.ai.azure.com</code>).
                  </small>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>
                    🔑 Copilot API Key / Token
                  </label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input 
                      type="password" 
                      placeholder="Enter Azure OpenAI key or GitHub token..." 
                      value={copilotKey}
                      onChange={(e) => {
                        setCopilotKey(e.target.value);
                        setCopilotStatus('idle');
                      }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleTestCopilot}
                      disabled={!copilotKey || copilotStatus === 'testing'}
                    >
                      {copilotStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {copilotStatus === 'valid' && (
                    <p style={{ color: '#27ae60', marginTop: 8, fontSize: '0.9rem' }}>✓ Copilot connection successful!</p>
                  )}
                  {copilotStatus === 'invalid' && (
                    <p style={{ color: '#c0392b', marginTop: 8, fontSize: '0.9rem' }}>
                      ✗ {copilotErrorMsg || 'Connection failed. Check your endpoint, API key, and model name.'}
                    </p>
                  )}
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>
                    🤖 Copilot Model / Deployment Name
                  </label>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <select 
                      value={selectedCopilotModel}
                      onChange={(e) => {
                        setSelectedCopilotModel(e.target.value);
                        localStorage.setItem('copilot_model', e.target.value);
                      }}
                      style={{ flex: 1 }}
                    >
                      {COPILOT_MODELS.map(m => (
                        <option key={m} value={m}>{m} {m === 'gpt-4o' ? '(Recommended)' : ''}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="Or custom deployment name..."
                      value={selectedCopilotModel}
                      onChange={(e) => {
                        setSelectedCopilotModel(e.target.value);
                        localStorage.setItem('copilot_model', e.target.value);
                      }}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <small style={{ color: 'var(--muted)', display: 'block', marginTop: 4 }}>
                    Pick a standard model or enter your exact Azure deployment name.
                  </small>
                </div>
              </>
            )}

            {provider === 'groq' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🔑 Groq API Key</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input 
                      type="password" 
                      placeholder="gsk_..." 
                      value={groqKey}
                      onChange={(e) => {
                        setGroqKey(e.target.value);
                        setGroqStatus('idle');
                      }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleTestGroq}
                      disabled={!groqKey || groqStatus === 'testing'}
                    >
                      {groqStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {groqStatus === 'valid' && <p style={{ color: '#27ae60', marginTop: 8, fontSize: '0.9rem' }}>✓ Connection successful!</p>}
                  {groqStatus === 'invalid' && <p style={{ color: '#c0392b', marginTop: 8, fontSize: '0.9rem' }}>✗ Invalid API key</p>}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🤖 Groq Model</label>
                  <select 
                    value={selectedGroqModel}
                    onChange={(e) => setSelectedGroqModel(e.target.value)}
                  >
                    {GROQ_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {provider === 'openai' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🔑 OpenAI API Key</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input 
                      type="password" 
                      placeholder="sk-..." 
                      value={openaiKey}
                      onChange={(e) => {
                        setOpenaiKey(e.target.value);
                        setOpenaiStatus('idle');
                      }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleTestOpenAI}
                      disabled={!openaiKey || openaiStatus === 'testing'}
                    >
                      {openaiStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {openaiStatus === 'valid' && <p style={{ color: '#27ae60', marginTop: 8, fontSize: '0.9rem' }}>✓ Connection successful!</p>}
                  {openaiStatus === 'invalid' && <p style={{ color: '#c0392b', marginTop: 8, fontSize: '0.9rem' }}>✗ Invalid API key</p>}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🤖 OpenAI Model</label>
                  <select 
                    value={selectedOpenaiModel}
                    onChange={(e) => setSelectedOpenaiModel(e.target.value)}
                  >
                    {OPENAI_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {provider === 'anthropic' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🔑 Anthropic API Key</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input 
                      type="password" 
                      placeholder="sk-ant-..." 
                      value={anthropicKey}
                      onChange={(e) => {
                        setAnthropicKey(e.target.value);
                        setAnthropicStatus('idle');
                      }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleTestAnthropic}
                      disabled={!anthropicKey || anthropicStatus === 'testing'}
                    >
                      {anthropicStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {anthropicStatus === 'valid' && <p style={{ color: '#27ae60', marginTop: 8, fontSize: '0.9rem' }}>✓ Connection successful!</p>}
                  {anthropicStatus === 'invalid' && <p style={{ color: '#c0392b', marginTop: 8, fontSize: '0.9rem' }}>✗ Invalid API key</p>}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🤖 Anthropic Model</label>
                  <select 
                    value={selectedAnthropicModel}
                    onChange={(e) => setSelectedAnthropicModel(e.target.value)}
                  >
                    {ANTHROPIC_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {provider === 'gemini' && (
              <>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🔑 Gemini API Key</label>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <input 
                      type="password" 
                      placeholder="AIza..." 
                      value={geminiKey}
                      onChange={(e) => {
                        setGeminiKey(e.target.value);
                        setGeminiStatus('idle');
                      }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={handleTestGemini}
                      disabled={!geminiKey || geminiStatus === 'testing'}
                    >
                      {geminiStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                  {geminiStatus === 'valid' && <p style={{ color: '#27ae60', marginTop: 8, fontSize: '0.9rem' }}>✓ Connection successful!</p>}
                  {geminiStatus === 'invalid' && <p style={{ color: '#c0392b', marginTop: 8, fontSize: '0.9rem' }}>✗ Invalid API key</p>}
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🤖 Gemini Model</label>
                  <select 
                    value={selectedGeminiModel}
                    onChange={(e) => setSelectedGeminiModel(e.target.value)}
                  >
                    {GEMINI_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {provider === 'ollama' && (
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>🤖 Ollama Model</label>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <input 
                    type="text" 
                    value={ollamaModel}
                    onChange={(e) => {
                      setOllamaModel(e.target.value);
                      setOllamaStatus('idle');
                    }}
                    placeholder="e.g. llama3"
                  />
                  <button 
                    className="btn btn-primary"
                    onClick={handleTestOllama}
                    disabled={ollamaStatus === 'testing'}
                  >
                    {ollamaStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
                {ollamaStatus === 'valid' && <p style={{ color: '#27ae60', marginBottom: 8, fontSize: '0.9rem' }}>✓ Connection successful!</p>}
                {ollamaStatus === 'invalid' && <p style={{ color: '#c0392b', marginBottom: 8, fontSize: '0.9rem' }}>✗ Could not connect to Ollama</p>}
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Make sure Ollama is running locally (port 11434).</p>
              </div>
            )}

            <hr style={{ margin: '32px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

            <h2 style={{ marginBottom: 20, color: 'var(--secondary)' }}>Work Tracking Integrations (Jira & Azure DevOps)</h2>
            <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.95rem' }}>
              Configure your Jira and Azure DevOps (ADO) connections so you can fetch requirements, upload test cases, and log bugs directly to either tool.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Jira Settings Card */}
              <div style={{ padding: 20, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h3 style={{ marginBottom: 16, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🎯 Atlassian Jira
                </h3>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Jira Base URL</label>
                  <input
                    type="text"
                    placeholder="https://your-domain.atlassian.net"
                    value={jiraUrl}
                    onChange={(e) => {
                      setJiraUrl(e.target.value);
                      localStorage.setItem('jira_url', e.target.value);
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Default Project Key</label>
                  <input
                    type="text"
                    placeholder="e.g. PROJ"
                    value={jiraProjectKey}
                    onChange={(e) => {
                      setJiraProjectKey(e.target.value.toUpperCase());
                      localStorage.setItem('jira_project_key', e.target.value.toUpperCase());
                    }}
                  />
                </div>
              </div>

              {/* Azure DevOps Settings Card */}
              <div style={{ padding: 20, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <h3 style={{ marginBottom: 16, color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🔷 Azure DevOps (ADO)
                </h3>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>ADO Organization URL</label>
                  <input
                    type="text"
                    placeholder="https://dev.azure.com/your-org"
                    value={adoOrgUrl}
                    onChange={(e) => {
                      setAdoOrgUrl(e.target.value);
                      localStorage.setItem('ado_org_url', e.target.value);
                      setAdoStatus('idle');
                    }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>ADO Project Name</label>
                  <input
                    type="text"
                    placeholder="e.g. MyProject"
                    value={adoProject}
                    onChange={(e) => {
                      setAdoProject(e.target.value);
                      localStorage.setItem('ado_project', e.target.value);
                      setAdoStatus('idle');
                    }}
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.9rem' }}>Personal Access Token (PAT)</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      type="password"
                      placeholder="ADO PAT with Work Item read/write"
                      value={adoPat}
                      onChange={(e) => {
                        setAdoPat(e.target.value);
                        localStorage.setItem('ado_pat', e.target.value);
                        setAdoStatus('idle');
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={async () => {
                        if (!adoOrgUrl || !adoPat) return;
                        setAdoStatus('testing');
                        setAdoErrorMsg('');
                        try {
                          const res = await fetch('http://localhost:3001/api/test-ado', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orgUrl: adoOrgUrl, project: adoProject, pat: adoPat })
                          });
                          const data = await res.json();
                          if (res.ok && data.success) {
                            setAdoStatus('valid');
                          } else {
                            setAdoStatus('invalid');
                            setAdoErrorMsg(data.message || 'Connection failed');
                          }
                        } catch (err: any) {
                          setAdoStatus('invalid');
                          setAdoErrorMsg(err?.message || 'Connection failed');
                        }
                      }}
                      disabled={!adoOrgUrl || !adoPat || adoStatus === 'testing'}
                    >
                      {adoStatus === 'testing' ? 'Testing...' : 'Test ADO'}
                    </button>
                  </div>
                  {adoStatus === 'valid' && <p style={{ color: '#27ae60', marginTop: 6, fontSize: '0.85rem' }}>✓ ADO connection successful!</p>}
                  {adoStatus === 'invalid' && <p style={{ color: '#c0392b', marginTop: 6, fontSize: '0.85rem' }}>✗ {adoErrorMsg || 'Connection failed. Check Org URL, Project, and PAT.'}</p>}
                </div>
              </div>
            </div>
          </div>
        ) : activeMenu === 'dashboard' ? (
          <div className="dashboard-container">
            <div className="hero-section">
              <h1>Welcome to <span>AI Powered Test Orchestrator</span></h1>
            </div>

            <div className="dashboard-grid">
              {/* Test Plan Chart */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3>Test Plans Created (2026)</h3>
                </div>
                <div className="chart-body">
                  {(() => {
                    const data = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
                      const count = history.filter(h => h.type === 'plan' && new Date(h.timestamp).getMonth() === i && new Date(h.timestamp).getFullYear() === 2026).length;
                      return { month: m, value: count };
                    });
                    const max = Math.max(...data.map(d => d.value), 5);
                    return data.map(d => (
                      <div key={d.month} className="bar-wrapper">
                        <div className="bar" style={{ height: `${(d.value / max) * 100}%` }}>
                          <span className="bar-value">{d.value}</span>
                        </div>
                        <span className="bar-label">{d.month}</span>
                      </div>
                    ));
                  })()}
                </div>
                <div className="chart-footer">2026</div>
              </div>

              {/* Test Case Chart */}
              <div className="chart-card">
                <div className="chart-header">
                  <h3>Test Cases Created (2026)</h3>
                </div>
                <div className="chart-body">
                  {(() => {
                    const data = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
                      const count = history
                        .filter(h => h.type === 'cases' && new Date(h.timestamp).getMonth() === i && new Date(h.timestamp).getFullYear() === 2026)
                        .reduce((acc, h) => acc + h.count, 0);
                      return { month: m, value: count };
                    });
                    const max = Math.max(...data.map(d => d.value), 20);
                    return data.map(d => (
                      <div key={d.month} className="bar-wrapper">
                        <div className="bar" style={{ height: `${(d.value / max) * 100}%` }}>
                          <span className="bar-value">{d.value}</span>
                        </div>
                        <span className="bar-label">{d.month}</span>
                      </div>
                    ));
                  })()}
                </div>
                <div className="chart-footer">2026</div>
              </div>
            </div>

            {/* History Table */}
            <div className="history-card">
              <h3 style={{ color: 'var(--secondary)', fontWeight: 700, marginBottom: 16 }}>Generation History</h3>
              {history.length === 0 ? (
                <p style={{ color: 'var(--muted)', textAlign: 'center', padding: '20px' }}>No history found. Start generating to see metrics!</p>
              ) : (
                <div className="history-list">
                  {history.map((h, i) => (
                    <div key={i} className="history-item">
                      <div className="history-info">
                        <span className="history-title">{h.title}</span>
                        <span className="history-meta">
                          {new Date(h.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{ fontWeight: 700, color: 'var(--secondary)' }}>{h.count} {h.type === 'plan' ? 'Plan' : 'Cases'}</span>
                        <span className={`history-badge badge-${h.type}`}>{h.type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeMenu === 'execute' ? (
          <ExecutionPanel 
            testCases={testCases} 
            results={executionResults}
            onStatusChange={(id, status) => setExecutionResults(prev => ({ ...prev, [id]: status }))}
          />
        ) : activeMenu === 'bugs' ? (
          <BugPanel 
            failedCases={testCases.filter(tc => executionResults[tc.id] === 'Fail')}
            jiraUrl={jiraUrl}
            projectKey={jiraProjectKey}
            onJiraUrlChange={setJiraUrl}
            onProjectKeyChange={setJiraProjectKey}
            adoOrgUrl={adoOrgUrl}
            adoProject={adoProject}
            adoPat={adoPat}
          />
        ) : activeMenu === 'knowledge' ? (
          <KnowledgeBasePanel 
            adoOrgUrl={adoOrgUrl}
            adoProject={adoProject}
            adoPat={adoPat}
          />
        ) : (
          <>
            <div className="accordion">
          {/* Panel 1 */}
          <div className={`panel ${activePanel === 'file' ? 'expanded' : ''}`}>
            <div className="panel-header" onClick={() => togglePanel('file')}>
              <div className="panel-title">
                <UploadCloud className="panel-icon" /> 
                Upload File or Enter Jira / ADO Story ID
              </div>
              <ChevronDown className="chevron" />
            </div>
            <div className="panel-body">
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      Jira Story ID / Azure DevOps Work Item ID
                      {jiraFetchStatus === 'fetching' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Fetching details...
                        </span>
                      )}
                      {jiraFetchStatus === 'success' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#27ae60', fontWeight: 500 }}>
                          <CheckCircle2 size={13} /> {jiraStoryPreview?.source === 'ado' ? 'ADO Work Item loaded' : 'Jira Story loaded'}
                        </span>
                      )}
                      {jiraFetchStatus === 'error' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#e74c3c', fontWeight: 500 }}>
                          <XCircle size={13} /> {jiraFetchError}
                        </span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      className="jira-input"
                      placeholder="e.g. PROJ-123, #12345, or paste Jira/ADO URL" 
                      value={storyId}
                      onChange={(e) => handleStoryIdChange(e.target.value)}
                      onBlur={handleStoryIdBlur}
                      onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
                    />
                    {jiraStoryPreview && (
                      <div style={{
                        marginTop: 10,
                        padding: '10px 14px',
                        background: jiraStoryPreview.source === 'ado' ? 'rgba(0, 120, 212, 0.08)' : 'rgba(75, 108, 183, 0.06)',
                        border: `1px solid ${jiraStoryPreview.source === 'ado' ? 'rgba(0, 120, 212, 0.3)' : 'rgba(75, 108, 183, 0.2)'}`,
                        borderRadius: 8,
                        fontSize: 13,
                        color: 'var(--secondary)',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        maxHeight: 140,
                        overflowY: 'auto'
                      }}>
                        <strong style={{ color: jiraStoryPreview.source === 'ado' ? '#0078d4' : 'var(--primary)' }}>
                          {jiraStoryPreview.key}
                        </strong>
                        <br />
                        {jiraStoryPreview.details}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="form-group">
                    <label className="form-label">Upload SRS / Requirement File</label>
                    <div className="drag-drop-zone">
                      <input 
                        type="file" 
                        accept=".pdf,.docx,.txt" 
                        style={{ display: 'none' }} 
                        id="file-upload" 
                        onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                      />
                      <label htmlFor="file-upload" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <UploadCloud className="drag-drop-icon" />
                        <p style={{ color: 'var(--muted)', fontWeight: 500 }}>
                          {uploadedFile ? uploadedFile.name : 'Drop file here or click to browse'}
                        </p>
                        <p style={{ color: '#aaa', fontSize: 12, marginTop: 4 }}>Supports .pdf, .docx, .txt</p>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleGenerate('story')}
                  disabled={loading}
                >
                  {loading ? <div className="spinner" /> : <><Play size={18} /> Generate</>}
                </button>
              </div>
            </div>
          </div>

          {/* Panel 2 */}
          <div className={`panel ${activePanel === 'instructions' ? 'expanded' : ''}`}>
            <div className="panel-header" onClick={() => togglePanel('instructions')}>
              <div className="panel-title">
                <FileText className="panel-icon" /> 
                Enter Instructions
              </div>
              <ChevronDown className="chevron" />
            </div>
            <div className="panel-body">
              <div className="form-group">
                <label className="form-label">Test Case Requirements</label>
                <textarea 
                  placeholder="Describe the feature or specific scenarios you want to generate test cases for..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
              <div style={{ marginTop: 16, textAlign: 'right' }}>
                <button 
                  className="btn btn-primary" 
                  onClick={() => handleGenerate('instructions')}
                  disabled={loading}
                >
                  {loading ? <div className="spinner" /> : <><Play size={18} /> Generate</>}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {(testCases.length > 0 || testPlanContent) && (
          <div className="results-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)' }}>Generated {activeMenu === 'plan' ? 'Test Plan' : `Test Cases (${testCases.length})`}</h2>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleDownload}
                >
                  <Download size={18} /> Download
                </button>
              </div>
            </div>
            {activeMenu === 'plan' && testPlanContent ? (
              <div style={{ marginTop: 16, padding: '24px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', lineHeight: 1.6, textAlign: 'left' }} className="markdown-body">
                <ReactMarkdown>{testPlanContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="table-wrapper">
                <TestCaseTable testCases={testCases} />
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* Jira Upload Modal */}
      {showJiraModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '20px',
            width: '450px',
            padding: '32px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
            position: 'relative',
            animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px', color: 'var(--text)' }}>Upload to JIRA</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
              Specify the JIRA instance and project details for this upload.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="input-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--secondary)', marginBottom: '8px', display: 'block' }}>JIRA URL</label>
                <input 
                  type="text" 
                  placeholder="https://company.atlassian.net"
                  value={modalJiraUrl}
                  onChange={(e) => setModalJiraUrl(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--secondary)', marginBottom: '8px', display: 'block' }}>Project Key</label>
                <input 
                  type="text" 
                  placeholder="PROJ"
                  value={modalProjectKey}
                  onChange={(e) => setModalProjectKey(e.target.value.toUpperCase())}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>

              <div className="input-group">
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--secondary)', marginBottom: '8px', display: 'block' }}>Story ID</label>
                <input 
                  type="text" 
                  placeholder="PROJ-123"
                  value={modalStoryId}
                  onChange={(e) => setModalStoryId(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '12px', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowJiraModal(false)}
                style={{ flex: 1, padding: '12px', borderRadius: '12px' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={confirmJiraUpload}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'linear-gradient(135deg, #3498db, #2980b9)' }}
              >
                Confirm Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
