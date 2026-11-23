export interface TestCase {
  id: string;
  summary: string;
  preconditions: string;
  testSteps: string;
  expectedResult: string;
  testType: 'Functional' | 'Non-Functional';
  priority: 'High' | 'Medium' | 'Low';
  category: string;
}
