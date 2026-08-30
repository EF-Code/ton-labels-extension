importScripts('address-utils.js', 'label-database.js', 'refresh-utils.js');

const LABEL_FEED_URLS = [
    'https://cdn.jsdelivr.net/gh/ton-studio/ton-labels@build/assets.json',
    'https://raw.githubusercontent.com/ton-studio/ton-labels/refs/heads/build/assets.json'
];
const REFRESH_ALARM_NAME = 'ton-labels-refresh';
const REFRESH_PERIOD_MINUTES = 24 * 60;
const REFRESH_PERIOD_MS = REFRESH_PERIOD_MINUTES * 60 * 1000;

function fetchWithTimeout(url, timeoutMs = 90_000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    return fetch(url, {
        cache: 'no-store',
        signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));
}

async function loadCustomLabels() {
    let response;
    try {
        response = await fetch(chrome.runtime.getURL('custom_labels.json'), {
            cache: 'no-store'
        });
    } catch (error) {
        // The file is optional and is intentionally absent from a clean clone.
        console.debug('No custom labels file found', error);
        return {};
    }

    if (response.status === 404) {
        return {};
    }
    if (!response.ok) {
        throw new Error('Custom labels returned HTTP ' + response.status);
    }

    const customLabels = await response.json();
    if (!customLabels || typeof customLabels !== 'object' || Array.isArray(customLabels)) {
        throw new Error('custom_labels.json must contain a JSON object');
    }

    return customLabels;
}

async function fetchLabelFeed() {
    let lastError = null;

    for (const url of LABEL_FEED_URLS) {
        try {
            const response = await fetchWithTimeout(url);
            if (!response.ok) {
                throw new Error('Label feed returned HTTP ' + response.status);
            }
            return await response.text();
        } catch (error) {
            lastError = error;
            console.warn('TON label feed source failed: ' + url, error);
        }
    }

    throw lastError || new Error('No label feed source was available');
}

async function fetchAndStoreTonLabels(reason = 'scheduled') {
    try {
        const text = await fetchLabelFeed();
        // A malformed custom file should not silently discard the user's last
        // known-good snapshot, so it fails the refresh as a whole.
        const customLabels = await loadCustomLabels();
        const prepared = TonLabelRefresh.buildSnapshot(text, customLabels);
        const database = prepared.database;

        const updatedAt = Date.now();
        await chrome.storage.local.set({
            tonLabels: database.labels,
            tonLabelAliases: database.aliases,
            tonLabelsMeta: {
                acceptedCustomLabels: database.stats.acceptedCustomLabels,
                acceptedPublicRecords: database.stats.acceptedPublicRecords,
                feedErrors: prepared.feedErrors,
                schemaVersion: 2,
                updatedAt
            }
        });

        console.log(
            'TON labels updated (' + reason + '): ' +
            Object.keys(database.labels).length + ' addresses, ' +
            Object.keys(database.aliases).length + ' display aliases from ' +
            prepared.publicRecords + ' public records'
        );
        return true;
    } catch (error) {
        console.warn('TON label refresh failed; retaining the previous snapshot', error);
        return false;
    }
}

async function scheduleRefreshAlarm() {
    await chrome.alarms.create(REFRESH_ALARM_NAME, {
        periodInMinutes: REFRESH_PERIOD_MINUTES
    });
}

async function refreshIfStale() {
    const stored = await chrome.storage.local.get('tonLabelsMeta');
    const updatedAt = stored.tonLabelsMeta?.updatedAt;
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt >= REFRESH_PERIOD_MS) {
        await fetchAndStoreTonLabels('startup');
    }
}

chrome.runtime.onInstalled.addListener(() => {
    void scheduleRefreshAlarm();
    void fetchAndStoreTonLabels('install/update');
});

chrome.runtime.onStartup.addListener(() => {
    void scheduleRefreshAlarm();
    void refreshIfStale();
});

chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === REFRESH_ALARM_NAME) {
        void fetchAndStoreTonLabels('alarm');
    }
});

// This also covers unpacked-extension reloads where onInstalled is not fired.
void scheduleRefreshAlarm();
