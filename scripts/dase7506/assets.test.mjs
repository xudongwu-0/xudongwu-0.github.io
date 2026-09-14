import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

const root=new URL('../../courses/dase7506/',import.meta.url);
const read=name=>fs.readFileSync(new URL(name,root),'utf8');
test('published entry uses a complete fingerprinted module graph with current source and MP1 open',async()=>{
  const html=read('index.html');
  const appPath=html.match(/src="(assets\/app\.[a-f0-9]{12}\.mjs)"/)[1];
  const cssPath=html.match(/href="(assets\/arena\.[a-f0-9]{12}\.css)"/)[1];
  const app=read(appPath);
  const arenaName=app.match(/from '\.\/(arena\.[a-f0-9]{12}\.mjs)'/)[1];
  const arena=read(`assets/${arenaName}`);
  const projectsName=arena.match(/from '\.\/(projects\.[a-f0-9]{12}\.mjs)'/)[1];
  const projects=read(`assets/${projectsName}`);
  assert.equal(app,read('app.mjs').replace("'./arena.mjs'",`'./${arenaName}'`));
  assert.equal(arena,read('arena.mjs').replace("'./projects.mjs'",`'./${projectsName}'`));
  assert.equal(projects,read('projects.mjs'));
  assert.equal(read(cssPath),read('arena.css'));
  for(const name of [appPath,cssPath,`assets/${arenaName}`,`assets/${projectsName}`]){
    const hash=createHash('sha256').update(read(name)).digest('hex').slice(0,12);
    assert.ok(name.includes(`.${hash}.`),name);
  }
  const config=await import(new URL(`assets/${projectsName}`,root));
  assert.equal(config.PROJECTS.mp1.open,true);
  assert.equal(config.PROJECTS.mp1.unit,'BPB');
  assert.equal(config.PROJECTS.mp1.lower,true);
  for(const content of [html,app,arena,projects]) assert.ok(!/\p{Script=Han}/u.test(content));
  assert.ok(!/href="\/"/.test(html));
  assert.ok(!/Xudong Wu|personal website/i.test(html));
});
