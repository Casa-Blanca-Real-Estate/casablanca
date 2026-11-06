# Step 1 of the Drive photo import (README.md): list @ Profile Pics (shared as anyone-with-link) into drive/tree.json.
import os; os.makedirs('drive', exist_ok=True)
import re, json, html, urllib.request, sys
from concurrent.futures import ThreadPoolExecutor
def ls(fid):
    u=f"https://drive.google.com/embeddedfolderview?id={fid}"
    t=urllib.request.urlopen(u,timeout=60).read().decode()
    out=[]
    for m in re.finditer(r'<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?flip-entry-title">([^<]*)<', t, re.S):
        fid2,href,title=m.group(1),html.unescape(m.group(2)),html.unescape(m.group(3))
        out.append({'id':fid2,'name':title,'folder':'/folders/' in href})
    return out
tree=[]
def walk(fid,path,depth):
    items=ls(fid)
    subs=[]
    for it in items:
        p=path+'/'+it['name']
        if it['folder']:
            if depth<4: subs.append((it['id'],p))
        else: tree.append({'id':it['id'],'path':p})
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda s: walk(s[0],s[1],depth+1), subs))
roots={'RAWS':'1ZNKCXSzd6_NXQpJZU_yZyinH6xB23SAU','SQUARE':'1S_K9AgRJLyq_vVm8vePh7NuomEzpUmKm','ROUND':'1-KAHgMyxlffQA43URbblgYs7mmLsJPY-','TODO':'10J-IvzbQcyBA4otE8QHzpBEC2yd6OULe'}
for k,v in roots.items(): walk(v,k,0)
json.dump(tree,open('drive/tree.json','w'),indent=0)
print(len(tree))
