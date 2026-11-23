# Amazon.in Signup Test Cases

Here is a list of positive and negative test cases for the Amazon.in signup process, keeping in mind standard e-commerce signup flows.

## Positive Test Cases

1. **Successful Signup with Valid Email:** Verify that a user can successfully create an account using a valid, unregistered email address, a valid name, and a password meeting all requirements.
2. **Successful Signup with Valid Mobile Number:** Verify that a user can successfully create an account using a valid, 10-digit unregistered mobile number, valid name, and a valid password, completing the OTP verification process.
3. **Password Validation Criteria Met:** Verify that the system accepts a new password that meets the stated criteria (e.g., minimum 6 characters).
4. **Resend OTP Functionality:** Verify that the "Resend OTP" button works correctly when signing up via mobile number and delivers a new valid OTP to the user.
5. **Navigation and Redirects:** Verify that clicking "Conditions of Use" and "Privacy Notice" links opens the correct respective pages, and after successful signup, the user is redirected to the Amazon homepage in an authenticated state.

## Negative Test Cases

6. **Signup with Already Registered Details:** Verify the system behavior when a user attempts to sign up with an email address or mobile number that is already registered. *Expected Result: User is prevented from signing up and shown an appropriate error message (e.g., "Account already exists" or prompting them to log in).*
7. **Invalid Mobile Number Format:** Verify that the system shows a validation error when attempting to sign up with an invalid mobile number (e.g., less than 10 digits, containing alphabets or special characters).
8. **Invalid Email Address Format:** Verify that the system shows a validation error when attempting to sign up with an improperly formatted email address (e.g., missing `@`, missing domain, or containing invalid characters).
9. **Missing Mandatory Fields:** Verify that the system prevents form submission and highlights the appropriate errors when mandatory fields (Name, Mobile number/Email, Password) are left blank.
10. **Password Criteria Not Met:** Verify that the system rejects passwords that do not meet the minimum security requirements (e.g., a password with fewer than 6 characters) and displays an appropriate error message advising the user on the requirements.
