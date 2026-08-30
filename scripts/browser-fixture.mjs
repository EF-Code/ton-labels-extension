import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';

const profile = mkdtempSync(resolve(tmpdir(), 'ton-address-labels-browser-'));
const fixture = resolve('test/fixtures/content-fixture.html');
const url = 'file://' + fixture;

try {
    const output = execFileSync('chromium', [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--allow-file-access-from-files',
        '--disable-dev-shm-usage',
        '--virtual-time-budget=1500',
        '--user-data-dir=' + profile,
        '--dump-dom',
        url
    ], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});

    const checks = {
        dynamicAddressLabeled: output.includes('id="dynamic"') &&
            output.includes('🏷️ Fixture wallet'),
        headingLabeled: output.includes('id="primary"') &&
            output.includes('data-ton-labels-badge="true"'),
        existingLinkPreserved: output.includes('id="breadcrumb" class="active"') &&
            output.includes('UQAzAYi1…ql_1EeYe'),
        suspiciousRowHidden: output.includes('id="suspicious-row"') &&
            output.includes('data-ton-labels-hidden="true"')
    };

    if (!Object.values(checks).every(Boolean)) {
        console.error(output);
        throw new Error('Browser fixture failed: ' + JSON.stringify(checks));
    }

    console.log('Browser fixture passed: ' + JSON.stringify(checks));
} finally {
    rmSync(profile, {recursive: true, force: true});
}
