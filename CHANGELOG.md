# Changelog

All notable changes to TabVault are documented here.

## [0.2.0] — 2026-07-21

### Added
- **Manual folders** — create persistent empty folders and organize tabs into them
- **Anthropic + OpenAI grouping** — provider is detected from the configured API key
- **Expand/Collapse All and Clear Vault** — everyday dashboard controls with confirmation and undo protection
- **Ignored-domain enforcement** — configured domains and their subdomains are excluded from automatic, manual bulk, and snapshot archiving
- **Large restore confirmation** — opening more than 10 tabs requires a second click
- **Drag & drop** — move tabs between groups by dragging; reorder groups by dragging the ⠿ handle
- **Undo** — every destructive action (delete tab, delete group, move tab, dedup, reorder) can be reversed with a one-click undo toast (8-second window)
- **Deduplication** — remove duplicate URLs across all groups; group order determines which copy is kept
- **Import** — accept any `.md` backup file and inject tabs back into the vault; merges into existing groups by label
- **Dismissible alerts** — proactive hints (forgotten tabs, unread tabs, large groups, recently archived) can be closed individually
- **Logs panel** — slide-in drawer showing dismissed alerts and full activity history (backups, purges, deletions, moves, dedup)
- **Per-group colors** — 9-color palette for visual grouping
- **Group menu always visible** — group options (rename, color, delete) accessible whether the group is collapsed or expanded
- **Notifications toggle** — silent mode (default) vs notification mode with grace-period countdown, configurable in Options
- **AI grouping** — optional Claude API key in Options for semantic grouping during Purge/Snapshot
- **API key security warning** — reminder to set a spending cap when using an Anthropic API key
- **Recently archived hint** — banner shows how many tabs were silently archived in the last 2 hours
- **Passive archiving mode** — tabs archived silently by default, no notification required
- **Park queue** — serialized parking prevents race conditions when multiple tabs go idle simultaneously
- **Tracker cleanup** — service worker heartbeat removes stale entries for tabs that were closed externally
- **O(n²) grouping cap** — full pairwise TF-IDF comparison capped at 300 tabs; greedy assignment for overflow
- **Groups start collapsed** — vault loads with all groups collapsed to reduce visual noise
- **GitHub Actions CI** — lint + test + build on every PR

### Fixed
- Existing tabs are enrolled after browser or MV3 service-worker restarts
- Native browser-pinned tabs are now protected from automatic archiving
- Automatic parking rechecks activity after slow AI calls and will not close a tab the user returned to
- Repeated park requests are serialized without swallowing a later manual archive request
- Popup pin state now persists visually, and popup/background failures are shown instead of hanging
- Snapshot and purge skip URLs already stored in the vault; purge safely closes already-archived duplicates
- Stored group membership and group order self-heal after interrupted or older writes
- Ignored-domain matching is normalized and includes subdomains without matching lookalike domains
- Backup throttling survives dashboard reloads, and Markdown round-trips URLs containing parentheses
- Restoring a large group opens tabs sequentially and removes each archive only after its browser tab succeeds
- Search trims whitespace and matches group labels as well as tab titles and URLs
- Reordering while search is active preserves hidden groups in the overall order
- GitHub Actions now targets the actual `master` branch and repository-root package
- Firefox drag-and-drop compatibility (module-level singleton bypasses Firefox `dataTransfer` restrictions)
- Group `...` menu clipped when group is collapsed (removed `overflow-hidden` from group root; scoped to tab list only)
- Double `getAllGroups()` call in `moveTab` (now conditionally re-fetches only for new-group moves)
- Orphaned tabs (tabs referencing deleted groups) now cleaned up on dashboard load

### Changed
- Updated Vite, Vitest, TypeScript, UUID, and the extension build plugin; dependency audit is clean
- Replaced broad all-site host access with API- and favicon-specific host permissions
- Tab actions remain visible on touch-sized layouts and group headers are keyboard operable

## [0.1.0] — 2026-04-06

Initial working build:
- Automatic idle detection with configurable threshold (default: 2 hours)
- Three-pass grouping: domain → TF-IDF topic → time proximity
- Vault dashboard (pinned tab, always restored after close)
- Markdown backup export / import
- Activity log
- Chrome MV3 + Firefox WebExtensions dual build
