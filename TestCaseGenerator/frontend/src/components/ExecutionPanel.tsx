import React, { useState } from 'react';
import { Play, Save, CheckCircle, XCircle, AlertCircle, Clock, MinusCircle } from 'lucide-react';
import { TestCase } from '../types/testCase';

export type ExecutionStatus = 'Not Started' | 'In Progress' | 'Pass' | 'Fail' | 'Blocked' | 'Not Applicable';

interface Props {
  testCases: TestCase[];
  results: Record<string, ExecutionStatus>;
  onStatusChange: (id: string, status: ExecutionStatus) => void;
}

export default function ExecutionPanel({ testCases, results, onStatusChange }: Props) {
  const [mode, setMode] = useState<'manual' | 'automation'>('manual');
  const [executingId, setExecutingId] = useState<string | null>(null);

  const statusOptions: ExecutionStatus[] = [
    'Not Started',
    'In Progress',
    'Pass',
    'Fail',
    'Blocked',
    'Not Applicable'
  ];

  const getStatusIcon = (status: ExecutionStatus) => {
    switch (status) {
      case 'Pass': return <CheckCircle size={16} color="#27ae60" />;
      case 'Fail': return <XCircle size={16} color="#c0392b" />;
      case 'Blocked': return <AlertCircle size={16} color="#f39c12" />;
      case 'In Progress': return <Clock size={16} color="#2980b9" />;
      case 'Not Applicable': return <MinusCircle size={16} color="#7f8c8d" />;
      default: return <Clock size={16} color="#bdc3c7" />;
    }
  };

  const runAutomation = async (id: string) => {
    setExecutingId(id);
    onStatusChange(id, 'In Progress');
    
    // Simulate Playwright automation delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate random result for demo purposes
    const resultOptions: ExecutionStatus[] = ['Pass', 'Pass', 'Fail', 'Pass'];
    const randomResult = resultOptions[Math.floor(Math.random() * resultOptions.length)];
    
    onStatusChange(id, randomResult);
    setExecutingId(null);
  };

  const handleSave = () => {
    alert('Results are automatically saved as you execute!');
  };

  if (testCases.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <p style={{ color: 'var(--muted)' }}>No test cases available to execute. Please generate test cases first.</p>
      </div>
    );
  }

  return (
    <div className="execution-panel">
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
        <button 
          className={`btn ${mode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('manual')}
          style={{ flex: 1 }}
        >
          Execute Manually
        </button>
        <button 
          className={`btn ${mode === 'automation' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setMode('automation')}
          style={{ flex: 1 }}
        >
          Execute with Automation
        </button>
      </div>

      <div className="results-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)' }}>
            {mode === 'manual' ? 'Execute Manually and Save' : 'Execute with automation'}
          </h2>
          {mode === 'manual' && (
            <button className="btn btn-primary" onClick={handleSave} style={{ opacity: 0.8 }}>
              <Save size={18} /> Auto-Saving...
            </button>
          )}
        </div>

        <div className="table-wrapper">
          <table className="test-table">
            <thead>
              <tr>
                <th style={{ width: '100px' }}>ID</th>
                <th>Test Scenario</th>
                <th style={{ width: '180px' }}>Status</th>
                {mode === 'automation' && <th style={{ width: '120px' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {testCases.map((tc) => (
                <tr key={tc.id}>
                  <td><strong>{tc.id}</strong></td>
                  <td>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{tc.summary}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{tc.testSteps?.substring(0, 100)}...</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {mode === 'manual' ? (
                        <select 
                          value={results[tc.id] || 'Not Started'} 
                          onChange={(e) => onStatusChange(tc.id, e.target.value as ExecutionStatus)}
                          style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                        >
                          {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, fontSize: '0.9rem' }}>
                          {getStatusIcon(results[tc.id] || 'Not Started')}
                          {results[tc.id] || 'Not Started'}
                        </span>
                      )}
                    </div>
                  </td>
                  {mode === 'automation' && (
                    <td>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => runAutomation(tc.id)}
                        disabled={executingId !== null}
                      >
                        {executingId === tc.id ? 'Running...' : <><Play size={14} /> Run</>}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
