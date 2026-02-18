# OpenCode Agents Repository

This repository contains customized agents for OpenCode.ai, aligned with Anthropic's skills framework.

## Project Structure

- `.opencode/agent/` - Custom agent configurations for OpenCode
- `docs/` - Documentation for agents and usage
- `AGENTS.md` - This file with project instructions

## Language-Specific Instructions

### .NET/C# Projects

Apply Clean Architecture principles:

- Follow dependency rules: Domain → Application → Infrastructure → WebAPI
- Use async/await with CancellationToken
- Enable nullable reference types
- Constructor injection for dependencies
- Entity Framework with IEntityTypeConfiguration

### Python Projects

- Always use type hints on function signatures
- Use context managers for resource management
- Prefer list comprehensions over loops
- Async/await for I/O operations
- Google-style docstrings for public APIs

### TypeScript Projects

- Enable strict mode in tsconfig.json
- Explicit types, no implicit any
- Strict null checks with optional chaining
- Generics for reusable code
- Utility types (Pick, Omit, Partial, etc.)

### Flutter/Dart Projects

- Use Riverpod for state management
- Feature-based architecture with clean separation
- Immutable data models with freezed
- Result pattern for error handling
- Provider pattern for dependency injection
- Widget testing for all UI components

## Agent Usage

Primary agents:

- `codebase` - Multi-language development with profile detection
- `orchestrator` - Strategic planning and complex workflow coordination
- `blogger` - Content creation for blogging, podcasting, and YouTube scripting
- `brutal-critic` - Ruthless content reviewer with framework-based criticism
- `em-advisor` - Engineering management guidance

Subagents:

- `docs` - Documentation creation and maintenance
- `review` - Code review for security, performance, and best practices

## Quality Requirements

All code changes must:

- Pass type checking (mypy, tsc --noEmit, flutter analyze)
- Pass linting (ruff, eslint, dart format)
- Pass all tests
- Follow language-specific conventions
- Include proper documentation

### Documentation Standards

All documentation changes must:

- Pass markdown linting (`npm run lint:md`)
- Have valid internal/external links (`npm run validate:docs`)
- Run validation before committing changes

## Session Summary Requirements

**All agents MUST summarize sessions upon task completion:**

### Summary Format

- **Context**: Brief description of what was accomplished
- **Key Decisions**: Important architectural or implementation choices made
- **Open Items**: Any follow-up tasks or unresolved issues
- **Lessons Learned**: Insights or patterns discovered during the session

### Summary Optimization

- Keep summaries concise and actionable
- Focus on information that would be valuable for future sessions
- Avoid redundant information from previous summaries
- Use bullet points for readability
- Include timestamps for chronological context

### Summary Location

Summaries should be added to this AGENTS.md file under a "Session Summaries" section for easy reference across sessions.

## Session Summaries

### 2026-02-19 19:10 - Event token QR route + streaming upload refactor

**Agent:** planner  
**Summary:** Implemented /event token QR route, streaming uploads, and refactors.

- Added /event?token=... route to set HttpOnly cookie and redirect to gallery
- Switched upload pipeline to Busboy streaming + XHR progress with server/client helpers
- Added rate-limit configurability and event token guidance in env templates
- Removed CHANGELOG and cleaned dead video upload types
- Updated README for token QR link and fixed outdated component list
- Handoff to: codebase for final testing

### 2026-02-19 18:40 - Event token QR route + streaming upload refactor

**Agent:** planner  
**Summary:** Added /event token redirect flow and streamlined upload pipeline.

- Implemented /event?token=... route to set HttpOnly cookie and redirect to gallery
- Added streaming upload pipeline with Busboy + XHR progress and extracted helpers
- Added rate-limit configurability, event token guidance, removed CHANGELOG, and cleaned dead code
- Updated README and env templates for token usage and QR link
- Handoff to: codebase for any further cleanup or testing

### 2026-02-19 14:20 - Event token URL + streaming upload refactor

