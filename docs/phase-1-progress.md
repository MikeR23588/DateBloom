# Local foundation progress

- [x] pnpm workspace, Next.js app, and SQLite persistence.
- [x] Automatic Tampa coverage initialization.
- [x] Shared request and generated-plan validation contracts.
- [x] Optional accounts and browser-bound guest plans.
- [x] Guest plans claimed when signing in on that browser.
- [x] Local setup documentation and optional database path.
- [x] Verify first-run database initialization and Tampa coverage seed with an empty test database.
- [x] Verify persistent sign-in, guest claiming on signup and existing-account sign-in, sign-out, and ownership isolation with the live app.
- [x] Verify sessions and saved plans across an app restart.
- [x] Preserve both guest and account plans when request keys collide during claiming.
- [ ] Verify dependency installation from a fresh checkout; isolated browser checks currently reuse installed dependencies.

No container or privileged account setup is required.

Run `pnpm test:browser` for the repeatable live acceptance suite. See `docs/local-verification.md` for scope and limits.
