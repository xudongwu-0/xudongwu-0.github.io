import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Fail closed if an archive was accidentally modified: never regenerate MP1.
export function loadArchive(directory = new URL('../../courses/dase7506/archive/mp1-2026-fall/', import.meta.url)) {
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json',directory),'utf8'));
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = fs.readFileSync(new URL(name,directory));
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`MP1 archive checksum mismatch: ${name}`);
  }
  return JSON.parse(fs.readFileSync(new URL('leaderboard.json',directory),'utf8'));
}

export function preserveArchivedProject(snapshot, archive, project = 'mp1') {
  const result = structuredClone(snapshot);
  for (const field of ['submissions','challenges','adjustments','review_requests']) {
    result[field] = [...(snapshot[field] || []).filter(row => row.project !== project),
      ...structuredClone((archive[field] || []).filter(row => row.project === project))].sort((a,b)=>a.number-b.number);
  }
  result.publication ??= {schema:'dase7506/publication-v1',projects:{}};
  result.publication.projects ??= {};
  if (archive.publication?.projects?.[project]) result.publication.projects[project] = structuredClone(archive.publication.projects[project]);
  else delete result.publication.projects[project];
  result.phases ??= {};
  result.phases[project] = archive.phases[project];
  return result;
}
