import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync} from 'node:crypto';
import {PROTOCOL,KEY_ID,PROJECTS,MP3_EVALUATION,MP3_LORA_BASE,validateSubmission,validateMP3Score,makeIssueURL,parseIssue,buildSnapshot,bestRows,encryptArtifactLinks,submissionPhase,reviewStartTime,reviewEndTime,createPeerReviewReport,hasMP3Adapter} from '../../courses/dase7506/arena.mjs';
import {prepareRelease} from './release-links.mjs';

const before='2026-11-10T00:00:00Z', cutoff='2026-12-01T00:00:00+08:00', reviewEnd='2026-12-08T00:00:00+08:00';

const claim=(changes={})=>({
  schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp3',student_id:'example-student-id',
  score:50,correct:120,n:240,source_sha256:'a'.repeat(64),score_sha256:'b'.repeat(64),
  predictions_sha256:'c'.repeat(64),benchmark:{...MP3_EVALUATION},model:{kind:'none'},
  artifacts:{algorithm:'RSA-OAEP-256+AES-256-GCM',key_id:KEY_ID,wrapped_key:'A'.repeat(512),iv:'A'.repeat(16),ciphertext:'A'.repeat(24)},
  ...changes,
});
const simpleClaim=(hasAdapter=false,changes={})=>{
  const data=claim({model:{kind:'report',has_adapter:hasAdapter},...changes});
  delete data.source_sha256;
  return data;
};
const issue=(data=claim(),changes={})=>({
  number:501,user:{type:'User',login:'example-student'},state:'open',labels:[],
  created_at:'2026-11-10T00:00:00Z',updated_at:'2026-11-10T00:00:00Z',
  body:'```json\n'+JSON.stringify(data)+'\n```',...changes,
});
const score=(changes={})=>({
  ...MP3_EVALUATION,split:'test',n:240,correct:120,accuracy:50,predictions_sha256:'c'.repeat(64),
  per_question:Array.from({length:240},(_,index)=>({
    id:`task-${index}`,passed:index<120,tool_calls:2,
    cases:Array.from({length:3},()=>({passed:index<120,error:null})),
  })),...changes,
});