**Agent:** planner  
**Summary:** Added /event token redirect flow and refactored upload handling.

- Implemented /event?token=... route to set HttpOnly cookie and redirect to gallery
- Added streaming upload pipeline with Busboy + XHR progress and extracted helpers
- Added rate-limit configurability, event token guidance, removed CHANGELOG, and cleaned dead code
- Updated README and env templates for token usage and QR link
- Handoff to: codebase for any further cleanup or testing

### 2026-02-18 16:45 - Local-only pipeline + ISR refresh

**Agent:** orchestrator

- **Context**: Completed local-only refactor follow-ups, sharp image variants + metadata, ISR refresh fix, and docs/comment cleanup.
- **Key Decisions**: Store image metadata in per-guest `/meta/` folders; use client-side video metadata (width/height) to avoid ffmpeg; background refresh only replaces gallery when server data is newer.
- **Open Items**: Task 4 Android video preload, Task 5 swipe sensitivity, Task 6 MediaModal evaluation doc, Task 7 final AGENTS.md summary; Migration-Plan.md still untracked.
- **Lessons Learned**: Background revalidate avoids ISR staleness without flicker; client video metadata is a safe stopgap for layout until server-side probing is added.

### 2026-02-18 14:30 - Review Task 1/2 gaps

**Agent:** review  
**Summary:** Reviewed recent changes against Migration-Plan.md focusing on Task 1 (local-only removal) and Task 2 (sharp pipeline).

- Noted remaining cloud/provider references and outdated docs/comments (README, validation.ts, app/page.tsx, mediaOptimization.ts, StorageAwareMedia.tsx, api/media route comment, AGENTS.md) that contradict local-only goal
- Found Task 2 partially implemented: LocalStorageService now uses sharp for image variants + blur, but video metadata/variants still hardcoded and uploadVideo unused
- Identified risks: video dimensions remain 720x480 placeholders; upload API never uses uploadVideo; doc mismatches could mislead deployment
- Recommended cleanup of dead/legacy interfaces (VideoUploadData) and presigned upload response types in api/upload response shape

### 2026-02-18 — Bug Fixes (Wrong Modal Item, Upload Placeholders, Video Thumbnails) & View Switcher Evaluation

**Agent:** orchestrator

**What was done:**

- **fix(bcb1992): gallery opens wrong item after refetch, uploaded media shows placeholder**
  - Root cause: per-file `addMedia()` inserted fake items with `Date.now()` IDs, empty `blurDataUrl`, and no video data — these showed as grey placeholders and shifted array positions causing modal to open wrong item
  - Replaced with single `/api/photos` refetch after all uploads complete
  - Changed modal selection from index-based to ID-based (`selectedMediaId` instead of `selectedMediaIndex`)
  - Removed `addMedia` from Zustand store entirely
  - Track upload success via return values instead of mutating inside React setState callback

- **fix(c2eba87): video thumbnails show placeholder instead of black rectangle on mobile**
  - Root cause: gallery videos used `preload="none"` on mobile → zero bytes downloaded → black rectangle. Desktop used `preload="auto"` → browser extracted first frame → worked
  - Solution: Hybrid lazy-load approach (Option 4 — chosen over server-side ffmpeg posters, global `preload="metadata"`, and client-side canvas extraction)
  - `preload="none"` on page load (zero bandwidth), Intersection Observer upgrades to `preload="metadata"` when video scrolls within 200px of viewport, `onLoadedMetadata` seeks to 0.1s, `onSeeked` sets `hasFrame=true` replacing placeholder with real first frame
  - Styled gradient + play icon placeholder shown until first frame extracted (instead of black rectangle)
  - `hasFrame` resets on `src` change to handle gallery refetch correctly

