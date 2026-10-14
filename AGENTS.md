<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# iooi releases

Use the streamlined controlled release workflow for future iooi changes:
- Inspect the live baseline and preserve unrelated checkout changes first.
- Validate UI changes in the development preview and use quick targeted checks as needed. Do not run a local production build for an ordinary release.
- Deploy with `/usr/local/sbin/iooi-release-request`. Server preparation runs tests, lint and TypeScript; it does not build the workspace. The isolated release directory installs the approved lockfile and performs the only production build.
- Do not run `claude-release check` immediately before `deploy`, since it would build the same release again.
- Keep approval, clean-commit checks, source hashes, backups, rollback and online health checks. Only PM2 `iooi` is restarted.
- GitHub push requires its own user authorization. When authorized, use the controlled push worker and verify the remote SHA.
