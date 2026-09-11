import fs from 'node:fs';
import {REPO, buildSnapshot} from '../../courses/dase7506/arena.mjs';

const root = new URL('../../', import.meta.url);
const out = new URL('courses/dase7506/data/leaderboard.json', root);
const headers = {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
async function api(path, options = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...options, headers:{...headers,...options.headers}, signal:AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`GitHub API ${r.status} on ${path.split('?')[0]}`);
  return r.json();
}
if (process.argv.includes('--ensure-labels')) {
  const existing = await api('labels?per_page=100');
  for (const [name, color, description] of [
    ['7506:verified','287468','Instructor reproduced this exact submission.'],
    ['7506:review','d9a441','Instructor review pending; excluded from main leaderboard.'],
    ['7506:invalid','b34040','Instructor invalidated this submission after review.'],
    ['7506:upheld','287468','Instructor upheld this reproduction report after hearing both parties.'],
    ['7506:rejected','8a9296','Instructor rejected this reproduction report.'],
  ]) if (!existing.some(l => l.name === name)) await api('labels', {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,color,description})});
}
const issues = [];
for (let page=1;;page++) {
  const batch = await api(`issues?state=all&sort=created&direction=asc&per_page=100&page=${page}`);
  issues.push(...batch);
  if (batch.length < 100) break;
}
const previous = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out,'utf8')) : {};
const snapshot = buildSnapshot(issues, previous);
const stable = d => JSON.stringify({...d, generated_at:null});
if (stable(snapshot) !== stable(previous) || !previous.generated_at) {
  fs.writeFileSync(out, JSON.stringify(snapshot,null,2)+'\n');
  console.log(`Snapshot updated: ${snapshot.submissions.length} submissions, ${snapshot.challenges.length} reproduction reports.`);
} else console.log('No submission or review changes.');
