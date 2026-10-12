import json,hashlib,sys,numpy as np,cv2
# Gera pares de controle (pixel ↔ lat/lon) para o site a partir das homografias foto → (s,t) do modelo de câmera.
#   python pares_controle.py                          recalcula tudo (o registro ORB/RANSAC das fotos herdadas varia um pouco)
#   python pares_controle.py --reamostrar relatorio.json  mantém as homografias do relatório e só escolhe novos pontos
E=json.load(open('eixo_st.json'));c=np.array(E['c']);ax=np.array(E['ax']);nrm=np.array(E['nrm'])
mx=111320*np.cos(np.radians(E['lat0']));my=110540
def st2ll(s,t):
    xy=c+(s+E['tmin'])*ax+t*nrm;return [round(E['lat0']+xy[1]/my,7),round(E['lon0']+xy[0]/mx,7)]
def ll2st(la,lo):
    xy=np.array([(lo-E['lon0'])*mx,(la-E['lat0'])*my])-c;return xy@ax-E['tmin'],xy@nrm
FOT='/home/fz/VSCode/conta-multidao/docs/casos/paulista-2026-10-11/fotos/'
# Linha central real da avenida (OSM): o eixo reto (s,t) se afasta do meio da pista em alguns trechos, como no MASP.
EIXO=np.array([[(lo-E['lon0'])*mx,(la-E['lat0'])*my] for la,lo in json.load(open('paulista_geo.json'))['eixo']])
def dist_eixo(ll):
    q=np.array([(ll[1]-E['lon0'])*mx,(ll[0]-E['lat0'])*my]);a,b=EIXO[:-1],EIXO[1:];d=b-a
    u=np.clip(((q-a)*d).sum(1)/(d*d).sum(1),0,1);return np.min(np.linalg.norm(a+u[:,None]*d-q,axis=1))
D_MAX=10      # só a pista (≤ 10 m da linha central): chão visível, longe das fachadas e do vão do MASP
PXM_MIN=4     # só onde a foto tem ≥ 4 px por metro de chão (o modelo é confiável perto da câmera)
N_PARES=10

def orb_H(a,b):
    A=cv2.imread(FOT+a);B=cv2.imread(FOT+b);o=cv2.ORB_create(6000)
    ka,da=o.detectAndCompute(cv2.cvtColor(A,cv2.COLOR_BGR2GRAY),None);kb,db=o.detectAndCompute(cv2.cvtColor(B,cv2.COLOR_BGR2GRAY),None)
    m=[x for x,y in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da,db,k=2) if x.distance<0.75*y.distance]
    pa=np.float32([ka[x.queryIdx].pt for x in m]);pb=np.float32([kb[x.trainIdx].pt for x in m])
    H,msk=cv2.findHomography(pa,pb,cv2.RANSAC,4);return H,int(msk.sum())

def escolher_pares(H,w,h):
    """Pontos do CHÃO da pista, espalhados pela foto (amostragem do ponto mais distante)."""
    cand=[]
    for y in np.linspace(0.02*h,0.98*h,60):
        for x in np.linspace(0.02*w,0.98*w,60):
            p=H@np.r_[x,y,1]
            if p[2]<=0: continue
            s,t=p[:2]/p[2]
            if not (0<s<2800 and dist_eixo(st2ll(s,t))<=D_MAX): continue
            J=(np.array([[H[0,0],H[0,1]],[H[1,0],H[1,1]]])-np.outer([s,t],H[2,:2]))/p[2]  # derivada de (s,t) por pixel
            if 1/np.sqrt(abs(np.linalg.det(J)))<PXM_MIN: continue
            cand.append((x,y,s,t))
    if len(cand)<4: return []
    cand=np.array(cand);esc=[int(np.argmax(cand[:,1]))]  # começa pelo ponto mais baixo (mais perto da câmera)
    while len(esc)<min(N_PARES,len(cand)):
        d=np.min(np.linalg.norm(cand[:,None,:2]-cand[esc][None,:,:2],axis=2),axis=1);esc.append(int(np.argmax(d)))
    return [{"foto":[round(x,1),round(y,1)],"mapa":st2ll(s,t)} for x,y,s,t in cand[esc]]

if '--reamostrar' in sys.argv:
    R=json.load(open(sys.argv[sys.argv.index('--reamostrar')+1]))
    Hst={};info={};shas={}
    for sha,g in R['georef'].items():
        f=g['foto'].split('/')[-1]
        src=np.float32([p['foto'] for p in g['pares']]);dst=np.float32([ll2st(*p['mapa']) for p in g['pares']])
        H=cv2.findHomography(src,dst,0)[0]
        Hst[f]=H if (H@np.r_[src[0],1])[2]>0 else -H;info[f]=g.get('metodo','');shas[f]=sha
else:
    modelos={'55582830431.jpg':'cam10_H.json','55583249175.jpg':'cam27_H.json'}
    derivadas={'55581805947.jpg':'55582830431.jpg','55583249180.jpg':'55582830431.jpg','55583675910.jpg':'55583249175.jpg','55583639030.jpg':'55583249175.jpg'}
    Hst={k:np.array(json.load(open(v))['H']) for k,v in modelos.items()}
    info={}
    for f,ref in derivadas.items():
        H,n=orb_H(f,ref);Hst[f]=Hst[ref]@H;info[f]=f"herdada de {ref} pelo registro ({n} inliers)"
    for f in modelos: info[f]="modelo de câmera por pontos de fuga"
    shas={f:hashlib.sha256(open(FOT+f,'rb').read()).hexdigest() for f in Hst}
georef={}
for f,H in Hst.items():
    h,w=cv2.imread(FOT+f).shape[:2]
    pares=escolher_pares(H,w,h)
    georef[shas[f]]={"foto":"fotos/"+f,"metodo":info[f],"pares":pares}
    print(f,len(pares),info[f])
json.dump(georef,open('georef_caso.json','w'),ensure_ascii=False,indent=1)
