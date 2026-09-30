# ChatGPT Userscripts

Public distribution repository for approved ChatGPT userscripts.

Authoritative source and project records remain in Google Drive under `/AI Governance & Infrastructure`. This repository is the Tampermonkey distribution/update channel only.

## Scripts

### ChatGPT Conversation ID Badges
- Distribution: `conversation-id-badges/chatgpt-conversation-id-badges.user.js`
- Update metadata: `conversation-id-badges/chatgpt-conversation-id-badges.meta.js`

### ChatGPT Sidebar Resizer — RETIRED / DORMANT
- Distribution: `sidebar-resizer/chatgpt-sidebar-resizer.user.js`
- Update metadata: `sidebar-resizer/chatgpt-sidebar-resizer.meta.js`
- Status: retired 2026-09-29 after ChatGPT added native browser-sidebar resizing.
- The files are retained as a fallback/reference baseline. The script should normally remain disabled unless the native feature regresses or a narrowly scoped sidebar-title fix is needed.

## Update model

Active installed userscripts contain `@updateURL` and `@downloadURL` entries pointing to the raw files in this repository. Future approved releases increment `@version`, update the authoritative Drive copy, then publish the matching release here. Tampermonkey can then discover/install the newer version automatically.

Retired scripts remain available for fallback and historical reference but are not expected to receive releases unless the underlying need returns.
