import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewEndTime,submissionPhase,buildSnapshot,PROTOCOL} from '../../courses/dase7506/arena.mjs';

const published='2026-11-01T04:00:00Z', end='2026-11-09T00:00:00+08:00';
const release={published_at:published,review_ends_at:end,entries:[]};
const publication={projects:{mp2:release}};
const issue=(number,data,at,author='student')=>({number,user:{login:author,type:'User'},state:'open',labels:[],created_at:at,updated_at:at,body:'```json\n'+JSON.stringify(data)+'\n```'});
const original=issue(10,{schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp2',student_id:'student-10',score:82},'2026-10-31T12:00:00Z');
const prior=buildSnapshot([original],{},'2026-10-31T13:00:00Z');

test('explicit instructor deadline remains open until 8 November at 24:00 UTC+8',()=>{
  assert.equal(reviewEndTime('mp2',release),Date.parse(end));
  assert.equal(submissionPhase('mp2',publication,'2026-11-08T23:59:59+08:00'),'review');
  assert.equal(submissionPhase('mp2',publication,end),'complete');
  assert.equal(submissionPhase('mp2',publication,'2026-11-01T03:59:59Z'),'artifacts');
  assert.equal(buildSnapshot([original],prior,published,publication).publication.projects.mp2.review_ends_at,'2026-11-08T16:00:00.000Z');
});

test('reports follow the explicit deadline rather than seven elapsed 24-hour periods',()=>{
  const report={schema:'dase7506/peer-review-v1',protocol:PROTOCOL,project:'mp2',submission:10,reproduced_score:80};
  const last=issue(11,report,'2026-11-08T15:59:59Z','peer');
  const late=issue(12,report,'2026-11-08T16:00:00Z','other-peer');
  const snapshot=buildSnapshot([original,last,late],prior,'2026-11-08T16:01:00Z',publication);
  assert.deepEqual(snapshot.challenges.map(r=>r.number),[11]);
  assert.equal(snapshot.review_requests.find(r=>r.number===11).status,'pending');
  assert.equal(snapshot.review_requests.find(r=>r.number===12).status,'late');
});

test('legacy releases retain seven-day duration and malformed instructor dates fail closed',()=>{
  assert.equal(reviewEndTime('mp2',{published_at:published}),Date.parse(published)+7*86400000);
  assert.throws(()=>reviewEndTime('mp2',{published_at:published,review_ends_at:'invalid'}),/Invalid/);
  assert.throws(()=>reviewEndTime('mp2',{published_at:published,review_ends_at:published}),/Invalid/);
});
