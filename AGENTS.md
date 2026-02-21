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

### 2026-02-21 13:00 - Swipe skip fix, filmstrip bounce fix, mobile gallery bandwidth optimization (H1)

**Agent:** orchestrator  
**Summary:** Fixed swipe skipping multiple photos, filmstrip bounce-back, and implemented H1 (mobile gallery serves thumb variant instead of medium — 80% bandwidth reduction).

- **Swipe fix:** Changed velocity formula from `Math.floor(v*2)+1` (cap 5) to `Math.floor(v)+1` (cap 3) — normal swipes now always advance by 1, only genuinely fast flicks skip 2-3
- **Filmstrip fix:** Added visibility check before `scrollIntoView` — only scrolls when thumbnail is outside visible area (±40px padding), eliminating bounce-back when user taps already-visible thumbnails
- **H1 (gallery bandwidth):** `getOptimizedMediaProps()` now returns `'thumb'` (400w WebP, 25-45KB) instead of `'medium'` (1080w WebP, 150-250KB) for gallery context on mobile. Gallery display is ~175px wide, so 400w is 2.3× display width (sufficient for Retina). Modal still serves `'full'` quality for zoom.
- **Impact:** ~8MB saved per 50-image gallery load on mobile (10MB → 1.75MB); no new variants, no pipeline changes, no backfill needed
- **Deprioritized M2 (API caching):** ISR with `revalidate=60` + `hasInitialDataRef` skip already eliminates most filesystem walks; in-memory cache would only help on burst traffic during uploads (which invalidates cache anyway)

### 2026-02-21 11:30 - Safari upload fix, smooth swipe, framer-motion removal, mobile perf quick wins

**Agent:** orchestrator  
**Summary:** Fixed two bugs (Safari upload close refresh, non-smooth swipe) and four mobile performance quick wins, plus removed framer-motion dependency entirely.

- **Fix 1 (Safari):** Deferred `scrollTo` by 350ms after drawer/dialog close animation; used `behavior: 'instant'` on Safari to avoid BFCache restoration; cleared file input value on every close
- **Fix 2 (Swipe):** Added `swipeOffsetX` for real-time drag feedback; velocity-based skip `Math.min(5, Math.floor(v*2)+1)`; rubber-band resistance (30%) at boundaries; `swipeTimerRef` for cleanup
- **Removed framer-motion** (~32KB min+gz) — replaced single `<motion.button>` scale animation with CSS `transform: scale()` + `transition: 150ms ease-out`
- **H2:** Skip redundant `/api/photos` fetch on gallery mount when SSR `initialMedia` already seeded the store
- **M1:** Removed `translate3d(0,0,0)` and `will-change-auto` from gallery items (was promoting 50+ GPU compositing layers)
- **M4:** Wired `--font-playfair` to `--font-serif` in Tailwind v4 `@theme` (font was downloaded but never used)
- **M3:** Guarded `onMouseEnter` prefetch with `!isMobileDevice()` (tap fires mouseenter+click simultaneously)
- Also: removed duplicate `useKeypress('=')` (double-zoom), replaced `backdrop-blur-2xl` with `bg-black/90` (GPU perf)

### 2026-02-21 10:45 - Remove AppLoader and cleanup dead exports

- Removed app-level loading overlay (fixed 800ms delay); kept route-level skeleton loading
- Added explicit `turbopack.root` in `next.config.mjs`

### 2026-02-20 - Modal filmstrip rewrite and video fixes (5 sessions consolidated)

**Summary:** Complete rewrite of modal filmstrip from Framer Motion transforms to native scroll, then simplified to tap-only navigation. Fixed Firefox video DOMException, swipe flicker, filmstrip click bugs, and video metadata prefetch waste.

- Replaced `<motion.div animate={{ x }}>` filmstrip with native `overflow-x: auto` scroll, then removed scroll-to-navigate entirely (tap-only)
- Removed `AnimatePresence`/`MotionConfig` — main content uses plain keyed `<div>` (no exit-fade flicker)
- Fixed Firefox DOMException: guard `currentTime = 0.1` seek with `video.buffered.length > 0`
- Replaced filmstrip `<video>` thumbnails with static gradient+play placeholders (zero metadata fetches on modal open)
- Added `hasEverHadDataRef` to prevent skeleton flicker during mid-playback buffering
- Added `/api/health` endpoint for Docker healthcheck (unauthenticated)
- Net result: filmstrip is free-scrolling with momentum, tap navigates, `scrollIntoView` centers active thumb

