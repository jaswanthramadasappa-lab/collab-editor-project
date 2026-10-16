# Backend tests

The server uses Node's built-in test runner (`npm test`). Add integration tests with Supertest and a dedicated test database before deployment. Recommended coverage:
- Registration validation and duplicate emails
- Login with valid/invalid password
- Missing, invalid, and expired bearer tokens
- Owner can update/delete own document
- Non-owner cannot delete a document
- Viewer cannot edit document content
- Editor can edit shared document
- Sharing only allowed by document owner
