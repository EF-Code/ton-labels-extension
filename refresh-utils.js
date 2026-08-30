(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./label-database.js'));
    } else {
        root.TonLabelRefresh = factory(root.TonLabelDatabase);
    }
}(typeof self !== 'undefined' ? self : this, function (database) {
    'use strict';

    const MAX_FEED_BYTES = 8 * 1024 * 1024;

    function byteLength(value) {
        if (typeof TextEncoder === 'function') {
            return new TextEncoder().encode(value).byteLength;
        }
        if (typeof Buffer !== 'undefined') {
            return Buffer.byteLength(value, 'utf8');
        }
        return value.length;
    }

    function buildSnapshot(feedText, customLabels = {}) {
        if (byteLength(feedText) > MAX_FEED_BYTES) {
            throw new Error('Label feed exceeds ' + MAX_FEED_BYTES + ' bytes');
        }

        const parsed = database.parseJsonLines(feedText);
        if (parsed.records.length === 0) {
            throw new Error('Label feed did not contain any JSON records');
        }
        if (parsed.errors.length > 0) {
            throw new Error('Label feed contained ' + parsed.errors.length + ' malformed JSON lines');
        }

        const result = database.createDatabase(parsed.records, customLabels);
        if (!database.isUsableDatabase(result)) {
            throw new Error(
                'Label feed contained fewer than ' + database.MIN_PUBLIC_LABELS + ' usable public labels'
            );
        }

        return {
            database: result,
            feedErrors: parsed.errors.length,
            publicRecords: parsed.records.length
        };
    }

    return {
        MAX_FEED_BYTES,
        buildSnapshot
    };
}));
