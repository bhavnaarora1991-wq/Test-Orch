import * as XLSX from 'xlsx';
import { TestCase } from '../types/testCase';

interface Props {
  testCases: TestCase[];
}

function toRows(testCases: TestCase[]) {
  return testCases.map((tc) => ({
    'Test Case ID': tc.id,
    Summary: tc.summary,
    Preconditions: tc.preconditions,
    'Test Steps': tc.testSteps,
    'Expected Result': tc.expectedResult,
    'Test Type': tc.testType,
    Priority: tc.priority,
    Category: tc.category,
  }));
}

function downloadCSV(testCases: TestCase[]) {
  const ws = XLSX.utils.json_to_sheet(toRows(testCases));
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `test_cases_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXLSX(testCases: TestCase[]) {
  const ws = XLSX.utils.json_to_sheet(toRows(testCases));
  // Auto-width columns
  const cols = Object.keys(toRows(testCases)[0]).map((k) => ({
    wch: Math.max(k.length, 20),
  }));
  ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
  XLSX.writeFile(wb, `test_cases_${Date.now()}.xlsx`);
}

export default function ExportBar({ testCases }: Props) {
  return (
    <div className="export-bar">
      <span className="export-label">📤 Export:</span>
      <button
        id="export-csv"
        className="btn-export csv"
        onClick={() => downloadCSV(testCases)}
        type="button"
      >
        📄 Download CSV
      </button>
      <button
        id="export-xlsx"
        className="btn-export xlsx"
        onClick={() => downloadXLSX(testCases)}
        type="button"
      >
        📊 Download Excel (.xlsx)
      </button>
    </div>
  );
}
