# Codebase Concerns

**Analysis Date:** 2026-02-24

## Tech Debt

**Process not exiting cleanly:**
- Issue: CLI adds explicit `Deno.exit(0)` after command execution because something is keeping the process alive (likely relay connections or event listeners not cleaning up properly)
- Files: `src/cli.ts:81`
- Impact: Deferred cleanup could leave zombie processes, potential resource leaks in automation/scripting contexts
- Fix approach: Trace all EventEmitter/relay listeners and ensure proper cleanup in `finally` blocks; consider explicit relay connection teardown with timeout

**Gateway file caching lacks expiration logic:**
- Issue: In-memory file cache (`fileCache` Map and `fileListCache` Map) stores files with only timestamp tracking but no eviction policy
- Files: `src/lib/gateway.ts:95-105`
- Impact: Long-running gateway servers will accumulate stale file data in memory; no protection against memory bloat
- Fix approach: Add TTL-based cache eviction (e.g., 1-hour expiration); implement LRU cache with size limits; add cache size monitoring

**Large file handling in gateway service:**
- Issue: Files are decompressed into memory using Brotli/Gzip without size checks or streaming
- Files: `src/lib/gateway.ts:1350-1425`
- Impact: A multi-megabyte file could cause out-of-memory errors on resource-constrained systems
- Fix approach: Add max file size config; stream decompression for large files; implement chunked responses

**DEBUG output left in production code:**
- Issue: Hardcoded debug logging statement with yellow color in gateway request handler
- Files: `src/lib/gateway.ts:1488-1492`
- Impact: Pollutes console output with verbose path/content-type debugging in all deployments
- Fix approach: Remove or make conditional on DEBUG environment variable; use log.debug() instead

## Known Bugs

**Duplicate site pointer validation:**
- Symptoms: If `sitePointer` is null, the code checks twice with identical validation, returning early each time
- Files: `src/lib/gateway.ts:232-252`
- Trigger: Invalid hostname that fails npub extraction (e.g., "invalid.localhost")
- Workaround: None; code path is unreachable on second check due to early return
- Fix approach: Remove redundant validation block at lines 244-252

**Unhandled async race in update listener:**
- Symptoms: `setInterval(checkForUpdates, 5000)` runs every 5 seconds but `checkForUpdates` is async; no tracking of pending promises
- Files: `src/lib/gateway.ts:1553`
- Trigger: Slow manifest event loading or relay connection issues causing overlapping async calls
- Workaround: None; will silently accumulate pending operations
- Fix approach: Use async queue or `setTimeout` instead; track in-flight requests and skip if one is pending

## Security Considerations

**Secret key exposure risk in error messages:**
- Risk: `getErrorMessage()` utility may include stack traces that expose hex keys or nbunksec format strings
- Files: `src/lib/error-utils.ts` (used throughout); see `src/commands/deploy.ts:1208`, `src/lib/upload.ts:60-63`
- Current mitigation: Error messages are caught and logged but no masking of sensitive key formats (nsec, nbunksec, hex)
- Recommendations: Implement error message sanitization to redact key material; audit all error logs for sensitive data; use `***REDACTED***` for credential leaks

**Secrets file permissions not validated:**
- Risk: Encrypted secrets stored at `~/.config/nsyte/secrets.enc` may have overly permissive file mode if system umask is weak
- Files: `src/lib/secrets/encrypted-storage.ts`, `src/lib/secrets/manager.ts`
- Current mitigation: AES-256-GCM encryption in place; no explicit chmod to 0600
- Recommendations: Add `chmod(secretsPath, 0o600)` after file creation; validate file permissions on load and reject if world-readable

**Keychain bypass via environment variables:**
- Risk: `NSYTE_DISABLE_KEYCHAIN=true` or `NSYTE_TEST_MODE=true` env vars disable all secure storage, falling back to plaintext
- Files: `src/lib/secrets/keychain.ts:552-553`
- Current mitigation: Environment variables are checked but no warning to user when security is downgraded
- Recommendations: Log WARN level message when keychain is disabled; document in help text that this is test-only; consider refusing to store secrets in fallback mode

