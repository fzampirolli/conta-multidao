import sys,numpy as np,cv2
img=cv2.imread(sys.argv[1]);y0,y1=int(sys.argv[2]),int(sys.argv[3])
hsv=cv2.cvtColor(img,cv2.COLOR_BGR2HSV)
red=(((hsv[...,0]<10)|(hsv[...,0]>165))&(hsv[...,1]>90)&(hsv[...,2]>70)).astype(np.uint8)
red=cv2.morphologyEx(red,cv2.MORPH_CLOSE,np.ones((15,15),np.uint8))
red=cv2.morphologyEx(red,cv2.MORPH_OPEN,np.ones((9,9),np.uint8))
E=[];D=[]
for y in range(y0,y1,8):
    xs=np.where(red[y])[0]
    if len(xs)<50: continue
    # maior segmento contínuo (a avenida)
    quebras=np.where(np.diff(xs)>25)[0];segs=np.split(xs,quebras+1);sg=max(segs,key=len)
    E.append((sg[0],y));D.append((sg[-1],y))
E=np.array(E,float);D=np.array(D,float)
def fit(P):
    # x = a*y + b, robusto (RANSAC simples)
    best=None
    for _ in range(500):
        i,j=np.random.choice(len(P),2,replace=False)
        if P[i,1]==P[j,1]: continue
        a=(P[j,0]-P[i,0])/(P[j,1]-P[i,1]);b=P[i,0]-a*P[i,1]
        inl=np.abs(P[:,0]-(a*P[:,1]+b))<6
        if best is None or inl.sum()>best[0]: best=(inl.sum(),inl)
    a,b=np.polyfit(P[best[1],1],P[best[1],0],1);return a,b,best[0]
ae,be,ne=fit(E);ad,bd,nd=fit(D)
yv=(bd-be)/(ae-ad);xv=ae*yv+be
print("esq: x=%.4f y+%.1f (%d) | dir: x=%.4f y+%.1f (%d)"%(ae,be,ne,ad,bd,nd))
print("V1 ~ (%.1f, %.1f)"%(xv,yv))
out=img.copy();out[red>0]=(out[red>0]*0.6+np.array([0,0,255])*0.4).astype(np.uint8)
for a,b in((ae,be),(ad,bd)): cv2.line(out,(int(a*yv+b),int(yv)),(int(a*img.shape[0]+b),img.shape[0]),(0,255,255),2)
cv2.imwrite(sys.argv[4],cv2.resize(out,None,fx=0.4,fy=0.4))
