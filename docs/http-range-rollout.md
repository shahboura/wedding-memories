# HTTP Range Support Rollout Plan

## Goal

Enable safe, low-risk rollout of HTTP Range support for local media streaming and seeking.

## Why

- Fixes video seeking issues (notably Android/Firefox)
- Enables faster thumbnails and partial fetches
- Improves perceived performance for large videos

## Related Config

- Upload rate limits are configurable via env vars.
- Limits are applied per guest when `EVENT_TOKEN` is set.

## Rollout Phases

### Phase 0 — Baseline (Before)

- Endpoint returns full files only (200 OK)
- No `Accept-Ranges` or `Content-Range`

### Phase 1 — Range Support (Now)

- Add `Accept-Ranges: bytes` on all responses
- Parse `Range` header and return `206 Partial Content`
- Validate ranges and return `416` on invalid requests
- Keep caching headers unchanged

**Verification**

- Desktop + Android: scrub video timeline without full reload
- Browser devtools: confirm 206 responses for Range requests
- No regressions for image loading

### Phase 2 — Observability (Optional)

- Add lightweight logging for invalid range headers and 416 responses
- Track range usage in server logs to confirm adoption

### Phase 3 — Tuning (Optional)

- If needed, set max chunk size (e.g., 4–8MB) to prevent extreme ranges
- Consider `Cache-Control` adjustments if hot content changes

## Rollback Plan

- Revert Range parsing block and keep `Accept-Ranges` removed
- Return to 200 responses only

## Risks & Mitigations

- **Risk:** Clients send malformed Range headers → **Mitigation:** strict validation + 416
- **Risk:** Very large ranges → **Mitigation:** optional max chunk size (Phase 3)
- **Risk:** Cache mismatch for partial content → **Mitigation:** keep immutable caching; monitor if future invalidation needed
