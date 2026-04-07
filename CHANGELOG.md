# Changelog

All notable changes to TabVault are documented here.

## [Unreleased]

### Added
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
- Firefox drag-and-drop compatibility (module-level singleton bypasses Firefox `dataTransfer` restrictions)
- Group `...` menu clipped when group is collapsed (removed `overflow-hidden` from group root; scoped to tab list only)
- Double `getAllGroups()` call in `moveTab` (now conditionally re-fetches only for new-group moves)
- Orphaned tabs (tabs referencing deleted groups) now cleaned up on dashboard load

## [0.1.0] — 2026-04-06

Initial working build:
- Automatic idle detection with configurable threshold (default: 2 hours)
- Three-pass grouping: domain → TF-IDF topic → time proximity
- Vault dashboard (pinned tab, always restored after close)
- Markdown backup export / import
- Activity log
- Chrome MV3 + Firefox WebExtensions dual build
