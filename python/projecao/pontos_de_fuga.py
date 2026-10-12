import sys,numpy as np,cv2
rng=np.random.default_rng(0)
def linhas(img):
    g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY)
    lsd=cv2.createLineSegmentDetector(cv2.LSD_REFINE_STD)
    L=lsd.detect(g)[0].reshape(-1,4)
    comp=np.hypot(L[:,2]-L[:,0],L[:,3]-L[:,1])
    return L[comp>40],comp[comp>40]
def homog(L):
    p=np.c_[L[:,:2],np.ones(len(L))];q=np.c_[L[:,2:],np.ones(len(L))]
    l=np.cross(p,q);return l/np.linalg.norm(l[:,:2],axis=1)[:,None]
def ransac_vp(L,w,ang_tol=1.0,it=3000,regiao=None):
    l=homog(L);mid=(L[:,:2]+L[:,2:])/2;d=L[:,2:]-L[:,:2];d/=np.linalg.norm(d,axis=1)[:,None]
    best=None
    for _ in range(it):
        i,j=rng.choice(len(L),2,replace=False);v=np.cross(l[i],l[j])
        if abs(v[2])<1e-12: continue
        v=v/v[2]
        if regiao is not None and not (regiao[0]<=v[0]<=regiao[2] and regiao[1]<=v[1]<=regiao[3]): continue
        to=v[:2]-mid;to/=np.linalg.norm(to,axis=1)[:,None]
        ang=np.degrees(np.arccos(np.clip(np.abs((to*d).sum(1)),0,1)))
        inl=ang<ang_tol;sc=(w*inl).sum()
        if best is None or sc>best[0]: best=(sc,v,inl)
    # refinamento: mínimos quadrados (menor autovetor) com inliers
    A=l[best[2]]*w[best[2]][:,None];_,_,vt=np.linalg.svd(A);v=vt[-1];v=v/v[2]
    return v[:2],best[2]
if __name__=="__main__":
    img=cv2.imread(sys.argv[1]);h,w=img.shape[:2]
    L,c=linhas(img)
    ang=np.degrees(np.arctan2(L[:,3]-L[:,1],L[:,2]-L[:,0]))%180
    vert=(np.abs(ang-90)<25)
    v3,i3=ransac_vp(L[vert],c[vert])
    resto=L[~vert];cr=c[~vert]
    reg=[float(x) for x in sys.argv[3].split(',')] if len(sys.argv)>3 else None
    v1,i1=ransac_vp(resto,cr,regiao=reg,it=20000)
    print("img",w,h,"linhas",len(L),"verticais",vert.sum())
    print("V3 (vertical)",v3.round(1),"inliers",i3.sum())
    print("V1 (avenida)",v1.round(1),"inliers",i1.sum())
    cc=np.array([w/2,h/2]);f2=-np.dot(v1-cc,v3-cc);print("f^2",f2,"f",np.sqrt(f2) if f2>0 else None)
    out=img.copy()
    for (x1,y1,x2,y2) in L[vert][i3].astype(int): cv2.line(out,(x1,y1),(x2,y2),(255,0,255),2)
    for (x1,y1,x2,y2) in resto[i1].astype(int): cv2.line(out,(x1,y1),(x2,y2),(0,255,0),2)
    cv2.circle(out,tuple(v1.astype(int)),12,(0,255,255),3)
    cv2.imwrite(sys.argv[2],cv2.resize(out,None,fx=0.5,fy=0.5))
    np.save(sys.argv[2]+'.npy',np.r_[v1,v3])
