<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git sync for project work

- For each active project, check `git status` and fetch from its configured remote at the start of the day's work. Confirm the current branch and whether it is ahead of or behind its upstream before editing.
- At the end of each day's work, push the project's completed, authorized commits to GitHub so the other computer can receive them. Do not push unfinished or unreviewed work, overwrite remote history, or create empty commits just to produce daily activity.
- If there are no completed local changes to publish, do not manufacture a commit; report that the project was checked and already synchronized (or explain what prevents a safe push). If remote changes conflict with local work, preserve both and report the conflict before proceeding.
- Never include secrets, local environment files, generated build outputs, or personal data in a commit. Respect the repository's existing branch and contribution workflow.

## Build artifact and disk cleanup

- After a requested Android APK build succeeds, verify that the new APK exists and is the expected output before cleaning older APKs for that same project. Keep the newest successful APK; remove older APK copies only after that check, unless the user asked to retain a version.
- Keep reusable dependency and compiler caches (such as Gradle, Expo, and EAS caches) across builds. Do not clear them after every build; clean them selectively when disk space is actually needed or a cache is demonstrably corrupt.
- Do not delete source code, Git history, or project files as part of build cleanup.
