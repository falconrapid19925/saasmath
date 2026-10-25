import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { build } from 'esbuild';
const root=process.cwd();
const files={};
const contentTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
async function collect(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=resolve(dir,entry.name);
    if(entry.isDirectory())await collect(path);
    else {const extension=extname(path);if(!contentTypes[extension])throw new Error(`Unembedded binary asset: ${path}`);
      files['/'+relative(resolve(root,'client-dist'),path).replaceAll('\\','/')]={body:await readFile(path,'utf8'),type:contentTypes[extension]};}
  }
}
await collect(resolve(root,'client-dist'));
await rm(resolve(root,'dist'),{recursive:true,force:true});
await mkdir(resolve(root,'dist/server'),{recursive:true});
await mkdir(resolve(root,'dist/.openai'),{recursive:true});
await build({entryPoints:['src/server/worker.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,define:{__STATIC_FILES__:JSON.stringify(files)}});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/drizzle',{recursive:true});
const module=await import(`data:text/javascript;base64,${Buffer.from(await readFile('dist/server/index.js')).toString('base64')}`);
if(typeof module.default?.fetch!=='function')throw new Error('Missing Worker fetch export');
console.log('Sites artifact ready: embedded frontend + authoritative Worker + migrations.');
