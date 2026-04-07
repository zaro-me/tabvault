# Contributing to TabVault

Thanks for your interest in contributing. This guide covers setup, code style, and the PR process.

## Setup

```bash
git clone https://github.com/zaro-me/tabvault.git
cd tabvault/tabvault
npm install
npm run dev        # Chrome (watch mode → dist/)
npm run dev:firefox  # Firefox (watch mode → dist-firefox/)
```

Load the unpacked extension:
- **Chrome**: `chrome://extensions` → Developer mode → Load unpacked → `dist/`
- **Firefox**: `about:debugging` → This Firefox → Load Temporary Add-on → `dist-firefox/manifest.json`

After any code change, the build rebuilds automatically. Click the refresh icon on the extension card to reload it.

## Code style

- **TypeScript** throughout — no `any`, no suppressed errors
- **Functional React** — hooks only, no class components
- **Pure functions** for data logic in `src/shared/` — no side effects, no browser APIs
- **No premature abstractions** — don't create helpers for one-off use cases
- Keep component files focused on rendering; keep business logic in `useVault.ts` or shared modules

## Testing

```bash
npm run test            # Run all tests
npm run lint            # ESLint + TypeScript check
npx vitest run src/shared/__tests__/grouping.test.ts  # Single file
```

All new logic in `src/shared/` should have unit tests. Dashboard components don't require tests for simple layout changes, but any non-trivial state logic should be covered.

## Pull requests

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes — keep commits focused and atomic
3. Run `npm run lint && npm run test && npm run build && npm run build:firefox` — all must pass
4. Open a PR against `main` with a clear description of what you changed and why
5. Link any related issues

Prefer one PR per feature or fix. Don't bundle unrelated changes.

## What we're looking for

- Bug fixes backed by a failing test
- Performance improvements with measured impact
- UX improvements that reduce friction without adding complexity
- Firefox compatibility fixes

## What we're not looking for (currently)

- Cloud sync or remote storage
- Account / login flows
- Screenshot capture (intentionally removed for privacy)
- Features that require backend infrastructure
