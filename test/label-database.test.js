const assert = require('node:assert/strict');
const test = require('node:test');

const addresses = require('../address-utils.js');
const database = require('../label-database.js');

function makeRaw(index) {
    return '0:' + index.toString(16).padStart(64, '0').toUpperCase();
}

function makeRecords(count = 12) {
    return Array.from({length: count}, (_, index) => {
        const raw = makeRaw(index + 1);
        return {
            address: raw,
            address_uf: addresses.toFriendlyAddress(raw, true),
            address_uf_nb: addresses.toFriendlyAddress(raw, false),
            label: 'Label ' + (index + 1)
        };
    });
}

test('parses JSONL while reporting malformed lines', () => {
    const parsed = database.parseJsonLines('{"label":"one"}\nnot-json\n\n[]\n');

    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.errors.length, 2);
    assert.deepEqual(parsed.errors.map(error => error.line), [2, 4]);
});

test('canonicalizes public records and applies custom labels to every alias', () => {
    const raw = makeRaw(1);
    const uq = addresses.toFriendlyAddress(raw, false);
    const result = database.createDatabase(makeRecords(), {
        [uq]: 'My Wallet'
    });

    assert.equal(result.labels[raw], 'My Wallet');
    assert.equal(result.aliases[addresses.toFriendlyAddress(raw, true)], raw);
    assert.equal(result.aliases[uq], raw);
    assert.equal(result.stats.acceptedPublicRecords, 12);
    assert.equal(result.stats.acceptedCustomLabels, 1);
    assert.equal(database.isUsableDatabase(result), true);
});

test('rejects invalid records and invalid custom labels', () => {
    const result = database.createDatabase([
        {address: 'not-valid', label: 'bad'},
        {address: makeRaw(1), label: ''},
        {address: makeRaw(2), label: 'valid'}
    ], {
        [makeRaw(3)]: 42,
        notAnAddress: 'bad'
    });

    assert.equal(result.stats.acceptedPublicRecords, 1);
    assert.equal(result.stats.rejectedPublicRecords, 2);
    assert.equal(result.stats.acceptedCustomLabels, 0);
    assert.equal(result.stats.rejectedCustomLabels, 2);
    assert.equal(Object.keys(result.labels).length, 1);
});

test('migrates the original friendly-keyed storage format', () => {
    const raw = makeRaw(99);
    const friendly = addresses.toFriendlyAddress(raw, false);
    const result = database.createDatabaseFromLegacyMap({[friendly]: 'Legacy'});

    assert.equal(result.labels[raw], 'Legacy');
    assert.equal(result.aliases[friendly], raw);
});
