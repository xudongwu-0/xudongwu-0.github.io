import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot,bestRows,parseIssue,makeIssueURL,validateSubmission,KEY_ID,PROTOCOL,PROJECTS} from '../../courses/dase7506/arena.mjs';
const claim = (overrides={}) => ({schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp2',score:70,
  code_url:'https://github.com/example/code/tree/abcdef',checkpoint_url:'https://example.org/model.pt',
  student_id:{algorithm:'RSA-OAEP-256',key_id:KEY_ID,ciphertext:'A'.repeat(512)},...overrides});
const issue = (number,data=claim(),options={}) => ({number,user:{login:'student-a',type:'User'},
  state:'open',labels:[],created_at:'2026-09-11T00:00:00Z',updated_at:'2026-09-11T00:00:00Z',
  body:'```json\n'+JSON.stringify(data)+'\n```',...options});
const challenge = (submission,overrides={}) => ({schema:'dase7506/challenge-v1',protocol:PROTOCOL,
  project:'mp2',submission,reproduced_score:60,evidence_url:'https://example.org/reproduction',...overrides});

test('unreleased projects reject submissions; enable synthetic metrics only inside this test process',()=>{
  const config = structuredClone(PROJECTS);
  for (const p of Object.values(PROJECTS)) p.open=false;
  assert.ok(!validateSubmission(claim()));
  assert.equal(buildSnapshot([issue(1)]).submissions.length,0);
  for (const [id,p] of Object.entries(PROJECTS)) Object.assign(p,config[id],{
    open:true,min:0,max:id==='mp1'?10:100,unit:'points',lower:id==='mp1',review_threshold:id==='mp1'?0.01:1,reward:5,penalty:-10});
});

test('submission rejects plaintext IDs, wrong protocol, invalid scores and executable URLs',()=>{
  assert.ok(validateSubmission(claim()));
  for(const invalid of [{student_id:'3035999000'},{protocol:'other'},{score:101},{score:'70'},
    {project:'__proto__'},{score:NaN},{code_url:'javascript:alert(1)'},{code_url:'https://secret:token@example.org'},
    {checkpoint_url:'https://example.org/\nmalformed'}]) assert.ok(!validateSubmission(claim(invalid)));
  assert.ok(!parseIssue({...issue(1),pull_request:{}}));
  assert.ok(!parseIssue({...issue(1),body:issue(1).body+'\n'+issue(1).body}));
});
test('issue handoff round-trips without label privileges or plaintext student ID',()=>{
  const data=claim(), u=new URL(makeIssueURL(data));
  assert.equal(u.hostname,'github.com'); assert.ok(!u.searchParams.has('labels'));
  const parsed=parseIssue({...issue(1),body:u.searchParams.get('body')});
  assert.deepEqual(parsed.data,data);
});
test('best-per-student ranking respects direction, history, review and withdrawal',()=>{
  const s=buildSnapshot([issue(1),issue(2,claim({score:72})),
    issue(3,claim({score:90}),{labels:['7506:review']}),
    issue(4,claim({score:95}),{state:'closed'}),
    issue(5,claim({project:'mp1',score:2.1})),issue(6,claim({project:'mp1',score:2.0}))]);
  assert.deepEqual(bestRows(s.submissions,'mp2').map(x=>x.number),[2]);
  assert.deepEqual(bestRows(s.submissions,'mp1').map(x=>x.number),[6]);
  assert.equal(bestRows(s.submissions,'mp2',true).length,4);
});
test('a student cannot put reviewed status in a JSON field; editing a verified payload requires review',()=>{
  const original=issue(1,claim({status:'verified'}));
  assert.equal(buildSnapshot([original]).submissions[0].status,'self-reported');
  const reviewed=issue(1,claim(),{labels:['7506:verified']});
  const prior=buildSnapshot([reviewed]);
  assert.equal(prior.submissions[0].status,'verified');
  const changed=issue(1,claim({score:99}),{labels:['7506:verified']});
  const next=buildSnapshot([changed],prior);
  assert.equal(next.submissions[0].status,'review');
  assert.equal(buildSnapshot([changed],next).submissions[0].status,'review');
});
test('disputes alone never penalize; upheld evidence and invalidation are both required',()=>{
  const c=issue(2,challenge(1),{user:{login:'reporter',type:'User'}});
  let s=buildSnapshot([issue(1),c]); assert.deepEqual(s.adjustments,[]);
  s=buildSnapshot([issue(1),{...c,labels:['7506:upheld']}]); assert.deepEqual(s.adjustments,[]);
  s=buildSnapshot([issue(1,claim(),{labels:['7506:invalid']}),{...c,labels:['7506:upheld']}]);
  assert.deepEqual(s.adjustments.map(a=>[a.author,a.reward,a.penalty]),[['student-a',0,-10],['reporter',5,0]]);
});
test('first upheld reporter only; duplicates, self-reports and below-threshold disputes do not earn rewards',()=>{
  const victim=issue(1,claim(),{labels:['7506:invalid']});
  const report=(n,who,data=challenge(1))=>issue(n,data,{user:{login:who,type:'User'},labels:['7506:upheld']});
  const s=buildSnapshot([victim,report(2,'r1'),report(3,'r2'),report(4,'student-a'),report(5,'r3',challenge(1,{reproduced_score:69}))]);
  assert.equal(s.adjustments.find(a=>a.author==='r1').reward,5);
  assert.ok(!s.adjustments.some(a=>['r2','r3'].includes(a.author)));
  assert.ok(!s.challenges.some(c=>c.number===4));
});
test('reward and penalty caps survive reruns and additional upheld submissions',()=>{
  const issues=[issue(1,claim(),{labels:['7506:invalid']}),issue(2,claim(),{labels:['7506:invalid']}),
    issue(3,challenge(1),{user:{login:'r',type:'User'},labels:['7506:upheld']}),
    issue(4,challenge(2),{user:{login:'r',type:'User'},labels:['7506:upheld']})];
  const a=buildSnapshot(issues),b=buildSnapshot(issues,a);
  assert.deepEqual(a.adjustments,b.adjustments);
  assert.deepEqual(a.adjustments.map(x=>[x.reward,x.penalty]),[[0,-10],[5,0]]);
});
test('authors cannot erase or redirect adjudicated claims by editing or clearing issue JSON',()=>{
  const victim=issue(1,claim(),{labels:['7506:invalid']});
  const report=issue(3,challenge(1),{user:{login:'r',type:'User'},labels:['7506:upheld']});
  const second=issue(2,claim(),{user:{login:'unrelated',type:'User'},labels:['7506:invalid']});
  const prior=buildSnapshot([victim,second,report]);
  const edited=[{...victim,body:'deleted' },second,
    issue(3,challenge(2),{user:{login:'r',type:'User'},labels:['7506:upheld']})];
  const after=buildSnapshot(edited,prior);
  assert.equal(after.challenges[0].submission,1);
  assert.deepEqual(after.adjustments,prior.adjustments);
  assert.deepEqual(buildSnapshot([{...victim,body:'deleted'},second,{...report,body:''}],prior).adjustments,prior.adjustments);
});
