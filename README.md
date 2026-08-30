# TON Address Labels

This Manifest V3 browser extension adds labels for TON addresses displayed on TON Viewer. It reads the public label feed from ton-studio/ton-labels, supports local overrides, and can hide transaction rows explicitly marked as scam or suspicious by the explorer.

Labels are informational hints, not proof of ownership or safety. The extension never changes blockchain data.

## Features

- Canonicalizes valid TON friendly and raw addresses before matching.
- Handles bounceable, non-bounceable, and masterchain friendly forms.
- Labels full addresses in headings, links, and other text nodes.
- Resolves shortened addresses only when the match is unique.
- Keeps the existing explorer elements, links, icons, classes, and event handlers intact.
- Refreshes the public database immediately after installation and approximately every 24 hours.
- Retains the last known-good database when a refresh fails.
- Processes dynamically loaded page content incrementally.
- Stores the label snapshot locally; no API key or account access is required.

## Installation

1. Clone or download this repository.
2. Optionally create custom_labels.json beside the extension files.
3. Open chrome://extensions/ in a Chromium-based browser.
4. Enable Developer mode.
5. Select Load unpacked and choose this directory.

The extension currently runs on https://tonviewer.com/ pages. After editing source files or custom labels, use Reload on the extension card and refresh the TON Viewer tab.

## Custom labels

Copy custom_labels.example.json to custom_labels.json and edit the JSON object. A friendly address or a raw address can be used as a key. One key is enough to label both bounceable and non-bounceable representations of the same account.

Example:

    {
      "UQDSE2BHJi4Qowu4jgvqQ3_4-KFrR2x6DqPzFkMGczCgoLcK": "My wallet"
    }

Custom labels override public labels. The custom file is intentionally ignored by Git and is not exposed as a web-accessible extension resource.

## Data and permissions

The extension needs storage for its local snapshot, alarms for reliable MV3 refresh scheduling, TON Viewer access for the content script, and access to the upstream feed through a compressed CDN mirror with raw GitHub fallback. The feed is treated as untrusted data: addresses are validated and labels are inserted as text rather than HTML.

## Development

The main files are:

- manifest.json: extension permissions and content-script wiring
- background.js: alarm-driven feed refresh and cache management
- address-utils.js: TON friendly-address checksum and canonicalization
- label-database.js: feed parsing, validation, alias generation, and migration
- refresh-utils.js: bounded feed validation and last-good-snapshot preparation
- content.js: incremental address rendering and guarded transaction filtering

Run the complete local verification:

    npm run verify

This runs the Node test suite, JavaScript and manifest checks, and creates a verified package at artifacts/ton-address-labels-2.0.0.zip.

## License

MIT
