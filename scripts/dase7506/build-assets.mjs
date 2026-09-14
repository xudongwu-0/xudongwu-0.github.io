// Fingerprint the complete browser module graph so cached releases cannot mix.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../courses/dase7506/',import.meta.url));
const assets=path.join(root,'assets');
fs.mkdirSync(assets,{recursive:true});
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
function emit(stem,extension,content){
  const hash=createHash('sha256').update(content).digest('hex').slice(0,12);
  const name=`${stem}.${hash}.${extension}`;
  fs.writeFileSync(path.join(assets,name),content);
  return name;
}
function replaceOnce(source,before,after){
  if(source.split(before).length!==2) throw new Error(`Expected one reference to ${before}`);
  return source.replace(before,after);
}
const projects=emit('projects','mjs',read('projects.mjs'));
const arena=emit('arena','mjs',replaceOnce(read('arena.mjs'),"'./projects.mjs'",`'./${projects}'`));
const app=emit('app','mjs',replaceOnce(read('app.mjs'),"'./arena.mjs'",`'./${arena}'`));
const instructor=emit('instructor','mjs',replaceOnce(read('instructor.mjs'),"'./arena.mjs'",`'./${arena}'`));
const css=emit('arena','css',read('arena.css'));
let html=read('index.html');
for(const [pattern,replacement] of [
  [/src="(?:assets\/)?app(?:\.[a-f0-9]{12})?\.mjs"/g,`src="assets/${app}"`],
  [/href="(?:assets\/)?arena(?:\.[a-f0-9]{12})?\.css"/g,`href="assets/${css}"`],
]){
  if([...html.matchAll(pattern)].length!==1) throw new Error(`Expected one HTML asset reference: ${pattern}`);
  html=html.replace(pattern,replacement);
}
fs.writeFileSync(path.join(root,'index.html'),html);
let teacher=read('instructor.html');
teacher=teacher.replace(/src="(?:assets\/)?instructor(?:\.[a-f0-9]{12})?\.mjs"/,`src="assets/${instructor}"`)
  .replace(/href="(?:assets\/)?arena(?:\.[a-f0-9]{12})?\.css"/,`href="assets/${css}"`);
fs.writeFileSync(path.join(root,'instructor.html'),teacher);
// Keep earlier fingerprinted releases available for already cached HTML.
console.log(JSON.stringify({app,instructor,arena,projects,css},null,2));
