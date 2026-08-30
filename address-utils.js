(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.TonAddressLabels = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const FRIENDLY_ADDRESS_LENGTH = 48;
    const FRIENDLY_PAYLOAD_LENGTH = 34;
    const BOUNCEABLE_TAG = 0x11;
    const NON_BOUNCEABLE_TAG = 0x51;
    const TESTNET_FLAG = 0x80;

    function crc16(bytes) {
        let crc = 0;

        for (const byte of bytes) {
            crc ^= byte << 8;
            for (let bit = 0; bit < 8; bit += 1) {
                crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
                crc &= 0xffff;
            }
        }

        return crc;
    }

    function decodeBase64Url(value) {
        if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{48}$/.test(value)) {
            return null;
        }

        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

        try {
            let binary;
            if (typeof atob === 'function') {
                binary = atob(normalized + padding);
            } else if (typeof Buffer !== 'undefined') {
                binary = Buffer.from(normalized + padding, 'base64').toString('binary');
            } else {
                return null;
            }

            if (binary.length !== 36) {
                return null;
            }

            return Uint8Array.from(binary, character => character.charCodeAt(0));
        } catch {
            return null;
        }
    }

    function encodeBase64Url(bytes) {
        let binary = '';
        for (const byte of bytes) {
            binary += String.fromCharCode(byte);
        }

        let encoded;
        if (typeof btoa === 'function') {
            encoded = btoa(binary);
        } else if (typeof Buffer !== 'undefined') {
            encoded = Buffer.from(binary, 'binary').toString('base64');
        } else {
            throw new Error('No base64 encoder is available');
        }

        return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    }

    function bytesToHex(bytes) {
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    function hexToBytes(value) {
        const bytes = new Uint8Array(value.length / 2);
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
        }
        return bytes;
    }

    function normalizeRawAddress(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const match = value.trim().match(/^(-?\d+):([0-9a-fA-F]{64})$/);
        if (!match) {
            return null;
        }

        const workchain = Number(match[1]);
        if (!Number.isInteger(workchain) || workchain < -128 || workchain > 127) {
            return null;
        }

        return String(workchain) + ':' + match[2].toUpperCase();
    }

    function parseFriendlyAddress(value, options = {}) {
        if (typeof value !== 'string' || value.trim().length !== FRIENDLY_ADDRESS_LENGTH) {
            return null;
        }

        const address = value.trim();
        const bytes = decodeBase64Url(address);
        if (!bytes) {
            return null;
        }

        const tag = bytes[0];
        const baseTag = tag & ~TESTNET_FLAG;
        const bounceable = baseTag === BOUNCEABLE_TAG;
        const nonBounceable = baseTag === NON_BOUNCEABLE_TAG;
        if (!bounceable && !nonBounceable) {
            return null;
        }

        const testnet = (tag & TESTNET_FLAG) !== 0;
        if (testnet && options.allowTestnet !== true) {
            return null;
        }

        const payload = bytes.slice(0, FRIENDLY_PAYLOAD_LENGTH);
        const expectedChecksum = (bytes[34] << 8) | bytes[35];
        if (crc16(payload) !== expectedChecksum) {
            return null;
        }

        const workchain = bytes[1] >= 128 ? bytes[1] - 256 : bytes[1];
        const accountId = bytesToHex(bytes.slice(2, 34));

        return {
            address,
            accountId,
            bounceable,
            raw: String(workchain) + ':' + accountId,
            testnet,
            workchain
        };
    }

    function normalizeAddress(value, options = {}) {
        if (typeof value !== 'string') {
            return null;
        }

        const trimmed = value.trim();
        if (trimmed.includes(':')) {
            return normalizeRawAddress(trimmed);
        }

        const parsed = parseFriendlyAddress(trimmed, options);
        return parsed ? parsed.raw : null;
    }

    function toFriendlyAddress(value, bounceable = false) {
        const raw = normalizeRawAddress(value);
        if (!raw) {
            return null;
        }

        const parts = raw.split(':');
        const workchain = Number(parts[0]);
        const accountId = parts[1];
        const payload = new Uint8Array(FRIENDLY_PAYLOAD_LENGTH);
        payload[0] = bounceable ? BOUNCEABLE_TAG : NON_BOUNCEABLE_TAG;
        payload[1] = workchain < 0 ? workchain + 256 : workchain;
        payload.set(hexToBytes(accountId), 2);

        const checksum = crc16(payload);
        const bytes = new Uint8Array(36);
        bytes.set(payload);
        bytes[34] = checksum >> 8;
        bytes[35] = checksum & 0xff;
        return encodeBase64Url(bytes);
    }

    function isFriendlyAddress(value, options = {}) {
        return parseFriendlyAddress(value, options) !== null;
    }

    return {
        FRIENDLY_ADDRESS_LENGTH,
        crc16,
        isFriendlyAddress,
        normalizeAddress,
        normalizeRawAddress,
        parseFriendlyAddress,
        toFriendlyAddress
    };
}));
