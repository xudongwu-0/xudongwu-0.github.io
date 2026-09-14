import {REPO, PROTOCOL, KEY_ID, REPORT_EMAIL, PROJECTS, safeURL, validScore, validStudentID, makeIssueURL, peerReviewEmailURL, bestRows, submissionPhase} from './arena.233381b09b3a.mjs';

const $ = id => document.getElementById(id);
let snapshot = {submissions: [], challenges: [], adjustments: []};
let project = 'mp1', challengeTarget = null;
const STATUS = {'self-reported':'Self-reported',verified:'Verified',review:'Under review',invalid:'Invalidated',withdrawn:'Withdrawn',late:'Late score','links-missing':'Links missing'};
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(text, url) {
  const a = element('a', text);
  if (safeURL(url)) a.href = url;
  a.target = '_blank'; a.rel = 'noopener noreferrer';
  return a;
}
function render() {
  const history = $('history').checked;
  const rows = bestRows(snapshot.submissions, project, history);
  $('score-heading').textContent = PROJECTS[project].open ? `${PROJECTS[project].unit} ${PROJECTS[project].lower ? '↓' : '↑'}` : 'Metric to be announced';
  $('board-body').replaceChildren();
  if (!rows.length) {
    const td = element('td', PROJECTS[project].open ? 'No submissions yet.' : 'This project is not open for submissions yet.', 'empty');
    td.colSpan = 6; const tr = element('tr'); tr.append(td); $('board-body').append(tr);
  }
  let lastScore = null, rank = 0;
  rows.forEach((row, i) => {
    if (row.score !== lastScore) rank = i + 1;
    lastScore = row.score;
    const tr = element('tr');
    const rankCell = element('td', history ? '—' : String(rank));
    const author = element('td', validStudentID(row.student_id)?row.student_id:'ID pending');
    const score = element('td', Number(row.score).toFixed(PROJECTS[project].unit === 'BPB' ? 5 : 4) + (PROJECTS[project].unit === '%' ? '%' : ''));
    const materials = element('td');
    if(row.code_url && row.checkpoint_url) materials.append(link('Code',row.code_url),link('Checkpoint',row.checkpoint_url));
    else materials.append(element('span',row.artifact_status==='received'?'Links received · ':'Links pending · '));
    materials.append(link(`#${row.number}`,row.url));
    const status = element('td'); status.append(element('span', STATUS[row.status] || row.status, `badge ${row.status}`));
    const reproduce = element('td'); const button = element('button', 'Peer Review Report', 'text-button');
    button.type = 'button'; button.disabled = ['closed','complete'].includes(submissionPhase(row.project,snapshot.publication)); button.addEventListener('click', () => openChallenge(row)); reproduce.append(button);
    tr.append(rankCell, author, score, materials, status, reproduce); $('board-body').append(tr);
  });
}
async function refresh() {
  $('refresh').disabled = true;
  $('sync-status').textContent = 'Refreshing…';
  // Raw GitHub serves the Actions snapshot without sharing the unauthenticated REST rate limit.
  const raw = `https://raw.githubusercontent.com/${REPO}/main/courses/dase7506/data/leaderboard.json?v=${Date.now()}`;
  const api = `https://api.github.com/repos/${REPO}/contents/courses/dase7506/data/leaderboard.json?ref=main`;
  let result, fallback = false;
  try {
    const fetchSnapshot = async (url, headers={}) => {
      const response = await fetch(url, {headers, cache:'no-cache', signal:AbortSignal.timeout(6000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const d = await response.json();
      if (d.schema !== 'dase7506/board-v1' || d.snapshot_version!==2 || d.protocol !== PROTOCOL || !Array.isArray(d.submissions) || !Array.isArray(d.challenges) || !Array.isArray(d.adjustments)) throw new Error('Invalid or outdated snapshot');
      return d;
    };
    try { result = await fetchSnapshot(raw); }
    catch {
      try { result = await fetchSnapshot(api, {Accept:'application/vnd.github.raw+json'}); }
      catch { result = await fetchSnapshot('./data/leaderboard.json'); fallback = true; }
    }
    snapshot = result; render(); configureForm();
    const time = result.generated_at ? new Date(result.generated_at).toLocaleString('en-GB') : 'not synced yet';
    $('sync-status').textContent = `${fallback ? 'Cached · ' : ''}Updated: ${time}. Allow a few minutes for new submissions.`;
  } catch {
    $('sync-status').textContent = 'Leaderboard unavailable. See submission records.';
    if (!$('board-body').children.length || !$('board-body').textContent.includes('Code')) {
      const tr = element('tr'), td = element('td','Unable to load the leaderboard. Please try again.','empty'); td.colSpan=6; tr.append(td); $('board-body').replaceChildren(tr);
    }
  } finally { $('refresh').disabled = false; }
}
for (const button of document.querySelectorAll('[data-project]')) {
  button.addEventListener('click', () => {
    project = button.dataset.project;
    document.querySelectorAll('[data-project]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    render();
  });
}
$('history').addEventListener('change', render);
$('refresh').addEventListener('click', refresh);
function configureForm() {
  const id=$('project').value, config=PROJECTS[id];
  const phase=submissionPhase(id,snapshot.publication), scores=phase==='scores', artifacts=phase==='artifacts';
  $('phase-badge').textContent={scores:'Score submissions open',artifacts:'Links required',review:'7-day public review',complete:'Review closed',closed:'Submissions closed'}[phase];
  $('phase-note').textContent=scores
    ? 'Report your score by 30 September. Links are optional now and required afterwards. The instructor releases links together for a 7-day review.'
    : artifacts ? 'Scores are frozen. Submit both links for your original score using the same GitHub account. The instructor will open the 7-day review after collecting the links.'
    : phase==='review' ? `Links are public. Peer-review deadline: ${new Date(snapshot.publication.projects[id].review_ends_at).toLocaleString('en-GB',{timeZone:'Asia/Shanghai'})} (UTC+8).`
    : 'The public review period has ended.';
  $('submit-title').textContent=scores?'Submit a score':'Submit code and checkpoint';
  $('score-fields').hidden=!scores; $('artifact-reference').hidden=!artifacts;
  $('student-id').required=scores; $('score').required=scores; $('score-submission').required=artifacts;
  $('student-id').disabled=!scores; $('score').disabled=!scores; $('score-submission').disabled=!artifacts;
  $('code-url').required=artifacts; $('checkpoint-url').required=artifacts;
  for(const node of document.querySelectorAll('.link-requirement')) node.textContent=scores?'Optional until the score deadline':'Required';
  $('score-unit').textContent=config.unit;
  $('score-help').textContent=scores?'Full-test FP32 BPB; lower is better.':'Find your original issue number in the leaderboard.';
  $('score-help').hidden=!scores && !artifacts;
  for(const name of ['code-url','checkpoint-url','consent','prepare-submit']) $(name).disabled=!scores && !artifacts;
  $('prepare-submit').textContent=scores?'Prepare score submission ↗':artifacts?'Prepare link submission ↗':'Submission period closed';
}
$('project').addEventListener('change', configureForm);
let publicKeyPromise;
function loadPublicKey() {
  if(!publicKeyPromise) publicKeyPromise=(async()=>{
    if (!window.isSecureContext || !crypto.subtle) throw new Error('Open this page over HTTPS to encrypt your submission.');
    const response=await fetch('./data/student-id-public.pem',{cache:'no-cache'});
    if(!response.ok) throw new Error('The encryption key could not be loaded. Please try again.');
    const pem=await response.text(), binary=atob(pem.replace(/-----[^-]+-----|\s/g,''));
    return crypto.subtle.importKey('spki',Uint8Array.from(binary,c=>c.charCodeAt(0)),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  })().catch(error=>{publicKeyPromise=null;throw error;});
  return publicKeyPromise;
}
const base64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
async function encryptArtifactLinks(code,checkpoint,project,submission=null) {
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const text=JSON.stringify({schema:'dase7506/artifact-links-v1',project,submission,code_url:code,checkpoint_url:checkpoint});
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},await loadPublicKey(),await crypto.subtle.exportKey('raw',key));
  return {algorithm:'RSA-OAEP-256+AES-256-GCM',key_id:KEY_ID,wrapped_key:base64(wrapped),iv:base64(iv),ciphertext:base64(ciphertext)};
}
function prepared(target, url, kind) {
  const p = element('div', `${kind} ready. Confirm on GitHub to save.`, 'prepared');
  // Generated issue URLs contain the encrypted payload and exceed the artifact URL limit.
  const a = element('a', 'Submit on GitHub ↗');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  p.append(element('br'), a);
  target.replaceChildren(p);
}
$('submission-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('prepare-submit'); button.disabled = true;
  $('submission-status').replaceChildren();
  try {
    const p=$('project').value, phase=submissionPhase(p,snapshot.publication);
    if(!['scores','artifacts'].includes(phase)) throw new Error('The submission period is closed.');
    const rawCode=$('code-url').value.trim(), rawCheckpoint=$('checkpoint-url').value.trim();
    const code=rawCode?safeURL(rawCode):null, checkpoint=rawCheckpoint?safeURL(rawCheckpoint):null;
    if((rawCode && !code)||(rawCheckpoint && !checkpoint)) throw new Error('Use HTTPS links without embedded credentials (maximum 500 characters).');
    let data;
    if(phase==='scores') {
      const score=Number($('score').value), studentId=$('student-id').value.trim();
      if(!validScore(p,score)) throw new Error('Enter a valid full-test BPB score.');
      if(!validStudentID(studentId)) throw new Error('Enter a student ID or result label of 1–64 characters, without control characters.');
      data={schema:'dase7506/submission-v1',protocol:PROTOCOL,project:p,score,student_id:studentId};
      if(code || checkpoint) data.artifacts=await encryptArtifactLinks(code,checkpoint,p);
    } else {
      const submission=Number($('score-submission').value);
      if(!Number.isSafeInteger(submission)||submission<1||!code||!checkpoint) throw new Error('Enter your original score submission number and both links.');
      data={schema:'dase7506/artifacts-v1',protocol:PROTOCOL,project:p,submission,artifacts:await encryptArtifactLinks(code,checkpoint,p,submission)};
    }
    prepared($('submission-status'),makeIssueURL(data),phase==='scores'?'Score submission':'Link submission');
    $('student-id').value=''; $('code-url').value=''; $('checkpoint-url').value='';
  } catch (error) { $('submission-status').append(element('p', error.message, 'error')); }
  finally { configureForm(); }
});
function openChallenge(row) {
  challengeTarget = row;
  $('challenge-form').reset(); $('challenge-status').replaceChildren();
  $('email-report').href=`mailto:${REPORT_EMAIL}`;
  $('challenge-target').textContent = `${row.project.toUpperCase()} · ${row.student_id||'ID pending'} · #${row.number} · self-reported ${row.score} ${PROJECTS[row.project].unit}`;
  for (const limit of ['min','max']) {
    if (PROJECTS[row.project][limit] === null) $('reproduced-score').removeAttribute(limit);
    else $('reproduced-score')[limit] = String(PROJECTS[row.project][limit]);
  }
  $('challenge-dialog').showModal();
}
$('close-dialog').addEventListener('click', () => $('challenge-dialog').close());
function peerReportData() {
    const phase=challengeTarget && submissionPhase(challengeTarget.project,snapshot.publication);
    if(!challengeTarget || ['closed','complete'].includes(phase)) throw new Error('Peer review reports are closed.');
    const reason=$('review-reason').value.trim(),rawScore=$('reproduced-score').value.trim(),rawEvidence=$('evidence-url').value.trim();
    const score=rawScore?Number(rawScore):null,evidence=rawEvidence?safeURL(rawEvidence):null;
    if(!rawScore || !validScore(challengeTarget.project,score)) throw new Error('Enter your reproduced score.');
    if(reason.length>2000) throw new Error('Keep the optional report within 2,000 characters.');
    if(rawEvidence && !evidence) throw new Error('Check the optional HTTPS evidence link.');
    const threshold = PROJECTS[challengeTarget.project].review_threshold;
    if (phase==='review' && typeof threshold === 'number' && Math.abs(score-challengeTarget.score) <= threshold) throw new Error(`The difference does not exceed the review threshold of ${threshold} ${PROJECTS[challengeTarget.project].unit}. Discuss general questions on the original submission.`);
    return {schema:'dase7506/peer-review-v1',protocol:PROTOCOL,project:challengeTarget.project,
      submission:challengeTarget.number,reason,reproduced_score:score,evidence_url:evidence};
}
$('challenge-form').addEventListener('submit', event => {
  event.preventDefault(); $('challenge-status').replaceChildren();
  try {
    prepared($('challenge-status'), makeIssueURL(peerReportData()), 'Peer Review Report');
  } catch (error) { $('challenge-status').append(element('p', error.message, 'error')); }
});
$('email-report').addEventListener('click', event => {
  $('challenge-status').replaceChildren();
  if(!$('challenge-form').reportValidity()){event.preventDefault();return;}
  try { $('email-report').href=peerReviewEmailURL(peerReportData()); }
  catch(error){event.preventDefault();$('challenge-status').append(element('p',error.message,'error'));}
});
configureForm();
refresh();

setInterval(configureForm,30000);
