// A local instructor view, intentionally not linked or published on the course page.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {safeURL,validStudentID,instructorRows} from '../../courses/dase7506/arena.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link=(label,url)=>safeURL(url)?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>`:escape(label);
export function renderTeacherReview(snapshot) {
  const requests=snapshot.review_requests||[],rows=instructorRows(snapshot);
  const flagged=rows.filter(r=>r.review_flag).length;
  const table=rows.map(row=>`<tr class="${row.review_flag?'flagged':''}"><td>${link('#'+row.number,row.url)}</td><td>${escape(validStudentID(row.student_id)?row.student_id:'ID pending')}</td><td>${escape(row.author)}</td><td>${escape(row.project.toUpperCase())}</td><td>${Number(row.score).toFixed(5)}</td><td>${row.review_request_total}</td><td>${row.review_request_count}</td><td class="flag">${row.review_flag?`<strong>FLAG — ${escape(row.review_flag_reasons.join('; '))}</strong>`:'—'}${row.review_accounts.length>1?`<br>Accounts: ${escape(row.review_accounts.join(', '))}`:''}</td><td>${escape(row.status)}</td></tr>`).join('');
  const details=rows.map(row=>{
    const entries=row.review_requests;
    const history=row.submission_history.map(s=>`${link('#'+s.number,s.url)} (${Number(s.score).toFixed(5)}, ${escape(s.status)})`).join(' · ');
    return `<details><summary>${escape(row.student_id||'ID pending')} · ${escape(row.author)} · latest #${row.number} · ${entries.length} report(s)</summary><p>Submission history: ${history}</p>${entries.length?entries.map(r=>`<article><p>${link('#'+r.number,r.url)} → submission #${r.submission} · GitHub: ${escape(r.author)} · ${escape(r.status)} · ${escape(r.created_at)}</p><p class="reason">${escape(r.reason)}</p>${r.reproduced_score!=null?`<p>Reproduced score: ${escape(r.reproduced_score)}</p>`:''}${r.evidence_url?`<p>${link('Evidence',r.evidence_url)}</p>`:''}</article>`).join(''):'<p>No reports.</p>'}</details>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DASE7506 · Instructor review overview</title><style>body{font:14px/1.6 system-ui,sans-serif;color:#20353d;max-width:1400px;margin:32px auto;padding:0 20px}h1{font-size:25px}a{color:#28677c}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #ddd}th{background:#f0f4f2}.flagged{background:#fff0dd}.flagged strong{color:#9b421b}.flag{min-width:180px;max-width:300px;white-space:normal;overflow-wrap:anywhere}details{margin-top:18px;border:1px solid #ddd;padding:12px}summary{cursor:pointer;font-weight:600}article{border-top:1px solid #ddd;padding:8px 0}.reason{white-space:pre-wrap;overflow-wrap:anywhere}.muted{color:#65777f}</style><h1>Instructor review overview</h1><p>${rows.length} ${rows.length===1?'entry':'entries'} · ${requests.length} total reports · <strong>${flagged} flagged</strong></p><p class="muted">Snapshot: ${escape(snapshot.generated_at)}. One entry per project, Student ID and GitHub account, showing the latest submission. Reports accumulate across the entry's history. Total reports include duplicates and inactive reports. Active reporters are deduplicated across that history; self, closed, rejected, late and scoreless reports do not count. More than 3 active reporters triggers a flag. The same Student ID used by multiple GitHub accounts across any project flags all related entries. A flag never changes the score or applies a penalty.</p><p class="muted">This overview is generated locally. Counts and flags are omitted from the student page; the underlying GitHub issues and snapshot remain publicly inspectable.</p><div class="scroll"><table><thead><tr><th>Latest submission</th><th>Student ID</th><th>GitHub account</th><th>Project</th><th>BPB</th><th>Total reports</th><th>Active reporters</th><th>Flag</th><th>Score status</th></tr></thead><tbody>${table}</tbody></table></div><h2>Report records</h2>${details}</html>`;
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
  const rows=instructorRows(snapshot);
  console.log(`Instructor overview saved: ${rows.length} entries, ${(snapshot.review_requests||[]).length} reports, ${rows.filter(r=>r.review_flag).length} flagged.`);
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
