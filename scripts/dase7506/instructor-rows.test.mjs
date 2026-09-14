import test from 'node:test';
import assert from 'node:assert/strict';
import {instructorRows,bestRows} from '../../courses/dase7506/arena.mjs';
import {renderTeacherReview} from './review-summary.mjs';

const submission=(number,fields={})=>({number,student_id:'00123',author:'owner',project:'mp1',score:1.5,
  status:'self-reported',created_at:`2026-09-${String(number).padStart(2,'0')}T00:00:00Z`,
  url:`https://github.com/example/course/issues/${number}`,review_request_total:0,review_request_count:0,review_flag:false,...fields});
const report=(number,target,author,status='pending')=>({number,submission:target,project:'mp1',author,status,
  reproduced_score:1.8,reason:'',created_at:'2026-09-15T00:00:00Z',url:`https://github.com/example/course/issues/${number}`});

test('instructor view binds a student/account to the latest result, even when it is worse or invalid',()=>{
  const snapshot={submissions:[submission(3,{score:1.9,status:'invalid'}),submission(1,{score:1.2}),submission(2)],review_requests:[]};
  const original=structuredClone(snapshot),[row]=instructorRows(snapshot);
  assert.equal(instructorRows(snapshot).length,1);
  assert.equal(row.number,3);assert.equal(row.score,1.9);assert.equal(row.status,'invalid');
  assert.deepEqual(row.submission_numbers,[3,2,1]);
  assert.deepEqual(snapshot,original);
  assert.deepEqual(bestRows(snapshot.submissions,'mp1').map(r=>r.number),[1]);
  const html=renderTeacherReview(snapshot);
  assert.equal((html.match(/<tbody>.*?<tr/g)||[]).length,1);
  assert.match(html,/1 entry · 0 total reports/);
  assert.match(html,/Submission history:.*issues\/1/);
});

test('reports on every prior result accumulate and reporters are deduplicated across results',()=>{
  const snapshot={submissions:[submission(1),submission(2)],review_requests:[
    report(10,1,'alice'),report(11,2,'ALICE'),report(12,1,'bob'),report(13,2,'carol'),
    ...['self-request','closed','rejected','late','score-missing'].map((status,i)=>report(20+i,1,'excluded-'+i,status))
  ]};
  let [row]=instructorRows(snapshot);
  assert.equal(row.number,2);assert.equal(row.review_request_total,9);
  assert.equal(row.review_request_count,3);assert.equal(row.review_flag,false);
  snapshot.review_requests.push(report(30,1,'dave','upheld'));
  [row]=instructorRows(snapshot);
  assert.equal(row.review_request_total,10);assert.equal(row.review_request_count,4);
  assert.deepEqual(row.review_flag_reasons,['More than 3 active reporters']);
  assert.equal(row.review_flag,true);
  const key=row.review_group_key;
  snapshot.submissions.push(submission(3));
  [row]=instructorRows(snapshot);
  assert.equal(row.number,3);assert.equal(row.review_flag,true);assert.equal(row.review_request_total,10);
  assert.equal(row.review_group_key,key);
  const html=renderTeacherReview(snapshot);
  assert.match(html,/→ submission #1/);assert.match(html,/→ submission #2/);
  assert.match(html,/FLAG — More than 3 active reporters/);
});

test('every entry for a student ID with multiple GitHub accounts is flagged across projects',()=>{
  const snapshot={submissions:[submission(1),submission(2,{author:'OWNER'}),
    submission(3,{author:'second-account',status:'withdrawn'}),submission(4,{project:'mp2'}),
    submission(5,{student_id:'different-id'})],review_requests:[]};
  const rows=instructorRows(snapshot),conflicts=rows.filter(r=>r.student_id==='00123');
  assert.equal(rows.length,4);assert.equal(conflicts.length,3);
  for(const row of conflicts){
    assert.equal(row.review_flag,true);assert.equal(row.review_request_total,0);
    assert.deepEqual(row.review_accounts,['owner','second-account']);
    assert.deepEqual(row.review_flag_reasons,['Student ID used by multiple GitHub accounts']);
  }
  assert.equal(rows.find(r=>r.student_id==='different-id').review_flag,false);
  assert.match(renderTeacherReview(snapshot),/4 entries · 0 total reports · <strong>3 flagged/);
});

test('the two flag reasons coexist and account conflicts do not combine different accounts reports',()=>{
  const snapshot={submissions:[submission(1),submission(2,{author:'other'})],
    review_requests:['a','b','c','d'].map((author,i)=>report(10+i,1,author))};
  const rows=instructorRows(snapshot);
  assert.equal(rows.find(r=>r.number===1).review_flag_reasons.length,2);
  assert.equal(rows.find(r=>r.number===2).review_flag_reasons.length,1);
  assert.equal(rows.find(r=>r.number===2).review_request_count,0);
});

test('IDs stay exact, GitHub casing is ignored, and projects retain independent histories',()=>{
  const snapshot={submissions:[submission(1),submission(2,{author:'OWNER'}),
    submission(3,{student_id:'123'}),submission(4,{student_id:'[Baseline] A&B + GPT'}),
    submission(5,{project:'mp2'})],review_requests:[report(10,1,'reviewer')]};
  const rows=instructorRows(snapshot);
  assert.equal(rows.length,4);
  assert.ok(rows.every(r=>!r.review_flag));
  assert.deepEqual(rows.find(r=>r.number===2).submission_numbers,[2,1]);
  assert.equal(rows.find(r=>r.number===2).review_request_count,1);
  assert.equal(rows.find(r=>r.number===5).review_request_count,0);
});

test('unresolved IDs remain separate and cannot trigger identity conflicts',()=>{
  const rows=instructorRows({submissions:[submission(1,{student_id:null}),submission(2,{student_id:null}),
    submission(3,{student_id:null,author:'other'}),submission(4,{student_id:'ID pending'})]});
  assert.equal(rows.length,4);assert.ok(rows.every(r=>!r.review_flag));
  assert.equal(new Set(rows.map(r=>r.review_group_key)).size,4);
});

test('latest means creation time, with deterministic issue-number ties and missing timestamp fallback',()=>{
  const tied=submission(2,{created_at:'2026-09-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'});
  assert.equal(instructorRows({submissions:[tied,submission(1)]})[0].number,2);
  const older=submission(3,{created_at:'2026-08-01T00:00:00Z',updated_at:'2026-10-02T00:00:00Z'});
  assert.equal(instructorRows({submissions:[older,submission(1)]})[0].number,1);
  assert.equal(instructorRows({submissions:[submission(1),submission(2,{created_at:null})]})[0].number,2);
});
