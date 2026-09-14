import test from 'node:test';
import assert from 'node:assert/strict';
import {PROTOCOL,KEY_ID,REPORT_EMAIL,validStudentID,validateSubmission,validateReviewRequest,validatePeerReviewReport,peerReviewEmailURL,buildSnapshot,makeIssueURL,bestRows} from '../../courses/dase7506/arena.mjs';
import {renderTeacherReview} from './review-summary.mjs';
const now='2026-09-15T00:00:00Z';
const score={schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp1',student_id:'3035999000',score:1.8};
const request={schema:'dase7506/review-request-v1',protocol:PROTOCOL,project:'mp1',submission:1,reason:'Please check the reported test result.',evidence_url:null,reproduced_score:2.1};
const issue=(number,data,author='owner',options={})=>({number,body:'```json\n'+JSON.stringify(data)+'\n```',user:{login:author,type:'User'},state:'open',labels:[],created_at:now,updated_at:now,...options});
test('public student ID is preserved, while supplied review counts and flags are ignored',()=>{
 const board=buildSnapshot([issue(1,{...score,review_request_count:99,review_flag:true})],{},now);
 assert.equal(board.submissions[0].student_id,score.student_id);
 assert.equal(board.submissions[0].author,'owner');
 assert.equal(board.submissions[0].review_request_count,0);
 assert.equal(board.submissions[0].review_flag,false);
});
test('legacy public-ID migration is bound to the original ciphertext',()=>{
 const identity={algorithm:'RSA-OAEP-256',key_id:KEY_ID,ciphertext:'A'.repeat(512)};
 const metadata={identities:{1:{student_id:'3035999000',source_ciphertext:identity.ciphertext}}};
 const board=buildSnapshot([issue(1,{...score,student_id:identity})],{},now,{projects:{}},metadata);
 assert.equal(board.submissions[0].student_id,'3035999000');
 const changed=buildSnapshot([issue(1,{...score,student_id:{...identity,ciphertext:'B'.repeat(512)}})],{},now,{projects:{}},metadata);
 assert.equal(changed.submissions[0].student_id,null);
});
test('review requests round-trip through public GitHub issues and validate optional evidence',()=>{
 assert.ok(validateReviewRequest(request));
 assert.ok(!validateReviewRequest({...request,reason:'short'}));
 assert.ok(!validateReviewRequest({...request,evidence_url:'javascript:alert(1)'}));
 assert.ok(!validateReviewRequest({...request,reproduced_score:'1.7'}));
 const url=new URL(makeIssueURL(request));
 assert.match(url.searchParams.get('body'),/account and report are public/);
 assert.equal(buildSnapshot([issue(1,score),{...issue(2,request,'reporter'),body:url.searchParams.get('body')}],{},now).submissions[0].review_request_count,1);
});
test('flags require more than three distinct active reporters and never alter ranking',()=>{
 const issues=[issue(1,score),issue(2,request,'a'),issue(3,request,'b'),issue(4,request,'c'),issue(5,request,'A')];
 let board=buildSnapshot(issues,{},now);
 assert.equal(board.submissions[0].review_request_total,4);
 assert.equal(board.submissions[0].review_request_count,3);
 assert.equal(board.submissions[0].review_flag,false);
 issues.push(issue(6,request,'d'));board=buildSnapshot(issues,board,now);
 assert.equal(board.submissions[0].review_request_count,4);
 assert.equal(board.submissions[0].review_flag,true);
 assert.equal(board.submissions[0].status,'self-reported');
 assert.deepEqual(bestRows(board.submissions,'mp1').map(r=>r.number),[1]);
 assert.deepEqual(board.adjustments,[]);
 assert.equal(buildSnapshot(issues,board,now).submissions[0].review_request_count,4);
});
test('teacher sees all requests, while self, closed, rejected and late requests cannot inflate flags',()=>{
 const publication={projects:{mp1:{published_at:'2026-10-03T00:00:00Z',entries:[]}}};
 const board=buildSnapshot([issue(1,score),issue(2,request,'OWNER'),issue(3,request,'closed',{state:'closed'}),
 issue(4,request,'rejected',{labels:['7506:rejected']}),issue(5,request,'late',{created_at:'2026-10-10T00:00:00Z'}),issue(6,request,'valid')],{},now,publication);
 assert.equal(board.submissions[0].review_request_total,5);
 assert.equal(board.submissions[0].review_request_count,1);
 assert.equal(board.review_requests.find(r=>r.number===2).status,'self-request');
 assert.equal(board.review_requests.find(r=>r.number===5).status,'late');
 assert.equal(board.submissions[0].review_flag,false);
});
test('instructor overview escapes untrusted reasons and includes account and count details',()=>{
 const board=buildSnapshot([issue(1,score),issue(2,{...request,reason:'<script>alert("unsafe")</script>'},'reporter')],{},now);
 const html=renderTeacherReview(board);
 assert.ok(!html.includes('<script>'));
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/GitHub: reporter/);
 assert.match(html,/Total reports/);
 assert.match(html,/Active reporters/);
});
test('student result labels accept special characters and remain literal text in exported HTML',()=>{
 for(const id of ['[Baseline] GPT-128 / 1.1M','Baseline_v2 + RoPE (FP32)','A&B @ 4090','<img src=x onerror=alert(1)>','★ Reference #1']){
  assert.ok(validStudentID(id));assert.ok(validateSubmission({...score,student_id:id}));
 }
 for(const id of ['', '  ', 'x'.repeat(65), 'bad\nid', 'bad\u0000id', 'bad\u202eid'])assert.ok(!validStudentID(id));
 const label='<img src=x onerror=alert(1)>';
 const board=buildSnapshot([issue(1,{...score,student_id:label})],{},now);
 const html=renderTeacherReview(board);assert.ok(!html.includes('<img'));assert.match(html,/&lt;img/);
 assert.equal(board.submissions[0].student_id,label);
});
test('peer review requires a numeric score while Markdown and links are optional',()=>{
 const report={schema:'dase7506/peer-review-v1',protocol:PROTOCOL,project:'mp1',submission:1,reproduced_score:1.95};
 assert.ok(validatePeerReviewReport(report));
 assert.ok(validatePeerReviewReport({...report,reason:'',evidence_url:''}));
 assert.ok(validatePeerReviewReport({...report,reproduced_score:0}));
 for(const reproduced_score of [undefined,null,'',NaN,-1,'1.95'])assert.ok(!validatePeerReviewReport({...report,reproduced_score}));
 assert.ok(!validatePeerReviewReport({...report,reason:'x'.repeat(2001)}));
 assert.ok(!validatePeerReviewReport({...report,evidence_url:'javascript:alert(1)'}));
 const url=new URL(makeIssueURL(report));assert.match(url.searchParams.get('title'),/Peer Review Report/);
 const board=buildSnapshot([issue(1,score),issue(2,report,'reporter')],{},now);
 assert.equal(board.submissions[0].review_request_count,1);
 assert.equal(board.review_requests[0].reproduced_score,1.95);
 assert.equal(board.challenges.length,0);
 const published_at='2026-10-03T00:00:00Z',publication={projects:{mp1:{published_at,entries:[]}}};
 const during=buildSnapshot([issue(1,score),issue(2,report,'reporter',{created_at:published_at})],board,published_at,publication);
 assert.equal(during.challenges[0].reproduced_score,1.95);
 assert.equal(during.submissions[0].review_request_count,1);
});
test('email report drafts include the required score and target, with optional details encoded safely',()=>{
 const report={schema:'dase7506/peer-review-v1',protocol:PROTOCOL,project:'mp1',submission:1,reproduced_score:0,reason:'## Notes\nA&B + C',evidence_url:'https://example.org/evidence?a=1&b=2'};
 const url=new URL(peerReviewEmailURL(report));
 assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,REPORT_EMAIL);
 assert.match(url.searchParams.get('subject'),/Peer Review Report.*MP1 #1/);
 assert.match(url.searchParams.get('body'),/Reproduced score: 0 BPB/);
 assert.ok(url.searchParams.get('body').includes('## Notes\nA&B + C'));
 assert.ok(url.searchParams.get('body').includes(report.evidence_url));
 assert.throws(()=>peerReviewEmailURL({...report,reproduced_score:null}));
});
test('legacy scoreless requests remain in teacher records but cannot inflate active report counts',()=>{
 const board=buildSnapshot([issue(1,score),issue(2,{...request,reproduced_score:null},'legacy-reporter')],{},now);
 assert.equal(board.submissions[0].review_request_total,1);
 assert.equal(board.submissions[0].review_request_count,0);
 assert.equal(board.review_requests[0].status,'score-missing');
});