### 2026-02-19 23:30 - Dead code cleanup and blur pipeline connection

- Deleted `imageUrl.ts` entirely; removed `StorageProvider` enum; simplified storage factory to direct `LocalStorageService` singleton
- Connected blur data pipeline end-to-end: `blurDataURL` flows from upload to `<Image placeholder="blur">`
- Extracted `getPhotosApiUrl()` and `isMobileDevice()` shared utilities
- Net -119 lines across 16 files

### 2026-02-19 - Event token, streaming uploads, Docker config (4 sessions consolidated)

- Implemented `/event?token=...` route to set HttpOnly cookie and redirect to gallery (QR code flow)
- Added middleware requiring EVENT_TOKEN cookie for all non-API routes; `/event/access` page for unauthorized visitors
- Switched upload pipeline to Busboy streaming + XHR progress
- Passed EVENT_TOKEN to docker-compose environments; cleaned docs for local-only storage

### 2026-02-18 - Bug fixes, video thumbnails, local-only pipeline, sharp variants

- Fixed gallery opening wrong item after refetch (changed modal selection from index-based to ID-based)
- Fixed video thumbnails showing black rectangle on mobile (hybrid lazy-load: IntersectionObserver + `preload="metadata"` + seek to 0.1s)
- Evaluated and rejected view switcher (masonry optimal for mobile wedding guests)
- Completed sharp image variants + metadata pipeline; ISR refresh fix
- Store image metadata in per-guest `/meta/` folders; client-side video metadata to avoid ffmpeg

### 2026-02-16 - Docker, local storage, Malay locale, CSP fixes (3 sessions consolidated)

- Containerized app: 3-stage Dockerfile, docker-compose.yml, dev override, `.dockerignore`
- Built `LocalStorageService` with `/api/media/[...path]` route (path traversal protection, MIME validation)
- Renamed `STORAGE_PROVIDER` to `NEXT_PUBLIC_STORAGE_PROVIDER` (fixed Cloudinary fallback bug)
- Added Malay locale (130+ strings); simplified rate limiter; fixed i18n language switching
- Fixed CSP font-src and connect-src directives
- Major dead code cleanup across 6 files (removed dead types, dead state, dead exports)

### Pre-2026-02-16 - Initial phases (consolidated)

- Fixed blur cache, duplicate blur generation, Pages Router config, S3 pagination, presigned URL caching
- Removed dead components (ModeToggle, LanguageSwitcher), fixed memory leaks, optimized mobile rendering
- Updated Next.js 16, eslint-config-next 16, react-i18next 16, pinned versions

## Architecture Reference

- **Stack:** Next.js 16, React 19, Tailwind CSS v4, Zustand, Radix UI (framer-motion removed)
- **Storage:** Local-only (`LocalStorageService`), self-hosted Docker with volume mount
- **i18n:** i18next + react-i18next (English, Malay); Turkish removed
- **Auth:** EVENT_TOKEN cookie via `/event?token=...` QR flow; middleware guards all routes
- **Docker:** Multi-stage build, standalone output, `node:25-alpine`, `/api/health` healthcheck
- **Audience:** Mobile wedding guests on cellular data — bandwidth matters for every decision
- **Guest isolation:** Defaults to false (shared gallery)
- **Env vars:** Use `NEXT_PUBLIC_` prefix for all client-visible vars
- **Video:** No ffmpeg; client-side metadata extraction; `LocalStorageService` hardcodes 720x480 dimensions
- **Modal:** ID-based selection (`selectedMediaId: number | null`); tap-only filmstrip navigation

## Open Items

- **H1:** `<Image unoptimized>` bypasses responsive sizing — 1080px served to 375px phones (needs sharp `srcSet`)
- **H5:** No video compression/variants — full original video served on cellular
- **M2:** Filesystem walk (`readdir` + `stat`) on every `/api/photos` request (needs caching)
- **M5:** `PAGE_SIZE = 50` with no infinite scroll — all items load at once
- **M6:** No service worker or offline caching
- **O3:** Duplicate `/api/photos` URL construction in Upload.tsx and MediaGallery.tsx
- **H2:** Download URL not validated against `javascript:` scheme in MediaModal

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