- **decision: view switcher evaluated and rejected**
  - Evaluated 3 views: masonry (current), grid (fixed square cells), list (thumbnail + text rows)
  - Current CSS columns masonry layout is already optimal for mobile wedding guests: full-width single column on phones, preserves natural aspect ratios, no cropping
  - Grid crops composition and wastes bandwidth on cropped pixels; list optimizes for 1000+ items (not needed for 50-200)
  - With Local storage (no CDN transforms), all views serve the same full-resolution file — zero benefit from different view modes
  - View switcher adds cognitive load for non-technical wedding guests who use the app once

**Key decisions & instructions for future sessions:**

- Use `NEXT_PUBLIC_` prefix for all client-visible env vars — baked at build time
- **Turkish language has been REMOVED** — locale file deleted, enum value removed
- **Keep `node:25-alpine`** in Dockerfile — intentional choice
- **Sign commits with GPG** (`--gpg-sign`)
- Primary audience: **mobile wedding guests on mobile data** — bandwidth matters for every feature decision
- Storage provider is **Local** (`NEXT_PUBLIC_STORAGE_PROVIDER=local`) — self-hosted Docker with volume mount
- Guest isolation defaults to **false** (shared gallery) — `=== 'true'` instead of `!== 'false'`
- `sharp@^0.34.3` is in `package.json` but **NOT imported anywhere** in source (Next.js may use internally). Available for image processing without adding dependency
- **No ffmpeg** in project — would need to be added for server-side video poster generation
- `LocalStorageService` hardcodes `width: 720, height: 480` for all media — no actual dimension extraction
- `viewport-fit: 'cover'` is set in `layout.tsx`, making all `env(safe-area-inset-*)` values functional

**Architecture notes:**

- Next.js 16, React 19, Tailwind CSS v4, Zustand, Framer Motion, Radix UI
- Storage abstracted via `StorageService` interface — Local-only
- i18n via i18next + react-i18next (English, Malay)
- Docker multi-stage build, standalone output
- Guest name stored in `localStorage` via Zustand persist — zero cookies, zero server sessions
- Modal selection is ID-based (`selectedMediaId: number | string | null` in store)

**Open items (not urgent):**

- I2: Change `selectedMediaId: number | string | null` → `number | null` (dead `string` branch since `addMedia` removed)
- P6: Local images served at full resolution (needs sharp pipeline)
- P8: No pagination on media list API
- H2: Download URL not validated against `javascript:` scheme in MediaModal
- O3: Duplicate `/api/photos` URL construction in Upload.tsx and MediaGallery.tsx
- O5: No AbortController on gallery refetch in handleUploadAll
- `LocalStorageService` hardcodes video dimensions — no actual video probing

**Verification:** `pnpm type-check` and `pnpm lint` both pass with zero errors/warnings.

---

### 2026-02-16 — Docker Runtime Fix, Local Storage Support & Dead Code Cleanup

**Agent:** orchestrator
**Summary:** Fixed Docker runtime errors (Cloudinary warnings + preload spam), added proper `StorageProvider.Local` handling across the client, renamed `STORAGE_PROVIDER` → `NEXT_PUBLIC_STORAGE_PROVIDER`, and cleaned up dead code across 6 files.

**What was done:**