**Bunker connection timeout using fixed 30 second value:**
- Risk: No configurability for slow network conditions; timeout could be too aggressive for legitimate users on poor connections
- Files: `src/lib/nip46.ts:400`
- Current mitigation: 30 second timeout is reasonable but hardcoded
- Recommendations: Make timeout configurable via CLI option; add exponential backoff for retries

## Performance Bottlenecks

**Sequential file upload with concurrency limits not respecting server rate limits:**
- Problem: Upload function implements client-side concurrency (4 files at a time) but doesn't back off when receiving 429 responses from servers
- Files: `src/lib/upload.ts:17, 405-491`
- Cause: Rate limit detection only logs warnings but continues processing at same pace; no dynamic concurrency adjustment
- Improvement path: Implement adaptive concurrency using Retry-After headers; track per-server rate limit headers; use exponential backoff on 429

**Gateway file list cache only timestamp-based invalidation:**
- Problem: Every new request requires polling remote servers even for unchanged files
- Files: `src/lib/gateway.ts:376-390, 1199-1250`
- Cause: Cache respects manifest event timestamps but doesn't optimize for static content
- Improvement path: Add ETag/conditional request support for manifest events; implement longer TTL for stable sites

**Browse loader does independent requests per file:**
- Problem: `listRemoteFilesWithProgress()` checks file presence on each server independently for each file, creating O(files × servers) requests
- Files: `src/lib/browse-loader.ts:420-440`
- Cause: No batching of file checks per server
- Improvement path: Batch file checks into multi-file manifest requests where supported; parallelize within server limits

**Message collector aggregation is O(n) lookup:**
- Problem: Finding duplicate messages uses linear search on every add
- Files: `src/lib/message-collector.ts:72-77`
- Cause: Simple array with `findIndex()` instead of indexed lookup
- Improvement path: Use Map with composite key (type+category+content+target) for O(1) deduplication

## Fragile Areas

**Gateway hostname parsing brittle against edge cases:**
- Files: `src/lib/gateway.ts:61-88`
- Why fragile: Simple string split on "." without validating hostname format; assumes consistent subdomain depth; no handling for IPv6 or unusual hostnames
- Safe modification: Add hostname validation against RFC 952; test with edge cases (trailing dots, unicode, very long names)
- Test coverage: No unit tests for hostname parsing; hardcoded unit tests only

**Config file mutation during CI/CD:**
- Files: `src/lib/config.ts`, `.nsite/config.json` (root project directory)
- Why fragile: Tests could overwrite real project config; user has documented risk of `bunkerPubkey` getting overwritten (see MEMORY.md)
- Safe modification: Always use temp directories for test configs; validate test isolation; use separate test project structure
- Test coverage: Only one test file (`tests/config-validator.test.ts`) does not test file I/O; no integration tests for deploy flow

**Error handling in upload batch processing:**
- Files: `src/lib/upload.ts:413-454`
- Why fragile: `.catch()` on `Promise.all()` returns partial failures as successful responses; downstream code checks `result.success` but upstream error handling may suppress the batch error
- Safe modification: Distinguish between file upload failure and batch failure; propagate critical errors up the stack
- Test coverage: No unit tests for upload error scenarios

**Deploy manifest file mapping logic:**
- Files: `src/commands/deploy.ts:1229-1292`
- Why fragile: Complex logic for combining upload responses + remote entries + local files with path normalization; multiple sources of truth for file checksums
- Safe modification: Add comprehensive comments; create unit test for edge cases (path case sensitivity, compression extensions, missing sha256); validate all branches covered
- Test coverage: Integration tested but path normalization edge cases unknown

## Scaling Limits

**In-memory event store unbounded:**
- Current capacity: No limit on EventStore size; grows with every manifest/profile event fetched
- Files: `src/lib/nostr.ts:44-45`
- Limit: Will cause memory bloat on long-running gateway servers; becomes significant after >10k unique sites accessed
- Scaling path: Add EventStore pruning (e.g., LRU with max 100k events); implement periodic cleanup of old events; consider disk-backed store for large deployments

