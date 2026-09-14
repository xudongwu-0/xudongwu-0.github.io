import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,publicEncrypt,randomBytes,createCipheriv,constants} from 'node:crypto';
import {PROJECTS,PROTOCOL,KEY_ID,validateSubmission,validateArtifacts,buildSnapshot,bestRows,submissionPhase} from '../../courses/dase7506/arena.mjs';
import {decryptLinks,prepareRelease} from './release-links.mjs';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
const identity={algorithm:'RSA-OAEP-256',key_id:KEY_ID,ciphertext:'A'.repeat(512)};
const code='https://github.com/student/private-until-release/tree/'+'a'.repeat(40);
const checkpoint='https://example.org/hidden-until-release.pt';
function seal(extra={}) {
  const aes=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',aes,iv);
  const plain=JSON.stringify({schema:'dase7506/artifact-links-v1',project:'mp1',code_url:code,checkpoint_url:checkpoint,...extra});
  const bytes=Buffer.concat([cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
  return {algorithm:'RSA-OAEP-256+AES-256-GCM',key_id:KEY_ID,iv:iv.toString('base64'),ciphertext:bytes.toString('base64'),wrapped_key:publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},aes).toString('base64')};
}
const score=(extra={})=>({schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp1',score:2.1,student_id:identity,...extra});
const links=(extra={})=>({schema:'dase7506/artifacts-v1',protocol:PROTOCOL,project:'mp1',submission:1,artifacts:seal({submission:1}),...extra});
const issue=(number,data,extra={})=>({number,body:'```json\n'+JSON.stringify(data)+'\n```',state:'open',labels:[],user:{login:'student',type:'User'},created_at:'2026-09-30T12:00:00Z',updated_at:'2026-09-30T12:00:00Z',...extra});
const before='2026-09-30T15:59:59Z',after='2026-10-01T01:00:00Z',released='2026-10-03T01:00:00Z';

test('score-only submissions are valid and links are withheld before release',()=>{
 assert.ok(validateSubmission(score()));
 assert.ok(validateSubmission(score({code_url:'',checkpoint_url:''})));
 assert.ok(!validateSubmission(score({code_url:'javascript:alert(1)'})));
 const snapshot=buildSnapshot([issue(1,score({artifacts:seal()}))],{},before);
 assert.equal(snapshot.submissions[0].code_url,null);
 assert.equal(snapshot.submissions[0].artifact_status,'received');
 assert.ok(!JSON.stringify(snapshot).includes('private-until-release'));
 assert.ok(!JSON.stringify(snapshot).includes(checkpoint));
 assert.equal(bestRows(snapshot.submissions,'mp1').length,1);
});
test('after deadline, new scores are late and edits cannot replace the frozen score',()=>{
 const original=issue(1,score()),prior=buildSnapshot([original],{},before);
 const edited=issue(1,score({score:0.1}),{updated_at:after});
 const late=issue(2,score({score:0.2}),{created_at:after,updated_at:after});
 const next=buildSnapshot([edited,late],prior,after);
 assert.equal(next.submissions.find(r=>r.number===1).score,2.1);
 assert.equal(next.submissions.find(r=>r.number===1).late_score_edit_ignored,true);
 assert.equal(next.submissions.find(r=>r.number===2).status,'late');
 assert.deepEqual(bestRows(next.submissions,'mp1').map(r=>r.number),[1]);
});
test('post-deadline links bind to the original score and actual GitHub author',()=>{
 const original=issue(1,score()),prior=buildSnapshot([original],{},before);
 const update=issue(2,links(),{created_at:after,updated_at:after});
 assert.ok(validateArtifacts(links()));
 const received=buildSnapshot([original,update],prior,after);
 assert.equal(received.submissions[0].artifact_issue,2);
 assert.equal(received.submissions[0].score,2.1);
 assert.equal(received.submissions[0].code_url,null);
 const forged={...update,user:{login:'someone-else',type:'User'}};
 assert.equal(buildSnapshot([original,forged],prior,after).submissions[0].artifact_issue,null);
});
test('hybrid encryption round-trips and detects tampering',()=>{
 const envelope=seal();assert.equal(decryptLinks(envelope,privateKey).code_url,code);
 const bytes=Buffer.from(envelope.ciphertext,'base64');bytes[0]^=1;
 assert.throws(()=>decryptLinks({...envelope,ciphertext:bytes.toString('base64')},privateKey));
});
test('teacher batch release requires complete links and opens exactly seven days',()=>{
 const original=issue(1,score()),prior=buildSnapshot([original],{},before);
 const update=issue(2,links(),{created_at:after,updated_at:after});
 const received=buildSnapshot([original,update],prior,after);
 assert.throws(()=>prepareRelease(received,[original,update],privateKey,'mp1',before),/deadline/);
 assert.throws(()=>prepareRelease(prior,[original],privateKey,'mp1',after),/required/);
 const release=prepareRelease(received,[original,update],privateKey,'mp1',released);
 const publication={projects:{mp1:release}};
 assert.equal(Date.parse(release.review_ends_at)-Date.parse(release.published_at),7*86400000);
 assert.equal(submissionPhase('mp1',publication,released),'review');
 assert.equal(submissionPhase('mp1',publication,release.review_ends_at),'complete');
 const publicBoard=buildSnapshot([original,update],received,released,publication);
 assert.equal(publicBoard.submissions[0].code_url,code);
 assert.equal(publicBoard.submissions[0].checkpoint_url,checkpoint);
 assert.equal(publicBoard.submissions[0].artifact_status,'published');
});
test('peer reports are accepted only during the published seven-day review',()=>{
 const original=issue(1,score({artifacts:seal()})),prior=buildSnapshot([original],{},before);
 const release=prepareRelease(prior,[original],privateKey,'mp1',released),publication={projects:{mp1:release}};
 const report={schema:'dase7506/challenge-v1',protocol:PROTOCOL,project:'mp1',submission:1,reproduced_score:2.3,evidence_url:'https://example.org/evidence'};
 const peer=at=>issue(3,report,{user:{login:'peer',type:'User'},created_at:at,updated_at:at});
 assert.equal(buildSnapshot([original,peer(after)],prior,released,publication).challenges.length,0);
 assert.equal(buildSnapshot([original,peer(released)],prior,released,publication).challenges.length,1);
 assert.equal(buildSnapshot([original,peer(release.review_ends_at)],prior,release.review_ends_at,publication).challenges.length,0);
});
