// Instructor-only decryption and batch publication. Never commit the private key.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {REPO,KEY_ID,PROJECTS,safeURL,parseIssue,bestRows,buildSnapshot} from '../../courses/dase7506/arena.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function decryptLinks(sealed,key) {
  if(sealed?.key_id!==KEY_ID || sealed.algorithm!=='RSA-OAEP-256+AES-256-GCM') throw new Error('Invalid sealed artifact envelope.');
  const aes=privateDecrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(sealed.wrapped_key,'base64'));
  const encrypted=Buffer.from(sealed.ciphertext,'base64');
  const decipher=createDecipheriv('aes-256-gcm',aes,Buffer.from(sealed.iv,'base64'));
  decipher.setAuthTag(encrypted.subarray(-16));
  const data=JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8'));
  if(data.schema!=='dase7506/artifact-links-v1') throw new Error('Invalid artifact payload.');
  return data;
}
export function prepareRelease(snapshot,issues,key,project='mp1',now=new Date().toISOString()) {
  const config=PROJECTS[project];
  if(!config?.open || !config.score_deadline) throw new Error('Unknown or closed project.');
  if(+new Date(now)<Date.parse(config.score_deadline)) throw new Error('Score deadline has not passed.');
  if(snapshot.publication?.projects?.[project]) throw new Error('Links have already been released.');
  const byNumber=new Map(issues.map(parseIssue).filter(Boolean).map(p=>[p.number,p]));
  const rows=bestRows(snapshot.submissions,project), entries=[], missing=[];
  if(!rows.length) throw new Error('No eligible score submissions to publish.');
  for(const row of rows) {
    const source=byNumber.get(row.artifact_issue||row.number);
    try {
      if(!source || source.author.toLowerCase()!==row.author.toLowerCase() || source.data.project!==project) throw new Error('Missing matching author.');
      let links;
      if(source.data.artifacts) links=decryptLinks(source.data.artifacts,key);
      else links={project,code_url:source.data.code_url,checkpoint_url:source.data.checkpoint_url};
      if(links.project!==project || (links.submission!=null && links.submission!==row.number)) throw new Error('Artifact reference mismatch.');
      if(!safeURL(links.code_url)||!safeURL(links.checkpoint_url)) throw new Error('Both valid HTTPS links are required.');
      entries.push({submission:row.number,author:row.author,score:row.score,code_url:links.code_url,checkpoint_url:links.checkpoint_url,artifact_issue:source.number});
    } catch { missing.push(row.number); }
  }
  if(missing.length) throw new Error(`Complete, decryptable links are still required for score issues: ${missing.join(', ')}`);
  return {published_at:new Date(now).toISOString(),review_ends_at:new Date(+new Date(now)+(config.review_days||7)*86400000).toISOString(),entries};
}
async function main() {
  const {values}=parseArgs({options:{key:{type:'string'},output:{type:'string'},publish:{type:'boolean'},project:{type:'string',default:'mp1'}}});
  if(!values.key) throw new Error('Provide --key with the instructor private PEM file outside the public repository.');
  const keyPath=fs.realpathSync(values.key);
  if(keyPath.startsWith(root)) throw new Error('The private key must be outside the public repository.');
  const snapshot=JSON.parse(fs.readFileSync(path.join(root,'courses/dase7506/data/leaderboard.json'),'utf8'));
  const file=path.join(root,'courses/dase7506/data/publication.json');
  const publication=JSON.parse(fs.readFileSync(file,'utf8'));
  if(publication.projects[values.project]) throw new Error('This project has already been published.');
  const issues=[],headers={Accept:'application/vnd.github+json'};
  if(process.env.GITHUB_TOKEN) headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
  for(let page=1;;page++) {
    const r=await fetch(`https://api.github.com/repos/${REPO}/issues?state=all&per_page=100&page=${page}`,{headers,signal:AbortSignal.timeout(30000)});
    if(!r.ok) throw new Error(`Issue retrieval failed: HTTP ${r.status}`);
    const batch=await r.json();issues.push(...batch);if(batch.length<100)break;
  }
  const now=new Date().toISOString();
  const current=buildSnapshot(issues,snapshot,now,publication);
  const release=prepareRelease(current,issues,fs.readFileSync(keyPath),values.project,now);
  if(values.publish) {
    publication.projects[values.project]=release;
    fs.writeFileSync(file,JSON.stringify(publication,null,2)+'\n');
    console.log(`Prepared public release of ${release.entries.length} entries. Commit and push publication.json to start the announced seven-day review.`);
  } else {
    if(!values.output) throw new Error('Use --output /private/path/preview.json, or --publish to prepare the public release.');
    const out=path.resolve(values.output);if(out.startsWith(root))throw new Error('Private previews must be outside the public repository.');
    fs.writeFileSync(out,JSON.stringify(release,null,2)+'\n',{mode:0o600});fs.chmodSync(out,0o600);
    console.log(`Prepared private preview for ${release.entries.length} entries; no links printed or published.`);
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(error=>{console.error(error.message);process.exitCode=1;});