- **Docker runtime fix** — Root cause: `STORAGE_PROVIDER` env var lacked `NEXT_PUBLIC_` prefix, so client-side code defaulted to Cloudinary, causing "cloud name not configured" warnings and 14+ `<link rel="preload">` spam. Renamed to `NEXT_PUBLIC_STORAGE_PROVIDER` across `config.ts`, `docker-compose.yml`, `.env.docker.example`, `Dockerfile`, `validate-env.cjs`, `route.ts`, and `README.md`
- **Local storage client support** — Added `StorageProvider.Local` branches in `imageUrl.ts` (all 5 public methods + new `getLocalUrl` private method), `mediaOptimization.ts` (treats Local same as S3), and `StorageAwareMedia.tsx` (doc comment)
- **`mediaOptimization.ts` rewrite** — Removed 3 dead exports (`shouldPrioritize`, `prefetchModalMediaNavigation`, `simpleMediaPrefetch`), removed unnecessary `export` from internal functions, removed unused `format` param, removed unreachable `default` branch, removed `videoId`/`duration`/`guestName` from video props return
- **Dead code cleanup (6 files):**
  - `imageUrl.ts` — Removed dead `supportsOptimization()` method; collapsed identical video/image branches in `getCloudinaryUrl`
  - `StorageAwareMedia.tsx` — Removed unused `videoId`, `duration`, `guestName` from interface and destructuring; simplified `{ ...style }` to `style`
  - `MediaGallery.tsx` — Removed trivial `openMediaModal` wrapper (use `openModal` directly); renamed `_error` → `error`; reduced gallery priority from `index < 6` to `index < 2`
  - `MediaModal.tsx` — Added missing `center` animation variant; removed dead `direction` state + `setDirection`/`custom={direction}`; removed dead `loaded` state + `setLoaded`; moved misplaced imports to top; fixed stale `currentIndex` dependency
  - `storage/index.ts` — Removed dead re-exports of `StorageService` type and `StorageProvider`
  - `utils/types.ts` — Removed 6 dead type exports: `SharedModalProps`, `EnvironmentConfig`, `UploadResponse`, `GuestNameInputProps`, `WelcomeDialogProps`, `ApiResponse<T>`

**Verification:** `pnpm type-check` and `pnpm lint` both pass with zero errors and zero warnings.

**Open Items:**

- Docker rebuild needed: `docker compose build --no-cache && docker compose up -d` to verify both runtime errors are gone
- No remaining dead code issues identified

---

### 2026-02-16 — Malay Locale, Rate Limiter Simplification, i18n & CSP Fixes

**Agent:** orchestrator
**Summary:** Added Malay (Bahasa Melayu) language support, simplified upload rate limiting, and fixed two browser-level bugs (CSP font/connect-src errors, language switching only working on second click).

**What was done:**

- **Malay locale (`ms`)** — Created `locales/ms/common.json` with full 130+ string translations; registered in `lib/i18n.ts`, added `Language.Malay` to `config.ts` enum and `supportedLanguages`; added display name + 🇲🇾 flag in `SettingsPanel.tsx`; documented in `.env.docker.example`
- **Rate limiter simplified** — Removed dual burst+sustained upload limiter (was 20/min + 50/10min); replaced with single sustained limiter (60 uploads per 10 minutes / 360 per hour). Burst limiter was counterproductive for wedding guests who naturally select 10-15 photos at once
- **i18n language switching fix** — Rewrote `I18nProvider.tsx`: import `i18n` singleton directly instead of via `useTranslation()` hook; define `t` as plain function calling `i18n.t()` (no stale `useCallback` closure); added render-key counter to force re-render after `changeLanguage`; swapped order so `await i18n.changeLanguage()` runs before `setLanguageState()`
- **CSP font-src fix** — Added `https://fonts.gstatic.com` to `font-src` directive (Next.js dev mode loads Google Fonts from CDN)
- **CSP connect-src fix** — Replaced invalid `https://*.s3.*.amazonaws.com` (double wildcards not allowed in CSP) with `https://*.amazonaws.com` across img-src, media-src, and connect-src

**Files changed:**

- `locales/ms/common.json` (new), `lib/i18n.ts`, `config.ts`, `components/SettingsPanel.tsx` — Malay locale
- `utils/rateLimit.ts` — simplified rate limiter
- `components/I18nProvider.tsx` — i18n switching fix
- `next.config.mjs` — CSP fixes
- `.env.docker.example` — documented `ms` language option

**Verification:** `pnpm type-check` and `pnpm lint` both pass with zero errors/warnings.

**Open Items:**

- Remaining low-severity warnings from prior review (W1-W5, S1-S2) still pending — not urgent

---

### 2026-02-16 — Containerization & Local Storage Provider

**Agent:** orchestrator
**Summary:** Containerized the Next.js wedding-memories app with Docker and added a new `Local` storage provider for self-hosted / offline deployments.

