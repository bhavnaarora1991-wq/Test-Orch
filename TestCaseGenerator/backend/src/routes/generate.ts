import { Router, Request, Response } from 'express';
import { generateTestCases, testOllamaConnection } from '../services/ollamaService';
import { generateWithGroq, testGroqConnection } from '../services/groqService';
import { generateWithOpenAI, testOpenAIConnection } from '../services/openaiService';
import { generateWithAnthropic, testAnthropicConnection } from '../services/anthropicService';
import { generateWithGemini, testGeminiConnection } from '../services/geminiService';
import { generateWithCopilot, testCopilotConnection } from '../services/copilotService';
import multer from 'multer';
import * as mammoth from 'mammoth';
import { fetchJiraStory, uploadTestCaseToJira, createJiraBug } from '../services/mcpClient';
import { retrieveRagContext, buildRagPromptBlock } from '../services/ragService';
import { extractPdfText } from '../utils/pdfExtractor';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    let reqRequirement = req.body.requirement;
    const model = req.body.model;
    const provider = req.body.provider;
    const apiKey = req.body.apiKey;
    const endpoint = req.body.endpoint;
    const type = req.body.type;

    if (req.file) {
      let fileText = '';
      const ext = req.file.originalname.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') {
        fileText = await extractPdfText(req.file.buffer);
      } else if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        fileText = result.value;
      } else if (ext === 'txt') {
        fileText = req.file.buffer.toString('utf-8');
      } else {
        res.status(400).json({ error: 'Unsupported file type. Use .pdf, .docx, or .txt' });
        return;
      }

      // Truncate large files to ~4000 chars (~1000 tokens) to stay within model limits
      const MAX_FILE_CHARS = 4000;
      if (fileText.length > MAX_FILE_CHARS) {
        console.warn(`[generate] File too large (${fileText.length} chars), truncating to ${MAX_FILE_CHARS} chars.`);
        fileText = fileText.slice(0, MAX_FILE_CHARS) + '\n\n[...content truncated for token limit]';
      }

      // Combine existing requirement with file context
      reqRequirement = reqRequirement ? `${reqRequirement}\n\nFile Content:\n${fileText}` : fileText;
    }

    if (!reqRequirement?.trim()) {
      res.status(400).json({ error: 'Requirement text or file is required.' });
      return;
    }

    // Use pre-fetched Jira details if the frontend already retrieved them
    const prefetchedJiraDetails = req.body.jiraDetails;

    if (typeof reqRequirement === 'string' && reqRequirement.startsWith('JIRA:')) {
      const issueKey = reqRequirement.replace('JIRA:', '').trim();

      if (prefetchedJiraDetails) {
        // Fast path: frontend already fetched the story – use it directly
        console.log(`[Jira] Using pre-fetched details for issue: ${issueKey}`);
        reqRequirement = prefetchedJiraDetails;
      } else {
        // Fallback: fetch from MCP with a timeout guard
        try {
          console.log(`[Jira] Fetching details for issue: ${issueKey}`);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Jira fetch timeout (10s)')), 10000)
          );
          const jiraDetails = await Promise.race([fetchJiraStory(issueKey), timeoutPromise]);
          console.log(`[Jira] Successfully fetched details. Length: ${jiraDetails.length}`);
          reqRequirement = jiraDetails;
        } catch (e) {
          console.error('[Jira] Error or timeout fetching story details:', e);
          reqRequirement = `Jira Story: ${issueKey}\n(Story details could not be fetched — generate test cases for a story with this ID.)`;
        }
      }
    }

    // RAG Augmentation: retrieve relevant guideline chunks & past defects based on requirement
    let augmentedRequirement = reqRequirement;
    try {
      const ragContext = retrieveRagContext(reqRequirement);
      if (ragContext.hasContext) {
        console.log(`[RAG] Retrieved ${ragContext.docChunks.length} doc chunks & ${ragContext.relevantBugs.length} related past bugs.`);
        const ragBlock = buildRagPromptBlock(ragContext);
        augmentedRequirement = `${reqRequirement}${ragBlock}`;
      }
    } catch (e) {
      console.warn('[RAG] Retrieval failed, proceeding with original requirement:', e);
    }

    // Final safety: cap total requirement length before sending to any LLM
    const MAX_REQ_CHARS = 8000;
    if (augmentedRequirement.length > MAX_REQ_CHARS) {
      console.warn(`[generate] Requirement too long (${augmentedRequirement.length} chars), capping at ${MAX_REQ_CHARS}.`);
      augmentedRequirement = augmentedRequirement.slice(0, MAX_REQ_CHARS) + '\n\n[...truncated]';
    }
    console.log(`[generate] Final requirement length (with RAG): ${augmentedRequirement.length} chars`);

    let result;
    if (provider === 'copilot') {
      console.log('[generate] Calling Copilot Service...');
      if (!apiKey) {
        res.status(400).json({ error: 'Copilot API Key / Token is required.' });
        return;
      }
      result = await generateWithCopilot(augmentedRequirement, model, apiKey, endpoint || '', type || 'cases');
    } else if (provider === 'groq') {
      console.log('[generate] Calling Groq Service...');
      if (!apiKey) {
        res.status(400).json({ error: 'Groq API Key is required.' });
        return;
      }
      result = await generateWithGroq(augmentedRequirement, model, apiKey, type || 'cases');
    } else if (provider === 'openai') {
      console.log('[generate] Calling OpenAI Service...');
      if (!apiKey) {
        res.status(400).json({ error: 'OpenAI API Key is required.' });
        return;
      }
      result = await generateWithOpenAI(augmentedRequirement, model, apiKey, type || 'cases');
    } else if (provider === 'anthropic') {
      console.log('[generate] Calling Anthropic Service...');
      if (!apiKey) {
        res.status(400).json({ error: 'Anthropic API Key is required.' });
        return;
      }
      result = await generateWithAnthropic(augmentedRequirement, model, apiKey, type || 'cases');
    } else if (provider === 'gemini') {
      console.log('[generate] Calling Gemini Service...');
      if (!apiKey) {
        res.status(400).json({ error: 'Gemini API Key is required.' });
        return;
      }
      result = await generateWithGemini(augmentedRequirement, model, apiKey, type || 'cases');
    } else {
      console.log('[generate] Calling Ollama Service...');
      result = await generateTestCases(augmentedRequirement, model, type || 'cases');
    }
    console.log('[generate] Generation successful, sending response.');
    if (type === 'plan') {
      res.json({ testPlan: result });
    } else {
      res.json({ testCases: result, count: result.length });
    }
  } catch (error: unknown) {
    console.error('Generation error:', error);
    const message =
      error instanceof Error ? error.message : 'Unknown error during generation.';
    res.status(500).json({ error: message });
  }
});

router.post('/test-ollama', async (req: Request, res: Response) => {
  const success = await testOllamaConnection();
  res.json({ success });
});

router.post('/test-groq', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  const success = await testGroqConnection(apiKey);
  res.json({ success });
});

router.post('/test-openai', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  const success = await testOpenAIConnection(apiKey);
  res.json({ success });
});

router.post('/test-anthropic', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  const success = await testAnthropicConnection(apiKey);
  res.json({ success });
});

router.post('/test-gemini', async (req: Request, res: Response) => {
  const { apiKey } = req.body;
  const success = await testGeminiConnection(apiKey);
  res.json({ success });
});

router.post('/log-bug', async (req: Request, res: Response) => {
  try {
    const result = await createJiraBug(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upload-cases', async (req: Request, res: Response) => {
  try {
    const { testCases, storyId } = req.body;
    console.log(`[Jira] Received request to upload ${testCases.length} cases to story: ${storyId}`);
    
    const results = [];
    for (const tc of testCases) {
      const res = await uploadTestCaseToJira(tc, storyId);
      results.push(res);
    }
    
    res.json({ success: true, count: results.length });
  } catch (error: any) {
    console.error('[Jira] Bulk upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
