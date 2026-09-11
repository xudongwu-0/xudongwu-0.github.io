#!/usr/bin/env python3
"""Instructor-only local export. The PEM private key must NEVER enter this repository."""
import argparse
import base64
import csv
import json
import math
import os
from pathlib import Path
import subprocess
import urllib.request

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--key', required=True, type=Path, help='Path to the instructor RSA private key')
p.add_argument('--output', required=True, type=Path, help='PRIVATE CSV path outside this public repository')
args = p.parse_args()
repo = Path(__file__).resolve().parents[2]
if args.output.resolve().is_relative_to(repo):
    p.error('Write the decrypted roster outside the public website repository.')
rows = []
for page in range(1,10000):
    url=f'https://api.github.com/repos/xudongwu-0/xudongwu-0.github.io/issues?state=all&per_page=100&page={page}'
    headers={'Accept':'application/vnd.github+json','User-Agent':'DASE7506-instructor'}
    if os.environ.get('GITHUB_TOKEN'):
        headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as r:
        issues=json.load(r)
    for issue in issues:
        if 'pull_request' in issue:
            continue
        import re
        blocks=re.findall(r'```json\s*\n([\s\S]*?)\n```',issue.get('body') or '')
        if len(blocks)!=1:
            continue
        try:
            data=json.loads(blocks[0])
            if data.get('schema')!='dase7506/submission-v1':
                continue
            if data.get('protocol')!='7506-submissions-v1' or data.get('project') not in ['mp1','mp2','mp3']:
                raise ValueError('Invalid project or protocol')
            score=data.get('score')
            if type(score) not in [int,float] or not math.isfinite(score):
                raise ValueError('Invalid numeric score')
            ciphertext=base64.b64decode(data['student_id']['ciphertext'],validate=True)
            decrypted=subprocess.run(['openssl','pkeyutl','-decrypt','-inkey',str(args.key),
                '-pkeyopt','rsa_padding_mode:oaep','-pkeyopt','rsa_oaep_md:sha256',
                '-pkeyopt','rsa_mgf1_md:sha256'],input=ciphertext,capture_output=True,check=True).stdout.decode()
            if not re.fullmatch(r'[A-Za-z0-9-]{3,32}',decrypted):
                raise ValueError('Invalid student ID format')
            rows.append([issue['number'],issue['user']['login'],decrypted,data['project'],data['score']])
        except (ValueError,KeyError,subprocess.CalledProcessError):
            print(f"Issue #{issue['number']}: malformed or undecryptable identity; check with its author.")
    if len(issues)<100:
        break
args.output.parent.mkdir(parents=True,exist_ok=True)
fd=os.open(args.output,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as f:
    writer=csv.writer(f)
    writer.writerow(['issue','github','student_id','project','score'])
    # Prevent spreadsheet formula interpretation of any untrusted text field.
    def cell(value):
        return "'"+value if isinstance(value,str) and value.startswith(('=','+','-','@','\t','\r')) else value
    writer.writerows([[cell(value) for value in row] for row in rows])
print(f'Exported {len(rows)} identities to the requested private CSV; no IDs printed.')
