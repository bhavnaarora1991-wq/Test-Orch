# AI Testing Tool - Compilation of User Prompts

This document tracks all the specific requirements and design prompts provided by the user during the development and refinement of the AI Powered Testing Tool.

---

### 1. 🐛 Bug Fixes & Initial Refinements
- "Failed to log bug appears on clicking the button" - *Initial bug report.*
- "Save Results button not working and not saving the results" - *Fixing data persistence.*

### 2. 🧠 Test Case Generation logic
> "While generating the test cases from all the three ways, make sure it should include:
> 1. Positive Test Cases
> 2. Negative Test Cases
> 3. Boundary/Edge Cases
> 4. UI/UX Case
> 5. Security Test Cases
> 6. Authentication/Authorization
> 7. Error handling
> 
> **Constraints:**
> - Use the mode that is selected by user
> - No assumptions about unmentioned features
> - Mark unclear items as 'Needs clarification'
> - Do NOT invent error messages or codes"

### 3. 📊 Data Formatting & Sequencing
- "Remove the Priority column from this and Categorize the cases based on Type/Category"
- "The Test Case ID should be in sequence"
- "In ID column, it should display proper sequence: TC_001, TC_002, TC_003"

### 4. 📂 Export & Integration Workflow
- "On clicking Download button, it should download in the CSV format"
- "On clicking to upload to JIRA button, it should ask for the JIRA URL and Project Key, where to upload"
- "On clicking Confirm Upload, it should redirect to the the provided URL and upload the cases there"
- "Remove the button upload to JIRA" - *Final pivoting to local export focus.*

### 5. 🎨 Dashboard & UI Enhancements
- "Move the content up, keep it in center and remove text By Protiviti"
- "Add 2 bar charts:"
    - **Y-Axis:** Test plan created, **X-Axis:** Month names (Jan to Dec), **Bottom:** 2026.
    - **Y-Axis:** Test cases created, **X-Axis:** Month names (Jan to Dec), **Bottom:** 2026.
    - *Logic:* Should fetch data based upon actual test plans and cases created.
- "History should be saved with Date and Time for test plan creation and test case creation."

---
*Last updated: 2026-04-09*
