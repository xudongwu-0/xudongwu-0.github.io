import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,generateKeyPairSync} from 'node:crypto';
import {PROTOCOL,KEY_ID,MP3_EVALUATION,MP3_LORA_BASE,validateSubmission,validateMP3Score,makeIssueURL,parseIssue,buildSnapshot,bestRows,encryptArtifactLinks} from '../../courses/dase7506/arena.mjs';

const claim=(changes={})=>({
  schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp3',student_id:'example-student-id',
  score:50,correct:120,n:240,source_sha256:'a'.repeat(64),score_sha256:'b'.repeat(64),
  predictions_sha256:'c'.repeat(64),benchmark:{...MP3_EVALUATION},model:{kind:'none'},
  artifacts:{algorithm:'RSA-OAEP-256+AES-256-GCM',key_id:KEY_ID,wrapped_key:'A'.repeat(512),iv:'A'.repeat(16),ciphertext:'A'.repeat(24)},
  ...changes,
});
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
  const snapshot=buildSnapshot([issue()]);
  const rows=bestRows(snapshot.submissions,'mp3');
  assert.equal(rows.length,1); assert.equal(rows[0].correct,120); assert.equal(rows[0].score,50);
  assert.equal(rows[0].status,'self-reported'); assert.equal(rows[0].code_url,null);
  assert.equal(Object.hasOwn(snapshot,'evaluation_requests'),false);
  assert.equal(buildSnapshot([issue(claim(),{labels:['7506:verified']})]).submissions[0].status,'verified');
});
test('editing model, hashes, scores or encrypted artifacts cannot inherit earlier verification',()=>{
  const previous=buildSnapshot([issue(claim(),{labels:['7506:verified']})]);
  for(const data of [
    claim({source_sha256:'d'.repeat(64)}),claim({score_sha256:'d'.repeat(64)}),
    claim({predictions_sha256:'d'.repeat(64)}),claim({score:75,correct:180}),
    claim({model:{kind:'public',repository:'example/tiny',revision:'d'.repeat(40),parameters:1}}),
    claim({artifacts:{...claim().artifacts,iv:'B'.repeat(16)}}),
  ]) {
    const snapshot=buildSnapshot([issue(data,{labels:['7506:verified']})],previous);
    assert.equal(snapshot.submissions[0].status,'review');
    assert.deepEqual(bestRows(snapshot.submissions,'mp3'),[]);
  }
});
test('withdrawn, invalidated and under-review scores do not rank; best same-student score does',()=>{
  for(const changes of [{state:'closed'},{labels:['7506:invalid']},{labels:['7506:review']}]) {
    const snapshot=buildSnapshot([issue(claim(),changes)]);
    assert.deepEqual(bestRows(snapshot.submissions,'mp3'),[]);
    assert.equal(bestRows(snapshot.submissions,'mp3',true).length,1);
  }
  const snapshot=buildSnapshot([issue(),issue(claim({correct:180,score:75}),{number:502})]);
  assert.deepEqual(bestRows(snapshot.submissions,'mp3').map(row=>row.number),[502]);
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
    }
  } finally {
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:oldCrypto});
    globalThis.fetch=oldFetch; globalThis.isSecureContext=oldSecure;
  }
});
