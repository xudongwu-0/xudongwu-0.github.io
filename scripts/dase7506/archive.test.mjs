import test from 'node:test';
import assert from 'node:assert/strict';
import {loadArchive,preserveArchivedProject} from './archive.mjs';
import {buildSnapshot,submissionPhase,validScore} from '../../courses/dase7506/arena.mjs';

test('MP1 archive passes every checksum and survives deletions, score edits and new MP1 records',()=>{
  const archive=loadArchive();
  const rebuilt={submissions:[{project:'mp1',number:999,score:0},{project:'mp2',number:1000,score:87}],
    challenges:[],adjustments:[],review_requests:[],publication:{projects:{mp1:{published_at:'2099-01-01'}}},phases:{mp1:'scores',mp2:'scores'}};
  const frozen=preserveArchivedProject(rebuilt,archive);
  for(const field of ['submissions','challenges','adjustments','review_requests']) {
    assert.deepEqual(frozen[field].filter(row=>row.project==='mp1'),archive[field].filter(row=>row.project==='mp1').sort((a,b)=>a.number-b.number));
  }
  assert.deepEqual(frozen.publication.projects.mp1,archive.publication.projects.mp1);
  assert.equal(frozen.phases.mp1,archive.phases.mp1);
  assert.equal(frozen.submissions.find(row=>row.project==='mp2').score,87);
  assert.equal(rebuilt.submissions.length,2);
});

test('MP2 accepts percentage scores and automatically freezes scores at midnight after 31 October',()=>{
  assert.ok(validScore('mp2',0) && validScore('mp2',100));
  assert.ok(!validScore('mp2',-1) && !validScore('mp2',100.1));
  assert.equal(submissionPhase('mp2',{},Date.parse('2026-10-31T23:59:59+08:00')),'scores');
  assert.equal(submissionPhase('mp2',{},Date.parse('2026-11-01T00:00:00+08:00')),'artifacts');
  const issue={number:999,user:{login:'student',type:'User'},state:'open',labels:[],created_at:'2026-10-31T15:00:00Z',updated_at:'2026-10-31T15:00:00Z',html_url:'https://github.com/example/issues/999',
    body:'```json\n'+JSON.stringify({schema:'dase7506/submission-v1',protocol:'7506-submissions-v1',project:'mp2',student_id:'baseline:test',score:72})+'\n```'};
  const before=buildSnapshot([issue],{},'2026-10-31T15:30:00Z');
  assert.equal(before.submissions[0].score,72);
  const edited={...issue,updated_at:'2026-11-01T01:00:00Z',body:issue.body.replace('72','98')};
  const after=preserveArchivedProject(buildSnapshot([edited],before,'2026-11-01T02:00:00Z'),loadArchive());
  assert.equal(after.submissions.find(row=>row.project==='mp2').score,72);
});
