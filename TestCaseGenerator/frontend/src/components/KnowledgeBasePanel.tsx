import React, { useState, useEffect } from 'react';
import { 
  Database, 
  UploadCloud, 
  Trash2, 
  RefreshCw, 
  FileText, 
  Bug, 
  CheckCircle, 
  AlertCircle, 
  Layers, 
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface KnowledgeDoc {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  chunkCount: number;
  category: 'guidelines' | 'architecture' | 'api' | 'general';
}

interface HistoricalBug {
  id: string;
  title: string;
  source: 'jira' | 'ado' | 'manual';
  area?: string;
  severity?: string;
  description: string;
  syncedAt: string;
}

interface Props {
  adoOrgUrl?: string;
  adoProject?: string;
  adoPat?: string;
}

export default function KnowledgeBasePanel({ adoOrgUrl = '', adoProject = '', adoPat = '' }: Props) {
  const [activeTab, setActiveTab] = useState<'docs' | 'bugs' | 'test'>('docs');
  const [documents, setDocuments] = useState<KnowledgeDoc[]>([]);
  const [bugs, setBugs] = useState<HistoricalBug[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [syncingAdo, setSyncingAdo] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual bug entry modal / inputs
  const [manualBugId, setManualBugId] = useState('');
  const [manualBugTitle, setManualBugTitle] = useState('');
  const [manualBugDesc, setManualBugDesc] = useState('');

  // RAG Retrieval tester
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<any>(null);
  const [testingQuery, setTestingQuery] = useState(false);

  const fetchDocs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/rag/documents');
      const data = await res.json();
      if (res.ok && data.success) {
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error('[RAG] Failed to load documents:', e);
    }
  };

  const fetchBugs = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/rag/bugs');
      const data = await res.json();
      if (res.ok && data.success) {
        setBugs(data.bugs || []);
      }
    } catch (e) {
      console.error('[RAG] Failed to load bugs:', e);
    }
  };

  useEffect(() => {
    fetchDocs();
    fetchBugs();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMsg(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'guidelines');

    try {
      const res = await fetch('http://localhost:3001/api/rag/documents', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: `Document "${file.name}" indexed successfully into ${data.document.chunkCount} knowledge chunks!` });
        fetchDocs();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to index document.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error uploading document.' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document from the knowledge base?')) return;
    try {
      const res = await fetch(`http://localhost:3001/api/rag/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDocs();
      }
    } catch (e) {
      console.error('[RAG] Delete error:', e);
    }
  };

  const handleSyncAdoBugs = async () => {
    if (!adoOrgUrl || !adoPat || !adoProject) {
      setStatusMsg({ type: 'error', text: 'Please configure your ADO Organization URL, Project, and PAT in Settings first.' });
      return;
    }
    setSyncingAdo(true);
    setStatusMsg(null);
    try {
      const res = await fetch('http://localhost:3001/api/rag/sync-ado-bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgUrl: adoOrgUrl,
          project: adoProject,
          pat: adoPat,
          maxCount: 50
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatusMsg({ type: 'success', text: `Successfully indexed ${data.count} bugs from Azure DevOps project "${adoProject}"!` });
        fetchBugs();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Failed to sync ADO bugs.' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Error syncing ADO bugs.' });
    } finally {
      setSyncingAdo(false);
    }
  };

  const handleAddManualBug = async () => {
    if (!manualBugTitle.trim() || !manualBugDesc.trim()) return;
    const bugId = manualBugId.trim() || `BUG-${Date.now().toString().slice(-4)}`;
    try {
      const res = await fetch('http://localhost:3001/api/rag/bugs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bugs: [{
            id: bugId,
            title: manualBugTitle.trim(),
            description: manualBugDesc.trim(),
            source: 'manual',
            syncedAt: new Date().toISOString()
          }]
        })
      });
      if (res.ok) {
        setManualBugId('');
        setManualBugTitle('');
        setManualBugDesc('');
        fetchBugs();
        setStatusMsg({ type: 'success', text: `Added bug [${bugId}] to regression knowledge base.` });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearBugs = async () => {
    if (!confirm('Clear all indexed historical bugs?')) return;
    try {
      await fetch('http://localhost:3001/api/rag/bugs', { method: 'DELETE' });
      fetchBugs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTestQuery = async () => {
    if (!testQuery.trim()) return;
    setTestingQuery(true);
    try {
      const res = await fetch('http://localhost:3001/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testQuery })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResults(data.result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTestingQuery(false);
    }
  };

  return (
    <div className="knowledge-base-panel">
      {/* Overview Banner */}
      <div className="results-card" style={{ marginBottom: 24, background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'var(--primary)', color: 'white', padding: 12, borderRadius: 12 }}>
            <Sparkles size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', color: 'var(--secondary)', margin: 0 }}>
              Retrieval-Augmented Generation (RAG) Knowledge Base
            </h2>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0 0', fontSize: '0.95rem' }}>
              Index your company QA guidelines, specifications, and past bugs. When generating test cases, the AI automatically retrieves relevant context to maximize coverage and prevent past regressions.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <button
            onClick={() => setActiveTab('docs')}
            style={{
              padding: '10px 20px',
              borderRadius: 20,
              border: `1.5px solid ${activeTab === 'docs' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'docs' ? 'rgba(75, 108, 183, 0.12)' : 'var(--surface)',
              color: activeTab === 'docs' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <FileText size={16} /> Reference Documents ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('bugs')}
            style={{
              padding: '10px 20px',
              borderRadius: 20,
              border: `1.5px solid ${activeTab === 'bugs' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'bugs' ? 'rgba(75, 108, 183, 0.12)' : 'var(--surface)',
              color: activeTab === 'bugs' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Bug size={16} /> Historical Bugs ({bugs.length})
          </button>
          <button
            onClick={() => setActiveTab('test')}
            style={{
              padding: '10px 20px',
              borderRadius: 20,
              border: `1.5px solid ${activeTab === 'test' ? 'var(--primary)' : 'var(--border)'}`,
              background: activeTab === 'test' ? 'rgba(75, 108, 183, 0.12)' : 'var(--surface)',
              color: activeTab === 'test' ? 'var(--primary)' : 'var(--text)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            <Layers size={16} /> Test RAG Retrieval
          </button>
        </div>
      </div>

      {statusMsg && (
        <div style={{
          marginBottom: 20,
          padding: '12px 18px',
          borderRadius: 8,
          background: statusMsg.type === 'success' ? '#eafdf1' : '#fdecea',
          color: statusMsg.type === 'success' ? '#27ae60' : '#c0392b',
          border: `1px solid ${statusMsg.type === 'success' ? '#a3e9b9' : '#f5c2c7'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          {statusMsg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Tab 1: Documents */}
      {activeTab === 'docs' && (
        <div className="results-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Company Standards, API Specs & Guidelines</h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Upload QA standards, boundary rule sheets, or API specifications (.pdf, .docx, .txt, .md).
              </p>
            </div>
            <div>
              <input
                type="file"
                id="rag-file-upload"
                style={{ display: 'none' }}
                accept=".pdf,.docx,.txt,.md"
                onChange={handleFileUpload}
              />
              <label
                htmlFor="rag-file-upload"
                className="btn btn-primary"
                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                <UploadCloud size={16} />
                {uploading ? 'Chunking & Indexing...' : 'Upload Document to RAG'}
              </label>
            </div>
          </div>

          {documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.01)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              <FileText size={40} color="var(--muted)" style={{ marginBottom: 12 }} />
              <p style={{ color: 'var(--secondary)', fontWeight: 600 }}>No documents uploaded yet</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Upload your QA standards or SRS documents so the AI can reference them during test generation.
              </p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Document Name</th>
                    <th>Category</th>
                    <th>Knowledge Chunks</th>
                    <th>Date Added</th>
                    <th style={{ width: 80 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr key={doc.id}>
                      <td>
                        <strong>{doc.name}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{(doc.size / 1024).toFixed(1)} KB</div>
                      </td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 12, background: 'rgba(75, 108, 183, 0.1)', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 600 }}>
                          {doc.category.toUpperCase()}
                        </span>
                      </td>
                      <td><strong>{doc.chunkCount}</strong> chunks</td>
                      <td>{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                      <td>
                        <button
                          onClick={() => handleDeleteDoc(doc.id)}
                          style={{ background: 'transparent', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 6 }}
                          title="Delete document"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Historical Bugs */}
      {activeTab === 'bugs' && (
        <div className="results-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, color: 'var(--secondary)' }}>Historical Bug Memory (Regression Prevention)</h3>
              <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
                Sync bugs from Azure DevOps or add known past issues to enforce regression testing.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                onClick={handleSyncAdoBugs}
                disabled={syncingAdo}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <RefreshCw size={16} className={syncingAdo ? 'spin' : ''} />
                {syncingAdo ? 'Syncing ADO Bugs...' : 'Sync Bugs from ADO'}
              </button>
              {bugs.length > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={handleClearBugs}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#c0392b' }}
                >
                  <Trash2 size={16} /> Clear All
                </button>
              )}
            </div>
          </div>

          {/* Quick manual bug adder */}
          <div style={{ padding: 16, background: 'rgba(0, 120, 212, 0.04)', borderRadius: 8, border: '1px solid rgba(0, 120, 212, 0.2)', marginBottom: 20 }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--secondary)', fontSize: '0.95rem' }}>+ Add Key Known Past Bug / Edge Case</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 2fr 100px', gap: 10 }}>
              <input
                type="text"
                placeholder="ID (e.g. BUG-01)"
                value={manualBugId}
                onChange={e => setManualBugId(e.target.value)}
              />
              <input
                type="text"
                placeholder="Title / Summary..."
                value={manualBugTitle}
                onChange={e => setManualBugTitle(e.target.value)}
              />
              <input
                type="text"
                placeholder="Root cause, repro details or edge-case..."
                value={manualBugDesc}
                onChange={e => setManualBugDesc(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleAddManualBug}
                disabled={!manualBugTitle || !manualBugDesc}
              >
                Add
              </button>
            </div>
          </div>

          {bugs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(0,0,0,0.01)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              <Bug size={40} color="var(--muted)" style={{ marginBottom: 12 }} />
              <p style={{ color: 'var(--secondary)', fontWeight: 600 }}>No historical bugs indexed yet</p>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                Click <strong>"Sync Bugs from ADO"</strong> to pull recent defects from your project, or add notable regression defects above.
              </p>
            </div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Bug ID</th>
                    <th>Summary</th>
                    <th>Source</th>
                    <th>Area / Severity</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {bugs.map((b, i) => (
                    <tr key={i}>
                      <td><strong style={{ color: '#c0392b' }}>{b.id}</strong></td>
                      <td><strong>{b.title}</strong></td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 10, background: b.source === 'ado' ? 'rgba(0, 120, 212, 0.1)' : 'rgba(75, 108, 183, 0.1)', color: b.source === 'ado' ? '#0078d4' : 'var(--primary)', fontSize: '0.75rem', fontWeight: 700 }}>
                          {b.source.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{b.area || 'General'} / {b.severity || 'Medium'}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--muted)', maxWidth: 300 }}>{b.description.slice(0, 120)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: RAG Retrieval Tester */}
      {activeTab === 'test' && (
        <div className="results-card">
          <h3 style={{ margin: '0 0 8px 0', color: 'var(--secondary)' }}>Preview RAG Retrieval for Any Requirement</h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Enter a feature or scenario to see which document chunks and historical bugs would be automatically retrieved and injected into the AI prompt.
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <input
              type="text"
              placeholder="e.g. Sub-code fee billing or Budgeted Hours validation"
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTestQuery(); }}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleTestQuery}
              disabled={!testQuery.trim() || testingQuery}
            >
              {testingQuery ? 'Retrieving...' : 'Test Retrieval'}
            </button>
          </div>

          {testResults && (
            <div>
              <h4 style={{ color: 'var(--secondary)', marginBottom: 12 }}>
                Retrieval Matches ({testResults.docChunks.length} Doc Chunks, {testResults.relevantBugs.length} Historical Bugs)
              </h4>

              {testResults.docChunks.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h5 style={{ color: 'var(--primary)', marginBottom: 8 }}>📄 Matched Document Guidelines</h5>
                  {testResults.docChunks.map((c: any, i: number) => (
                    <div key={i} style={{ padding: 12, borderRadius: 8, background: 'rgba(75, 108, 183, 0.05)', border: '1px solid rgba(75, 108, 183, 0.2)', marginBottom: 8 }}>
                      <strong style={{ color: 'var(--secondary)' }}>From: {c.docName}</strong> (Score: {c.score.toFixed(2)})
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'var(--text)' }}>{c.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {testResults.relevantBugs.length > 0 && (
                <div>
                  <h5 style={{ color: '#c0392b', marginBottom: 8 }}>🐛 Matched Historical Regression Bugs</h5>
                  {testResults.relevantBugs.map((b: any, i: number) => (
                    <div key={i} style={{ padding: 12, borderRadius: 8, background: 'rgba(192, 57, 43, 0.05)', border: '1px solid rgba(192, 57, 43, 0.2)', marginBottom: 8 }}>
                      <strong style={{ color: '#c0392b' }}>[{b.id}] {b.title}</strong> (Score: {b.score.toFixed(2)})
                      <p style={{ margin: '6px 0 0 0', fontSize: '0.9rem', color: 'var(--text)' }}>{b.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {!testResults.docChunks.length && !testResults.relevantBugs.length && (
                <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
                  No high-confidence matches found for this query. Add more documents or sync bugs to expand the knowledge base.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
