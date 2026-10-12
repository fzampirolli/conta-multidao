import json,math,numpy as np,cv2,urllib.request,os,sys
d=json.load(open('cruz.json'))
N={e['id']:(e['lat'],e['lon']) for e in d['elements'] if e['type']=='node'}
P=[w for w in d['elements'] if w['type']=='way' and w['tags'].get('name')=='Avenida Paulista']
pts=[N[n] for w in P for n in w['nodes']]
lat0=sum(p[0] for p in pts)/len(pts);lon0=sum(p[1] for p in pts)/len(pts)
mx=111320*math.cos(math.radians(lat0));my=110540
A=np.array([((p[1]-lon0)*mx,(p[0]-lat0)*my) for p in pts]);c=A.mean(0)
u,s,vt=np.linalg.svd(A-c);ax=vt[0]
if ax[0]<0: ax=-ax
t=(A-c)@ax;tmin=t.min()
nrm=np.array([-ax[1],ax[0]])   # lado esquerdo de quem vai p/ leste (≈ nordeste)
def st2ll(sv,tv):
    xy=c+(sv+tmin)*ax+tv*nrm; return lat0+xy[1]/my, lon0+xy[0]/mx
json.dump({"lat0":lat0,"lon0":lon0,"c":c.tolist(),"ax":ax.tolist(),"nrm":nrm.tolist(),"tmin":float(tmin)},open('eixo_st.json','w'))
if __name__=='__main__':
    s0,s1,res=float(sys.argv[1]),float(sys.argv[2]),float(sys.argv[3]); T=70
    W=int((s1-s0)/res);H=int(2*T/res)
    # baixa ortofoto em blocos EPSG:4326 cobrindo a faixa
    lats=[];lons=[]
    for sv in (s0,s1):
        for tv in (-T,T):
            la,lo=st2ll(sv,tv);lats.append(la);lons.append(lo)
    la0,la1,lo0,lo1=min(lats),max(lats),min(lons),max(lons)
    deg_per_px_lon=res/mx*0.9;deg_per_px_lat=res/my*0.9
    nx=int((lo1-lo0)/deg_per_px_lon)+1;ny=int((la1-la0)/deg_per_px_lat)+1
    big=np.zeros((ny,nx,3),np.uint8);B=1800
    for j in range(0,ny,B):
        for i in range(0,nx,B):
            w=min(B,nx-i);h=min(B,ny-j)
            bb=(lo0+i*deg_per_px_lon,la1-(j+h)*deg_per_px_lat,lo0+(i+w)*deg_per_px_lon,la1-j*deg_per_px_lat)
            fn=f"orto_{s0:.0f}_{i}_{j}_{res}.jpg"
            if not os.path.exists(fn):
                url=("https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms?service=WMS&version=1.1.1&request=GetMap"
                     f"&layers=ORTO_RGB_2020&styles=&srs=EPSG:4326&bbox={bb[0]},{bb[1]},{bb[2]},{bb[3]}&width={w}&height={h}&format=image/jpeg")
                urllib.request.urlretrieve(url,fn)
            big[j:j+h,i:i+w]=cv2.imread(fn)
    # reamostra na faixa (s,t): coluna = s, linha = t (t positivo em cima = lado NE)
    S,Tg=np.meshgrid(s0+(np.arange(W)+.5)*res, T-(np.arange(H)+.5)*res)
    XY=c[None,None,:]+(S[...,None]+tmin)*ax+Tg[...,None]*nrm
    LO=lon0+XY[...,0]/mx;LA=lat0+XY[...,1]/my
    mapx=((LO-lo0)/deg_per_px_lon).astype(np.float32);mapy=((la1-LA)/deg_per_px_lat).astype(np.float32)
    faixa=cv2.remap(big,mapx,mapy,cv2.INTER_LINEAR)
    for sv in range(int(s0)//20*20,int(s1)+1,20):
        x=int((sv-s0)/res)
        if 0<=x<W:
            cv2.line(faixa,(x,0),(x,H if sv%100==0 else 12),(0,255,255),1)
            if sv%100==0: cv2.putText(faixa,str(sv),(x+2,24),0,0.5,(0,255,255),1)
    for tv in range(-60,61,20):
        y=int((T-tv)/res);cv2.line(faixa,(0,y),(W,y),(255,0,255) if tv==0 else (255,255,0),1);cv2.putText(faixa,f"t={tv}",(2,y-2),0,0.4,(255,255,0),1)
    cv2.imwrite(f"faixa_{s0:.0f}_{s1:.0f}.jpg",faixa);print(faixa.shape)
