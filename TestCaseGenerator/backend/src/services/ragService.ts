import fs from 'fs';
import path from 'path';

export interface KnowledgeDocument {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  chunkCount: number;
  category: 'guidelines' | 'architecture' | 'api' | 'general';
}

export interface DocumentChunk {
  docId: string;
  docName: string;
  chunkIndex: number;
  text: string;
}

export interface HistoricalBug {
  id: string;           // e.g. "BUG-101" or "ADO-402"
  title: string;
  source: 'jira' | 'ado' | 'manual';
  area?: string;
  severity?: string;
  description: string;
  syncedAt: string;
}

interface StorageData {
  documents: KnowledgeDocument[];
  chunks: DocumentChunk[];
  bugs: HistoricalBug[];
}

const STORAGE_DIR = path.join(process.cwd(), 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'rag_store.json');

function ensureStorage(): StorageData {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORAGE_FILE)) {
    const initial: StorageData = { documents: [], chunks: [], bugs: [] };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  } catch {
    return { documents: [], chunks: [], bugs: [] };
  }
}

function saveStorage(data: StorageData) {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/** Simple text chunking by paragraph and sentence boundaries with overlap */
export function chunkText(text: string, chunkSize = 500, overlap = 100): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    let end = start + chunkSize;
    if (end < cleaned.length) {
      // Find nearest punctuation or newline to break gracefully
      const nextBreak = cleaned.slice(start, end + 100).search(/(\n\n|\.\s|\?\s|!\s)/);
      if (nextBreak !== -1) {
        end = start + nextBreak + 1;
      }
    }
    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length > 20) {
      chunks.push(chunk);
    }
    start += (chunkSize - overlap);
  }
  return chunks;
}

/** Token-level BM25-like scoring for local retrieval without heavy native C++ dependencies */
function scoreSimilarity(query: string, text: string): number {
  const tokenize = (s: string) =>
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);

  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;

  const textTokens = tokenize(text);
  const textFreq: Record<string, number> = {};
  for (const t of textTokens) {
    textFreq[t] = (textFreq[t] || 0) + 1;
  }

  let score = 0;
  for (const q of queryTokens) {
    if (textFreq[q]) {
      // Term frequency weighting
      score += 1 + Math.log(textFreq[q]);
      // Bonus if exact phrase or term is in title/header
      if (text.toLowerCase().includes(q)) {
        score += 0.5;
      }
    }
  }
  return score;
}

// ─── Public API: Document Management ─────────────────────────────────────────

export function getKnowledgeDocuments(): KnowledgeDocument[] {
  return ensureStorage().documents;
}

export function addKnowledgeDocument(
  name: string,
  fullText: string,
  category: KnowledgeDocument['category'] = 'general'
): KnowledgeDocument {
  const store = ensureStorage();
  const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const textChunks = chunkText(fullText);

  const doc: KnowledgeDocument = {
    id,
    name,
    size: fullText.length,
    uploadedAt: new Date().toISOString(),
    chunkCount: textChunks.length,
    category
  };

  const newChunks: DocumentChunk[] = textChunks.map((c, i) => ({
    docId: id,
    docName: name,
    chunkIndex: i,
    text: c
  }));

  store.documents.push(doc);
  store.chunks.push(...newChunks);
  saveStorage(store);

  return doc;
}

export function deleteKnowledgeDocument(id: string): boolean {
  const store = ensureStorage();
  store.documents = store.documents.filter(d => d.id !== id);
  store.chunks = store.chunks.filter(c => c.docId !== id);
  saveStorage(store);
  return true;
}

// ─── Public API: Historical Bug Management ──────────────────────────────────

export function getHistoricalBugs(): HistoricalBug[] {
  return ensureStorage().bugs;
}

export function addHistoricalBugs(bugs: HistoricalBug[]): number {
  const store = ensureStorage();
  const existingIds = new Set(store.bugs.map(b => b.id));
  let addedCount = 0;

  for (const bug of bugs) {
    if (!existingIds.has(bug.id)) {
      store.bugs.push(bug);
      existingIds.add(bug.id);
      addedCount++;
    }
  }

  saveStorage(store);
  return addedCount;
}

export function clearHistoricalBugs(): void {
  const store = ensureStorage();
  store.bugs = [];
  saveStorage(store);
}

// ─── Public API: RAG Retrieval ──────────────────────────────────────────────

export interface RagContextResult {
  docChunks: Array<{ docName: string; text: string; score: number }>;
  relevantBugs: Array<HistoricalBug & { score: number }>;
  hasContext: boolean;
}

export function retrieveRagContext(query: string, topKDocs = 3, topKBugs = 3): RagContextResult {
  const store = ensureStorage();
  if (!query || !query.trim()) {
    return { docChunks: [], relevantBugs: [], hasContext: false };
  }

  // 1. Retrieve most relevant document chunks
  const scoredChunks = store.chunks.map(chunk => ({
    docName: chunk.docName,
    text: chunk.text,
    score: scoreSimilarity(query, chunk.text)
  }))
  .filter(c => c.score > 0.5)
  .sort((a, b) => b.score - a.score)
  .slice(0, topKDocs);

  // 2. Retrieve most relevant historical bugs
  const scoredBugs = store.bugs.map(bug => ({
    ...bug,
    score: scoreSimilarity(query, `${bug.title} ${bug.description} ${bug.area || ''}`)
  }))
  .filter(b => b.score > 0.5)
  .sort((a, b) => b.score - a.score)
  .slice(0, topKBugs);

  return {
    docChunks: scoredChunks,
    relevantBugs: scoredBugs,
    hasContext: scoredChunks.length > 0 || scoredBugs.length > 0
  };
}

/** Format retrieved RAG context into an LLM prompt block */
export function buildRagPromptBlock(rag: RagContextResult): string {
  if (!rag.hasContext) return '';

  let block = '\n\n=== RETRIEVED INSTITUTIONAL KNOWLEDGE (RAG CONTEXT) ===\n';

  if (rag.docChunks.length > 0) {
    block += '\n[COMPANY QA GUIDELINES & SPECIFICATION REFERENCES]:\n';
    rag.docChunks.forEach((chunk, i) => {
      block += `--- Source: ${chunk.docName} (Snippet ${i + 1}) ---\n${chunk.text}\n\n`;
    });
  }

  if (rag.relevantBugs.length > 0) {
    block += '\n[SIMILAR HISTORICAL DEFECTS (REGRESSION FOCUS)]:';
    block += '\n*CRITICAL*: Ensure you generate specific test cases to prevent recurrence of these past bugs:\n';
    rag.relevantBugs.forEach((bug, i) => {
      block += `${i + 1}. [${bug.id}] ${bug.title}\n   Details: ${bug.description.slice(0, 200)}\n`;
    });
  }

  block += '=== END OF RAG CONTEXT ===\n';
  return block;
}