**What was built:**

- **`LocalStorageService`** — Full `StorageService` implementation saving to local filesystem (mounted Docker volume)
- **`/api/media/[...path]` route** — Serves local files with path traversal protection, MIME validation, cache headers
- **`Dockerfile`** — 3-stage multi-stage build (deps → build → runner) with Node 22 Alpine, standalone output, non-root user
- **`docker-compose.yml`** — Production service with all env vars and named volume for uploads
- **`docker-compose.dev.yml`** — Dev override that mounts source code for hot-reload via `pnpm dev`
- **`.dockerignore`** and **`.env.docker.example`** — Build context optimization and documented env template

**Config changes:**

- `config.ts` — Added `StorageProvider.Local`; bride/groom names, storage provider, guest isolation, language all configurable via env vars (`STORAGE_PROVIDER`, `BRIDE_NAME`, `GROOM_NAME`, `GUEST_ISOLATION`, `DEFAULT_LANGUAGE`)
- `storage/index.ts` — Wired `LocalStorageService` into factory
- `next.config.mjs` — Added `output: 'standalone'` for Docker
- `validate-env.cjs` — Local storage skips cloud credential validation; reads `STORAGE_PROVIDER` env var
- `.gitignore` — Stopped ignoring `pnpm-lock.yaml` (needed for Docker); added `/uploads/`

**Key Decisions:**

- `STORAGE_PROVIDER` env var overrides `config.ts` hardcoded default — compose sets it without code changes
- Dev mode uses compose file merge (`-f docker-compose.yml -f docker-compose.dev.yml`) — one Dockerfile, zero duplication
- Local files served through API route (not `public/`) — supports dynamic uploads and path security
- `pnpm-lock.yaml` un-ignored from git — required for `pnpm install --frozen-lockfile` in Docker

**Usage:**

