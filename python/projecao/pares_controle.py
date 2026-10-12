import json,hashlib,numpy as np,cv2
E=json.load(open('eixo_st.json'));c=np.array(E['c']);ax=np.array(E['ax']);nrm=np.array(E['nrm'])
mx=111320*np.cos(np.radians(E['lat0']));my=110540
def st2ll(s,t):
    xy=c+(s+E['tmin'])*ax+t*nrm;return [round(E['lat0']+xy[1]/my,7),round(E['lon0']+xy[0]/mx,7)]
FOT='/home/fz/VSCode/conta-multidao/docs/casos/paulista-2026-10-11/fotos/'
def orb_H(a,b):
    A=cv2.imread(FOT+a);B=cv2.imread(FOT+b);o=cv2.ORB_create(6000)
    ka,da=o.detectAndCompute(cv2.cvtColor(A,cv2.COLOR_BGR2GRAY),None);kb,db=o.detectAndCompute(cv2.cvtColor(B,cv2.COLOR_BGR2GRAY),None)
    m=[x for x,y in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da,db,k=2) if x.distance<0.75*y.distance]
    pa=np.float32([ka[x.queryIdx].pt for x in m]);pb=np.float32([kb[x.trainIdx].pt for x in m])
    H,msk=cv2.findHomography(pa,pb,cv2.RANSAC,4);return H,int(msk.sum())
modelos={'55582830431.jpg':('cam10_H.json',None),'55583249175.jpg':('cam27_H.json',None)}
derivadas={'55581805947.jpg':'55582830431.jpg','55583249180.jpg':'55582830431.jpg','55583675910.jpg':'55583249175.jpg','55583639030.jpg':'55583249175.jpg'}
Hst={k:np.array(json.load(open(v[0]))['H']) for k,v in modelos.items()}
info={}
for f,ref in derivadas.items():
    H,n=orb_H(f,ref);Hst[f]=Hst[ref]@H;info[f]=f"herdada de {ref} pelo registro ({n} inliers)"
for f in modelos: info[f]="modelo de câmera por pontos de fuga"
georef={}
for f,H in Hst.items():
    im=cv2.imread(FOT+f);h,w=im.shape[:2]
    sha=hashlib.sha256(open(FOT+f,'rb').read()).hexdigest()
    pares=[]
    # pontos espalhados na metade inferior/central da foto (chão próximo, onde o modelo é confiável)
    for fy in (0.55,0.7,0.85,0.97):
        for fx in (0.15,0.5,0.85):
            x,y=fx*w,fy*h;p=H@np.r_[x,y,1]
            if p[2]==0: continue
            s,t=p[:2]/p[2]
            if not (0<s<2800 and -80<t<80): continue
            pares.append({"foto":[round(x,1),round(y,1)],"mapa":st2ll(s,t)})
    georef[sha]={"foto":"fotos/"+f,"metodo":info[f],"pares":pares}
    print(f,len(pares),info[f])
json.dump(georef,open('georef_caso.json','w'),ensure_ascii=False,indent=1)
