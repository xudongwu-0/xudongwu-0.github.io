import {REPO, PROTOCOL, PROJECTS, MP3_EVALUATION, MP3_LORA_BASE, safeURL, validStudentID, validateSubmission, validateMP3Score, makeIssueURL, bestRows, encryptArtifactLinks} from './arena.mjs';

const $=id=>document.getElementById(id);
const ROUTES={none:'CPU / fixed hints',public:'Public LLM',lora:'LoRA'};
const STATUS={'self-reported':'Self-reported',verified:'Verified',review:'Review required',invalid:'Invalidated',withdrawn:'Withdrawn',late:'Late submission'};
let snapshot={submissions:[]}, refreshing=false, hasSnapshot=false, scoreReport=null, scoreHash=null, loadedScoreFile=null, formVersion=0;
function element(tag,text,className) {
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(className) node.className=className;
  return node;
}
function issueLink(row) {
  const link=element('a',`#${row.number}`);
  const url=safeURL(row.url);
  if(url) link.href=url;
  link.target='_blank'; link.rel='noopener noreferrer';
  return link;
}
function empty(body,columns,text) {
  const row=element('tr'), cell=element('td',text,'empty');
  cell.colSpan=columns; row.append(cell); body.append(row);
}
function submissionsOpen() {
  const deadline=PROJECTS.mp3.score_deadline;
  return PROJECTS.mp3.open && (!deadline || Date.now()<Date.parse(deadline));
}
function configureForm() {
  const kind=$('model-kind').value, live=kind!=='none', lora=kind==='lora';
  $('model-fields').hidden=!live; $('model-fields').disabled=!live;
  $('adapter-fields').hidden=!lora; $('adapter-fields').disabled=!lora;
  $('model-repo').readOnly=lora; $('model-revision').readOnly=lora;
  if(lora) {
    $('model-repo').value=MP3_LORA_BASE.repository;
    $('model-revision').value=MP3_LORA_BASE.revision;
    $('model-parameters').min=String(MP3_LORA_BASE.parameters+1);
  } else $('model-parameters').min='1';
  const open=submissionsOpen();
  $('prepare-submit').disabled=!open;
  $('phase-badge').textContent=open?'Score submissions open':'Score submissions closed';
  $('phase-note').textContent=PROJECTS.mp3.score_deadline
    ? `Score issues must be created before ${new Date(PROJECTS.mp3.score_deadline).toLocaleString('en-GB',{timeZone:'Asia/Shanghai'})} (UTC+8).`
    : 'No deadline has been configured yet. Follow the separate course announcement.';
}
function render() {
  const history=$('history').checked, rows=bestRows(snapshot.submissions,'mp3',history);
  $('board-body').replaceChildren();
  if(!rows.length) empty($('board-body'),6,'No eligible results yet. Evaluate locally and submit your test-score JSON.');
  let rank=0, previous=null;
  for(const [index,row] of rows.entries()) {
    if(row.score!==previous) rank=index+1;
    previous=row.score;
    const tr=element('tr'), record=element('td');
    record.append(issueLink(row),element('br'),element('span',STATUS[row.status]||row.status,'caption'));
    tr.append(element('td',history?'—':String(rank)),element('td',row.student_id),
      element('td',`${row.correct} / ${row.n}`),element('td',`${row.score.toFixed(2)}%`),
      element('td',ROUTES[row.model_kind]||row.model_kind),record);
    $('board-body').append(tr);
  }
}
async function refresh() {
  if(refreshing) return;
  refreshing=true; $('refresh').disabled=true; $('sync-status').textContent='Refreshing…';
  const raw=`https://raw.githubusercontent.com/${REPO}/main/courses/dase7506/data/leaderboard.json?v=${Date.now()}`;
  const api=`https://api.github.com/repos/${REPO}/contents/courses/dase7506/data/leaderboard.json?ref=main`;
  const fetchSnapshot=async(url,headers={})=>{
    const response=await fetch(url,{headers,cache:'no-cache',signal:AbortSignal.timeout(6000)});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(data.schema!=='dase7506/board-v1' || data.snapshot_version!==2 || data.protocol!==PROTOCOL
      || !Array.isArray(data.submissions)) throw new Error('The leaderboard snapshot is invalid.');
    return data;
  };
  try {
    const responses=await Promise.allSettled([fetchSnapshot(raw),fetchSnapshot('../data/leaderboard.json')]);
    const candidates=responses.filter(result=>result.status==='fulfilled').map(result=>result.value)
      .sort((a,b)=>Date.parse(b.generated_at)-Date.parse(a.generated_at));
    let result=candidates[0];
    if(!result) result=await fetchSnapshot(api,{Accept:'application/vnd.github.raw+json'});
    if(hasSnapshot && Date.parse(result.generated_at)<Date.parse(snapshot.generated_at)) result=snapshot;
    snapshot=result; hasSnapshot=true; render();
    $('sync-status').textContent=`Updated: ${new Date(result.generated_at).toLocaleString('en-GB')}. Auto-refresh every 30 seconds. Reported scores remain subject to instructor checks.`;
  } catch(error) {
    $('sync-status').textContent=hasSnapshot?'Refresh failed; showing the last loaded results. Retrying automatically.'
      :`Results unavailable: ${error.message} Your score submission is saved only after you create its GitHub issue.`;
    if(!hasSnapshot) {
      $('board-body').replaceChildren();
      empty($('board-body'),6,'Leaderboard unavailable. Your GitHub issue is the submission receipt.');
    }
  } finally {refreshing=false; $('refresh').disabled=false; configureForm();}
}
$('model-kind').addEventListener('change',configureForm);
$('history').addEventListener('change',render);
$('refresh').addEventListener('click',refresh);
$('submission-form').addEventListener('input',()=>{
  formVersion++; $('submission-status').replaceChildren();
});
$('submission-form').addEventListener('submit',async event=>{
  event.preventDefault(); $('prepare-submit').disabled=true; $('submission-status').replaceChildren();
  try {
    const version=formVersion;
    if(!submissionsOpen()) throw new Error('Score submissions are closed.');
    if(!$('consent').checked) throw new Error('Confirm the project rules and privacy notice.');
    if(!scoreReport || loadedScoreFile!==$('score-file').files[0]) throw new Error('Load a valid full test-score JSON first.');
    const student_id=$('student-id').value.trim(), code=safeURL($('code-url').value.trim());
    if(!validStudentID(student_id)) throw new Error('Enter a student ID of 1–64 visible characters.');
    if(!code) throw new Error('Provide an HTTPS source ZIP link without credentials.');
    const kind=$('model-kind').value;
    let model={kind}, adapter=null;
    if(kind!=='none') model={kind,repository:$('model-repo').value.trim(),
      revision:$('model-revision').value.trim().toLowerCase(),parameters:Number($('model-parameters').value)};
    if(kind==='lora') {
      adapter=safeURL($('adapter-url').value.trim());
      if(!adapter) throw new Error('Provide an HTTPS adapter ZIP link without credentials.');
      model.adapter_sha256=$('adapter-sha').value.trim().toLowerCase();
    }
    const data={schema:'dase7506/submission-v1',protocol:PROTOCOL,project:'mp3',student_id,
      score:scoreReport.accuracy,correct:scoreReport.correct,n:scoreReport.n,score_sha256:scoreHash,
      predictions_sha256:scoreReport.predictions_sha256,
      source_sha256:$('source-sha').value.trim().toLowerCase(),benchmark:{...MP3_EVALUATION},model};
    data.artifacts=await encryptArtifactLinks(code,adapter,'mp3');
    if(version!==formVersion) throw new Error('The form changed while preparing. Check your fields and prepare again.');
    if(!validateSubmission(data)) throw new Error('Check artifact hashes, the fixed benchmark, model revision and actual parameter count. Only the pinned Qwen3-0.6B base may use LoRA.');
    const ready=element('div','Score submission prepared, not submitted. Create the GitHub issue to save it.','prepared');
    const link=element('a','Submit on GitHub ↗');
    link.href=makeIssueURL(data); link.target='_blank'; link.rel='noopener noreferrer';
    ready.append(element('br'),link); $('submission-status').append(ready);
    $('code-url').value=''; $('adapter-url').value='';
  } catch(error) {$('submission-status').append(element('p',error.message,'error'));}
  finally {configureForm();}
});
$('score-file').addEventListener('change',async()=>{
  scoreReport=null; scoreHash=null; loadedScoreFile=null; $('score').value='';
  const file=$('score-file').files[0];
  if(!file) {$('score-status').textContent='Select the complete outputs/test-score.json.';return;}
  $('score-status').textContent='Checking the local score file…';
  try {
    if(file.size>4*1024*1024) throw new Error('The score JSON must be at most 4 MiB.');
    const bytes=await file.arrayBuffer(), data=JSON.parse(new TextDecoder().decode(bytes));
    if(!validateMP3Score(data)) throw new Error('Use an unchanged, full 240-task test-score JSON from this starter package and scorer, not validation results or one-instance checks.');
    const hash=await crypto.subtle.digest('SHA-256',bytes);
    if($('score-file').files[0]!==file) return;
    scoreReport=data; loadedScoreFile=file;
    scoreHash=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
    $('score').value=`${data.correct} / ${data.n} = ${data.accuracy.toFixed(2)}%`;
    $('score-status').textContent='Full public test score loaded. This checks format and identity, not independent reproduction.';
  } catch(error) {
    if($('score-file').files[0]===file) $('score-status').textContent=`Score file rejected: ${error.message}`;
  }
});
configureForm();
refresh();
setInterval(()=>{if(!document.hidden){configureForm();refresh();}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden) refresh();});
