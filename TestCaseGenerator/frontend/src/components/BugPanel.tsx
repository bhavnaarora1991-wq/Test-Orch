import React, { useState } from 'react';
import { Bug, Send, Globe, CheckCircle, Loader2 } from 'lucide-react';
import { TestCase } from '../types/testCase';

interface Props {
  failedCases: TestCase[];
  jiraUrl: string;
  projectKey: string;
  onJiraUrlChange: (url: string) => void;
  onProjectKeyChange: (key: string) => void;
  adoOrgUrl?: string;
  adoProject?: string;
  adoPat?: string;
}

export default function BugPanel({
  failedCases,
  jiraUrl,
  projectKey,
  onJiraUrlChange,
  onProjectKeyChange,
  adoOrgUrl = '',
  adoProject = '',
  adoPat = ''
}: Props) {
  const [targetPlatform, setTargetPlatform] = useState<'jira' | 'ado'>('jira');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [reportStatus, setReportStatus] = useState<Record<string, 'success' | 'error'>>({});
  const [reportMsg, setReportMsg] = useState<Record<string, string>>({});

  const logBug = async (tc: TestCase) => {
    setLoading(prev => ({ ...prev, [tc.id]: true }));
    setReportMsg(prev => ({ ...prev, [tc.id]: '' }));

    try {
      if (targetPlatform === 'ado') {
        const res = await fetch('http://localhost:3001/api/log-ado-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgUrl: adoOrgUrl,
            project: adoProject,
            pat: adoPat,
            summary: `BUG: ${tc.summary}`,
            description: `Failed Test Case: ${tc.id}\nPre-conditions: ${tc.preconditions}\nSteps to Reproduce:\n${tc.testSteps}\n\nExpected Result: ${tc.expectedResult}\nActual Result: (Failed in execution tool)`,
            priority: tc.priority === 'High' ? 'Highest' : tc.priority === 'Low' ? 'Low' : 'Medium'
          }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setReportStatus(prev => ({ ...prev, [tc.id]: 'success' }));
          setReportMsg(prev => ({ ...prev, [tc.id]: `Logged to ADO (#${data.id})` }));
        } else {
          setReportStatus(prev => ({ ...prev, [tc.id]: 'error' }));
          setReportMsg(prev => ({ ...prev, [tc.id]: data.error || 'Failed to log to ADO' }));
        }
      } else {
        // Jira Bug
        const res = await fetch('http://localhost:3001/api/log-bug', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectKey: projectKey,
            summary: `BUG: ${tc.summary}`,
            description: `*Failed Test Case:* ${tc.id}\n*Pre-conditions:* ${tc.preconditions}\n*Steps to Reproduce:*\n${tc.testSteps}\n\n*Expected Result:* ${tc.expectedResult}\n*Actual Result:* (Failing in execution tool)`,
            priority: tc.priority === 'High' ? 'Highest' : tc.priority === 'Low' ? 'Low' : 'Medium'
          }),
        });

        if (res.ok) {
          setReportStatus(prev => ({ ...prev, [tc.id]: 'success' }));
          setReportMsg(prev => ({ ...prev, [tc.id]: 'Logged to Jira' }));
        } else {
          setReportStatus(prev => ({ ...prev, [tc.id]: 'error' }));
          setReportMsg(prev => ({ ...prev, [tc.id]: 'Failed to log to Jira' }));
        }
      }
    } catch (err: any) {
      setReportStatus(prev => ({ ...prev, [tc.id]: 'error' }));
      setReportMsg(prev => ({ ...prev, [tc.id]: err?.message || 'Error logging bug' }));
    } finally {
      setLoading(prev => ({ ...prev, [tc.id]: false }));
    }
  };

  const handleJiraUrlUpdate = (value: string) => {
    try {
      if (value.startsWith('http')) {
        const url = new URL(value);
        onJiraUrlChange(`${url.protocol}//${url.hostname}`);
      } else {
        onJiraUrlChange(value);
      }
    } catch {
      onJiraUrlChange(value);
    }
  };

  const handleProjectKeyUpdate = (value: string) => {
    const keyMatch = value.match(/\/projects\/([A-Za-z]+)/);
    if (keyMatch) {
      onProjectKeyChange(keyMatch[1].toUpperCase());
    } else {
      onProjectKeyChange(value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10));
    }
  };

  const isTargetConfigured = targetPlatform === 'ado' ? Boolean(adoOrgUrl && adoPat && adoProject) : Boolean(jiraUrl && projectKey);

  return (
    <div className="bug-panel">
      {/* Target Selector Card */}
      <div className="results-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Globe size={24} color="var(--primary)" /> Bug Tracking Target
          </h2>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => setTargetPlatform('jira')}
              style={{
                padding: '8px 18px',
                borderRadius: 20,
                border: `1.5px solid ${targetPlatform === 'jira' ? 'var(--primary)' : 'var(--border)'}`,
                background: targetPlatform === 'jira' ? 'rgba(75, 108, 183, 0.1)' : 'transparent',
                color: targetPlatform === 'jira' ? 'var(--primary)' : 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🎯 Atlassian Jira
            </button>
            <button
              onClick={() => setTargetPlatform('ado')}
              style={{
                padding: '8px 18px',
                borderRadius: 20,
                border: `1.5px solid ${targetPlatform === 'ado' ? '#0078d4' : 'var(--border)'}`,
                background: targetPlatform === 'ado' ? 'rgba(0, 120, 212, 0.1)' : 'transparent',
                color: targetPlatform === 'ado' ? '#0078d4' : 'var(--text)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔷 Azure DevOps (ADO)
            </button>
          </div>
        </div>

        {targetPlatform === 'jira' ? (
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>Jira Instance URL</label>
              <input 
                type="text" 
                placeholder="https://company.atlassian.net" 
                value={jiraUrl}
                onChange={(e) => handleJiraUrlUpdate(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ width: 220 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, color: 'var(--secondary)' }}>Project Key (Letters only)</label>
              <input 
                type="text" 
                placeholder="e.g., MSB" 
                value={projectKey}
                onChange={(e) => handleProjectKeyUpdate(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', background: 'rgba(0, 120, 212, 0.05)', borderRadius: 8, border: '1px solid rgba(0, 120, 212, 0.2)' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--secondary)', margin: 0 }}>
              <strong>ADO Target:</strong> {adoOrgUrl || '(Not configured)'} / <strong>Project:</strong> {adoProject || '(Not configured)'}
            </p>
            {!isTargetConfigured && (
              <small style={{ color: '#c0392b', display: 'block', marginTop: 4 }}>
                ⚠️ Please configure your ADO Organization URL, Project, and PAT in <strong>Settings</strong> first.
              </small>
            )}
          </div>
        )}
      </div>

      <div className="results-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Bug size={32} color="#c0392b" /> Log Bugs for Failed Cases ({failedCases.length})
          </h2>
        </div>

        {failedCases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(0,0,0,0.02)', borderRadius: 8 }}>
            <CheckCircle size={48} color="#27ae60" style={{ marginBottom: 16 }} />
            <p style={{ color: 'var(--muted)' }}>No failed test cases found. Great job!</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="test-table">
              <thead>
                <tr>
                  <th style={{ width: 100 }}>ID</th>
                  <th>Failed Scenario</th>
                  <th style={{ width: 120 }}>Priority</th>
                  <th style={{ width: 200 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {failedCases.map(tc => (
                  <tr key={tc.id}>
                    <td><strong>{tc.id}</strong></td>
                    <td>{tc.summary}</td>
                    <td><span className={`badge ${tc.priority.toLowerCase()}`}>{tc.priority}</span></td>
                    <td>
                      {reportStatus[tc.id] === 'success' ? (
                        <span style={{ color: '#27ae60', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                          <CheckCircle size={16} /> {reportMsg[tc.id] || 'Logged successfully'}
                        </span>
                      ) : (
                        <button 
                          className="btn btn-primary" 
                          style={{ padding: '6px 16px', fontSize: '0.85rem' }}
                          onClick={() => logBug(tc)}
                          disabled={loading[tc.id] || !isTargetConfigured}
                        >
                          {loading[tc.id] ? (
                            <Loader2 size={16} className="spin" />
                          ) : (
                            <><Send size={14} /> Log to {targetPlatform === 'ado' ? 'ADO' : 'Jira'}</>
                          )}
                        </button>
                      )}
                      {reportStatus[tc.id] === 'error' && (
                        <p style={{ color: '#c0392b', fontSize: '0.75rem', marginTop: 4 }}>
                          {reportMsg[tc.id] || 'Failed to log bug'}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
