import {REPO, PROTOCOL, REPORT_EMAIL, PROJECTS, safeURL, validScore, validStudentID, makeIssueURL, peerReviewEmailURL, bestRows, submissionPhase} from './arena.68319748f2fc.mjs';

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
    const artifactLinks=element('div',undefined,'artifact-links');
    for(const [label,url,kind] of [['Code',row.code_url,'code'],['Checkpoint',row.checkpoint_url,'checkpoint']]) {
      const item=element('span',undefined,'artifact-item');
      item.append(url ? link(label,url) : element('span',`${label}: Not provided`,'caption'));
      const access=row.artifact_access?.[kind];
      if(url && access?.status==='unavailable') {
        const warning=element('span','Unable to open','artifact-unavailable');
        warning.title=access.reason || 'Unavailable without signing in at the last check.';
        item.append(warning);
      }
      artifactLinks.append(item);
    }
    materials.append(artifactLinks);
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
    snapshot = result; render(); configureReview();
    const time = result.generated_at ? new Date(result.generated_at).toLocaleString('en-GB') : 'not synced yet';
    $('sync-status').textContent = `${fallback ? 'Cached · ' : ''}Updated: ${time}. Scores are frozen. Links are public for peer review.`;
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
function configureReview() {
  const phase=submissionPhase(project,snapshot.publication);
  $('phase-badge').textContent={scores:'Scores frozen',artifacts:'Scores frozen',review:'7-day public review',complete:'Review closed',closed:'Closed'}[phase];
  $('phase-note').textContent=phase==='review'
    ? `Code and checkpoint links are public. Peer-review deadline: ${new Date(snapshot.publication.projects[project].review_ends_at).toLocaleString('en-GB',{timeZone:'Asia/Shanghai'})} (UTC+8).`
    : phase==='complete' ? 'The public review period has ended. Code and checkpoint links remain available.'
    : 'Scores are frozen. Submitted links are being prepared for public review.';
}
function prepared(target, url, kind) {
  const p = element('div', `${kind} ready. Confirm on GitHub to save.`, 'prepared');
  // Generated issue URLs contain the encrypted payload and exceed the artifact URL limit.
  const a = element('a', 'Submit on GitHub ↗');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  p.append(element('br'), a);
  target.replaceChildren(p);
}
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
configureReview();
refresh();

setInterval(()=>{configureReview();render();},30000);
