import { build } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await rm('client-dist',{recursive:true,force:true});
await mkdir('client-dist/assets',{recursive:true});
const result=await build({entryPoints:['src/client/main.tsx'],bundle:true,format:'esm',platform:'browser',target:['es2022'],jsx:'automatic',minify:true,write:false,metafile:true,outfile:'client-dist/assets/game.js',define:{'process.env.NODE_ENV':'"production"'}});
const hash=createHash('sha256').update(result.outputFiles.map(f=>f.text).join('')).digest('hex').slice(0,12);
for(const file of result.outputFiles){const extension=file.path.endsWith('.css')?'css':'js';await writeFile(`client-dist/assets/game-${hash}.${extension}`,file.contents);}
let html=await readFile('index.html','utf8');
html=html.replace('<script type="module" src="/src/client/main.tsx"></script>',`<link rel="stylesheet" href="/assets/game-${hash}.css"/><script type="module" src="/assets/game-${hash}.js"></script>`);
await writeFile('client-dist/index.html',html);
await writeFile('client-dist/assets/meta.json',JSON.stringify({version:1,hash}));
console.log(`Browser bundle ready: ${hash}`);