test('MP3 accepts no-model, public-model and pinned LoRA self-reports, not other training',()=>{
  assert.ok(validateSubmission(claim()));
  assert.ok(validateSubmission(claim({model:{kind:'report',adapter_sha256:null}})));
  assert.ok(validateSubmission(claim({model:{kind:'report',adapter_sha256:'e'.repeat(64)}})));
  for(const model of [{kind:'report'},{kind:'report',adapter_sha256:'bad'},
    {kind:'report',adapter_sha256:null,parameters:1}]) assert.ok(!validateSubmission(claim({model})));
  const publicModel={kind:'public',repository:'example/tiny-model',revision:'d'.repeat(40),parameters:900000000};
  assert.ok(validateSubmission(claim({model:publicModel})));
  const lora={kind:'lora',repository:MP3_LORA_BASE.repository,revision:MP3_LORA_BASE.revision,
    parameters:MP3_LORA_BASE.parameters+1024,adapter_sha256:'e'.repeat(64)};
  assert.ok(validateSubmission(claim({model:lora})));
  for(const model of [{...publicModel,parameters:1000000001},{...publicModel,revision:'main'},
    {...publicModel,repository:'../..'},{...publicModel,repository:'example/..'},
    {...publicModel,repository:'example/-invalid'},{...publicModel,repository:'example/'+('x'.repeat(97))},
    {...lora,repository:'example/other-model'},{...lora,revision:'d'.repeat(40)},
    {...lora,parameters:MP3_LORA_BASE.parameters},{...lora,adapter_sha256:'bad'},
    {kind:'none',repository:'undeclared-model'},{...publicModel,kind:'full-finetune'}]) {
    assert.ok(!validateSubmission(claim({model})));
  }
  for(const change of [{score:99},{correct:241},{correct:120.5},{n:120},{source_sha256:'bad'},
    {score_sha256:'bad'},{predictions_sha256:'bad'},{benchmark:{...MP3_EVALUATION,manifest_sha256:'f'.repeat(64)}},
    {student_id:''},{artifacts:null},{code_url:'https://example.org/plaintext.zip'},
    {schema:'dase7506/evaluation-request-v1'},{status:'verified'}]) assert.ok(!validateSubmission(claim(change)));
});
test('simplified entries need no source or adapter ZIP hashes, but retain automatic evaluation fingerprints',()=>{
  for(const hasAdapter of [false,true]) {
    const data=simpleClaim(hasAdapter);
    assert.ok(validateSubmission(data));
    assert.equal(Object.hasOwn(data,'source_sha256'),false);
    assert.equal(Object.hasOwn(data.model,'adapter_sha256'),false);
    assert.equal(hasMP3Adapter(data.model),hasAdapter);
    assert.deepEqual(parseIssue(issue(data)).data,data);
    const url=new URL(makeIssueURL(data));
    assert.deepEqual(parseIssue({...issue(),body:url.searchParams.get('body')}).data,data);
    for(const changes of [{score_sha256:undefined},{predictions_sha256:'bad'},{source_sha256:'bad'},
      {model:{kind:'report',has_adapter:'true'}},{model:{kind:'report',has_adapter:null}},
      {model:{kind:'report',has_adapter:hasAdapter,adapter_sha256:'e'.repeat(64)}}]) {
      assert.ok(!validateSubmission({...data,...changes}));
    }
  }
  assert.equal(hasMP3Adapter({kind:'report',adapter_sha256:null}),false);
  assert.equal(hasMP3Adapter({kind:'report',adapter_sha256:'e'.repeat(64)}),true);
  assert.equal(hasMP3Adapter({kind:'lora'}),true);
});
test('simplified entries preserve review binding and deadline-frozen adapter declarations',()=>{
  const original=issue(simpleClaim(),{labels:['7506:verified']});
  const previous=buildSnapshot([original],{},before);
  assert.equal(buildSnapshot([original],previous,before).submissions[0].status,'verified');
  const edited=issue(simpleClaim(true),{labels:['7506:verified'],updated_at:cutoff});
  const changed=buildSnapshot([edited],previous,before);
  assert.equal(changed.submissions[0].status,'review');
  const frozen=buildSnapshot([edited],previous,cutoff);
  assert.equal(frozen.submissions[0].status,'verified');
  assert.equal(frozen.submissions[0].model.has_adapter,false);
  assert.equal(Object.hasOwn(JSON.parse(frozen.submissions[0].signature)[6],'source_sha256'),false);
  assert.deepEqual(bestRows(frozen.submissions,'mp3').map(row=>row.number),[501]);
});
test('score-file validation requires complete public test identity and consistent three-case counts',()=>{
  assert.ok(validateMP3Score(score()));
  for(const change of [{split:'validation'},{n:120},{correct:121},{accuracy:99},
    {manifest_sha256:'f'.repeat(64)},{references_sha256:'f'.repeat(64)},{scorer_sha256:'f'.repeat(64)},
    {executor_sha256:'f'.repeat(64)},
    {bank_sha256:'f'.repeat(64)},{predictions_sha256:'bad'},{per_question:score().per_question.slice(1)}]) {
    assert.ok(!validateMP3Score(score(change)));
  }
  for(const mutate of [
    rows=>{rows[0].cases.pop();},rows=>{rows[0].cases[2].passed=false;},
    rows=>{rows[0].id=rows[1].id;},rows=>{rows[0].tool_calls=9;},
  ]) {
    const data=score(); mutate(data.per_question); assert.ok(!validateMP3Score(data));
  }
  for(const correct of [0,1,239,240]) {
    const data=score({correct,accuracy:100*correct/240});
    data.per_question.forEach((row,index)=>{
      row.passed=index<correct; row.cases.forEach(item=>{item.passed=row.passed;});
    });
    assert.ok(validateMP3Score(data));
    assert.ok(validateSubmission(claim({correct,score:100*correct/240})));
  }
});
test('GitHub handoff round-trips a self-reported score without label privileges or plaintext URLs',()=>{
  const data=claim(),url=new URL(makeIssueURL(data));
  assert.match(url.searchParams.get('title'),/MP3/);
  assert.match(url.searchParams.get('body'),/Self-reported public test result/);
  assert.equal(url.searchParams.has('labels'),false);
  assert.deepEqual(parseIssue({...issue(),body:url.searchParams.get('body')}).data,data);
  assert.equal(Object.hasOwn(data,'code_url'),false);
});
test('self-reported scores rank immediately; instructor verification remains a separate status',()=>{
  const snapshot=buildSnapshot([issue()],{},before);
  const rows=bestRows(snapshot.submissions,'mp3');
  assert.equal(rows.length,1); assert.equal(rows[0].correct,120); assert.equal(rows[0].score,50);
  assert.equal(rows[0].status,'self-reported'); assert.equal(rows[0].code_url,null);
  assert.equal(Object.hasOwn(snapshot,'evaluation_requests'),false);
  assert.equal(buildSnapshot([issue(claim(),{labels:['7506:verified']})],{},before).submissions[0].status,'verified');
});
test('editing model, hashes, scores or encrypted artifacts cannot inherit earlier verification',()=>{
  const previous=buildSnapshot([issue(claim(),{labels:['7506:verified']})],{},before);
  for(const data of [
    claim({source_sha256:'d'.repeat(64)}),claim({score_sha256:'d'.repeat(64)}),
    claim({predictions_sha256:'d'.repeat(64)}),claim({score:75,correct:180}),
    claim({model:{kind:'public',repository:'example/tiny',revision:'d'.repeat(40),parameters:1}}),
    claim({artifacts:{...claim().artifacts,iv:'B'.repeat(16)}}),
  ]) {
    const snapshot=buildSnapshot([issue(data,{labels:['7506:verified']})],previous,before);
    assert.equal(snapshot.submissions[0].status,'review');
    assert.deepEqual(bestRows(snapshot.submissions,'mp3'),[]);
  }
});
test('withdrawn, invalidated and under-review scores do not rank; best same-student score does',()=>{
  for(const changes of [{state:'closed'},{labels:['7506:invalid']},{labels:['7506:review']}]) {
    const snapshot=buildSnapshot([issue(claim(),changes)],{},before);
    assert.deepEqual(bestRows(snapshot.submissions,'mp3'),[]);
    assert.equal(bestRows(snapshot.submissions,'mp3',true).length,1);
  }
  const snapshot=buildSnapshot([issue(),issue(claim({correct:180,score:75}),{number:502})],{},before);
  assert.deepEqual(bestRows(snapshot.submissions,'mp3').map(row=>row.number),[502]);
});
test('all methods share one ranking and an individual best score regardless of model use',()=>{
  const records=[
    issue(claim({student_id:'student-a'})),
    issue(claim({student_id:'student-a',correct:144,score:60,
      model:{kind:'report',adapter_sha256:'e'.repeat(64)}}),{number:502}),
    issue(claim({student_id:'student-b',correct:180,score:75,
      model:{kind:'public',repository:'example/tiny',revision:'d'.repeat(40),parameters:1}}),{number:503}),
    issue(claim({student_id:'student-c',correct:144,score:60,
      model:{kind:'report',adapter_sha256:null}}),{number:504}),
  ];
  const snapshot=buildSnapshot(records,{},before);
  assert.deepEqual(bestRows(snapshot.submissions,'mp3').map(row=>[row.number,row.score]),[[503,75],[502,60],[504,60]]);
  assert.equal(bestRows(snapshot.submissions,'mp3',true).length,4);
});
test('MP3 freezes on November 30 and reviews December 1-7 independently of release timing',()=>{
  assert.equal(PROJECTS.mp3.score_deadline,cutoff);
  assert.equal(PROJECTS.mp3.review_deadline,reviewEnd);
  assert.equal(reviewStartTime('mp3'),Date.parse(cutoff));
  assert.equal(reviewEndTime('mp3'),Date.parse(reviewEnd));
  assert.equal(reviewEndTime('mp3')-reviewStartTime('mp3'),7*86400000);
  assert.equal(submissionPhase('mp3',{},'2026-11-30T23:59:59.999+08:00'),'scores');
  assert.equal(submissionPhase('mp3',{},cutoff),'review');
  assert.equal(submissionPhase('mp3',{},'2026-12-07T23:59:59.999+08:00'),'review');
  assert.equal(submissionPhase('mp3',{},reviewEnd),'complete');
  const delayed={projects:{mp3:{published_at:'2026-12-03T00:00:00+08:00',review_ends_at:'2026-12-20T00:00:00+08:00'}}};
  assert.equal(submissionPhase('mp3',delayed,reviewEnd),'complete');
  const original=issue(), previous=buildSnapshot([original],{},before);
  const edited=issue(claim({correct:180,score:75,source_sha256:'d'.repeat(64)}),{updated_at:cutoff});
  const late=issue(claim(),{number:502,created_at:cutoff,updated_at:cutoff});
  const frozen=buildSnapshot([edited,late],previous,cutoff);
  assert.equal(frozen.submissions[0].score,50);
  assert.equal(frozen.submissions[0].source_sha256,claim().source_sha256);
  assert.equal(frozen.submissions[0].late_score_edit_ignored,true);
  assert.equal(frozen.submissions[0].status,'self-reported');
  assert.equal(frozen.submissions[1].status,'late');
  assert.deepEqual(bestRows(frozen.submissions,'mp3').map(row=>row.number),[501]);
});
test('peer reports use the exact fixed window, exclude self reports and cannot change grades alone',()=>{
  const original=issue(), previous=buildSnapshot([original],{},before);
  const report={schema:'dase7506/peer-review-v1',protocol:PROTOCOL,project:'mp3',submission:501,reproduced_score:45};
  const peer=(number,at,author)=>issue(report,{number,user:{type:'User',login:author},created_at:at,updated_at:at});
  const records=[original,peer(601,'2026-11-30T23:59:59.999+08:00','early'),
    peer(602,cutoff,'first'),peer(603,'2026-12-07T23:59:59.999+08:00','last'),
    peer(604,reviewEnd,'late'),peer(605,cutoff,'example-student')];
  const snapshot=buildSnapshot(records,previous,reviewEnd);
  assert.deepEqual(snapshot.challenges.map(row=>row.number),[602,603]);
  assert.equal(snapshot.review_requests.find(row=>row.number===601).status,'early');
  assert.equal(snapshot.review_requests.find(row=>row.number===604).status,'late');
  assert.equal(snapshot.review_requests.find(row=>row.number===605).status,'self-request');
  assert.equal(snapshot.submissions[0].review_request_count,2);
  assert.equal(snapshot.submissions[0].score,50);
  assert.equal(snapshot.submissions[0].status,'self-reported');
  assert.deepEqual(snapshot.adjustments,[]);
  const target={project:'mp3',number:501,score:50};
  assert.equal(createPeerReviewReport(target,{}, {reproduced_score:0},cutoff).reproduced_score,0);
  assert.throws(()=>createPeerReviewReport(target,{}, {reproduced_score:null},cutoff),/reproduced score/);
  assert.throws(()=>createPeerReviewReport(target,{}, {reproduced_score:45,evidence_url:'http://example.org'},cutoff),/HTTPS/);
  assert.throws(()=>createPeerReviewReport(target,{}, {reproduced_score:45},before),/closed/);
  assert.throws(()=>createPeerReviewReport(target,{}, {reproduced_score:45},reviewEnd),/closed/);
});
test('MP3 uses the same hybrid encryption as MP2 and fails closed without HTTPS',async()=>{
  const oldCrypto=globalThis.crypto,oldFetch=globalThis.fetch,oldSecure=globalThis.isSecureContext;
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:3072});
  try {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
    globalThis.isSecureContext=false;
    await assert.rejects(encryptArtifactLinks('https://example.org/code.zip',null,'mp3'),/HTTPS/);
    globalThis.isSecureContext=true;
    globalThis.fetch=async()=>new Response(publicKey.export({type:'spki',format:'pem'}));
    for(const adapter of [null,'https://example.org/adapter.zip']) {
      const sealed=await encryptArtifactLinks('https://example.org/code.zip',adapter,'mp3');
      assert.ok(validateSubmission(claim({artifacts:sealed})));
      const key=await webcrypto.subtle.importKey('pkcs8',privateKey.export({type:'pkcs8',format:'der'}),{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
      const aes=await webcrypto.subtle.decrypt({name:'RSA-OAEP'},key,Buffer.from(sealed.wrapped_key,'base64'));
      const unwrapped=await webcrypto.subtle.importKey('raw',aes,'AES-GCM',false,['decrypt']);
      const plaintext=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(sealed.iv,'base64')},unwrapped,Buffer.from(sealed.ciphertext,'base64'));
      const data=JSON.parse(new TextDecoder().decode(plaintext));
      assert.equal(data.code_url,'https://example.org/code.zip'); assert.equal(data.checkpoint_url,adapter);
      assert.ok(!new URL(makeIssueURL(claim({artifacts:sealed}))).searchParams.get('body').includes('example.org'));
      for(const legacy of [false,true]) {
        const makeClaim=(artifacts,hasAdapter=adapter!==null)=>legacy
          ? claim({artifacts,model:{kind:'report',adapter_sha256:hasAdapter?'e'.repeat(64):null}})
          : simpleClaim(hasAdapter,{artifacts});
        const original=issue(makeClaim(sealed));
        const previous=buildSnapshot([original],{},before);
        assert.ok(!JSON.stringify(previous).includes('https://example.org'));
        assert.throws(()=>prepareRelease(previous,[original],privateKey,'mp3',before),/deadline/);
        const release=prepareRelease(previous,[original],privateKey,'mp3',cutoff);
        assert.equal(release.review_ends_at,new Date(reviewEnd).toISOString());
        const publication={projects:{mp3:release}};
        const published=buildSnapshot([original],previous,cutoff,publication);
        assert.equal(published.submissions[0].artifact_status,'published');
        assert.equal(published.submissions[0].code_url,'https://example.org/code.zip');
        assert.equal(published.submissions[0].checkpoint_url,adapter);
        const edited=issue(makeClaim(await encryptArtifactLinks('https://example.org/changed.zip',adapter,'mp3')),{updated_at:cutoff});
        const frozen=buildSnapshot([edited],previous,cutoff);
        const frozenRelease=prepareRelease(frozen,[edited],privateKey,'mp3',cutoff);
        assert.equal(frozenRelease.entries[0].code_url,'https://example.org/code.zip');
        if(!adapter) {
          const missing=issue(makeClaim(sealed,true));
          assert.throws(()=>prepareRelease(buildSnapshot([missing],{},before),[missing],privateKey,'mp3',cutoff),/required/);
        }
      }
    }
  } finally {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:oldCrypto});
    globalThis.fetch=oldFetch; globalThis.isSecureContext=oldSecure;
  }
});