**File list cache scaling:**
- Current capacity: Map with unbounded entries; one cache per unique (pubkey, identifier) pair
- Files: `src/lib/gateway.ts:95-105`
- Limit: Cache entries grow indefinitely; multi-thousand-entry gateways could hit memory limits
- Scaling path: Implement LRU with max 10k entries; add size monitoring; enable cache metrics

**Concurrent upload limit hardcoded at 4:**
- Current capacity: 4 files uploaded in parallel; no scaling based on server/network capacity
- Files: `src/lib/upload.ts:17`
- Limit: Suboptimal on high-bandwidth connections; too aggressive on constrained networks
- Scaling path: Make concurrency configurable; auto-detect based on observed upload time; implement adaptive throttling

## Dependencies at Risk

**@nick/brotli unmaintained:**
- Risk: Package has no recent updates; Deno module import from unmaintained source
- Impact: Security vulnerabilities in decompression code won't be patched; compatibility issues with future Deno versions
- Files: `src/lib/gateway.ts:2`
- Migration plan: Evaluate `brotli-wasm` or native Deno compression APIs when available; add fallback to gzip-only if brotli unavailable

**applesauce-core/relay dependency on NodeJS APIs:**
- Risk: If relay implementation uses Node-specific APIs, gateway server won't work on non-Node Deno runtimes
- Impact: Blocks potential deployment targets (Cloudflare Workers, edge runtimes)
- Files: `src/lib/nostr.ts:28`
- Migration plan: Audit applesauce-relay for Node dependencies; consider relay-lite alternative for edge deployments

## Missing Critical Features

**No webhook/event listener for remote file changes:**
- Problem: Gateway must continuously poll manifest events; no real-time notification of file updates
- Blocks: Live publishing of updated nsites without waiting for poll interval
- Files: `src/lib/gateway.ts:1553` (polling mechanism)
- Impact: Update latency measured in seconds; scaling issue for high-traffic sites

**Compression format negotiation missing:**
- Problem: Gateway always tries .br first, then .gz, then raw; no Accept-Encoding header inspection
- Blocks: Optimal compression for client capabilities; forces fallback to uncompressed for clients that support only specific formats
- Files: `src/lib/gateway.ts:1350-1425`
- Impact: Bandwidth waste; suboptimal performance for older clients

**No incremental/delta uploads:**
- Problem: All files re-uploaded on every deploy; no support for skipping unchanged binary data
- Blocks: Fast deployments for large sites with few changes; wastes server bandwidth
- Files: `src/lib/upload.ts`
- Impact: Deployment time scales with total site size, not change size

## Test Coverage Gaps

**Untested area: Upload retry logic with rate limiting:**
- What's not tested: Whether rate limit detection correctly triggers backoff and retries
- Files: `src/lib/upload.ts:44-70, 420-431`
- Risk: Rate limit recovery path may never work correctly in production; untested error condition
- Priority: High (impacts any large deployment)

**Untested area: Gateway 404 fallback file serving:**
- What's not tested: Whether 404.html is correctly identified and served with 404 status code
- Files: `src/lib/gateway.ts:1469-1494`
- Risk: 404 pages might serve with 200 status; manifest logic for fallback may have path matching bugs
- Priority: High (breaks SEO and error handling expectations)

**Untested area: Config validation with profile metadata:**
- What's not tested: Full config with nested appHandler/profile objects; validation of platform URLs
- Files: `tests/config-validator.test.ts:82-103` (test marked as "no longer applicable")
- Risk: Invalid app handler config accepted; deployment fails at runtime when publishing
- Priority: Medium (impacts app handler feature)

**Untested area: Secrets manager backend fallback:**
- What's not tested: Behavior when keychain unavailable; fallback to encrypted storage initialization
- Files: `src/lib/secrets/manager.ts:125-200`
- Risk: First-time setup on systems without native keychain fails silently; secrets silently stored as plaintext
- Priority: High (security critical)

**Untested area: NIP-46 Bunker connection timeout:**
- What's not tested: Connection timeout after 30 seconds; user experience when bunker doesn't respond
- Files: `src/lib/nip46.ts:395-410`
- Risk: Timeout appears as generic error; no helpful messaging to user about what went wrong
- Priority: Medium (impacts bunker users)

---

*Concerns audit: 2026-02-24*
