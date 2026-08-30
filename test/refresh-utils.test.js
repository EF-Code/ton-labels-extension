const assert = require('node:assert/strict');
const test = require('node:test');

const addresses = require('../address-utils.js');
const refresh = require('../refresh-utils.js');

function makeFeed(count = 10) {
    return Array.from({length: count}, (_, index) => {
        const raw = '0:' + (index + 1).toString(16).padStart(64, '0');
        return JSON.stringify({
            address: raw,
            address_uf: addresses.toFriendlyAddress(raw, true),
            label: 'Label ' + index
        });
    }).join('\n');
}

test('accepts a valid feed and produces a canonical snapshot', () => {
    const prepared = refresh.buildSnapshot(makeFeed());

    assert.equal(prepared.publicRecords, 10);
    assert.equal(prepared.feedErrors, 0);
    assert.equal(Object.keys(prepared.database.labels).length, 10);
});

test('rejects malformed feeds so callers can retain their old snapshot', () => {
    assert.throws(
        () => refresh.buildSnapshot(makeFeed() + '\ntruncated'),
        /malformed JSON lines/
    );
});

test('rejects empty or undersized feeds', () => {
    assert.throws(() => refresh.buildSnapshot(''), /did not contain any JSON records/);
    assert.throws(() => refresh.buildSnapshot(makeFeed(9)), /fewer than 10/);
});