- Production: `docker compose up -d --build`
- Development: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`
- Local mode needs zero cloud credentials — just set `STORAGE_PROVIDER=local`

**Verification:** `pnpm type-check` and `pnpm lint` both pass with zero errors/warnings.

**Open Items:**

- 28 dead exports in `validation.ts`, `errors.ts`, `rateLimit.ts`, `imageUrl.ts`, `useAppStore.ts` still pending removal (from earlier cleanup pass)

---

### Prior session context (Phases 1–4, 8, Cleanup):

- Fixed blur cache, duplicate blur generation, Pages Router config, S3 pagination, presigned URL caching
- Removed dead components (ModeToggle, LanguageSwitcher), fixed memory leaks, optimized mobile rendering
- Updated Next.js 16, eslint-config-next 16, react-i18next 16, pinned versions
- Cleanup pass: removed redundant state, merged identical branches, consolidated imports, fixed hook placement, removed dead ActionTypes runtime object
- All changes verified with `pnpm type-check` and `pnpm lint` — zero errors

### 2025-12-24 11:00 - Update global config location to match OpenCode standards

**Agent:** opencode
**Summary:** Updated global configuration directory to match OpenCode.ai documentation standards

- Modified getGlobalConfigDir() to use ~/.config/opencode/ on all platforms (Linux/macOS/Windows)
- Updated README.md to document correct installation locations
- Updated install.js help text to include installation location information
- Added configuration path display in global install success message
- All changes align with https://opencode.ai/docs/config/#global specifications

### 2025-12-23 21:00 - Update instructions.md with new language standards

**Agent:** docs  
**Summary:** Added comprehensive documentation sections for newly supported languages in @codebase agent

- Added Go Standards section with modules, error handling, concurrency, and testing
- Added Node.js Express Standards section with security, async/await, validation, and logging
- Added React Next.js Standards section with TypeScript, components, accessibility, and performance
- Updated overview to mention all supported languages
- Included code examples and validation commands following existing format

### 2025-12-23 20:00 - Commit all repository changes

**Agent:** GitHub Copilot  
**Summary:** Committed comprehensive repository updates and validated integrity

- Committed 54 new files including prompts, examples, docs, scripts, and workflows
- Installed PowerShell on Linux to enable validation script execution
- Ran full validation suite (agents, docs, context, markdown lint) - all passed
- Repository now includes complete OpenCode agent ecosystem with examples and tooling

### 2025-12-23 19:45 - Migrate instructions and enhance agent context patterns

**Agent:** orchestrator  
**Summary:** Migrated 5 missing instruction files and standardized all agent context persistence

- Copied ci-cd-hygiene, go, node-express, react-next, sql-migrations instructions from .github to .opencode
- Enhanced all 8 agents with structured Context Persistence sections (replaced generic Session Summary Requirements)
- Standardized timestamp format (YYYY-MM-DD HH:MM), prepend behavior, 3-5 bullet max, 100KB auto-prune
- Updated opencode.json to reference all 11 instruction files (5 new + 6 existing)

### 2025-12-23 19:30 - Complete migration from Copilot patterns to OpenCode

**Agent:** codebase  
**Summary:** Migrated best practices from .github (Copilot) to OpenCode agents, added prompts system, CI/CD workflow

- Added @planner agent for read-only analysis and detailed implementation planning
- Created 8 structured reusable prompts in .opencode/prompts/ (api-docs, code-review, generate-tests, create-readme, architecture-decision, refactor-plan, security-audit, 1-on-1-prep)
- Optimized validate-agents.ps1 to support both Copilot (.github/agents/_.agent.md) and OpenCode (.opencode/agent/_.md) formats
- Added GitHub Actions workflow (.github/workflows/validate.yml) for agent validation, doc link checking, and markdown linting
- Created package.json with essential validation scripts (validate:agents, validate:docs, validate:context)
- Updated .gitignore to allow .github/workflows/ while excluding other GitHub files
- Updated all documentation (README.md, docs/index.md, docs/agents/README.md) to reflect new agents and prompts

### 2025-12-23 18:20 - Ignore .github and commit repo

**Agent:** orchestrator  
**Summary:** Added .github to gitignore; committed remaining files.

- Phase sequence and agent handoffs used: Implementation (@codebase) → Commit
- Workflow patterns that worked well: quick ignore rule + batch commit
- Lessons learned: Confirm tracked state before ignore; `.github` was untracked

### Session Summary - Mon Dec 22 2025

- **Context**: Updated brutal-critic agent to include research capabilities with YouTube creators policies and guidelines URL, and synchronized GitHub Pages documentation to include all available agents.
- **Key Decisions**: Added research & validation section to brutal-critic instructions emphasizing platform-specific policy compliance; updated docs/index.md to include blogger and brutal-critic agents in the main agents list.
- **Open Items**: None.
- **Lessons Learned**: Documentation synchronization requires checking multiple files (index.md, agents/README.md, getting-started.md) to ensure consistency across all GitHub Pages content.

### Session Summary - Mon Dec 22 2025

- **Context**: Added the requested session summary to AGENTS.md under the Session Summaries section as instructed.
- **Key Decisions**: Used the edit tool to insert the new summary at the top of the section to maintain chronological order.
- **Open Items**: None.
- **Lessons Learned**: Session summaries can be added directly using the edit tool when the content is provided.

### Session Summary - Sun Dec 21 2025

- **Context**: Consolidated repository to OpenCode-only by moving instructions locally, updating configurations, removing Copilot files, cleaning up documentation, and simplifying installation.
- **Key Decisions**: Moved instructions to .opencode/instructions/ for consolidation, removed all Copilot configurations (.github/agents/, prompts/, copilot-instructions.md), updated opencode.json and README accordingly.
- **Open Items**: None.
- **Lessons Learned**: Repository consolidation improves maintainability; clear separation of concerns makes setup easier for users.

### Session Summary - Sun Dec 21 2025

- **Context**: Reviewed all documentation files and removed remaining Copilot references, moved instruction files to .opencode/instructions/ to match configuration, and updated repository structure documentation to reflect the cleaned-up OpenCode-only organization.
- **Key Decisions**: Moved instruction files from .github/instructions/ to .opencode/instructions/ for consistency, updated all Copilot references to OpenCode throughout documentation, corrected all file paths to reflect current repository structure.
- **Open Items**: None.
- **Lessons Learned**: Systematic documentation cleanup ensures users have accurate, consistent information across all docs files.

### Session Summary - Sun Dec 21 2025

- **Context**: Removed Copilot-specific files and directories (.github/agents/, .github/copilot-instructions.md, .github/prompts/) to clean up repository structure.
- **Key Decisions**: Used bash rm commands to remove the specified paths completely.
- **Open Items**: None.
- **Lessons Learned**: Efficient file removal maintains repository cleanliness and removes outdated configurations.

### Session Summary - Sun Dec 21 2025

- **Context**: Updated README.md installation section to make copying instructions files from .opencode/instructions/ a standard step, simplified setup process, and updated repository structure documentation to remove Copilot references.
- **Key Decisions**: Changed instructions copying from optional to mandatory, updated path from .github/instructions/ to .opencode/instructions/, reorganized repository structure to reflect current organization.
- **Open Items**: None.
- **Lessons Learned**: Direct README updates efficiently maintain documentation consistency and user experience.

### Session Summary - Sun Dec 21 2025

- **Context**: Updated opencode.json to reference new instruction file locations, changing paths from ".github/instructions/" to ".opencode/instructions/" while maintaining exact filenames.
- **Key Decisions**: Used replaceAll edit operation to update all instruction paths simultaneously.
- **Open Items**: None.
- **Lessons Learned**: The edit tool's replaceAll functionality efficiently handles bulk path updates across configuration files.

### Session Summary - Sun Dec 21 2025

- **Context**: Performed minor updates to AGENTS.md, validated changes, removed Acknowledgments section from README.md, and pushed all changes with meaningful commit message.
- **Key Decisions**: Removed Acknowledgments to streamline documentation, maintained all other sections and formatting.
- **Open Items**: None.
- **Lessons Learned**: Direct documentation edits can be validated quickly; consistent commit messages improve repository history.

### Session Summary - Sun Dec 21 2025

- **Context**: Updated all agent configuration files in .opencode/agent/ to include explicit instructions for adding session summaries, ensuring consistent workflow across agents with different edit permissions.
- **Key Decisions**: For agents with edit "allow" or "ask", use edit tool directly; for agents with edit "deny" (review, em-advisor), use task tool to launch @docs agent.
- **Open Items**: None
- **Lessons Learned**: Centralized summary management improves consistency and provides better historical context for agent interactions.

### Session Summary - Sun Dec 21 2025

- **Context**: Added a brief note to README.md under the agents table mentioning that all agents automatically add session summaries to AGENTS.md after task completion.
- **Key Decisions**: Placed the note in the Core Concepts section after the agents table for visibility.
- **Open Items**: None
- **Lessons Learned**: Minor documentation updates can be implemented directly without requiring the full analysis-approval-execution workflow phases.

### Session Summary - Sun Dec 21 2025

- **Context**: Troubleshot and fixed agent session summary issue by updating all agent configurations with explicit implementation guidance, tested the fix, and validated consistency.
- **Key Decisions**: Added edit tool instructions for agents with permissions, task tool delegation for read-only agents, maintained role-specific summary formats.
- **Open Items**: None - all agents now have proper summary workflows.
- **Lessons Learned**: Explicit implementation guidance in agent prompts ensures consistent behavior; testing small changes validates fixes before full deployment.

### Session Summary - Sun Dec 21 2025

- **Context**: Added the requested session summary to AGENTS.md under the Session Summaries section as instructed.
- **Key Decisions**: Used the edit tool to insert the new summary at the top of the section to maintain chronological order.
- **Open Items**: None.
- **Lessons Learned**: Session summaries can be added directly using the edit tool when the content is provided.
