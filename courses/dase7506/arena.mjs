// Shared validation for the browser and the trusted snapshot builder. No dependencies.
export const REPO = 'xudongwu-0/xudongwu-0.github.io';
import {PROTOCOL, PROJECTS} from './projects.mjs';
export {PROTOCOL, PROJECTS};
export const KEY_ID = '7506-2026-v1';
export function safeURL(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\s<>`]/.test(value)) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && u.hostname.includes('.') ? u.href : null;
  } catch { return null; }
}
export function validScore(project, score) {
  return Object.hasOwn(PROJECTS, project) && typeof score === 'number' && Number.isFinite(score)
    && (PROJECTS[project].min === null || score >= PROJECTS[project].min)
    && (PROJECTS[project].max === null || score <= PROJECTS[project].max);
}
export function validateSubmission(d) {
  return d && d.schema === 'dase7506/submission-v1' && d.protocol === PROTOCOL
    && validScore(d.project, d.score) && PROJECTS[d.project].open && !!safeURL(d.code_url) && !!safeURL(d.checkpoint_url)
    && d.student_id?.key_id === KEY_ID && d.student_id?.algorithm === 'RSA-OAEP-256'
    && typeof d.student_id?.ciphertext === 'string' && /^[A-Za-z0-9+/]{512}$/.test(d.student_id.ciphertext);
}
export function validateChallenge(d) {
  return d && d.schema === 'dase7506/challenge-v1' && d.protocol === PROTOCOL
    && Number.isSafeInteger(d.submission) && d.submission > 0
    && validScore(d.project, d.reproduced_score) && PROJECTS[d.project].open && !!safeURL(d.evidence_url);
}
export function parseIssue(issue) {
  if (issue.pull_request || issue.user?.type !== 'User' || !Number.isSafeInteger(issue.number)) return null;
  const body = issue.body || '';
  if (body.length > 12000) return null;
  const blocks = [...body.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) return null;
  try {
    const d = JSON.parse(blocks[0][1]);
    if (!validateSubmission(d) && !validateChallenge(d)) return null;
    return {data: d, number: issue.number, author: issue.user.login,
      url: `https://github.com/${REPO}/issues/${issue.number}`,
      created_at: issue.created_at, updated_at: issue.updated_at,
      labels: (issue.labels || []).map(l => typeof l === 'string' ? l : l.name),
      closed: issue.state === 'closed'};
  } catch { return null; }
}
export function makeIssueURL(data) {
  const submission = validateSubmission(data);
  if (!submission && !validateChallenge(data)) throw new Error('Invalid submission data.');
  const title = submission
    ? `[DASE7506] ${data.project.toUpperCase()} · ${data.score} ${PROJECTS[data.project].unit}`
    : `[DASE7506 reproduction] #${data.submission}`;
  const intro = submission
    ? 'Self-reported result. The student ID is encrypted for the instructor. Code, checkpoint, score and GitHub identity are public.\n\nPlease keep the JSON unchanged. Submit an improved result as a new issue.'
    : 'Reproduction request, pending instructor review. This is not a finding of misconduct. Evidence must use the same checkpoint and evaluator.';
  const body = `${intro}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
  const url = new URL(`https://github.com/${REPO}/issues/new`);
  url.searchParams.set('title', title);
  url.searchParams.set('body', body);
  return url.href;
}
export function buildSnapshot(issues, previous = {}, now = new Date().toISOString()) {
  const parsed = issues.map(parseIssue).filter(Boolean);
  const old = new Map((previous.submissions || []).map(s => [s.number, s]));
  const submissions = parsed.filter(p => validateSubmission(p.data)).map(p => {
    const d = p.data;
    // Bind reviewed status to the exact submitted payload. Edits need another review.
    const signature = JSON.stringify([d.project, d.score, d.code_url, d.checkpoint_url, d.student_id]);
    const prior = old.get(p.number);
    // An author cannot erase an adjudicated submission by editing its body.
    if (prior?.status === 'invalid' && p.labels.includes('7506:invalid')) return prior;
    const changed = !!prior && prior.signature !== signature;
    const reviewChanged = prior && JSON.stringify(prior.review_labels) !== JSON.stringify(p.labels.filter(l => l.startsWith('7506:')).sort());
    const editedAfterReview = changed || (!!prior?.edited_after_review && !reviewChanged);
    const status = p.labels.includes('7506:invalid') ? 'invalid'
      : p.labels.includes('7506:review') || editedAfterReview ? 'review'
      : p.closed ? 'withdrawn' : p.labels.includes('7506:verified') ? 'verified' : 'self-reported';
    return {number: p.number, author: p.author, url: p.url, project: d.project,
      score: d.score, code_url: d.code_url, checkpoint_url: d.checkpoint_url,
      status, created_at: p.created_at, signature, edited_after_review: editedAfterReview,
      review_labels: p.labels.filter(l => l.startsWith('7506:')).sort()};
  });
  for (const prior of old.values()) {
    if (prior.status === 'invalid' && !submissions.some(s => s.number === prior.number)
      && issues.some(i => i.number === prior.number && (i.labels || []).some(l => (l.name || l) === '7506:invalid'))) submissions.push(prior);
  }
  const byNumber = new Map(submissions.map(s => [s.number, s]));
  const priorChallenges = new Map((previous.challenges || []).map(c => [c.number, c]));
  const challenges = parsed.filter(p => validateChallenge(p.data)).map(p => {
    const prior = priorChallenges.get(p.number);
    if (prior?.status === 'upheld' && p.labels.includes('7506:upheld') && byNumber.get(prior.submission)?.status === 'invalid') return prior;
    const d = p.data, target = byNumber.get(d.submission);
    if (!target || target.project !== d.project || target.author === p.author) return null;
    const difference = Math.abs(target.score - d.reproduced_score);
    const threshold = PROJECTS[d.project].review_threshold;
    // Labels can only be applied by repository maintainers. Both decisions are needed.
    const upheld = p.labels.includes('7506:upheld') && target.status === 'invalid'
      && typeof threshold === 'number' && difference > threshold;
    return {number: p.number, author: p.author, url: p.url, submission: d.submission,
      project: d.project, reproduced_score: d.reproduced_score, evidence_url: d.evidence_url,
      created_at: p.created_at, status: upheld ? 'upheld' : p.labels.includes('7506:rejected') ? 'rejected' : 'pending'};
  }).filter(Boolean);
  for (const prior of priorChallenges.values()) {
    if (prior.status === 'upheld' && !challenges.some(c => c.number === prior.number)
      && byNumber.get(prior.submission)?.status === 'invalid'
      && issues.some(i => i.number === prior.number && (i.labels || []).some(l => (l.name || l) === '7506:upheld'))) challenges.push(prior);
  }
  challenges.sort((a,b) => a.number - b.number);
  const adjustments = new Map(), awarded = new Set();
  for (const c of challenges.filter(c => c.status === 'upheld')) {
    if (awarded.has(c.submission)) continue;
    awarded.add(c.submission);
    const target = byNumber.get(c.submission);
    for (const [author, kind] of [[target.author, 'penalty'], [c.author, 'reward']]) {
      const key = `${c.project}/${author}`;
      const a = adjustments.get(key) || {project: c.project, author, reward: 0, penalty: 0};
      a[kind] = PROJECTS[c.project][kind];
      adjustments.set(key, a);
    }
  }
  return {schema: 'dase7506/board-v1', protocol: PROTOCOL, generated_at: now,
    submissions: submissions.sort((a,b) => a.number - b.number), challenges,
    adjustments: [...adjustments.values()]};
}
export function bestRows(submissions, project, history = false) {
  let rows = submissions.filter(s => s.project === project);
  if (!history) {
    rows = rows.filter(s => ['self-reported','verified'].includes(s.status));
    const best = new Map();
    for (const s of rows) {
      const key = s.author.toLowerCase(), old = best.get(key);
      if (!old || (PROJECTS[project].lower ? s.score < old.score : s.score > old.score)) best.set(key, s);
    }
    rows = [...best.values()];
  }
  return rows.sort((a,b) => (PROJECTS[project].lower ? a.score - b.score : b.score - a.score) || a.number - b.number);
}
