# Profile visual QA fixture

Run from the repository root: `npx vite --config docs/design/profile-preview/vite.config.mjs`.

This separate local entry renders the real profile components with sample data. It is outside the Electron/PWA application entry points, has no auth bypass, and aliases both database and MFA modules to local fixtures only. It cannot update production profiles, passwords or sessions, enroll MFA, or issue real recovery codes. The avatar is an asset crop of the selected visual for comparison. The application uses the actual signed-in user's avatar.
