"""Registro de imagens (mosaico) — versão Python do que o site faz no navegador.
ORB → correspondências (teste da razão) → RANSAC → homografia → composição.

Uso: python python/registrar.py saida.jpg foto_referencia.jpg outra1.jpg outra2.jpg ...
"""
import sys
import cv2
import numpy as np

def caracteristicas(img, n=6000):
    orb = cv2.ORB_create(n)
    return orb.detectAndCompute(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), None)

def casar(fa, fb):
    (ka, da), (kb, db) = fa, fb
    pares = [m for m, n in cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2) if m.distance < 0.75 * n.distance]
    if len(pares) < 12:
        return None, 0
    pa = np.float32([ka[m.queryIdx].pt for m in pares]); pb = np.float32([kb[m.trainIdx].pt for m in pares])
    H, masc = cv2.findHomography(pa, pb, cv2.RANSAC, 4)
    return H, int(masc.sum()) if masc is not None else 0

def main(saida, *arquivos, lado=1600):
    imgs = []
    for a in arquivos:
        im = cv2.imread(a); s = min(1, lado / max(im.shape[:2]))
        imgs.append(cv2.resize(im, None, fx=s, fy=s, interpolation=cv2.INTER_AREA))
    feats = [caracteristicas(im) for im in imgs]
    H = {0: np.eye(3)}
    pend = list(range(1, len(imgs)))
    while pend:
        melhor = None
        for i in pend:
            for j in H:
                Hij, inl = casar(feats[i], feats[j])
                if Hij is not None and inl >= 25 and (melhor is None or inl > melhor[3]):
                    melhor = (i, j, Hij, inl)
        if not melhor:
            break
        i, j, Hij, inl = melhor
        H[i] = H[j] @ Hij; pend.remove(i)
        print(f"{arquivos[i]} → {arquivos[j]}: {inl} inliers")
    cantos = np.vstack([cv2.perspectiveTransform(np.float32([[0, 0], [w, 0], [w, h], [0, h]]).reshape(-1, 1, 2), H[i]).reshape(-1, 2)
                        for i, (h, w) in ((i, imgs[i].shape[:2]) for i in H)])
    x0, y0 = cantos.min(0); x1, y1 = cantos.max(0)
    T = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]])
    W, Ht = int(np.ceil(x1 - x0)), int(np.ceil(y1 - y0))
    mosaico = np.zeros((Ht, W, 3), np.uint8); ocupado = np.zeros((Ht, W), bool)
    for i in H:  # referência primeiro; as demais só preenchem o que falta
        w = cv2.warpPerspective(imgs[i], T @ H[i], (W, Ht))
        m = cv2.warpPerspective(np.full(imgs[i].shape[:2], 255, np.uint8), T @ H[i], (W, Ht)) > 0
        novo = m & ~ocupado
        mosaico[novo] = w[novo]; ocupado |= m
    cv2.imwrite(saida, mosaico, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(f"mosaico {W}×{Ht} salvo em {saida}; não registradas: {[arquivos[i] for i in pend]}")

if __name__ == "__main__":
    main(*sys.argv[1:])
