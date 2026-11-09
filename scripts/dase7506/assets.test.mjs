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
  assert.ok(read('arena.mjs').includes("fetch('../data/student-id-public.pem'"));
  assert.ok(read('app.mjs').includes('archive/mp1-2026-fall/leaderboard.json'));
  assert.ok(!read('app.mjs').includes('courses/dase7506/data/leaderboard.json'));
});

test('MP3 publishes public self-evaluation, a score form and the current fingerprinted graph',()=>{
  const html=read('mp3/index.html');
  const moduleName=html.match(/src="\.\.\/(assets\/mp3\.[a-f0-9]{12}\.mjs)"/)[1];
  const source=read(moduleName);
  const arenaName=source.match(/from '\.\/(arena\.[a-f0-9]{12}\.mjs)'/)[1];
  assert.equal(source,read('mp3.mjs').replace("'./arena.mjs'",`'./${arenaName}'`));
  assert.ok(moduleName.includes(createHash('sha256').update(source).digest('hex').slice(0,12)));
  assert.ok(!/\p{Script=Han}/u.test(html+source));
  assert.ok(html.includes('id="submission-form"') && html.includes('id="score-file"'));
  assert.ok(html.includes('id="score"') && !html.includes('id="request-body"'));
  assert.ok(html.includes('self-reported') && html.includes('240 test tasks'));
  assert.ok(html.includes('If you train an LLM, use <strong>Qwen3-0.6B LoRA only</strong>; submit adapters, not full or merged model weights.'));
  assert.ok(read('mp3/PROJECT.md').includes('if you train an LLM, use **LoRA on `Qwen/Qwen3-0.6B` only**'));
  assert.ok(!/deploy no extra live llm|no additional live llm, or|one llm with at most/i.test(html+read('mp3/PROJECT.md')));
  assert.ok(!/id="model-(?:kind|fields|repo|revision|parameters)"|<th[^>]*>Route<\/th>/.test(html));
  assert.ok(!/id="(?:source-sha|adapter-sha)"|Source ZIP SHA-256|Adapter ZIP SHA-256/.test(html));
  assert.ok(!/\$\('(?:source-sha|adapter-sha)'\)/.test(source));
  assert.ok(!/source ZIP link\/hash|adapter link\/hash|Record the source ZIP SHA-256/.test(read('mp3/PROJECT.md')));
  assert.ok(html.includes('One leaderboard') && html.includes('id="challenge-dialog"'));
  assert.ok(html.includes('30 November 2026, 23:59 (UTC+8)') && html.includes('7 December 2026, 23:59 (UTC+8)'));
  assert.ok(html.includes('id="reproduced-score"') && html.includes('id="email-report"'));
  assert.ok(read('mp3/PROJECT.md').includes('All approaches compete on one leaderboard'));
  assert.ok(!/instructor-only|prepare evaluation request|submit an evaluation request|hidden-test answers are not/i.test(html+source+read('mp3/PROJECT.md')));
  for(const name of ['PROJECT.md','downloads/MP3_SQL_student_package.zip','downloads/MP3_SQL_student_package.zip.sha256']) assert.ok(fs.existsSync(new URL(`mp3/${name}`,root)),name);
  const zip=fs.readFileSync(new URL('mp3/downloads/MP3_SQL_student_package.zip',root));
  assert.equal(read('mp3/downloads/MP3_SQL_student_package.zip.sha256'),
    `${createHash('sha256').update(zip).digest('hex')}  MP3_SQL_student_package.zip\n`);
  assert.deepEqual(fs.readdirSync(new URL('mp3/',root)).filter(name=>name.endsWith('.md')),['PROJECT.md']);
  assert.ok(!/instructor\/private|internal[-_]results|teacher[-_](?:reference|checkpoint)/i.test(html+source+read('mp3/PROJECT.md')));
});
