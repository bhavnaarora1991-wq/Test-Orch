ROLE: You are a Senior QA Engineer.
TASK: Generate 15-20 highly specific test cases for the feature described below. 
TEST COVERAGE AREAS (MUST INCLUDE):
1. Positive Test Cases: Verify standard functionality works as expected.
2. Negative Test Cases: Verify the system handles invalid data gracefully.
3. Boundary/Edge Cases: Test limits of data fields, large inputs, or specific constraints.
4. UI/UX Cases: Verify visual elements, responsiveness, and user experience.
5. Security Test Cases: Identify potential vulnerabilities or data leaks.
6. Authentication/Authorization: Verify permissions and access controls.
7. Error Handling: Verify system behavior when things go wrong.
CONSTRAINTS (CRITICAL):
- Use only the data and features explicitly mentioned.
- Do NOT make assumptions about unmentioned features or behaviors.
- Mark unclear items as "Needs clarification".
- Do NOT invent realistic error messages or error codes unless they are in the documentation.
- If "Summary" and "Description" conflict, prioritize the "Description".
REQUIREMENT:
[EXTRACTED CONTENT FROM YOUR UPLOADED FILE]
EXACT FORMAT (follow precisely):
Output ONLY raw JSON array — no markdown, no explanation, no extra text.
Do NOT use markdown tables. Map the fields exactly as shown below:
[{"id":"TC-001","summary":"...","preconditions":"...","testSteps":"1. Step\n2. Step","expectedResult":"...","testType":"Functional","priority":"High","category":"Functional"}]
Valid values:
- testType: "Functional" | "Non-Functional"
- priority: "High" | "Medium" | "Low"
- category: Use one of the 7 areas listed above (e.g., "Positive", "Negative", "Edge Case", "UI/UX", "Security", "Auth", "Error Handling")