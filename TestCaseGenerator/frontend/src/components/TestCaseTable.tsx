import { TestCase } from '../types/testCase';

interface Props {
  testCases: TestCase[];
}

function TypeBadge({ t }: { t: string }) {
  return (
    <span className={`badge ${t === 'Functional' ? 'badge-func' : 'badge-nfunc'}`}>{t}</span>
  );
}

export default function TestCaseTable({ testCases }: Props) {
  // Grouping cases by category
  const groupedCases = testCases.reduce((acc, tc) => {
    const category = tc.category || 'General';
    if (!acc[category]) acc[category] = [];
    acc[category].push(tc);
    return acc;
  }, {} as Record<string, TestCase[]>);

  const categories = Object.keys(groupedCases);

  return (
    <div className="table-wrap">
      {categories.map(category => (
        <div key={category} className="category-section" style={{ marginBottom: '32px' }}>
          <div style={{ 
            background: 'var(--primary)', 
            color: 'white', 
            padding: '8px 16px', 
            borderRadius: '6px 6px 0 0',
            fontWeight: 700,
            fontSize: '1.1rem',
            display: 'inline-block',
            marginBottom: '-1px'
          }}>
            {category.toUpperCase()} ({groupedCases[category].length})
          </div>
          <table className="test-table" style={{ borderTop: '2px solid var(--primary)' }}>
            <thead>
              <tr>
                <th style={{ width: '80px' }}>ID</th>
                <th>Summary</th>
                <th>Preconditions</th>
                <th style={{ width: '25%' }}>Test Steps</th>
                <th>Expected Result</th>
                <th style={{ width: '120px' }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {groupedCases[category].map((tc) => (
                <tr key={tc.id}>
                  <td><span className="tc-id">{tc.id}</span></td>
                  <td><span className="tc-summary" style={{ fontWeight: 600 }}>{tc.summary}</span></td>
                  <td>{tc.preconditions}</td>
                  <td>
                    <div className="tc-steps" style={{ whiteSpace: 'pre-line' }}>{tc.testSteps}</div>
                  </td>
                  <td>{tc.expectedResult}</td>
                  <td><TypeBadge t={tc.testType} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
