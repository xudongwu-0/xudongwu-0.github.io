import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot,bestRows,PROTOCOL,instructorRows} from '../../courses/dase7506/arena.mjs';

const score={schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp2',student_id:'3036897306',score:83.0835,code_url:'https://github.com/YUShinH/MP2-DASE7506',late_submission:true,instructor_accepted:true};
const record={number:1000,user:{login:'instructor',type:'User'},state:'open',labels:[],created_at:'2026-11-04T00:00:00Z',updated_at:'2026-11-04T00:00:00Z',body:'```json\n'+JSON.stringify(score)+'\n```'};
const entry={submission:1000,author:'instructor',student_id:score.student_id,score:score.score,code_url:score.code_url,checkpoint_url:null,instructor_accepted:true,late_submission:true};
const publication={projects:{mp2:{published_at:'2026-11-01T04:42:52Z',review_ends_at:'2026-11-09T00:00:00+08:00',entries:[entry]}}};
const now='2026-11-04T01:00:00Z';

test('instructor-accepted late submission is visible, marked late and retains its unadjusted score and partial links',()=>{
  const snapshot=buildSnapshot([record],{},now,publication),row=snapshot.submissions[0];
  assert.equal(row.late_submission,true);
  assert.equal(row.instructor_entered,true);
  assert.equal(row.status,'self-reported');
  assert.equal(row.score,83.0835);
  assert.equal(row.code_url,score.code_url);
  assert.equal(row.checkpoint_url,null);
  assert.equal(row.artifact_status,'partial');
  assert.equal(bestRows(snapshot.submissions,'mp2')[0].number,1000);
  assert.equal(instructorRows(snapshot)[0].late_submission,true);
  assert.deepEqual(snapshot.adjustments,[]);
  const next=buildSnapshot([record],snapshot,now,publication);
  assert.equal(next.submissions[0].late_submission,true);
  assert.equal(next.submissions[0].score,83.0835);
});

test('issue authors cannot self-accept late results or forge the instructor late marker',()=>{
  const unapproved=buildSnapshot([record],{},now).submissions[0];
  assert.equal(unapproved.status,'late');
  assert.equal(unapproved.late_submission,undefined);
  assert.deepEqual(bestRows([unapproved],'mp2'),[]);
  for(const changed of [{author:'other'},{student_id:'other'},{score:99},{instructor_accepted:false}]) {
    const pub=structuredClone(publication);Object.assign(pub.projects.mp2.entries[0],changed);
    const row=buildSnapshot([record],{},now,pub).submissions[0];
    assert.equal(row.status,'late');
    assert.equal(row.late_submission,undefined);
  }
});
