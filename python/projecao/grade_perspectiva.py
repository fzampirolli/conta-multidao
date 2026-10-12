import sys,json,numpy as np,cv2
foto,camf,saida=sys.argv[1],sys.argv[2],sys.argv[3]
im=cv2.imread(foto);H=np.array(json.load(open(camf))["H"]);Hi=np.linalg.inv(H)
ancora=json.load(open(camf)).get("ancora",[1100,7.5]);Hi=Hi*np.sign((Hi@np.r_[ancora,1])[2])
cz={"Consolação":165,"Augusta":559,"Frei Caneca":731,"Peixoto Gomide":1000,"Pl. Figueiredo":1080,"Casa Branca":1179,"Itapeva":1279,"Pamplona":1460,"Campinas":1664,"J.E.Lima":1863,"Brigadeiro":2110,"13 de Maio":2743}
def P(s,t):
    q=Hi@np.r_[s,t,1]
    return None if q[2]<=0 else (int(q[0]/q[2]),int(q[1]/q[2]))
out=im.copy()
for t,cor in ((2,(0,255,255)),(-22,(0,255,255)),(8,(255,180,0)),(-30,(255,180,0))):
    pts=[P(s,t) for s in np.arange(0,2800,5)];pts=[p for p in pts if p and -5000<p[0]<5000 and -5000<p[1]<9000]
    for a,b in zip(pts,pts[1:]): cv2.line(out,a,b,cor,2)
for nome,s in cz.items():
    a,b=P(s,-30),P(s,8)
    if a and b and 0<=a[1]<im.shape[0]+2000:
        cv2.line(out,a,b,(255,0,255),2);cv2.putText(out,f"{nome} ({s})",(b[0]+4,b[1]),0,0.8,(255,0,255),2)
cv2.imwrite(saida,cv2.resize(out,None,fx=0.5,fy=0.5))
