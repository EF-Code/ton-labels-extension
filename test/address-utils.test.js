const assert = require('node:assert/strict');
const test = require('node:test');

const addresses = require('../address-utils.js');

const BOUNCEABLE = 'EQAzAYi12p5JpfjM0aH-Gh2RG6BKvhhEc-GHrTPjql_1Ebvb';
const NON_BOUNCEABLE = 'UQAzAYi12p5JpfjM0aH-Gh2RG6BKvhhEc-GHrTPjql_1EeYe';
const RAW = '0:330188B5DA9E49A5F8CCD1A1FE1A1D911BA04ABE184473E187AD33E3AA5FF511';

test('parses and canonicalizes both friendly representations', () => {
    assert.equal(addresses.normalizeAddress(BOUNCEABLE), RAW);
    assert.equal(addresses.normalizeAddress(NON_BOUNCEABLE), RAW);
    assert.equal(addresses.normalizeAddress(RAW.toLowerCase()), RAW);
    assert.equal(addresses.toFriendlyAddress(RAW, true), BOUNCEABLE);
    assert.equal(addresses.toFriendlyAddress(RAW, false), NON_BOUNCEABLE);
});

test('validates the friendly-address checksum and length', () => {
    assert.equal(addresses.parseFriendlyAddress(BOUNCEABLE)?.workchain, 0);
    assert.equal(addresses.parseFriendlyAddress(BOUNCEABLE)?.testnet, false);
    assert.equal(addresses.parseFriendlyAddress(BOUNCEABLE.slice(0, -1) + 'a'), null);
    assert.equal(addresses.parseFriendlyAddress(BOUNCEABLE.slice(0, -1)), null);
});

test('supports masterchain friendly addresses without confusing them with labels', () => {
    const masterchain = '-1:' + '00'.repeat(32);
    const bounceable = addresses.toFriendlyAddress(masterchain, true);
    const nonBounceable = addresses.toFriendlyAddress(masterchain, false);

    assert.match(bounceable, /^Ef/);
    assert.match(nonBounceable, /^Uf/);
    assert.equal(addresses.normalizeAddress(bounceable), masterchain);
    assert.equal(addresses.normalizeAddress(nonBounceable), masterchain);
});

test('rejects malformed or unsupported address values', () => {
    assert.equal(addresses.normalizeAddress('not-an-address'), null);
    assert.equal(addresses.normalizeAddress('0:' + '0'.repeat(63)), null);
    assert.equal(addresses.normalizeAddress('128:' + '0'.repeat(64)), null);
    assert.equal(addresses.normalizeAddress('1:' + '0'.repeat(64)), '1:' + '0'.repeat(64));
});
