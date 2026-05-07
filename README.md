# TabVault

**TabVault** is a browser extension that turns your tab chaos into a searchable, organized archive. Instead of keeping 80 tabs open "just in case", TabVault watches for idle tabs, parks them silently in the background, and surfaces them in a clean dashboard — grouped by topic, domain, and when you opened them.

Your browser stays fast. Nothing gets lost.

---

## The Problem

Most people don't close tabs because closing feels permanent. So tabs pile up — slowing the browser, eating RAM, and making it impossible to find the thing you actually need. Bookmarks are a graveyard. History is noise.

TabVault is neither. It's a living archive of things you were actually looking at, automatically organized, always one click away.

---

## Features

- **Automatic idle detection** — tabs you haven't touched in a configurable window (default: 2 hours) enter a grace period with a notification countdown, then get parked automatically
- **Smart grouping** — three-pass algorithm: domain clustering → TF-IDF cosine similarity on titles/URLs → time proximity fallback
- **AI grouping** — optional Anthropic or OpenAI API key for smarter semantic grouping
- **Vault dashboard** — pinned tab that always stays open; shows all parked tabs in collapsible group columns
- **Drag & drop** — move tabs between groups, reorder groups by priority
- **Undo** — every destructive action (delete, move, dedup) is reversible with a one-click undo toast
- **Deduplication** — find and remove duplicate URLs across all groups; group order determines which copy is kept
- **Import / Export** — download a `tabvault-backup.md` snapshot anytime; re-import it later to restore
- **Activity log** — full history of backups, purges, deletions, moves, and dismissed alerts
- **Dismissible alerts** — proactive hints (forgotten tabs, unread tabs, bloated groups) you can close and review later in Logs
- **Per-group colors** — color-code groups for fast visual scanning
- **Firefox + Chrome** — single codebase, separate manifests (MV3 for Chrome, WebExtensions for Firefox)

---

## Install (Development)

### Prerequisites

```bash
node >= 18
npm >= 9
```

### 1. Clone and install

```bash
git clone https://github.com/zaro-me/tabvault.git
cd tabvault
npm install
```

### 2. Build

```bash
npm run build          # Chrome (Manifest V3)
npm run build:firefox  # Firefox (WebExtensions)
```

Or watch mode during development:

```bash
npm run dev            # Chrome
npm run dev:firefox    # Firefox
```

### 3. Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### 4. Load in Firefox

1. Go to `about:debugging`
2. Click **This Firefox**
3. Click **Load Temporary Add-on…**
4. Select `dist-firefox/manifest.json`

> **Note:** Firefox temporary add-ons are removed on browser restart. For persistent installs, the extension needs to be signed via Mozilla's AMO.

---

## Usage

Once installed, TabVault pins a **Vault tab** automatically. That tab is your dashboard.

| Action | How |
|---|---|
| Park a tab now | Click the toolbar icon → "Park this tab" |
| Restore a tab | Click the tab card in the Vault |
| Move a tab to another group | Drag it, or hover → ⇄ button |
| Reorder groups | Drag the ⠿ handle on any group header |
| Delete permanently | Hover a tab card → ✕ |
| Undo last action | Click **Undo** in the toast that appears |
| Import a backup | Header → 📥 Import → pick a `.md` file |
| Export a backup | Header → ⬇ Backup |
| Remove duplicates | Header → 🗂 Clear dupes |
| Archive all open tabs | Header → 🧹 Purge all tabs |
| View activity history | Header → 📋 Logs |

### Optional: AI Grouping

Add an Anthropic or OpenAI API key in **Options** (click the extension icon → Options). TabVault detects the provider from the key format (`sk-ant-...` for Anthropic, `sk-...` for OpenAI). When set, Purge and Snapshot will use AI to group tabs by semantic meaning instead of the built-in TF-IDF algorithm.

---

## Development

```bash
npm run lint    # TypeScript check + ESLint
npm run test    # Vitest unit tests
```

Run a single test file:

```bash
npx vitest run src/shared/__tests__/grouping.test.ts
```

After any code change, the dev build auto-rebuilds. Click the **↻** refresh icon on the extension card in `chrome://extensions` to reload it.

---

## Architecture

```
src/
├── background/
│   ├── service-worker.ts     # Tab lifecycle, idle detection, alarms, parking
│   └── idle-tracker.ts       # Per-tab activity map + heartbeat
├── dashboard/
│   ├── App.tsx               # Root — state wiring, dismissed alerts, undo toast
│   ├── hooks/useVault.ts     # All vault actions + undo stack
│   ├── dragState.ts          # Module-level DnD state (Firefox-safe)
│   └── components/
│       ├── Header.tsx        # Action buttons + tooltips + log panel trigger
│       ├── GroupList.tsx     # Group DnD orchestration
│       ├── GroupColumn.tsx   # Group card + drag handle + drop zone
│       ├── TabCard.tsx       # Tab row — draggable, hover actions
│       ├── AssistantBanner.tsx  # Proactive hints (dismissible)
│       ├── LogPanel.tsx      # Activity log drawer
│       └── UndoToast.tsx     # 8-second undo prompt
├── popup/                    # Toolbar flyout
├── options/                  # Settings page
└── shared/
    ├── types.ts              # StoredTab, TabGroup, VaultSettings, etc.
    ├── storage.ts            # IndexedDB (tabs, groups) + chrome.storage.local
    ├── grouping.ts           # TF-IDF cosine similarity grouping (pure functions)
    ├── ai-provider.ts        # API key provider detection
    ├── ai-grouping.ts        # Anthropic/OpenAI grouping (fallback to TF-IDF)
    ├── backup.ts             # Markdown export
    └── import.ts             # Markdown import parser
```

**Data flow:** Service worker monitors tabs → on idle threshold, writes to IndexedDB via `storage.ts` → dashboard reads via `useVault` hook → renders in real time via `chrome.runtime.sendMessage` → user actions write back through the same hook.

---

## Backup Format

Backups are plain Markdown files, human-readable and re-importable:

```markdown
# TabVault Backup

> Last updated: 2026-04-07
> Total archived tabs: 42 across 6 groups

## Research (8 tabs)

- [Some Article Title](https://example.com/article) — *archived 2026-04-06*
- [Another Tab](https://example.com/other) — *archived 2026-04-05*

## YouTube / Video (5 tabs)

- [Video Title - YouTube](https://youtube.com/watch?v=...) — *archived 2026-04-04*
```

Import accepts any `.md` file in this format (group-order priority determines which copy survives deduplication).

---

## License

MIT
