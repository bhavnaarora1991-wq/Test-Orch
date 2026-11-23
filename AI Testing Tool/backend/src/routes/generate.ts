import { Router, Request, Response } from 'express';
import { generateTestCases } from '../services/ollamaService';
import { generateWithGroq } from '../services/groqService';

const router = Router();

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { requirement, model, provider, apiKey } = req.body as {
    requirement?: string;
    model?: string;
    provider?: 'ollama' | 'groq';
    apiKey?: string;
  };

  if (!requirement?.trim()) {
    res.status(400).json({ error: 'Requirement text is required.' });
    return;
  }
  if (!model?.trim()) {
    res.status(400).json({ error: 'Model name is required.' });
    return;
  }

  try {
    let testCases;
    if (provider === 'groq') {
      if (!apiKey) {
        res.status(400).json({ error: 'Groq API Key is required.' });
        return;
      }
      testCases = await generateWithGroq(requirement, model, apiKey);
    } else {
      testCases = await generateTestCases(requirement, model);
    }
    res.json({ testCases, count: testCases.length });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error during generation.';
    res.status(500).json({ error: message });
  }
});

export default router;
