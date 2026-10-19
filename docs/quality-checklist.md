# Application workflow and accessibility checks

The CI smoke suite exercises the real production HTTP server against an isolated PostgreSQL database, sign-in cookie, CSRF checks, role catalogue, real text-bearing PDF submission and SkillMatch extraction, same-key replay, duplicate-role conflict, role separation, private download headers, fake-PDF rejection, the 5 MiB limit, and sign-out. It creates only fictional test data.

The following browser checks complement the automated smoke suite. Use fictional data only and run against a fresh local database.

## 1. Failed upload keeps the user's work

1. Sign in and open a role application.
2. Complete the required fields and select a PDF.
3. Use browser devtools to make the application POST return HTTP 500.
4. Submit the form.
5. Confirm the error summary receives focus, inline values remain, and the selected file name is still shown.
6. Restore the network and choose **Retry safely**. Confirm the application appears once on the dashboard.

## 2. Timeout after the server saves

1. Submit a valid application while delaying the POST response until after the server has committed it.
2. Allow the client request to reach its 20-second timeout.
3. Choose **Retry safely** without changing the form.
4. Confirm the retry uses the same Idempotency-Key, returns the original reference, and produces exactly one application row.

## 3. Mobile keyboard at 360 px

1. Use a 360 CSS-pixel viewport and open the device keyboard.
2. Focus the name and email fields and confirm each focused field remains visible while scrolling.
3. Confirm the email input requests an email-optimized keyboard.
4. Scroll to the submit action and verify it remains reachable without horizontal scrolling.
5. Check interactive controls are at least 44 × 44 CSS pixels where practical and the page has no horizontal overflow.

## 4. Repeated submit activation

1. Fill in a valid form and select a PDF.
2. Quickly activate Submit twice, then press Enter.
3. Confirm the in-flight reference guard sends one network request.
4. Confirm exactly one row exists for that user and role.

## 5. Session expires while the form is open

1. Open an application, fill in the text fields, and select a PDF.
2. Delete or expire the careers_session cookie before submitting.
3. Submit and confirm a focus-trapped dialog explains that sign-in is needed.
4. Choose **Sign in again**, log in, and return to the application.
5. Confirm text fields and the same retry key are restored, the file field is empty, and the user is prompted to select the PDF again.
6. Submit once and verify one application row.

## 6. A fake PDF is rejected

1. Create a harmless HTML text file and name it cv.pdf.
2. Submit it from an application form (or send it directly to the API during local QA).
3. Confirm the server responds with HTTP 415, the error is associated with the resume field, and no file or application row is created for that attempt.

## 7. Public registration and stored account details

1. Open `/sign-up` from the global header and create an account using fictional test data and a password of at least 12 characters.
2. Confirm a mismatched confirmation password is stopped before the request is sent, and the server rejects a shorter password.
3. Confirm a successful registration signs the new candidate in and opens the dashboard after a full page navigation.
4. Try registering with the same email using different letter casing; confirm the duplicate is rejected.
5. Stop and restart the local app, sign in with the new credentials, and confirm the account remains available in PostgreSQL.
6. Do not use real candidate information during QA. Email verification and password reset are not implemented.

## Reduced-motion and keyboard pass

Enable the operating-system reduced-motion preference, then navigate from the skip link through the header, role search controls, sign-in, application form, and dashboard using only the keyboard. Focus must remain visible. The session-expiry dialog must keep Tab and Shift+Tab focus inside it until the user continues or dismisses it.
