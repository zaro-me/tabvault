# Security Policy

## Supported Versions

Only the latest release receives security fixes.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Email the maintainer directly or open a [GitHub Security Advisory](https://github.com/zaro-me/tabvault/security/advisories/new) with:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested fix or mitigation

You can expect an acknowledgement within 48 hours. If the vulnerability is confirmed, a fix will be prioritized for the next release.

## Scope

TabVault is a browser extension that runs entirely locally. It does not have a backend server. The relevant attack surface is:

- The extension's content security policy and permissions
- The Anthropic API key stored in `chrome.storage.local` (plaintext — set a spending cap)
- Cross-site data leakage via tab metadata (titles, URLs) visible to the extension
- The markdown import parser (untrusted `.md` file input)
