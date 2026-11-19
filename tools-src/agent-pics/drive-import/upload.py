# Step 3 of the Drive photo import (README.md): upload what plan.json lists and the store lacks.
# Dry run by default; --go uploads; --only=slug,slug limits it. Resumes from drive/done.jsonl.
import json, os, sys, time, urllib.request, urllib.error, threading
from concurrent.futures import ThreadPoolExecutor
API='https://casa-blanca-creative-studio.netlify.app/.netlify/functions/agent-pics'
TOK=os.environ['CB_PICS_TOKEN']; BY='drive import'; PART=3*1024*1024; MAX_RAWS=50
DRY='--go' not in sys.argv
plan=json.load(open('drive/plan.json'))
DONE='drive/done.jsonl'; done=set()
if os.path.exists(DONE):
    for l in open(DONE): done.add(json.loads(l)['id'])
lock=threading.Lock()
def log(rec):
    with lock:
        open(DONE,'a').write(json.dumps(rec)+'\n')
def req(method,url,body=None,ctype='application/json',tries=5):
    for i in range(tries):
        try:
            r=urllib.request.Request(url,data=body,method=method,headers={'Authorization':'Bearer '+TOK,'Content-Type':ctype})
            with urllib.request.urlopen(r,timeout=120) as resp: return json.loads(resp.read() or b'{}')
        except urllib.error.HTTPError as e:
            msg=e.read().decode()[:300]
            if e.code<500 and e.code!=429: raise RuntimeError(f'{e.code} {msg}')
            err=f'{e.code} {msg}'
        except Exception as e: err=str(e)
        time.sleep(2**i)
    raise RuntimeError(err)
def fetch(fid):
    for i in range(5):
        try:
            with urllib.request.urlopen(f'https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t',timeout=300) as r:
                b=r.read()
                if b[:15].lower().startswith(b'<!doctype html') : raise RuntimeError('got an html page, not the file')
                return b
        except Exception as e: err=str(e); time.sleep(2**i)
    raise RuntimeError('download: '+err)
def put(slug,role,name,data,variant=None,captured=None):
    b={'action':'upload-start','slug':slug,'role':role,'filename':name,'bytes':len(data),'by':BY}
    if captured: b['capturedAt']=captured
    if variant: b['variant']=variant
    up=req('POST',API,json.dumps(b).encode())['upload']
    for n in range(up['parts']):
        req('POST',f"{API}?slug={slug}&upload={up['id']}&part={n}",data[n*PART:(n+1)*PART],'application/octet-stream')
    return req('POST',API,json.dumps({'action':'upload-finish','slug':slug,'upload':up['id'],'by':BY}).encode())
jobs={}
for o in plan['outputs']: jobs.setdefault(o['slug'],[]).append(('output',o))
for slug,rs in plan['raws'].items():
    rs=sorted(rs,key=lambda r:(r['name'].lower().endswith('.nef'),r['path']))
    for r in rs: jobs.setdefault(slug,[]).append(('raw',r))
stats={'up':0,'skip':0,'fail':0,'bytes':0}; fails=[]
def agent(slug):
    a=req('GET',f'{API}?slug={slug}')['agent']
    pic=a.get('pic') or {}
    have_v={o.get('variant') for o in pic.get('outputs',[])}
    have_r={r.get('filename') for r in pic.get('raws',[])}
    nraw=len(pic.get('raws',[]))
    # Keep the agent where they were: an output stamps generatedAt now, and an original stored now reads
    # as newer than the last generate. Both would mark every placement stale.
    gen=pic.get('generatedAt') or ''
    from datetime import datetime, timedelta
    captured=(datetime.fromisoformat(gen.replace('Z','+00:00'))-timedelta(days=1)).isoformat().replace('+00:00','Z') if gen else None
    wrote_output=False
    for role,j in jobs[slug]:
        if j['id'] in done: continue
        name=j['path'].split('/')[-1].replace('/','_')
        if role=='output' and j['variant'] in have_v: stats['skip']+=1; continue
        if role=='raw':
            if name in have_r: stats['skip']+=1; continue
            if nraw>=MAX_RAWS: stats['skip']+=1; log({'id':j['id'],'slug':slug,'skipped':'over 50 originals','path':j['path']}); continue
        if DRY: stats['up']+=1; continue
        try:
            data=fetch(j['id'])
            put(slug,role,name,data,j.get('variant'),captured if role=='raw' else None)
            if role=='output': wrote_output=True
            if role=='raw': nraw+=1; have_r.add(name)
            stats['up']+=1; stats['bytes']+=len(data)
            log({'id':j['id'],'slug':slug,'role':role,'variant':j.get('variant'),'path':j['path'],'bytes':len(data)})
        except Exception as e:
            stats['fail']+=1; fails.append((slug,j['path'],str(e)[:200]))
            if 'not-found' in str(e).lower() or '404' in str(e)[:4]: break
    if gen and wrote_output and not DRY:
        req('POST',API,json.dumps({'action':'update','slug':slug,'pic':{'generatedAt':gen},'by':BY}).encode())
ONLY=[a.split('=',1)[1] for a in sys.argv if a.startswith('--only=')]
with ThreadPoolExecutor(6) as ex: list(ex.map(agent,[s for s in sorted(jobs) if not ONLY or s in ONLY[0].split(',')]))
print(json.dumps(stats)); print('\n'.join(map(str,fails[:40])))
json.dump(fails,open('drive/fails.json','w'),indent=1)
