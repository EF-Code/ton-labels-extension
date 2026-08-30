const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const addresses = require('../address-utils.js');

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

function makeEvent() {
    const listeners = [];
    return {
        addListener(listener) {
            listeners.push(listener);
        },
        listeners
    };
}

function loadBackground() {
    const installed = makeEvent();
    const startup = makeEvent();
    const alarms = makeEvent();
    const alarmCalls = [];
    const setCalls = [];
    let feed = makeFeed();
    const state = {
        tonLabels: {'0:old': 'Old'},
        tonLabelAliases: {},
        tonLabelsMeta: {updatedAt: Date.now()}
    };

    const chrome = {
        alarms: {
            create: async (name, options) => {
                alarmCalls.push({name, options});
            },
            onAlarm: alarms
        },
        runtime: {
            getURL: file => 'chrome-extension://test/' + file,
            onInstalled: installed,
            onStartup: startup
        },
        storage: {
            local: {
                get: async keys => {
                    if (keys === 'tonLabelsMeta') {
                        return {tonLabelsMeta: state.tonLabelsMeta};
                    }
                    return {
                        tonLabelAliases: state.tonLabelAliases,
                        tonLabels: state.tonLabels
                    };
                },
                set: async values => {
                    setCalls.push(values);
                    Object.assign(state, values);
                }
            }
        }
    };

    const sandbox = {
        AbortController,
        Buffer,
        TextEncoder,
        Uint8Array,
        atob,
        btoa,
        clearTimeout,
        console,
        chrome,
        fetch: async url => {
            if (url === 'chrome-extension://test/custom_labels.json') {
                return {ok: false, status: 404};
            }
            return {
                ok: true,
                status: 200,
                text: async () => feed
            };
        },
        importScripts(...files) {
            files.forEach(file => {
                const source = fs.readFileSync(path.resolve(file), 'utf8');
                vm.runInContext(source, context, {filename: file});
            });
        },
        setTimeout,
        Date,
        Number,
        Object,
        Promise
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.resolve('background.js'), 'utf8'), context, {
        filename: 'background.js'
    });

    return {
        alarmCalls,
        alarms,
        installed,
        setCalls,
        startup,
        state,
        setFeed(value) {
            feed = value;
        }
    };
}

function waitForTasks() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

test('registers a persistent alarm and refreshes on install', async () => {
    const harness = loadBackground();
    await waitForTasks();

    assert.equal(harness.alarmCalls[0].name, 'ton-labels-refresh');
    harness.installed.listeners[0]({reason: 'install'});
    await waitForTasks();
    await waitForTasks();

    assert.equal(harness.setCalls.length, 1);
    assert.equal(Object.keys(harness.state.tonLabels).length, 10);
    assert.equal(harness.state.tonLabelsMeta.schemaVersion, 2);
});

test('retains the existing snapshot when an alarm receives malformed data', async () => {
    const harness = loadBackground();
    harness.installed.listeners[0]({reason: 'install'});
    await waitForTasks();
    await waitForTasks();

    const previousLabels = harness.state.tonLabels;
    harness.setCalls.length = 0;
    harness.setFeed(makeFeed() + '\ntruncated');
    harness.alarms.listeners[0]({name: 'ton-labels-refresh'});
    await waitForTasks();
    await waitForTasks();

    assert.equal(harness.setCalls.length, 0);
    assert.equal(harness.state.tonLabels, previousLabels);
});
