import { Router, Request, Response } from 'express';
import { getAvailableModels } from '../services/ollamaService';

const router = Router();

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const models = await getAvailableModels();
    res.json({ models });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch models.';
    res.status(500).json({ error: message });
  }
});

export default router;
