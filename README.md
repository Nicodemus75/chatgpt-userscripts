# ChatGPT Userscripts

Public distribution repository for approved ChatGPT userscripts.

Authoritative source and project records remain in Google Drive under `/AI Governance & Infrastructure`. This repository is the Tampermonkey distribution/update channel only.

## Scripts

### ChatGPT Conversation ID Badges
- Distribution: `conversation-id-badges/chatgpt-conversation-id-badges.user.js`
- Update metadata: `conversation-id-badges/chatgpt-conversation-id-badges.meta.js`

### ChatGPT Sidebar Resizer
- Distribution: `sidebar-resizer/chatgpt-sidebar-resizer.user.js`
- Update metadata: `sidebar-resizer/chatgpt-sidebar-resizer.meta.js`

## Update model

Each installed userscript contains `@updateURL` and `@downloadURL` entries pointing to the raw files in this repository. Future approved releases increment `@version`, update the authoritative Drive copy, then publish the matching release here. Tampermonkey can then discover/install the newer version automatically.
