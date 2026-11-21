# Top 10 Guide Publishing

## Hostinger release

The application starts with Node.js 24 and npm. Run npm ci, npm run build and npm test before releasing. Hostinger uses server.js as its entry point.

Keep the site's existing MariaDB variables and NODE_ENV=production. Add a new, unique ADMIN_PASSWORD with at least 20 characters. ADMIN_EMAIL overrides the default editor sign-in address. If an automation publishes guides, give it a new EDITORIAL_PUBLISH_KEY of at least 32 characters and update its secret before resuming it. The old PUBLISH_API_KEY and keys stored in the legacy database are no longer accepted in production.

The editor signs in at /admin. Sessions use an HttpOnly cookie, expire after eight hours, and are invalidated when the configured password changes. Rotate secrets through hPanel and restart the site. The full-replacement Hostinger environment endpoint requires every existing value. hPanel can be used to add the new keys while retaining the database settings.

## Storage and recovery

Production requires MariaDB. Back up the existing database before deploying or rolling back. The app preserves the existing full_state record in top10_state_store and uses the bundled sanitized seed only for a new database. The legacy relational mirror tables may still exist. The editor reads and writes full_state directly, and saves are acknowledged only after the database confirms the write. A conflicting write returns 409. Reload the guide before retrying.

Use a separate staging database to test a backup restore. Verify /api/health, the homepage, /blog and an existing /list/ guide. In staging, create a draft, confirm it is private, schedule or publish it, restart the app and confirm the resulting article survives. Use the same smoke test after restoring the backup. Watch Hostinger runtime logs for database and scheduler errors and monitor the readiness endpoint.

Set NODE_ENV=development for local use without MariaDB. The app reads data/db.json as its seed and writes to ignored data/runtime.json by default. Set DB_PATH to keep an existing local state file or use a separate fixture. An existing JSON-only deployment should import its current state into a staging MariaDB database and verify content before switching. Preserve the old file and any existing Docker volumes until recovery has been tested.

The current seed omits legacy accounts, claim codes and lead records. Earlier public revisions still exist. Review those records before deciding how to handle published history and any required incident response.
