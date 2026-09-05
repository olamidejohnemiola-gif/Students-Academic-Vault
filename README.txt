STUDENT ACADEMIC VAULT - V5 GOOGLE DRIVE BUILD

This build keeps the existing V5 design and uses Firebase Authentication
and Firestore for identity/account data and document metadata. Student
documents themselves are stored in each student's own Google Drive.
Firebase Storage is intentionally NOT used for student documents.

GOOGLE CLOUD SETUP
1. Enable Google Drive API in Google Cloud Console.
2. Configure Google Auth Platform / OAuth consent screen.
3. Create a Web OAuth 2.0 Client ID.
4. In google-drive.js replace:
   PASTE_YOUR_GOOGLE_OAUTH_WEB_CLIENT_ID_HERE.apps.googleusercontent.com
   with your actual Web OAuth Client ID.
5. Do NOT put a Google client secret or Google password in frontend code.
6. Use the OAuth scope:
   https://www.googleapis.com/auth/drive.file
7. Add your local and production HTTPS origins to the OAuth client settings.
   Example local origin: http://localhost:8080

FIREBASE SETUP
1. Enable Firebase Authentication -> Email/Password.
2. Publish firestore.rules from this build.
3. Firebase Storage is not required for the document vault.

HOW STORAGE WORKS
When a verified student clicks Connect Google Drive, Google authorization
is requested. The app creates a folder named "Student Academic Vault" in
that student's Google Drive and stores only the folder ID/name connection
metadata in Firestore. OAuth access tokens are kept in browser memory and
are not stored in Firestore.

DOCUMENT METADATA
students/{USER_UID}/documents/{DOCUMENT_ID}
The metadata contains the Google Drive file ID plus name, category, type,
size and timestamps. The actual PDF/JPG/PNG remains in the student's Drive.

SUPPORTED FILES
PDF, JPG, PNG up to 25 MB per file.

MULTI-DEVICE BEHAVIOUR
On another device, the student signs into Student Academic Vault and
connects the same Google account. The documents remain in that Google
Drive and the Vault can load their metadata again.

TEST FLOW
Login -> My Vault -> Connect Google Drive -> approve access -> confirm the
Student Academic Vault folder appears in Drive -> upload a document ->
verify the file in Drive -> sign in on another device -> connect the same
Google account -> confirm the same Vault documents are available.

IMPORTANT
The V5 design is intentionally preserved. This build adds only the Google
Drive connection/status controls and the storage integration needed for the
document vault.
