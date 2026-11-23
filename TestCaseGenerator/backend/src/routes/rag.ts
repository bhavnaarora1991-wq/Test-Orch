import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as mammoth from 'mammoth';
import {
  getKnowledgeDocuments,
  addKnowledgeDocument,
  deleteKnowledgeDocument,
  getHistoricalBugs,
  addHistoricalBugs,
  clearHistoricalBugs,
  retrieveRagContext
} from '../services/ragService';
import { extractPdfText } from '../utils/pdfExtractor';
import { syncAdoBugsToRag } from '../services/adoBugSyncService';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Document Endpoints ──────────────────────────────────────────────────────

router.get('/documents', (_req: Request, res: Response) => {
  try {
    const docs = getKnowledgeDocuments();
    res.json({ success: true, documents: docs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/documents', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    let text = req.body.text || '';
    let name = req.body.name || 'Untitled Document';
    const category = req.body.category || 'general';

    if (req.file) {
      name = req.file.originalname;
      const ext = name.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') {
        text = await extractPdfText(req.file.buffer);
      } else if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = result.value;
      } else if (ext === 'txt' || ext === 'md') {
        text = req.file.buffer.toString('utf-8');
      } else {
        res.status(400).json({ error: 'Unsupported format. Use .pdf, .docx, .txt, or .md' });
        return;
      }
    }

    if (!text.trim()) {
      res.status(400).json({ error: 'Document content is empty.' });
      return;
    }

    const doc = addKnowledgeDocument(name, text, category);
    res.json({ success: true, document: doc });
  } catch (error: any) {
    console.error('[RAG] Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/documents/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    deleteKnowledgeDocument(id);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Historical Bugs Endpoints ──────────────────────────────────────────────

router.get('/bugs', (_req: Request, res: Response) => {
  try {
    const bugs = getHistoricalBugs();
    res.json({ success: true, bugs });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/bugs', (req: Request, res: Response) => {
  try {
    const bugs = req.body.bugs || [];
    if (!Array.isArray(bugs) || !bugs.length) {
      res.status(400).json({ error: 'bugs array is required.' });
      return;
    }
    const addedCount = addHistoricalBugs(bugs);
    res.json({ success: true, addedCount, totalBugs: getHistoricalBugs().length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/bugs', (_req: Request, res: Response) => {
  try {
    clearHistoricalBugs();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sync bugs directly from Azure DevOps (ADO)
router.post('/sync-ado-bugs', async (req: Request, res: Response): Promise<void> => {
  try {
    const { orgUrl, project, pat, maxCount } = req.body;
    if (!orgUrl || !pat || !project) {
      res.status(400).json({ error: 'orgUrl, project, and pat are required.' });
      return;
    }
    const result = await syncAdoBugsToRag({ orgUrl, project, pat }, maxCount || 50);
    res.json({ success: true, count: result.count, totalBugs: getHistoricalBugs().length });
  } catch (error: any) {
    console.error('[RAG] ADO Bug sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Query Preview Endpoint (For testing retrieval) ─────────────────────────

router.post('/query', (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    const result = retrieveRagContext(query || '');
    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
