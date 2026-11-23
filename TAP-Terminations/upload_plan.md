# Plan: Uploading TAP Test Cases to Azure DevOps

The objective is to upload 15 test cases from `terminations_test_cases.md` to Azure DevOps (TAP 2.0).

## Current Status
- [x] Read test cases from `terminations_test_cases.md`.
- [i] Attempted browser automation: Reached login screen for `bhawna.arora@protivitiglobal.in`.
- [!] `mcp-ado` configuration found in `mcp_config.json` but it lacks a Personal Access Token (PAT) and is currently inactive.

## Proposed Steps

### Option A: Use Browser Automation (Playwright)
1. **User Action Required**: Please log in to Azure DevOps in the browser window if prompted, or ensure you are logged in.
2. **Continue Upload**: Once logged in, I will use the browser subagent to:
   - Navigate to the Test Plan defined by `planId=29213&suiteId=29214`.
   - Iterate through each of the 15 test cases.
   - Click "New Test Case", enter details, and save.

### Option B: Use Azure DevOps MCP Server (Recommended for speed)
1. **User Action Required**: Provide/Add an `AZURE_DEVOPS_PERSONAL_ACCESS_TOKEN` to the `env` section of `mcp-ado` in `mcp_config.json`.
2. **Execute Upload**: I will use the specialized `mcp-ado` tools to bulk-create the test cases directly via API.

## Pending Information
- Which option do you prefer? 
- If Option B, please add the PAT to `mcp_config.json`.
- If Option A, please confirm you are logged in or provide assistance with the login screen.
