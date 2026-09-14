import {REPO,PROTOCOL,PROJECTS,safeURL,validStudentID} from './arena.808a6c32860d.mjs';
const $=id=>document.getElementById(id);
let snapshot={submissions:[],review_requests:[]};
function el(tag,text,className){const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node;}
function link(text,url){const node=el('a',text);if(safeURL(url))node.href=url;node.target='_blank';node.rel='noopener noreferrer';return node;}
function render(){
 const rows=snapshot.submissions,requests=snapshot.review_requests||[];
 $('review-summary').textContent=`${rows.length} submissions · ${requests.length} total requests · ${rows.filter(r=>r.review_flag).length} flagged`;
 $('instructor-board').replaceChildren();
 const visible=rows.filter(r=>!$('only-flagged').checked||r.review_flag).sort((a,b)=>Number(b.review_flag)-Number(a.review_flag)||a.number-b.number);
 for(const row of visible){
  const tr=el('tr',null,row.review_flag?'instructor-flagged':'');
  const number=el('td');number.append(link('#'+row.number,row.url));tr.append(number);
  for(const value of [validStudentID(row.student_id)?row.student_id:'ID pending',row.author,row.project.toUpperCase(),`${Number(row.score).toFixed(5)} ${PROJECTS[row.project].unit}`,row.review_request_total||0,row.review_request_count||0,row.review_flag?'FLAG — check requested':'—',row.status])tr.append(el('td',value));
  $('instructor-board').append(tr);
 }
 if(!visible.length){const tr=el('tr'),td=el('td','No matching submissions.','empty');td.colSpan=9;tr.append(td);$('instructor-board').append(tr);}
 const selected=$('record-submission').value;
 $('record-submission').replaceChildren(new Option('All submissions',''));
 for(const row of rows)$('record-submission').append(new Option(`#${row.number} · ${row.student_id||'ID pending'}`,String(row.number)));
 $('record-submission').value=selected;
 renderRecords();
}
function renderRecords(){
 const selected=$('record-submission').value,requests=(snapshot.review_requests||[]).filter(r=>!selected||r.submission===Number(selected));
 $('request-records').replaceChildren();
 if(!requests.length)$('request-records').append(el('p','No requests.','caption'));
 for(const request of requests){
  const details=el('details'),summary=el('summary',`#${request.number} → submission #${request.submission} · ${request.author} · ${request.status}`);details.append(summary);
  details.append(el('p',request.reason,'request-reason'));
  details.append(el('p',`Created: ${request.created_at}`,'caption'));
  if(request.reproduced_score!=null)details.append(el('p',`Reproduced score: ${request.reproduced_score}`));
  const links=el('p');links.append(link('GitHub record',request.url));
  if(request.evidence_url){links.append(document.createTextNode(' · '),link('Evidence',request.evidence_url));}
  details.append(links);$('request-records').append(details);
 }
}
async function refresh(){
 $('refresh').disabled=true;$('instructor-sync').textContent='Refreshing…';
 const sources=[
  [`https://raw.githubusercontent.com/${REPO}/main/courses/dase7506/data/leaderboard.json?v=${Date.now()}`,{}],
  [`https://api.github.com/repos/${REPO}/contents/courses/dase7506/data/leaderboard.json?ref=main`,{Accept:'application/vnd.github.raw+json'}],
  ['./data/leaderboard.json',{}]
 ];
 try {
  let loaded=false;
  for(const [index,[url,headers]] of sources.entries()){
   try {
    const response=await fetch(url,{headers,cache:'no-cache',signal:AbortSignal.timeout(6000)});if(!response.ok)throw new Error();
    const data=await response.json();if(data.schema!=='dase7506/board-v1'||data.protocol!==PROTOCOL||!Array.isArray(data.submissions))throw new Error();
    snapshot=data;render();$('instructor-sync').textContent=`${index===2?'Cached · ':''}Updated: ${new Date(data.generated_at).toLocaleString('en-GB')}. Allow a few minutes for new requests.`;loaded=true;break;
   } catch { /* Try the next snapshot source. */ }
  }
  if(!loaded)throw new Error('Unable to load review records.');
 } catch(error){$('instructor-sync').textContent=error.message;}
 finally{$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);$('only-flagged').addEventListener('change',render);$('record-submission').addEventListener('change',renderRecords);refresh();
