(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./address-utils.js'));
    } else {
        root.TonLabelDatabase = factory(root.TonAddressLabels);
    }
}(typeof self !== 'undefined' ? self : this, function (addresses) {
    'use strict';

    const MAX_LABEL_LENGTH = 256;
    const MIN_PUBLIC_LABELS = 10;

    function normalizeLabel(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const label = value.replace(/\s+/g, ' ').trim();
        if (!label || label.length > MAX_LABEL_LENGTH) {
            return null;
        }

        return label;
    }

    function parseJsonLines(text) {
        if (typeof text !== 'string') {
            throw new TypeError('The label feed must be text');
        }

        const records = [];
        const errors = [];
        text.split(/\r?\n/).forEach((line, index) => {
            if (!line.trim()) {
                return;
            }

            try {
                const record = JSON.parse(line);
                if (!record || typeof record !== 'object' || Array.isArray(record)) {
                    throw new TypeError('record is not an object');
                }
                records.push(record);
            } catch (error) {
                errors.push({
                    line: index + 1,
                    message: error instanceof Error ? error.message : String(error)
                });
            }
        });

        return { errors, records };
    }

    function createDatabase(records, customLabels = {}) {
        const labels = {};
        const aliases = {};
        const stats = {
            acceptedCustomLabels: 0,
            acceptedPublicRecords: 0,
            rejectedCustomLabels: 0,
            rejectedPublicRecords: 0
        };

        function addAliases(raw) {
            const bounceable = addresses.toFriendlyAddress(raw, true);
            const nonBounceable = addresses.toFriendlyAddress(raw, false);
            if (bounceable) {
                aliases[bounceable] = raw;
            }
            if (nonBounceable) {
                aliases[nonBounceable] = raw;
            }
        }

        function addLabel(raw, label) {
            labels[raw] = label;
            addAliases(raw);
        }

        for (const record of Array.isArray(records) ? records : []) {
            const label = normalizeLabel(record?.label);
            const candidates = [
                addresses.normalizeAddress(record?.address),
                addresses.normalizeAddress(record?.address_uf),
                addresses.normalizeAddress(record?.address_uf_nb)
            ].filter(Boolean);
            const rawAddresses = [...new Set(candidates)];

            if (!label || rawAddresses.length === 0) {
                stats.rejectedPublicRecords += 1;
                continue;
            }

            rawAddresses.forEach(raw => addLabel(raw, label));
            stats.acceptedPublicRecords += 1;
        }

        if (customLabels && typeof customLabels === 'object' && !Array.isArray(customLabels)) {
            for (const [address, value] of Object.entries(customLabels)) {
                const raw = addresses.normalizeAddress(address);
                const label = normalizeLabel(value);

                if (!raw || !label) {
                    stats.rejectedCustomLabels += 1;
                    continue;
                }

                addLabel(raw, label);
                stats.acceptedCustomLabels += 1;
            }
        }

        return { aliases, labels, stats };
    }

    function createDatabaseFromLegacyMap(legacyLabels) {
        return createDatabase([], legacyLabels);
    }

    function isUsableDatabase(database, minimumPublicLabels = MIN_PUBLIC_LABELS) {
        if (!database || !database.labels || !database.aliases || !database.stats) {
            return false;
        }

        return database.stats.acceptedPublicRecords >= minimumPublicLabels &&
            Object.keys(database.labels).length >= minimumPublicLabels &&
            Object.keys(database.aliases).length >= minimumPublicLabels;
    }

    return {
        MAX_LABEL_LENGTH,
        MIN_PUBLIC_LABELS,
        createDatabase,
        createDatabaseFromLegacyMap,
        isUsableDatabase,
        normalizeLabel,
        parseJsonLines
    };
}));
