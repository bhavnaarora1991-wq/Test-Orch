import React, { useState, useRef, useCallback } from 'react';
import { Image, Plus, Trash2, Play, Download, RefreshCw, Loader2, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';

export interface AcceptanceCriterion {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
}

interface Props {
  provider: string;
  model: string;
  apiKey: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  Functional:    { bg: 'rgba(75, 108, 183, 0.12)',  color: '#4b6cb7' },
  Validation:    { bg: 'rgba(230, 126, 34, 0.12)',  color: '#d35400' },
  'UI/UX':       { bg: 'rgba(142, 68, 173, 0.12)', color: '#8e44ad' },
  Security:      { bg: 'rgba(231, 76, 60, 0.12)',   color: '#c0392b' },
  Performance:   { bg: 'rgba(22, 160, 133, 0.12)',  color: '#1abc9c' },
  Accessibility: { bg: 'rgba(52, 152, 219, 0.12)',  color: '#2980b9' },
  Navigation:    { bg: 'rgba(46, 204, 113, 0.12)',  color: '#27ae60' },
  Data:          { bg: 'rgba(241, 196, 15, 0.15)',  color: '#c9a600' },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  High:   { bg: 'rgba(231,76,60,0.1)',    color: '#c0392b' },
  Medium: { bg: 'rgba(230,126,34,0.1)',   color: '#d35400' },
  Low:    { bg: 'rgba(46,204,113,0.1)',   color: '#27ae60' },
};

function getCatStyle(cat: string) {
  return CATEGORY_COLORS[cat] || { bg: 'rgba(127,140,141,0.12)', color: '#7f8c8d' };
}
function getPrStyle(p: string) {
  return PRIORITY_COLORS[p] || { bg: 'rgba(127,140,141,0.12)', color: '#7f8c8d' };
}

export default function AcceptanceCriteriaPanel({ provider, model, apiKey }: Props) {
  const [description, setDescription] = useState('');
  const [wireframes, setWireframes] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const [filterCat, setFilterCat] = useState('All');
  const [filterPri, setFilterPri] = useState('All');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const newFiles = [...wireframes, ...imageFiles].slice(0, 5); // max 5 images
    setWireframes(newFiles);

    // Generate preview URLs
    const newUrls = newFiles.map(f => URL.createObjectURL(f));
    setPreviewUrls(newUrls);
  };

  const removeImage = useCallback((idx: number) => {
    setWireframes(prev => prev.filter((_, i) => i !== idx));
    setPreviewUrls(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    const newFiles = [...wireframes, ...files].slice(0, 5);
    setWireframes(newFiles);
    setPreviewUrls(newFiles.map(f => URL.createObjectURL(f)));
  }, [wireframes]);

  const handleGenerate = async () => {
    if (!description.trim()) {
      setMessage({ text: 'Please enter a feature description.', type: 'error' });
      return;
    }
    setLoading(true);
    setMessage({ text: '', type: '' });
    setCriteria([]);

    try {
      const formData = new FormData();
      formData.append('description', description.trim());
      formData.append('provider', provider);
      formData.append('model', model);
      if (apiKey) formData.append('apiKey', apiKey);
      wireframes.forEach(f => formData.append('wireframes', f));

      const res = await fetch('http://localhost:3001/api/acceptance-criteria', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setCriteria(data.criteria || []);
      setMessage({ text: `Generated ${data.count} Acceptance Criteria successfully!`, type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message || 'An error occurred.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setDescription('');
    setWireframes([]);
    setPreviewUrls([]);
    setCriteria([]);
    setMessage({ text: '', type: '' });
    setFilterCat('All');
    setFilterPri('All');
  };

  const handleDownload = () => {
    if (!criteria.length) return;
    const headers = ['ID', 'Category', 'Priority', 'Title', 'Description'];
    const rows = criteria.map(ac => [
      `"${ac.id}"`,
      `"${ac.category}"`,
      `"${ac.priority}"`,
      `"${ac.title.replace(/"/g, '""')}"`,
      `"${ac.description.replace(/"/g, '""')}"`
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'acceptance_criteria.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ text: 'Acceptance Criteria downloaded as CSV!', type: 'success' });
  };

  const categories = ['All', ...Array.from(new Set(criteria.map(c => c.category)))];
  const priorities = ['All', 'High', 'Medium', 'Low'];

  const filtered = criteria.filter(ac =>
    (filterCat === 'All' || ac.category === filterCat) &&
    (filterPri === 'All' || ac.priority === filterPri)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Input Panel ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #eef2ff 0%, #f3e8ff 100%)',
          borderBottom: '1px solid rgba(75, 108, 183, 0.1)',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <Image size={20} color="var(--primary)" />
          <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--secondary)' }}>
            Wireframes &amp; Description
          </span>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {/* Description */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 8, color: 'var(--secondary)' }}>
              Feature Description *
            </label>
            <textarea
              placeholder="Describe the feature, user flow, or screen you want Acceptance Criteria for. Example: 'User Registration page with email, password, confirm password fields, terms checkbox, and a submit button. On success show a verification email sent message.'"
              value={description}
              onChange={e => setDescription(e.target.value)}
              style={{ minHeight: 110, resize: 'vertical', width: '100%' }}
            />
          </div>

          {/* Wireframe Upload */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 500, marginBottom: 8, color: 'var(--secondary)' }}>
              Wireframe Images <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional, up to 5 images)</span>
            </label>

            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 'var(--radius)',
                padding: '24px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--surface)',
                transition: 'all 0.2s',
                marginBottom: wireframes.length ? 16 : 0
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary)';
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(75,108,183,0.03)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)';
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Image size={32} color="var(--primary)" style={{ marginBottom: 8 }} />
              <p style={{ color: 'var(--muted)', fontWeight: 500, margin: '4px 0' }}>
                Drop wireframes here or click to browse
              </p>
              <p style={{ color: '#aaa', fontSize: 12 }}>Supports PNG, JPG, GIF, WebP (max 20 MB each)</p>
            </div>

            {/* Preview Grid */}
            {wireframes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {previewUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#f8f9fa' }}>
                    <img
                      src={url}
                      alt={`Wireframe ${i + 1}`}
                      style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                    />
                    <button
                      onClick={e => { e.stopPropagation(); removeImage(i); }}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: '50%',
                        width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'white'
                      }}
                      title="Remove image"
                    >
                      <Trash2 size={12} />
                    </button>
                    <div style={{ padding: '4px 8px', fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {wireframes[i].name}
                    </div>
                  </div>
                ))}
                {wireframes.length < 5 && (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--border)', borderRadius: 8, height: 156,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', color: 'var(--muted)', gap: 6, transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <Plus size={20} />
                    <span style={{ fontSize: 12 }}>Add more</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Message */}
          {message.text && (
            <div style={{
              marginBottom: 16, padding: '12px 16px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 10,
              background: message.type === 'error' ? '#fdecea' : '#eafdf1',
              color: message.type === 'error' ? '#c0392b' : '#27ae60',
              fontSize: '0.9rem'
            }}>
              {message.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px' }}>
              <RefreshCw size={16} /> Reset
            </button>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px' }}
            >
              {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Generating...</> : <><Play size={18} /> Generate AC</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── Results Grid ── */}
      {criteria.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          {/* Results Header */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--secondary)', margin: 0 }}>
                Acceptance Criteria
                <span style={{ marginLeft: 10, fontSize: '0.9rem', fontWeight: 600, background: 'rgba(75,108,183,0.1)', color: 'var(--primary)', padding: '2px 10px', borderRadius: 20 }}>
                  {filtered.length} / {criteria.length}
                </span>
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
                High-level acceptance criteria generated from your wireframes &amp; description
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Category filter */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select
                  value={filterCat}
                  onChange={e => setFilterCat(e.target.value)}
                  style={{ padding: '7px 32px 7px 12px', fontSize: '0.85rem', borderRadius: 8, border: '1px solid var(--border)', appearance: 'none', background: 'var(--surface)', cursor: 'pointer', minWidth: 130 }}
                >
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: 'var(--muted)' }} />
              </div>

              {/* Priority filter */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select
                  value={filterPri}
                  onChange={e => setFilterPri(e.target.value)}
                  style={{ padding: '7px 32px 7px 12px', fontSize: '0.85rem', borderRadius: 8, border: '1px solid var(--border)', appearance: 'none', background: 'var(--surface)', cursor: 'pointer', minWidth: 120 }}
                >
                  {priorities.map(p => <option key={p}>{p}</option>)}
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: 'var(--muted)' }} />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleDownload}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: '0.9rem' }}
              >
                <Download size={16} /> Export CSV
              </button>
            </div>
          </div>

          {/* Grid */}
          <div style={{ padding: 24 }}>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>No criteria match the selected filters.</p>
            ) : (
              <div className="ac-grid">
                {filtered.map(ac => {
                  const catStyle = getCatStyle(ac.category);
                  const prStyle = getPrStyle(ac.priority);
                  return (
                    <div key={ac.id} className="ac-card">
                      {/* Card header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--muted)', letterSpacing: '0.04em' }}>{ac.id}</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span style={{ padding: '2px 9px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: catStyle.bg, color: catStyle.color }}>
                            {ac.category}
                          </span>
                          <span style={{ padding: '2px 9px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: prStyle.bg, color: prStyle.color }}>
                            {ac.priority}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 style={{ fontSize: '0.97rem', fontWeight: 700, color: 'var(--secondary)', marginBottom: 8, lineHeight: 1.35 }}>{ac.title}</h3>

                      {/* Description */}
                      <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>{ac.description}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
