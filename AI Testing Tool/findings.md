# Findings — TestCaseGenerator

## Status: BLUEPRINT APPROVED — DEVELOPMENT IN PROGRESS

---

## Research & Discoveries

### Core Purpose
- Generate **API test cases** and **Web Application test cases**
- Covers both **Functional** and **Non-Functional** test types
- Takes a **Jira requirement** as input and produces test cases in **Jira tabular format**

### Input Mechanism
- User copies and pastes Jira requirement text directly into the chat/UI
- No file upload required (at least for MVP)

### Output Format
- Test cases in **Jira-compatible tabular format**
- Columns expected (Jira standard): Test Case ID, Summary, Description, Steps, Expected Result, Priority, Type, etc.

### Target Users
- **Software Testing Professionals** (QA Engineers, Test Analysts)

### AI / LLM Backbone
- **Ollama API** — local LLM inference (privacy-first, no cloud dependency)
- Model TBD (likely `llama3`, `mistral`, or `codellama` — to be confirmed with user)

### Tech Stack
- **Frontend**: React (TypeScript)
- **Backend**: Node.js + TypeScript
- **LLM Integration**: Ollama REST API (default: http://localhost:11434)

### Project Type
- **Greenfield** — no existing codebase

---

## Constraints
- Ollama must be installed and running locally on the user's machine
- LLM model must be pulled into Ollama before use
- Output must strictly follow Jira tabular format
- No cloud LLM calls — fully local

---

## Open Questions — RESOLVED ✅
- [x] **Model**: User picks from dropdown (lists all locally available Ollama models)
- [x] **Export**: Download as CSV **and** Excel (.xlsx)
- [x] **Editable**: No — read-only table
- [x] **Test case count**: Fixed at **15** per generation
- [x] **Column schema**: Same Jira columns for both API and Web App

---

## Dependencies & Integrations
- `Ollama` — local LLM runtime
- `React` — frontend framework
- `Node.js + TypeScript` — backend API server
- `Express.js` (or Fastify) — HTTP server for backend
- Jira test case format definitions
