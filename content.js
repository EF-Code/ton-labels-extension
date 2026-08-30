(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(
            require('./address-utils.js'),
            require('./label-database.js')
        );
    } else if (root.TonAddressLabels && root.TonLabelDatabase) {
        root.TonLabelContent = factory(root.TonAddressLabels, root.TonLabelDatabase);
        if (root.document && root.chrome) {
            root.TonLabelContent.start(root.document, root.chrome);
        }
    }
}(typeof self !== 'undefined' ? self : this, function (addresses, database) {
    'use strict';

    const BADGE_ATTRIBUTE = 'data-ton-labels-badge';
    const ADDRESS_ATTRIBUTE = 'data-ton-labels-address';
    const LABEL_ATTRIBUTE = 'data-ton-labels-label';
    const ORIGINAL_ATTRIBUTE = 'data-ton-labels-original';
    const HIDDEN_ATTRIBUTE = 'data-ton-labels-hidden';
    const SHORTENED_PATTERN = /^[A-Za-z0-9_-]+(?:…|\.{3})[A-Za-z0-9_-]+$/;

    function snapshotFromStorage(data) {
        if (data?.tonLabelAliases && data?.tonLabels) {
            return {
                aliases: data.tonLabelAliases,
                labels: data.tonLabels
            };
        }

        return database.createDatabaseFromLegacyMap(data?.tonLabels || {});
    }

    function lookupLabel(value, snapshot) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text || !snapshot) {
            return null;
        }

        const exactRaw = addresses.normalizeAddress(text);
        if (exactRaw && typeof snapshot.labels[exactRaw] === 'string') {
            return {
                address: text.includes(':')
                    ? (addresses.toFriendlyAddress(exactRaw, false) || text)
                    : text,
                label: snapshot.labels[exactRaw],
                raw: exactRaw
            };
        }

        if (!SHORTENED_PATTERN.test(text)) {
            return null;
        }

        const separator = text.includes('…') ? '…' : '...';
        const parts = text.split(separator);
        if (parts.length !== 2) {
            return null;
        }

        const matchingAliases = Object.keys(snapshot.aliases || {}).filter(address =>
            address.startsWith(parts[0]) && address.endsWith(parts[1])
        );
        const matchingRawAddresses = [...new Set(
            matchingAliases.map(address => snapshot.aliases[address])
        )];
        if (matchingRawAddresses.length !== 1) {
            return null;
        }

        const raw = matchingRawAddresses[0];
        const label = snapshot.labels[raw];
        if (typeof label !== 'string') {
            return null;
        }

        return {
            address: matchingAliases[0],
            label,
            raw
        };
    }

    function withPreservedWhitespace(original, replacement) {
        const leading = original.match(/^\s*/)?.[0] || '';
        const trailing = original.match(/\s*$/)?.[0] || '';
        return leading + replacement + trailing;
    }

    function isTransactionRow(element) {
        const role = element.getAttribute?.('role') || '';
        const testId = element.getAttribute?.('data-testid') || '';
        const className = typeof element.className === 'string' ? element.className : '';
        const href = element.getAttribute?.('href') || '';

        return role.toLowerCase() === 'row' ||
            /transaction|tx/i.test(testId) ||
            /transaction/i.test(className) ||
            (element.tagName === 'A' && /\/(?:transaction|tx)(?:\/|$)/i.test(href));
    }

    function containsScamMarker(element) {
        return Boolean(
            element.classList?.contains('scam') ||
            element.querySelector?.('.scam')
        );
    }

    function containsSuspiciousText(element) {
        return /\bsuspicious\b/i.test((element.textContent || '').trim());
    }

    function hideSuspiciousTransactions(document) {
        const candidates = document.querySelectorAll(
            '[role="row"], li, a[href], [data-testid], [class*="transaction"]'
        );

        candidates.forEach(element => {
            if (!isTransactionRow(element)) {
                return;
            }

            const suspicious = containsScamMarker(element) || containsSuspiciousText(element);
            if (suspicious) {
                element.hidden = true;
                element.setAttribute(HIDDEN_ATTRIBUTE, 'true');
            }
        });

        document.querySelectorAll('[' + HIDDEN_ATTRIBUTE + '="true"]').forEach(element => {
            if (!containsScamMarker(element) && !containsSuspiciousText(element)) {
                element.hidden = false;
                element.removeAttribute(HIDDEN_ATTRIBUTE);
            }
        });
    }

    function createController(document, chrome) {
        let observer = null;
        let snapshot = null;
        let snapshotPromise = null;
        let flushScheduled = false;
        let pendingRoots = new Set();

        function isGeneratedBadge(element) {
            return Boolean(element?.closest?.('[' + BADGE_ATTRIBUTE + '="true"]'));
        }

        function createBadge(node, match) {
            const parent = node.parentElement;
            if (!parent || isGeneratedBadge(parent)) {
                return;
            }

            const original = node.nodeValue || '';
            const hasInteractiveAncestor = Boolean(
                parent.closest?.('a,button,[role="button"],input,select,textarea')
            );
            const badge = document.createElement(hasInteractiveAncestor ? 'span' : 'a');

            badge.setAttribute(BADGE_ATTRIBUTE, 'true');
            badge.setAttribute(ADDRESS_ATTRIBUTE, match.raw);
            badge.setAttribute(LABEL_ATTRIBUTE, match.label);
            badge.setAttribute(ORIGINAL_ATTRIBUTE, original);
            badge.title = match.raw;
            badge.textContent = withPreservedWhitespace(original, '🏷️ ' + match.label);

            if (badge.tagName === 'A') {
                badge.setAttribute('href', '/' + match.address);
                badge.style.textDecoration = 'none';
            }

            node.parentNode.replaceChild(badge, node);
        }

        function updateBadges() {
            document.querySelectorAll('[' + BADGE_ATTRIBUTE + '="true"]').forEach(badge => {
                const raw = badge.getAttribute(ADDRESS_ATTRIBUTE);
                const original = badge.getAttribute(ORIGINAL_ATTRIBUTE) || '';
                const label = raw ? snapshot.labels[raw] : null;

                if (typeof label !== 'string') {
                    badge.parentNode?.replaceChild(document.createTextNode(original), badge);
                    return;
                }

                badge.setAttribute(LABEL_ATTRIBUTE, label);
                const rendered = withPreservedWhitespace(original, '🏷️ ' + label);
                if (badge.textContent !== rendered) {
                    badge.textContent = rendered;
                }
            });
        }

        function scanRoot(root) {
            if (!root || root.nodeType === 1 && root.hasAttribute(BADGE_ATTRIBUTE)) {
                return;
            }

            const textNodes = [];
            if (root.nodeType === 3) {
                textNodes.push(root);
            } else {
                const walker = document.createTreeWalker(root, 4);
                let node = walker.nextNode();
                while (node) {
                    textNodes.push(node);
                    node = walker.nextNode();
                }
            }

            textNodes.forEach(node => {
                const parent = node.parentElement;
                if (!parent || isGeneratedBadge(parent)) {
                    return;
                }

                const tagName = parent.tagName;
                if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT' ||
                    tagName === 'TEXTAREA' || tagName === 'OPTION') {
                    return;
                }

                const match = lookupLabel(node.nodeValue, snapshot);
                if (match) {
                    createBadge(node, match);
                }
            });
        }

        async function readSnapshot() {
            if (snapshot) {
                return snapshot;
            }
            if (!snapshotPromise) {
                snapshotPromise = chrome.storage.local.get([
                    'tonLabels',
                    'tonLabelAliases'
                ]).then(data => {
                    snapshot = snapshotFromStorage(data);
                    return snapshot;
                }).catch(error => {
                    snapshotPromise = null;
                    console.warn('Unable to load TON labels', error);
                    return null;
                });
            }
            return snapshotPromise;
        }

        async function flush() {
            flushScheduled = false;
            const roots = [...pendingRoots];
            pendingRoots = new Set();
            const currentSnapshot = await readSnapshot();
            if (!currentSnapshot) {
                return;
            }

            updateBadges();
            roots.forEach(scanRoot);
            hideSuspiciousTransactions(document);
        }

        function schedule(root) {
            const candidate = root?.nodeType === 3 ? root.parentNode : root;
            if (candidate) {
                pendingRoots.add(candidate);
            }

            if (!flushScheduled) {
                flushScheduled = true;
                Promise.resolve().then(flush);
            }
        }

        function start() {
            if (observer || !document.body) {
                return;
            }

            observer = new MutationObserver(records => {
                records.forEach(record => {
                    if (record.type === 'characterData') {
                        schedule(record.target);
                    } else {
                        record.addedNodes.forEach(schedule);
                    }
                });
            });
            observer.observe(document.body, {
                characterData: true,
                childList: true,
                subtree: true
            });

            chrome.storage.onChanged?.addListener((changes, areaName) => {
                if (areaName === 'local' &&
                    (changes.tonLabels || changes.tonLabelAliases)) {
                    snapshot = null;
                    snapshotPromise = null;
                    schedule(document.body);
                }
            });

            schedule(document.body);
        }

        function stop() {
            observer?.disconnect();
            observer = null;
            pendingRoots = new Set();
            flushScheduled = false;
        }

        return {
            flush,
            lookupLabel,
            snapshotFromStorage,
            start,
            stop
        };
    }

    function start(document, chrome) {
        const controller = createController(document, chrome);
        controller.start();
        return controller;
    }

    return {
        createController,
        lookupLabel,
        snapshotFromStorage,
        start,
        withPreservedWhitespace
    };
}));
