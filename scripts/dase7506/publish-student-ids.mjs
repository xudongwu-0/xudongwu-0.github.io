// Instructor migration after the decision to display student IDs publicly.
// The private key stays outside the public repository; it is never printed.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {privateDecrypt,constants} from 'node:crypto';
import {validStudentID} from '../../courses/dase7506/arena.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const {values}=parseArgs({options:{key:{type:'string'}}});
if(!values.key) throw new Error('Provide --key with the instructor PEM outside this public repository.');
const keyPath=fs.realpathSync(values.key);
if(keyPath.startsWith(root)) throw new Error('Keep the private key outside the public repository.');
const key=fs.readFileSync(keyPath),file=path.join(root,'courses/dase7506/data/student-identities.json');
const registry=JSON.parse(fs.readFileSync(file,'utf8'));
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'courses/dase7506/data/leaderboard.json'),'utf8'));
let migrated=0;const failed=[];
for(const row of snapshot.submissions) {
  try {
    const identity=JSON.parse(row.signature)[4];
    if(validStudentID(identity)) continue;
    const id=privateDecrypt({key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(identity.ciphertext,'base64')).toString('utf8');
    if(!validStudentID(id)) throw new Error('Invalid legacy identity.');
    registry.identities[row.number]={student_id:id,source_ciphertext:identity.ciphertext};migrated++;
  } catch { failed.push(row.number); }
}
if(failed.length) throw new Error(`No migration written; inspect legacy identities on score issues ${failed.join(', ')}.`);
fs.writeFileSync(file,JSON.stringify(registry,null,2)+'\n');
console.log(`Migrated ${migrated} legacy student IDs for public display. No key or IDs printed.`);
