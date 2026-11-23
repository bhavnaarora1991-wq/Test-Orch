import streamlit as st
import pandas as pd
import zipfile
import email
from email import policy
from email.parser import BytesParser
import re
import io

st.set_page_config(page_title="Approved Data Extractor", layout="wide")

st.markdown("""
<style>
    /* Gradient heading mapping to light purple, light blue, and gray */
    h1.custom-heading {
        background: linear-gradient(to right, #a29bfe, #74b9ff, #b2bec3);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-weight: 800;
        font-size: 3.2rem;
        padding-bottom: 5px;
        margin-bottom: 5px;
    }
    
    /* Subheading / Formal info text */
    .formal-text {
        color: #7f8fa6;
        font-size: 1.1rem;
        font-family: 'Segoe UI', sans-serif;
        margin-bottom: 25px;
        border-bottom: 1px solid #e0e0e0;
        padding-bottom: 20px;
    }

    /* Override simple gray label items */
    .stMultiSelect label, .stFileUploader label {
        color: #718093 !important;
        font-weight: 600 !important;
        font-size: 1.05rem !important;
    }
</style>
""", unsafe_allow_html=True)

st.markdown("<h1 class='custom-heading'>Approved Data Extractor</h1>", unsafe_allow_html=True)
st.markdown("<div class='formal-text'>Upload your archived email batch (.zip) to automatically extract, filter, and export approval data into a structured format.</div>", unsafe_allow_html=True)

# File uploader
uploaded_file = st.file_uploader("Upload Zip of eml files", type=["zip"])

# Multiselect for column extraction
all_columns = ["Email Id", "Access", "Approved By", "Approved On", "Source"]
selected_columns = st.multiselect(
    "Information to extract",
    options=all_columns,
    default=all_columns
)

if st.button("Generate"):
    if uploaded_file is not None:
        extracted_data = []
        
        # Open the uploaded zip file directly from memory
        with zipfile.ZipFile(uploaded_file, 'r') as z:
            for file_name in z.namelist():
                # Only process .eml files
                if file_name.lower().endswith(".eml"):
                    with z.open(file_name) as fp:
                        msg = BytesParser(policy=policy.compat32).parse(fp)
                    
                    # Parse the message body
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            ctype = part.get_content_type()
                            disp = str(part.get("Content-Disposition", ""))
                            # Grab plaintext or HTML parts
                            if ctype in ("text/plain", "text/html") and "attachment" not in disp:
                                try: body = part.get_payload(decode=True).decode(part.get_content_charset() or 'utf-8', errors='replace')
                                except: body = part.get_payload(decode=True).decode('latin-1', errors='replace')
                                break
                    else:
                        try: body = msg.get_payload(decode=True).decode(msg.get_content_charset() or 'utf-8', errors='replace')
                        except: body = msg.get_payload(decode=True).decode('latin-1', errors='replace')

                    # Remove HTML tags and entities
                    clean_body = re.sub(r'<[^>]+>', ' ', body)
                    clean_body = re.sub(r'&nbsp;', ' ', clean_body)

                    # Usually replies have "On [date] [person] wrote:" or "______________" - focus on the top part
                    top_body = clean_body.split("________________________________")[0]
                    # Another common delimiter
                    top_body = re.split(r'On\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)', top_body)[0].strip()
                    
                    is_approved = bool(re.search(r'\bapproved\b', top_body, re.IGNORECASE))
                    
                    # Skip if the top message doesn't contain "approved"
                    if not is_approved:
                        continue
                        
                    # Extract the approver (from the 'From' field of the reply)
                    approver = email.utils.parseaddr(msg.get('From', ''))[0] or email.utils.parseaddr(msg.get('From', ''))[1]
                    
                    # Extract Date
                    raw_date = msg.get('Date', '')
                    try:
                        parsed_dt = email.utils.parsedate_to_datetime(raw_date)
                        approval_date = parsed_dt.strftime('%d-%b-%Y')
                    except:
                        approval_date = raw_date.strip()

                    # Extract Requester 
                    # Generally the 'To' field in the reply is the original requester
                    requester = email.utils.parseaddr(msg.get("To", ""))[1]
                    
                    # But we also fall-back to looking at who wrote the original email if available
                    wrote_match = re.search(r'<\s*([^\s<>]+@[^\s<>]+)\s*>\s*wrote', clean_body, re.IGNORECASE)
                    if wrote_match:
                        requester = wrote_match.group(1)
                        
                    # Extract Role requested
                    role_match = re.search(r'role\s*["\u201c\u2018\x93]?([^"\u201d\u2019\x94]+)["\u201d\u2019\x94]?', clean_body, re.IGNORECASE)
                    access_role = role_match.group(1).strip() if role_match else 'N/A'
                    access_role = access_role.strip('.').strip()

                    # Add row
                    extracted_data.append({
                        "Email Id": requester,
                        "Access": access_role,
                        "Approved By": approver,
                        "Approved On": approval_date,
                        "Source": file_name
                    })
        
        # Render the result if we got any data
        if extracted_data:
            df = pd.DataFrame(extracted_data)
            
            # Filter the displayed table by the selected columns in the multiselect
            if selected_columns:
                df = df[selected_columns]
            else:
                st.warning("No columns selected for extraction.")
                
            st.success("Successfully processed ZIP file.")
            
            # Display Table
            st.dataframe(df, use_container_width=True)
            
            # Export to CSV
            csv = df.to_csv(index=False).encode('utf-8')
            st.download_button(
                label="Download as CSV",
                data=csv,
                file_name='extracted_approvals.csv',
                mime='text/csv',
            )
        else:
            st.warning("No approved requests found in the uploaded zip file.")
    else:
        st.error("Please upload a Zip file first.")
