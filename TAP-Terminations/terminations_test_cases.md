# TAP-Terminations: Comprehensive Test Case Grid

This document outlines the functional and non-functional test cases for the **Terminations Testing App**, covering positive and negative scenarios based on the observed application UI and requirements.

| ID | Category | Test Type | Test Case Description | Steps to Reproduce | Expected Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-001** | Functional | Positive | **Successful Sidebar Access** | 1. Navigate to Home Screen.<br>2. Click the **Begin** button. | The "Input Form" sidebar slides out from the right side of the screen. |
| **TC-002** | Functional | Positive | **Engagement MD Lookup** | 1. Click "Begin".<br>2. Type a valid email part in **Engagement MD Email**. | The system performs a fuzzy search and displays matching organization users. |
| **TC-003** | Functional | Positive | **Valid Zip File Attachment** | 1. Click "Begin".<br>2. Attach a `.zip` file containing `Input Form.xlsx`. | The attachment is accepted and the "There is nothing attached" message disappears. |
| **TC-004** | Functional | Negative | **Invalid Attachment Format** | 1. Click "Begin".<br>2. Attempt to attach a `.pdf` or `.xlsx` file directly (not zipped). | The system should display a validation error or ignore the file (Zip files only). |
| **TC-005** | Functional | Negative | **Missing Mandatory Fields** | 1. Click "Begin".<br>2. Fill all fields except **Project ID Number**.<br>3. Check the "Submit" button state. | The **Submit** button remains disabled/grayed out. |
| **TC-006** | Functional | Negative | **Missing 'Input Form.xlsx'** | 1. Click "Begin".<br>2. Attach a `.zip` file *without* `Input Form.xlsx`. | The system should flag the missing mandatory Excel file before allowing submission. |
| **TC-007** | Functional | Positive | **Cancel Functionality** | 1. Click "Begin".<br>2. Fill in partial data.<br>3. Click the **Cancel** button (bottom right). | The sidebar closes and the user is returned to the Home screen with no data saved. |
| **TC-008** | Functional | Positive | **Submit Button Activation Logic** | 1. Fill all mandatory fields (Proj ID, MD Email, Sensitivity).<br>2. Attach valid Zip.<br>3. Toggle chargeback agreement. | The **Submit** button becomes clickable only after the final agreement is checked. |
| **TC-009** | Non-Functional | Performance | **Sidebar Load Time** | 1. Click "Begin" and measure response time. | The Input Form sidebar should appear within 2 seconds. |
| **TC-010** | Non-Functional | Usability | **Responsive Scrolling (Sidebar)** | 1. Open the sidebar on a standard viewport.<br>2. Scroll to the bottom. | All form elements (Chargeback, Submit, Cancel) should be accessible via scrolling. |
| **TC-011** | Non-Functional | Reliability | **Network Timeout Handling** | 1. Disable network connection.<br>2. Try to search for a user in "Engagement MD Email". | A user-friendly error message ("Error when trying to retrieve data") should appear. |
| **TC-012** | Functional | Negative | **File Size Limit Violation** | 1. Attempt to upload a `.zip` file exceeding **50MB**. | The app should prevent the upload and display a "50MB Maximum File Size" warning. |
| **TC-013** | Functional | Positive | **Fuzzy Match Sensitivity Levels** | 1. Click the **Matching Sensitivity** dropdown. | List reveals selectable levels (High, Medium, Low) and sets the selected value. |
| **TC-014** | Functional | Positive | **External Support Link** | 1. Click **"Find Your TAP Champion"** in the footer. | The system navigates to the relevant support page/contact list. |
| **TC-015** | Functional | Negative | **Invalid Project ID Format** | 1. Enter special characters/symbols in **Project ID**. | The system should validate the format against billing requirements (if applicable). |

---

### **Note on Requirements Verification**
*   **Zip Requirement**: Confirmed via UI label ("Please attach a single Zip file only").
*   **Mandatory Files**: Confirmed via UI label ("Must include 'Input Form.xlsx'").
*   **Billing Link**: Confirmed via **Project Codes** button visibility.
