import {REPO, PROTOCOL, KEY_ID, PROJECTS, safeURL, validScore, makeIssueURL, bestRows} from './arena.mjs';

const $ = id => document.getElementById(id);
let snapshot = {submissions: [], challenges: [], adjustments: []};
let project = 'mp1', challengeTarget = null;
const STATUS = {'self-reported':'自报 · 未复核',verified:'已复核',review:'待核查',invalid:'已作废',withdrawn:'已撤回'};
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
  $('score-heading').textContent = PROJECTS[project].open ? `${PROJECTS[project].unit} ${PROJECTS[project].lower ? '↓' : '↑'}` : '指标待公布';
  $('board-body').replaceChildren();
  if (!rows.length) {
    const td = element('td', PROJECTS[project].open ? '还没有学生提交，期待你的成果。' : '项目内容与评分指标待公布，暂未开放提交。', 'empty');
    td.colSpan = 6; const tr = element('tr'); tr.append(td); $('board-body').append(tr);
  }
  let lastScore = null, rank = 0;
  rows.forEach((row, i) => {
    if (row.score !== lastScore) rank = i + 1;
    lastScore = row.score;
    const tr = element('tr');
    const rankCell = element('td', history ? '—' : String(rank));
    const author = element('td'); author.append(link(row.author, `https://github.com/${encodeURIComponent(row.author)}`));
    const score = element('td', Number(row.score).toFixed(4) + (PROJECTS[project].unit === '%' ? '%' : ''));
    const materials = element('td'); materials.append(link('代码', row.code_url), link('权重', row.checkpoint_url), link(`#${row.number}`, row.url));
    const status = element('td'); status.append(element('span', STATUS[row.status] || row.status, `badge ${row.status}`));
    const reproduce = element('td'); const button = element('button', '申请核查', 'text-button');
    button.type = 'button'; button.addEventListener('click', () => openChallenge(row)); reproduce.append(button);
    tr.append(rankCell, author, score, materials, status, reproduce); $('board-body').append(tr);
  });
  $('review-list').replaceChildren();
  const challenges = snapshot.challenges.filter(c => c.project === project);
  if (!challenges.length) $('review-list').append(element('p', '该项目尚无复现申请。', 'caption'));
  for (const c of challenges) {
    const p = element('p');
    p.append(link(`#${c.number}`, c.url), document.createTextNode(` ${c.author} 复现 #${c.submission}：${c.reproduced_score} ${PROJECTS[project].unit} · ${ {upheld:'教师确认成立',rejected:'教师驳回',pending:'等待教师裁定'}[c.status] || c.status} · `), link('证据', c.evidence_url));
    $('review-list').append(p);
  }
  for (const a of snapshot.adjustments.filter(a => a.project === project)) {
    $('review-list').append(element('p', `${a.author}：复现奖励 +${a.reward}，核查扣分 ${a.penalty}（作业分；各项独立封顶）。`));
  }
}
async function refresh() {
  $('refresh').disabled = true;
  $('sync-status').textContent = '正在同步 GitHub 提交记录…';
  // Raw GitHub serves the Actions snapshot without sharing the unauthenticated REST rate limit.
  const raw = `https://raw.githubusercontent.com/${REPO}/main/courses/dase7506/data/leaderboard.json`;
  let result, fallback = false;
  try {
    const fetchSnapshot = async url => {
      const response = await fetch(url, {cache:'no-cache', signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const d = await response.json();
      if (d.schema !== 'dase7506/board-v1' || d.protocol !== PROTOCOL || !Array.isArray(d.submissions) || !Array.isArray(d.challenges) || !Array.isArray(d.adjustments)) throw new Error('Invalid snapshot');
      return d;
    };
    try { result = await fetchSnapshot(raw); }
    catch { result = await fetchSnapshot('./data/leaderboard.json'); fallback = true; }
    snapshot = result; render();
    const time = result.generated_at ? new Date(result.generated_at).toLocaleString('zh-CN') : '尚未同步';
    $('sync-status').textContent = `${fallback ? '当前显示网站缓存，可能落后于最新提交。' : ''}快照更新：${time}。提交后通常需数分钟同步；原始记录立即可查。`;
  } catch {
    $('sync-status').textContent = '暂时无法读取榜单。已提交记录仍保存在 GitHub，可用右侧链接查看。';
    if (!$('board-body').children.length || !$('board-body').textContent.includes('代码')) {
      const tr = element('tr'), td = element('td','无法读取榜单，请稍后重试。','empty'); td.colSpan=6; tr.append(td); $('board-body').replaceChildren(tr);
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
  $('score-unit').textContent = config.open ? config.unit : '指标待公布';
  for (const limit of ['min','max']) {
    if (config[limit] === null) $('score').removeAttribute(limit); else $('score')[limit] = String(config[limit]);
  }
  $('score').value = ''; $('score').placeholder = config.open ? '填写评测分数' : '项目公布后填写';
  $('score-help').textContent = config.open ? `指定 checkpoint 的 ${config.unit}，越${config.lower ? '低' : '高'}越好。` : '填写所提交 checkpoint 的评测分数。';
  for (const id of ['student-id','score','code-url','checkpoint-url','consent','prepare-submit']) $(id).disabled = !config.open;
  $('prepare-submit').textContent = config.open ? '生成 GitHub 提交 ↗' : '项目待公布 · 暂未开放';
  $('submission-status').replaceChildren();
}
$('project').addEventListener('change', configureForm);
async function encryptStudentID(studentId) {
  if (!window.isSecureContext || !crypto.subtle) throw new Error('请通过 HTTPS 打开此页面，才能加密学号。');
  const response = await fetch('./data/student-id-public.pem', {cache:'no-cache'});
  if (!response.ok) throw new Error('学号加密公钥暂时无法加载，请稍后重试。');
  const pem = await response.text();
  const binary = atob(pem.replace(/-----[^-]+-----|\s/g, ''));
  const key = await crypto.subtle.importKey('spki', Uint8Array.from(binary, c => c.charCodeAt(0)), {name:'RSA-OAEP',hash:'SHA-256'}, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({name:'RSA-OAEP'}, key, new TextEncoder().encode(studentId));
  return {algorithm:'RSA-OAEP-256', key_id:KEY_ID, ciphertext:btoa(String.fromCharCode(...new Uint8Array(ciphertext)))};
}
function prepared(target, url, kind) {
  const p = element('div', `${kind}已准备，尚未保存。请打开 GitHub，登录并确认创建 Issue。`, 'prepared');
  // Generated issue URLs contain the encrypted payload and exceed the artifact URL limit.
  const a = element('a', '在 GitHub 确认并保存 ↗');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  p.append(element('br'), a);
  target.replaceChildren(p);
}
$('submission-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('prepare-submit'); button.disabled = true;
  $('submission-status').replaceChildren();
  try {
    const p = $('project').value, score = Number($('score').value);
    if (!PROJECTS[p].open) throw new Error('该项目尚未开放提交。');
    const code = safeURL($('code-url').value.trim()), checkpoint = safeURL($('checkpoint-url').value.trim());
    if (!validScore(p,score) || !code || !checkpoint) throw new Error('请检查分数范围，并使用不含账号密码的 HTTPS 链接（最多 500 字符）。');
    const studentId = $('student-id').value.trim();
    if (!/^[A-Za-z0-9-]{3,32}$/.test(studentId)) throw new Error('请填写 3–32 位学号，只使用英文字母、数字或连字符。');
    const encrypted = await encryptStudentID(studentId);
    const data = {schema:'dase7506/submission-v1',protocol:PROTOCOL,project:p,score,
      code_url:code,checkpoint_url:checkpoint,student_id:encrypted};
    prepared($('submission-status'), makeIssueURL(data), '提交内容');
    $('student-id').value = '';
  } catch (error) { $('submission-status').append(element('p', error.message, 'error')); }
  finally { button.disabled = !PROJECTS[$('project').value].open; }
});
function openChallenge(row) {
  challengeTarget = row;
  $('challenge-form').reset(); $('challenge-status').replaceChildren();
  $('challenge-target').textContent = `${row.project.toUpperCase()} · ${row.author} · #${row.number} · 自报 ${row.score} ${PROJECTS[row.project].unit}`;
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
    if (!challengeTarget || !validScore(challengeTarget.project, score) || !evidence) throw new Error('请检查复现分数与 HTTPS 证据链接。');
    const threshold = PROJECTS[challengeTarget.project].review_threshold;
    if (typeof threshold === 'number' && Math.abs(score-challengeTarget.score) <= threshold) throw new Error(`差异未超过核查阈值：${threshold} ${PROJECTS[challengeTarget.project].unit}。一般问题可在原提交下讨论。`);
    const data = {schema:'dase7506/challenge-v1',protocol:PROTOCOL,project:challengeTarget.project,
      submission:challengeTarget.number,reproduced_score:score,evidence_url:evidence};
    prepared($('challenge-status'), makeIssueURL(data), '核查申请');
  } catch (error) { $('challenge-status').append(element('p', error.message, 'error')); }
});
configureForm();
refresh();
