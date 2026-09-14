import {REPO, PROTOCOL, KEY_ID, PROJECTS, safeURL, validScore, makeIssueURL, bestRows} from './arena.7edd6e636e4c.mjs';

const $ = id => document.getElementById(id);
let snapshot = {submissions: [], challenges: [], adjustments: []};
let project = 'mp1', challengeTarget = null;
const STATUS = {'self-reported':'Self-reported',verified:'Verified',review:'Under review',invalid:'Invalidated',withdrawn:'Withdrawn'};
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
    const author = element('td'); author.append(link(row.author, `https://github.com/${encodeURIComponent(row.author)}`));
    const score = element('td', Number(row.score).toFixed(PROJECTS[project].unit === 'BPB' ? 5 : 4) + (PROJECTS[project].unit === '%' ? '%' : ''));
    const materials = element('td'); materials.append(link('Code', row.code_url), link('Checkpoint', row.checkpoint_url), link(`#${row.number}`, row.url));
    const status = element('td'); status.append(element('span', STATUS[row.status] || row.status, `badge ${row.status}`));
    const reproduce = element('td'); const button = element('button', 'Request review', 'text-button');
    button.type = 'button'; button.addEventListener('click', () => openChallenge(row)); reproduce.append(button);
    tr.append(rankCell, author, score, materials, status, reproduce); $('board-body').append(tr);
  });
  $('review-list').replaceChildren();
  const challenges = snapshot.challenges.filter(c => c.project === project);
  if (!challenges.length) $('review-list').append(element('p', 'No reports yet.', 'caption'));
  for (const c of challenges) {
    const p = element('p');
    p.append(link(`#${c.number}`, c.url), document.createTextNode(` ${c.author} reproduced #${c.submission}: ${c.reproduced_score} ${PROJECTS[project].unit} · ${ {upheld:'Upheld by instructor',rejected:'Rejected by instructor',pending:'Pending instructor review'}[c.status] || c.status} · `), link('Evidence', c.evidence_url));
    $('review-list').append(p);
  }
  for (const a of snapshot.adjustments.filter(a => a.project === project)) {
    $('review-list').append(element('p', `${a.author}: reproduction reward +${a.reward}, review adjustment ${a.penalty} (project marks; each adjustment capped independently).`));
  }
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
      if (d.schema !== 'dase7506/board-v1' || d.protocol !== PROTOCOL || !Array.isArray(d.submissions) || !Array.isArray(d.challenges) || !Array.isArray(d.adjustments)) throw new Error('Invalid snapshot');
      return d;
    };
    try { result = await fetchSnapshot(raw); }
    catch {
      try { result = await fetchSnapshot(api, {Accept:'application/vnd.github.raw+json'}); }
      catch { result = await fetchSnapshot('./data/leaderboard.json'); fallback = true; }
    }
    snapshot = result; render();
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
  const config = PROJECTS[$('project').value];
  $('score-unit').textContent = config.open ? config.unit : 'Metric to be announced';
  for (const limit of ['min','max']) {
    if (config[limit] === null) $('score').removeAttribute(limit); else $('score')[limit] = String(config[limit]);
  }
  $('score').value = ''; $('score').placeholder = config.open ? 'e.g. 2.10184' : 'Available when this project opens';
  $('score-help').textContent = config.open ? `Full-test FP32 ${config.unit}; ${config.lower ? 'lower' : 'higher'} is better.` : 'Enter the evaluation score for the submitted checkpoint.';
  for (const id of ['student-id','score','code-url','checkpoint-url','consent','prepare-submit']) $(id).disabled = !config.open;
  $('prepare-submit').textContent = config.open ? 'Prepare submission ↗' : 'Project not open yet';
  $('submission-status').replaceChildren();
}
$('project').addEventListener('change', configureForm);
async function encryptStudentID(studentId) {
  if (!window.isSecureContext || !crypto.subtle) throw new Error('Open this page over HTTPS to encrypt your student ID.');
  const response = await fetch('./data/student-id-public.pem', {cache:'no-cache'});
  if (!response.ok) throw new Error('The student ID encryption key could not be loaded. Please try again.');
  const pem = await response.text();
  const binary = atob(pem.replace(/-----[^-]+-----|\s/g, ''));
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(binary, c => c.charCodeAt(0)), {name:'RSA-OAEP',hash:'SHA-256'}, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({name:'RSA-OAEP'}, key, new TextEncoder().encode(studentId));
  return {algorithm:'RSA-OAEP-256', key_id:KEY_ID, ciphertext:btoa(String.fromCharCode(...new Uint8Array(ciphertext)))};
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
    const p = $('project').value, score = Number($('score').value);
    if (!PROJECTS[p].open) throw new Error('This project is not open for submissions.');
    const code = safeURL($('code-url').value.trim()), checkpoint = safeURL($('checkpoint-url').value.trim());
    if (!validScore(p,score) || !code || !checkpoint) throw new Error('Check the score range and use HTTPS links without embedded credentials (maximum 500 characters).');
    const studentId = $('student-id').value.trim();
    if (!/^[A-Za-z0-9-]{3,32}$/.test(studentId)) throw new Error('Enter a student ID of 3–32 characters using letters, numbers or hyphens.');
    const encrypted = await encryptStudentID(studentId);
    const data = {schema:'dase7506/submission-v1',protocol:PROTOCOL,project:p,score,
      code_url:code,checkpoint_url:checkpoint,student_id:encrypted};
    prepared($('submission-status'), makeIssueURL(data), 'Submission');
    $('student-id').value = '';
  } catch (error) { $('submission-status').append(element('p', error.message, 'error')); }
  finally { button.disabled = !PROJECTS[$('project').value].open; }
});
function openChallenge(row) {
  challengeTarget = row;
  $('challenge-form').reset(); $('challenge-status').replaceChildren();
  $('challenge-target').textContent = `${row.project.toUpperCase()} · ${row.author} · #${row.number} · self-reported ${row.score} ${PROJECTS[row.project].unit}`;
  for (const limit of ['min','max']) {
    if (PROJECTS[row.project][limit] === null) $('reproduced-score').removeAttribute(limit);
    else $('reproduced-score')[limit] = String(PROJECTS[row.project][limit]);
  }
  $('challenge-dialog').showModal();
}
$('close-dialog').addEventListener('click', () => $('challenge-dialog').close());
$('challenge-form').addEventListener('submit', event => {
  event.preventDefault(); $('challenge-status').replaceChildren();
  try {
    const score = Number($('reproduced-score').value), evidence = safeURL($('evidence-url').value.trim());
    if (!challengeTarget || !validScore(challengeTarget.project, score) || !evidence) throw new Error('Check the reproduced score and HTTPS evidence link.');
    const threshold = PROJECTS[challengeTarget.project].review_threshold;
    if (typeof threshold === 'number' && Math.abs(score-challengeTarget.score) <= threshold) throw new Error(`The difference does not exceed the review threshold of ${threshold} ${PROJECTS[challengeTarget.project].unit}. Discuss general questions on the original submission.`);
    const data = {schema:'dase7506/challenge-v1',protocol:PROTOCOL,project:challengeTarget.project,
      submission:challengeTarget.number,reproduced_score:score,evidence_url:evidence};
    prepared($('challenge-status'), makeIssueURL(data), 'Review request');
  } catch (error) { $('challenge-status').append(element('p', error.message, 'error')); }
});
configureForm();
refresh();
