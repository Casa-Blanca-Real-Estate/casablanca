# Step 2 of the Drive photo import (README.md): match every Drive file to an agent and a photo type.
# Writes drive/plan.json. Reads nothing private into the repo: run it from a scratch folder.
import json, re, os, unicodedata, collections
import os as _os, urllib.request as _u
t=json.load(open('drive/tree.json'))
# The roster as the photo store has it now (CB_PICS_TOKEN).
_r=_u.Request('https://casa-blanca-creative-studio.netlify.app/.netlify/functions/agent-pics',headers={'Authorization':'Bearer '+_os.environ['CB_PICS_TOKEN']})
roster=json.loads(_u.urlopen(_r,timeout=60).read())['roster']
def norm(s):
    s=unicodedata.normalize('NFD',s); s=''.join(c for c in s if unicodedata.category(c)!='Mn').lower()
    return re.findall(r'[a-z]+',s)
# agent keys
full={}; short=collections.defaultdict(set)
for a in roster:
    names=[a['name']]+list(a.get('formerNames') or [])
    for n in names:
        w=norm(n)
        if not w: continue
        if len(w[-1])>1: full.setdefault(' '.join(w),a['slug'])  # "Brittany F." is only reachable by its short key
        if len(w)>1: short[w[0]+'-'+w[-1][0]].add(a['slug'])
    short[a['slug']].add(a['slug'])
ALIAS={'king coleman':'malik king coleman','kiing coleman':'malik king coleman','isabel izzy godwin':'izzy godwin','adriana kuzmovych':'andriana kuzmovych',
 'jennifer hilfinger futoransky':'jennifer futoransky hilfinger','josie hubschman margulis':'josie hubschman','tyler w french':'tyler french'}
FULLNAMED=set(s for n,s in full.items())
def match(label,newfmt=False):
    w=norm(label)
    w=[x for x in w if x not in ('pp','profile','picture','headshot','png','jpg','jpeg')]
    key=' '.join(w)
    for k in (key, ALIAS.get(key,'')):
        if k and k in full: return full[k],'full'
    # fuzzy full: same first and last word
    if len(w)>1:
        c=[s for n,s in full.items() if n.split()[0]==w[0] and n.split()[-1]==w[-1]]
        if len(set(c))==1: return c[0],'full~'
        s=short.get(w[0]+'-'+w[-1][0],set())
        if len(s)==1: return next(iter(s)),'short'
        if len(s)>1:
            # A generator file names the person in full on its other variants: the full-named agent.
            fn=[x for x in s if x in FULLNAMED]
            if newfmt and len(fn)==1: return fn[0],'short*'
            return None,'ambiguous:'+','.join(sorted(s))
    return None,'nomatch'
VAR={'SQUARE/1G MAIN Logo':'SQ1_GrayLogo','SQUARE/2G Clean':'SQ2_Clean','SQUARE/3G Name':'SQ3_Name','SQUARE/4 Color Name':'SQ4_ColorName',
 'SQUARE/5 Color Clean':'SQ5_ColorClean','SQUARE/6 Color Logo':'SQ6_ColorLogo','ROUND/1 MAIN Round Logo':'R1_Logo','ROUND/2 Logo Round JPG':'R2_Logo',
 'ROUND/3 Blank Round PNG':'R3_Blank','ROUND/4 Blank Round JPG':'R4_Clean'}
IMG=('.jpg','.jpeg','.png'); RAWOK=IMG+('.nef',)
outs={}; raws=collections.defaultdict(list); skipped=[]
for x in t:
    p=x['path']; parts=p.split('/'); ext=os.path.splitext(p)[1].lower()
    top='/'.join(parts[:2])
    if top in VAR and len(parts)==3:
        if ext not in IMG: skipped.append((p,'not an image')); continue
        base=os.path.splitext(parts[2])[0]
        m=re.search(r'_(R[1-4]_[A-Za-z]+|SQ[1-6]_[A-Za-z]+)$',base)
        newfmt=bool(m)
        label=base[:m.start()] if m else re.split(r'_(SQ|Square|Round|Blank|Circle)',base,maxsplit=1)[0]
        slug,how=match(label.replace('_',' '),newfmt)
        if not slug: skipped.append((p,how)); continue
        k=(slug,m.group(1) if newfmt else VAR[top]); prev=outs.get(k)
        if prev and (prev['rank']>=1 or not newfmt): skipped.append((p,'second file for '+slug+' '+k[1]+', kept '+prev['path'])); continue
        if prev: skipped.append((prev['path'],'older file, replaced by '+p))
        outs[k]={'id':x['id'],'path':p,'how':how,'rank':1 if newfmt else 0}
    elif parts[0]=='TODO' and len(parts)==3:
        m=re.search(r'(R[1-4]_[A-Za-z]+|SQ[1-6]_[A-Za-z]+)\.(png|jpe?g)$',parts[2])
        slug,how=match(parts[1].replace('_PP','').replace('_',' '))
        if not slug: skipped.append((p,how)); continue
        if m:
            k=(slug,m.group(1)); prev=outs.get(k)
            # the @ to do set is the newest generator output: it wins
            if prev: skipped.append((prev['path'],'replaced by the @ to do file'))
            outs[k]={'id':x['id'],'path':p,'how':how,'rank':2}
        elif ext in RAWOK: raws[slug].append({'id':x['id'],'path':p,'name':parts[2]})
        else: skipped.append((p,'not a photo'))
    elif parts[0]=='RAWS':
        if len(parts)==2:
            label=re.sub(r'\s*\d+$','',os.path.splitext(parts[1])[0]) if ext else re.sub(r'\s*\d+$','',parts[1])
        else: label=parts[1]
        if ext not in RAWOK: skipped.append((p,'not a photo ('+(ext or 'no extension')+')')); continue
        if re.match(r'photo_180x180',parts[-1],re.I) or parts[-1].startswith('@'): skipped.append((p,'signature export or placeholder')); continue
        slug,how=match(label)
        if not slug: skipped.append((p,how)); continue
        raws[slug].append({'id':x['id'],'path':p,'name':parts[-1]})
    else: skipped.append((p,'outside the photo folders'))
plan={'outputs':[{'slug':k[0],'variant':k[1],**v} for k,v in sorted(outs.items())],'raws':{k:v for k,v in sorted(raws.items())},'skipped':skipped}
json.dump(plan,open('drive/plan.json','w'),indent=1)
agents=set(k[0] for k in outs)|set(raws)
print('agents',len(agents),'of',len(roster),'outputs',len(outs),'raws',sum(len(v) for v in raws.values()))
print('raws over 50:',[(k,len(v)) for k,v in raws.items() if len(v)>50])
pass
#,sorted(set((v['path'].split('/')[2] if v['path'].count('/')>1 else v['path'], k[0]) for k,v in outs.items() if v['how']!='full'))[:0])
c=collections.Counter(r for _,r in skipped); print(c.most_common(30))
print('no photos at all:',sorted(a['slug'] for a in roster if a['slug'] not in agents))
