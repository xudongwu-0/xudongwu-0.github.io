// A local instructor view, intentionally not linked or published on the course page.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {safeURL,validStudentID} from '../../courses/dase7506/arena.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(label,url)=>safeURL(url)?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(label);
export function renderTeacherReview(snapshot) {
  const requests=snapshot.review_requests||[],rows=snapshot.submissions||[];
  const flagged=rows.filter(r=>r.review_flag).length;
  const table=rows.map(row=>`<tr class="${row.review_flag?'flagged':''}"><td>${link('#'+row.number,row.url)}</td><td>${escape(validStudentID(row.student_id)?row.student_id:'ID pending')}</td><td>${escape(row.author)}</td><td>${escape(row.project.toUpperCase())}</td><td>${Number(row.score).toFixed(5)}</td><td>${row.review_request_total||0}</td><td>${row.review_request_count||0}</td><td>${row.review_flag?'<strong>FLAG — check requested</strong>':'—'}</td><td>${escape(row.status)}</td></tr>`).join('');
  const details=rows.map(row=>{
    const entries=requests.filter(r=>r.submission===row.number);
    return `<details><summary>Submission #${row.number} · ${escape(row.student_id||'ID pending')} · ${entries.length} request(s)</summary>${entries.length?entries.map(r=>`<article><p>${link('#'+r.number,r.url)} · GitHub: ${escape(r.author)} · ${escape(r.status)} · ${escape(r.created_at)}</p><p class="reason">${escape(r.reason)}</p>${r.reproduced_score!=null?`<p>Reproduced score: ${escape(r.reproduced_score)}</p>`:''}${r.evidence_url?`<p>${link('Evidence',r.evidence_url)}</p>`:''}</article>`).join(''):'<p>No requests.</p>'}</details>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DASE7506 · Instructor review overview</title><style>body{font:14px/1.6 system-ui,sans-serif;color:#20353d;max-width:1400px;margin:32px auto;padding:0 20px}h1{font-size:25px}a{color:#28677c}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f0f4f2}.flagged{background:#fff0dd}.flagged strong{color:#9b421b}details{margin-top:18px;border:1px solid #ddd;padding:12px}summary{cursor:pointer;font-weight:600}article{border-top:1px solid #ddd;padding:8px 0}.reason{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#65777f}</style><h1>Instructor review overview</h1><p>${rows.length} submissions · ${requests.length} total requests · <strong>${flagged} flagged</strong></p><p class="muted">Snapshot: ${escape(snapshot.generated_at)}. Total requests include repeat, closed, rejected and self requests. Active reporters count distinct GitHub accounts with pending or upheld requests; self, closed, rejected and late requests do not count. More than 3 active reporters triggers a flag. A flag never changes the score or applies a penalty.</p><p class="muted">This overview is generated locally. Counts and flags are omitted from the student page; the underlying GitHub issues and snapshot remain publicly inspectable.</p><div class="scroll"><table><thead><tr><th>Submission</th><th>Student ID</th><th>GitHub account</th><th>Project</th><th>BPB</th><th>Total requests</th><th>Active reporters</th><th>Flag</th><th>Score status</th></tr></thead><tbody>${table}</tbody></table></div><h2>Request records</h2>${details}</html>`;
}
async function main() {
  const {values}=parseArgs({options:{output:{type:'string'},refresh:{type:'boolean'}}});
  if(!values.output) throw new Error('Use --output /private/path/review-overview.html.');
  const output=path.resolve(values.output);
  if(output.startsWith(root)) throw new Error('Keep the instructor overview outside the public website repository.');
  if(values.refresh) await import('./sync.mjs');
  const snapshot=JSON.parse(fs.readFileSync(path.join(root,'courses/dase7506/data/leaderboard.json'),'utf8'));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,renderTeacherReview(snapshot),{mode:0o600});fs.chmodSync(output,0o600);
  console.log(`Instructor overview saved: ${snapshot.submissions.length} submissions, ${(snapshot.review_requests||[]).length} requests, ${snapshot.submissions.filter(r=>r.review_flag).length} flagged.`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
