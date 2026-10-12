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
  const teacherHTML=read('instructor.html'),teacherPath=teacherHTML.match(/src="(assets\/instructor\.[a-f0-9]{12}\.mjs)"/)[1];
  assert.equal(read(teacherPath),read('instructor.mjs').replace("'./arena.mjs'",`'./${arenaName}'`));
  assert.ok(teacherPath.includes(createHash('sha256').update(read(teacherPath)).digest('hex').slice(0,12)));
  assert.ok(teacherHTML.includes(cssPath));
  assert.ok(!html.includes('instructor.html'));
  assert.ok(!app.includes('review_request_count') && !app.includes('review_flag'));
});

test('MP2 serves the current fingerprinted graph, score form and English student interface',async()=>{
  const html=read('mp2/index.html');
  const moduleName=html.match(/src="\.\.\/(assets\/mp2\.[a-f0-9]{12}\.mjs)"/)[1];
  const source=read(moduleName);
  const arenaName=source.match(/from '\.\/(arena\.[a-f0-9]{12}\.mjs)'/)[1];
  assert.equal(source,read('mp2.mjs').replace("'./arena.mjs'",`'./${arenaName}'`));
  assert.ok(moduleName.includes(createHash('sha256').update(source).digest('hex').slice(0,12)));
  assert.ok(html.includes('id="submission-form"') && html.includes('31 October 2026, 23:59'));
  assert.ok(!/\p{Script=Han}/u.test(html+source));
  assert.ok(!/instructor\.html|href="\/"|review_request_count|review_flag/.test(html+source));
  assert.ok(source.includes("fetch('../data/student-id-public.pem'"));
  assert.ok(read('app.mjs').includes('archive/mp1-2026-fall/leaderboard.json'));
  assert.ok(!read('app.mjs').includes('courses/dase7506/data/leaderboard.json'));
});
