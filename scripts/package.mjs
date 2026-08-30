import {mkdir, rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const output = 'artifacts/ton-address-labels-2.0.0.zip';
const files = [
    'manifest.json',
    'background.js',
    'address-utils.js',
    'label-database.js',
    'refresh-utils.js',
    'content.js',
    'custom_labels.example.json',
    'README.md',
    'images/image.png'
];

await mkdir('artifacts', {recursive: true});
await rm(output, {force: true});
execFileSync('zip', ['-q', output, ...files], {stdio: 'inherit'});
execFileSync('unzip', ['-tq', output], {stdio: 'inherit'});
console.log('Created and verified ' + output);
