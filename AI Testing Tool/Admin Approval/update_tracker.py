"""
Admin Approval Tracker Updater
-------------------------------
Reads the approval reply .eml file, extracts key fields,
and appends a new row to the Approved Tracker.xlsx file.

Extracted from:
  - Approval Request.eml   -> requester email, access role
  - Re Approval Request.eml -> approver name/email, approval date, "Approved" check
"""

import email
import re
from email import policy
from email.parser import BytesParser
from datetime import datetime
import openpyxl
import os

# ── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
REQUEST_EML = os.path.join(BASE_DIR, "Approval Request.eml")
REPLY_EML   = os.path.join(BASE_DIR, "Re Approval Request.eml")
EXCEL_FILE  = os.path.join(BASE_DIR, "Approved Tracker.xlsx")


# ── Helper: load & parse an EML file ─────────────────────────────────────────
def parse_eml(path):
    with open(path, "rb") as f:
        msg = BytesParser(policy=policy.compat32).parse(f)
    return msg


# ── Helper: extract plain-text body ──────────────────────────────────────────
def get_plain_body(msg):
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp  = str(part.get("Content-Disposition", ""))
            if ctype == "text/plain" and "attachment" not in disp:
                charset = part.get_content_charset() or "utf-8"
                try:
                    return part.get_payload(decode=True).decode(charset, errors="replace")
                except Exception:
                    return part.get_payload(decode=True).decode("latin-1", errors="replace")
    else:
        charset = msg.get_content_charset() or "utf-8"
        return msg.get_payload(decode=True).decode(charset, errors="replace")


# ── Step 1: Parse the original request email ─────────────────────────────────
print("Parsing original request email...")
req_msg  = parse_eml(REQUEST_EML)
req_from = email.utils.parseaddr(req_msg.get("From", ""))[1]   # requester email
req_body = get_plain_body(req_msg)

# Extract role from body:  for the role "Admin"
role_match = re.search(r'role\s*["\u201c\u2018\x93]?([^"\u201d\u2019\x94\n]+)["\u201d\u2019\x94]?', req_body, re.IGNORECASE)
access_role = role_match.group(1).strip().strip('"').strip('\u201d').strip('\u201c') if role_match else "N/A"

print(f"  Requester Email : {req_from}")
print(f"  Access Role     : {access_role}")


# ── Step 2: Parse the reply / approval email ──────────────────────────────────
print("\nParsing approval reply email...")
rep_msg   = parse_eml(REPLY_EML)
rep_body  = get_plain_body(rep_msg)

# Check for "Approved" keyword (case-insensitive) only in top portion of reply
# (before the quoted original message separator)
top_body = rep_body.split("________________________________")[0].strip()
is_approved = bool(re.search(r'\bapproved\b', top_body, re.IGNORECASE))

if not is_approved:
    print("  [!] 'Approved' keyword NOT found in the reply email top section.")
    print("     Tracker will NOT be updated.")
    exit(0)

print("  [OK] 'Approved' keyword found.")

# Approver: the From field of the reply email
approver_full = email.utils.parseaddr(rep_msg.get("From", ""))
approver_name  = approver_full[0] or approver_full[1]   # prefer display name
approver_email = approver_full[1]
who_approved   = approver_name if approver_name else approver_email

# Approval date: parse the Date header
raw_date = rep_msg.get("Date", "")
try:
    parsed_dt    = email.utils.parsedate_to_datetime(raw_date)
    approval_date = parsed_dt.strftime("%d-%b-%Y")          # e.g. 17-Apr-2026
except Exception:
    approval_date = raw_date.strip()

print(f"  Who Approved    : {who_approved} <{approver_email}>")
print(f"  Approval Date   : {approval_date}")


# ── Step 3: Update the Excel file ────────────────────────────────────────────
print(f"\nUpdating Excel tracker: {EXCEL_FILE}")

wb = openpyxl.load_workbook(EXCEL_FILE)
ws = wb.active

# Find the header row to locate correct columns
header_row = None
col_map    = {}
for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), start=1):
    for j, cell in enumerate(row, start=1):
        if cell and isinstance(cell, str):
            key = cell.strip().lower()
            if "email" in key:
                col_map["email"]    = j
            elif "access" in key:
                col_map["access"]   = j
            elif "who approved" in key or "approved by" in key:
                col_map["approved"] = j
            elif "approval date" in key or "date" in key:
                col_map["date"]     = j
            elif "comment" in key:
                col_map["comment"]  = j
    if col_map:
        header_row = i
        break

if not col_map:
    print("  [!] Could not find header columns in the Excel file. Please check column names.")
    exit(1)

print(f"  Header found at row {header_row}: {col_map}")

# Find the next empty row (after header)
next_row = ws.max_row + 1

# Write values into the correct columns
def write_cell(row, col_key, value):
    if col_key in col_map:
        ws.cell(row=row, column=col_map[col_key], value=value)

write_cell(next_row, "email",    req_from)
write_cell(next_row, "access",   access_role)
write_cell(next_row, "approved", who_approved)
write_cell(next_row, "date",     approval_date)

wb.save(EXCEL_FILE)
print("\n[SUCCESS] Tracker updated at row " + str(next_row) + "!")
print("   Email ID      : " + req_from)
print("   Access        : " + access_role)
print("   Who Approved  : " + who_approved)
print("   Approval Date : " + approval_date)
