import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const assets=['index.html','app.css','app.js','sync.js','layout.js','rest-timer.js','training-metrics.js','photo-tools.js','manifest.json','icon.svg','sw.js'];
const output=join(root,'dist');await mkdir(output,{recursive:true});
for(const asset of assets){await copyFile(join(root,asset),join(output,asset));}
const digest=createHash('sha256');for(const asset of assets)digest.update(await readFile(join(output,asset)));
console.log(`Prepared ${assets.length} runtime assets; SHA-256 ${digest.digest('hex')}`);
