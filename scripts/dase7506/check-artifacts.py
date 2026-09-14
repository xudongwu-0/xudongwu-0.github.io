#!/usr/bin/env python3
"""Automated file-checking agent. Inspects code/checkpoints; never executes student code.
Numerical BPB reproduction is a separate instructor spot check.
"""
import argparse, ast, hashlib, io, ipaddress, json, pickletools, re, secrets, socket, struct, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

LIMIT=64*1024*1024
PROTOCOL='7506-mp1-wt2-v2'

def public_url(url):
    from urllib.parse import urlsplit
    p=urlsplit(url)
    if p.scheme!='https' or not p.hostname or p.username or p.password:
        raise ValueError('An HTTPS URL without embedded credentials is required.')
    addresses=socket.getaddrinfo(p.hostname,p.port or 443,type=socket.SOCK_STREAM)
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise ValueError('Only public network destinations are allowed.')
    return url

class PublicRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        public_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def download(url):
    public_url(url)
    opener=urllib.request.build_opener(PublicRedirect())
    with opener.open(urllib.request.Request(url,headers={'User-Agent':'DASE7506-artifact-agent/1'}),timeout=20) as response:
        body=response.read(LIMIT+1)
    if len(body)>LIMIT:raise ValueError('Automated download limit exceeded; instructor review required.')
    return body

def inspect_code(files):
    functions=set(); syntax=[]; count=0; digest=hashlib.sha256(); size=0
    for name,body in sorted(files):
        if not name.endswith('.py') or len(body)>2*1024*1024:continue
        count+=1
        digest.update(name.encode('utf-8')+b'\0'+hashlib.sha256(body).digest());size+=len(body)
        try:
            tree=ast.parse(body.decode('utf-8-sig'))
            functions.update(n.name for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)))
        except (UnicodeError,SyntaxError,ValueError,RecursionError):syntax.append(name)
    return {'python_files':count,'python_bytes':size,'python_tree_sha256':digest.hexdigest(),'syntax_errors':syntax[:20],
            'model_factory_found':'build_model' in functions,
            'prediction_interface_found':'predict_log_probs' in functions,
            'student_code_executed':False}

def inspect_checkpoint(body, depth=0):
    if depth>2:raise ValueError("Nested checkpoint archives require manual inspection.")
    result={'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest(),'format':'unknown','protocol_found':False}
    if zipfile.is_zipfile(io.BytesIO(body)):
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            size=sum(x.file_size for x in z.infolist())
            if size>LIMIT:raise ValueError('Uncompressed checkpoint/bundle exceeds automated inspection limit.')
            result['uncompressed_bytes']=size
            metadata=[n for n in z.namelist() if n.endswith('/data.pkl') or n=='data.pkl']
            if metadata:
                name=metadata[0]
                if z.getinfo(name).file_size>1024*1024:raise ValueError('Checkpoint metadata is too large for automated inspection.')
                strings={arg for op,arg,pos in pickletools.genops(z.read(name)) if isinstance(arg,str)}
                result.update(format='pytorch-zip',protocol_found=PROTOCOL in strings,
                              model_state_found='model' in strings,config_found='config' in strings)
            else:
                members=[n for n in z.namelist() if n.endswith(('.pt','.pth','.safetensors'))]
                result.update(format='bundle-zip',checkpoint_members=len(members))
                result['members']=[{'name':n,**inspect_checkpoint(z.read(n),depth+1)} for n in members[:16]]
    elif len(body)>=8:
        size=struct.unpack('<Q',body[:8])[0]
        if 0<size<min(len(body)-7,1024*1024):
            try:
                header=json.loads(body[8:8+size]);result.update(format='safetensors',tensor_count=len([k for k in header if k!='__metadata__']))
            except (ValueError,UnicodeError):pass
    result['checkpoint_executed']=False
    return result

def inspect_entry(entry,local_code=None,local_checkpoint=None):
    report={'submission':entry.get('submission'),'author':entry.get('author'),'score_reproduced':False,'checks':{},'errors':[]}
    try:
        if local_code:
            files=[(str(p.relative_to(local_code)),p.read_bytes()) for p in Path(local_code).rglob('*.py') if p.is_file()]
        else:
            match=re.fullmatch(r'https://github\.com/([^/]+)/([^/]+)/(?:tree|commit)/([0-9a-fA-F]{40})/?',entry['code_url'])
            if not match:raise ValueError('Code URL needs an immutable full GitHub commit for automated inspection.')
            owner,repo,commit=match.groups(); archive=download(f'https://codeload.github.com/{owner}/{repo}/zip/{commit}')
            with zipfile.ZipFile(io.BytesIO(archive)) as z:
                if sum(i.file_size for i in z.infolist())>LIMIT:raise ValueError('Code archive needs manual inspection because of its size.')
                files=[(n,z.read(n)) for n in z.namelist() if n.endswith('.py') and z.getinfo(n).file_size<=2*1024*1024]
        report['checks']['code']=inspect_code(files)
    except Exception as error:report['errors'].append('Code: '+str(error))
    try:
        body=Path(local_checkpoint).read_bytes() if local_checkpoint else download(entry['checkpoint_url'])
        if len(body)>LIMIT:raise ValueError('Checkpoint exceeds automated inspection limit.')
        report['checks']['checkpoint']=inspect_checkpoint(body)
    except Exception as error:report['errors'].append('Checkpoint: '+str(error))
    code=report['checks'].get('code',{});ckpt=report['checks'].get('checkpoint',{})
    def valid_checkpoint(info):
        if info.get('format')=='pytorch-zip':return info.get('protocol_found') and info.get('model_state_found') and info.get('config_found')
        if info.get('format')=='safetensors':return info.get('tensor_count',0)>0
        if info.get('format')=='bundle-zip':return 0<info.get('checkpoint_members',0)==len(info.get('members',[])) and all(valid_checkpoint(m) for m in info.get('members',[]))
        return False
    passed=(not report['errors'] and code.get('python_files',0)>0 and not code.get('syntax_errors')
            and code.get('model_factory_found') and code.get('prediction_interface_found') and valid_checkpoint(ckpt))
    report['status']='files-checked' if passed else 'needs-instructor-review'
    return report

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--publication',type=Path)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--sample-count',type=int,default=1)
    p.add_argument('--local-code',type=Path)
    p.add_argument('--local-checkpoint',type=Path)
    args=p.parse_args();now=datetime.now(timezone.utc)
    if args.local_code and args.local_checkpoint:
        reports=[inspect_entry({'submission':0,'author':'local-self-test'},args.local_code,args.local_checkpoint)]
    elif args.publication:
        publication=json.loads(args.publication.read_text());reports=[]
        for project,release in publication.get('projects',{}).items():
            if datetime.fromisoformat(release['published_at'].replace('Z','+00:00'))>now:continue
            for entry in release.get('entries',[]):reports.append({'project':project,**inspect_entry(entry)})
    else:p.error('Use --publication, or both --local-code and --local-checkpoint.')
    population=[r['submission'] for r in reports]
    selected=secrets.SystemRandom().sample(population,min(max(0,args.sample_count),len(population)))
    result={'schema':'dase7506/artifact-checks-v1','agent':'DASE7506 artifact-checking agent','checked_at':now.isoformat(),
            'scope':'Code syntax/interface and checkpoint file/format checks. Numerical scores require separate reproduction.',
            'reports':reports,'spot_check_queue':selected}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({'checked':len(reports),'files_checked':sum(r['status']=='files-checked' for r in reports),'spot_checks_selected':len(selected),'student_code_executed':False}))
if __name__=='__main__':main()
