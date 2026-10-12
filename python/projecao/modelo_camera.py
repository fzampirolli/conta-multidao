"""Modelo de câmera por pontos de fuga: K (f, centro), R (de V_avenida e V_vertical),
altura h (de um comprimento conhecido) e posição (de um ponto conhecido no chão).
Saída: homografia foto → (s,t) em metros no sistema da avenida."""
import json,sys,numpy as np,cv2
def modelo(W,H,v1,v3,ref_px,ref_largura_px,ref_m,anc_px,anc_st,sentido=+1,c=None):
    c=np.array(c if c is not None else [W/2,H/2],float);v1=np.array(v1,float);v3=np.array(v3,float)
    f=np.sqrt(-np.dot(v1-c,v3-c))
    K=np.array([[f,0,c[0]],[0,f,c[1]],[0,0,1]]);Ki=np.linalg.inv(K)
    d=Ki@np.r_[v3,1];d/=np.linalg.norm(d)
    if d[1]<0: d=-d                       # "para baixo" na imagem
    r1=Ki@np.r_[v1,1];r1/=np.linalg.norm(r1)
    if r1[2]<0: r1=-r1                    # para a frente
    r1=r1-np.dot(r1,d)*d;r1/=np.linalg.norm(r1)
    up=-d;r2=np.cross(up,r1)              # esquerda
    def Hg(h): return K@np.c_[r1,r2,h*d]  # chão (a,b) -> imagem
    # altura pela escala lateral no ponto de referência
    H1=Hg(1.0);Hi=np.linalg.inv(H1)
    p=Hi@np.r_[ref_px,1];a,b=p[:2]/p[2]
    q1=H1@np.r_[a,b-0.5,1];q2=H1@np.r_[a,b+0.5,1];s1=np.linalg.norm(q1[:2]/q1[2]-q2[:2]/q2[2])
    h=s1*ref_m/ref_largura_px
    Hh=Hg(h);Hhi=np.linalg.inv(Hh)
    p=Hhi@np.r_[anc_px,1];a0,b0=p[:2]/p[2]
    # (a,b) -> (s,t):  s = s_c + sentido*a ; t = t_c + sentido*b
    sc=anc_st[0]-sentido*a0;tc=anc_st[1]-sentido*b0
    A=np.array([[sentido,0,sc],[0,sentido,tc],[0,0,1]])
    Hfoto_st=A@Hhi
    return dict(f=f,h=h,sc=sc,tc=tc,K=K.tolist(),H=(Hfoto_st/Hfoto_st[2,2]).tolist(),
                depressao=float(np.degrees(np.arccos(np.dot(d,[0,0,1])))))
if __name__=="__main__":
    cfg=json.load(open(sys.argv[1]))
    im=cv2.imread(cfg["foto"]);H,W=im.shape[:2]
    m=modelo(W,H,cfg["v1"],cfg["v3"],cfg["ref_px"],cfg["ref_largura_px"],cfg["ref_m"],cfg["anc_px"],cfg["anc_st"],cfg.get("sentido",1))
    print("f=%.0f px  altura da câmera=%.1f m  nadir s=%.0f t=%.1f"%(m["f"],m["h"],m["sc"],m["tc"]))
    Hst=np.array(m["H"])
    for nome,px in cfg.get("checar",{}).items():
        p=Hst@np.r_[px,1];print("  %-28s -> s=%.0f t=%.1f"%(nome,p[0]/p[2],p[1]/p[2]))
    json.dump(m,open(cfg["saida"],"w"))
    # sobreposição: ortofoto (faixa) renderizada na perspectiva da foto
    F=cv2.imread(cfg["faixa"]);s0=cfg["faixa_s0"];res=0.25;T=70
    A=np.array([[1/res,0,-s0/res],[0,-1/res,T/res],[0,0,1]])
    M=A@Hst
    warp=cv2.warpPerspective(F,M,(W,H),flags=cv2.WARP_INVERSE_MAP)
    ed=cv2.Canny(cv2.cvtColor(warp,cv2.COLOR_BGR2GRAY),60,150)
    out=im.copy();msk=warp.sum(2)>0
    out[msk]=(0.55*im[msk]+0.45*warp[msk]).astype(np.uint8);out[ed>0]=(0,255,255)
    cv2.imwrite(cfg["sobreposicao"],cv2.resize(out,None,fx=0.5,fy=0.5))
