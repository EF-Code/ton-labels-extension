const assert = require('node:assert/strict');
const test = require('node:test');

const addresses = require('../address-utils.js');
const content = require('../content.js');
const database = require('../label-database.js');

const RAW = '0:330188B5DA9E49A5F8CCD1A1FE1A1D911BA04ABE184473E187AD33E3AA5FF511';
const EQ = addresses.toFriendlyAddress(RAW, true);
const UQ = addresses.toFriendlyAddress(RAW, false);

function makeSnapshot(label = 'Wallet') {
    return database.createDatabase(
        Array.from({length: 10}, () => ({address: RAW, label})),
        {}
    );
}

test('finds full addresses in headings and other text nodes', () => {
    const snapshot = makeSnapshot();
    const match = content.lookupLabel(UQ, snapshot);

    assert.deepEqual(match, {
        address: UQ,
        label: 'Wallet',
        raw: RAW
    });
});

test('finds unique shortened addresses across both display formats', () => {
    const snapshot = makeSnapshot('Treasury');
    const shortened = UQ.slice(0, 8) + '…' + UQ.slice(-6);
    const match = content.lookupLabel(shortened, snapshot);

    assert.equal(match.raw, RAW);
    assert.equal(match.label, 'Treasury');
});

test('does not guess when shortened text matches multiple addresses', () => {
    const secondRaw = '0:330188B5DA9E49A5F8CCD1A1FE1A1D911BA04ABE184473E187AD33E3AA5FF512';
    const snapshot = {
        aliases: {
            EQ11111111111111111111111111111111111111111111ZZ: RAW,
            EQ22222222222222222222222222222222222222222222ZZ: secondRaw
        },
        labels: {
            [RAW]: 'Wallet',
            [secondRaw]: 'Other'
        }
    };
    const shortened = 'EQ…ZZ';

    assert.equal(content.lookupLabel(shortened, snapshot), null);
});

test('preserves whitespace around rendered labels', () => {
    assert.equal(
        content.withPreservedWhitespace('  EQ...  ', '🏷️ Wallet'),
        '  🏷️ Wallet  '
    );
});
