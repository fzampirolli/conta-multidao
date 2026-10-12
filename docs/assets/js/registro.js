// Etapa 2 — Registro de imagens (mosaico) com OpenCV.js, executado no navegador.
// Pipeline: ORB (pontos de interesse) → correspondências (Hamming + teste da razão de Lowe)
//           → RANSAC + homografia → composição do mosaico.
import { estado, avisar, ouvir, carregarScript } from "./estado.js";

const OPENCV = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js";
let cv = null;

async function obterCV(status) {
  if (cv) return; // não retornar cv: o objeto do OpenCV.js é "thenable" e travaria o await
  status("Carregando OpenCV.js (≈10 MB, só na primeira vez)…");
  await carregarScript(OPENCV);
  // O módulo WebAssembly inicializa de forma assíncrona; esperamos até cv.Mat existir.
  for (let t = 0; !window.cv?.Mat && t < 600; t++) await new Promise((ok) => setTimeout(ok, 100));
  if (!window.cv?.Mat) throw new Error("OpenCV.js não inicializou");
  cv = window.cv;
}

/** Desenha a foto reduzida num canvas (lado maior = max px). */
function reduzir(img, max) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const s = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c;
}

function caracteristicas(canvas) {
  const rgba = cv.imread(canvas), cinza = new cv.Mat();
  cv.cvtColor(rgba, cinza, cv.COLOR_RGBA2GRAY);
  const orb = new cv.ORB(6000);
  const kp = new cv.KeyPointVector(), des = new cv.Mat(), mascara = new cv.Mat();
  orb.detectAndCompute(cinza, mascara, kp, des);
  const pts = [];
  for (let i = 0; i < kp.size(); i++) { const p = kp.get(i).pt; pts.push([p.x, p.y]); }
  rgba.delete(); cinza.delete(); orb.delete(); kp.delete(); mascara.delete();
  return { pts, des };
}

/** Casa A→B. Retorna {H (A→B), pares, inliers} ou null. */
function casar(A, B) {
  if (A.des.rows < 10 || B.des.rows < 10) return null;
  const bf = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const knn = new cv.DMatchVectorVector();
  bf.knnMatch(A.des, B.des, knn, 2);
  const pares = [];
  for (let i = 0; i < knn.size(); i++) {
    const m = knn.get(i);
    if (m.size() < 2) continue;
    const a = m.get(0), b = m.get(1);
    if (a.distance < 0.75 * b.distance) pares.push([a.queryIdx, a.trainIdx]); // teste da razão de Lowe
  }
  bf.delete(); knn.delete();
  if (pares.length < 12) return { H: null, pares: [], inliers: 0, total: pares.length };
  const src = cv.matFromArray(pares.length, 1, cv.CV_32FC2, pares.flatMap(([i]) => A.pts[i]));
  const dst = cv.matFromArray(pares.length, 1, cv.CV_32FC2, pares.flatMap(([, j]) => B.pts[j]));
  const masc = new cv.Mat();
  const Hm = cv.findHomography(src, dst, cv.RANSAC, 4, masc);
  const ok = [];
  for (let i = 0; i < pares.length; i++) ok.push(masc.data[i] === 1);
  const inliers = ok.filter(Boolean).length;
  const H = Hm.rows === 3 ? Array.from(Hm.data64F) : null;
  src.delete(); dst.delete(); masc.delete(); Hm.delete();
  return { H, pares, ok, inliers, total: pares.length };
}

/** Homografia é razoável? (evita distorções absurdas) */
function plausivel(r) {
  if (!r || !r.H || r.inliers < 25 || r.inliers / r.total < 0.2) return false;
  const [a, b, , d, e] = r.H, det = a * e - b * d;
  return det > 0.05 && det < 20 && Math.abs(r.H[6]) < 0.005 && Math.abs(r.H[7]) < 0.005;
}

const mult = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j];
  return C;
};
const aplicar = (H, [x, y]) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };

/** Visualização didática dos pares: lado a lado, linhas verdes = inliers, vermelhas = descartadas. */
function desenharPares(cA, cB, A, B, r, titulo) {
  const alt = 260, sA = alt / cA.height, sB = alt / cB.height;
  const c = document.createElement("canvas");
  c.width = Math.round(cA.width * sA + cB.width * sB + 10); c.height = alt;
  const g = c.getContext("2d");
  g.drawImage(cA, 0, 0, cA.width * sA, alt);
  const ox = cA.width * sA + 10;
  g.drawImage(cB, ox, 0, cB.width * sB, alt);
  const passo = Math.max(1, Math.floor(r.pares.length / 300));
  r.pares.forEach(([i, j], k) => {
    if (k % passo) return;
    const [x1, y1] = A.pts[i], [x2, y2] = B.pts[j];
    g.strokeStyle = r.ok[k] ? "rgba(40,220,160,.75)" : "rgba(255,80,80,.35)";
    g.lineWidth = r.ok[k] ? 1.2 : 0.7;
    g.beginPath(); g.moveTo(x1 * sA, y1 * sA); g.lineTo(ox + x2 * sB, y2 * sB); g.stroke();
  });
  const fig = document.createElement("figure");
  fig.style.margin = ".6rem 0";
  const Hs = r.H ? r.H.map((v) => v.toFixed(3)) : null;
  fig.innerHTML = `<figcaption class="pequeno"><b>${titulo}</b>: ${r.total} correspondências,
    <span class="ok">${r.inliers} consistentes (inliers)</span>, ${r.total - r.inliers} descartadas pelo RANSAC.
    ${Hs ? `<details><summary>Matriz de homografia H</summary><div class="formula">⎡ ${Hs.slice(0, 3).join("  ")} ⎤\n⎢ ${Hs.slice(3, 6).join("  ")} ⎥\n⎣ ${Hs.slice(6, 9).join("  ")} ⎦</div></details>` : ""}</figcaption>`;
  fig.prepend(c);
  return fig;
}

/** Compõe um mosaico (canvas) a partir das telas e homografias (para o plano da referência). */
function compor(idx, telas, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const i of idx) {
    const c = telas[i];
    for (const p of [[0, 0], [c.width, 0], [c.width, c.height], [0, c.height]]) {
      const [x, y] = aplicar(H[i], p);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  const LIM = 7000;
  const esc = Math.min(1, LIM / Math.max(x1 - x0, y1 - y0));
  const T = [esc, 0, -x0 * esc, 0, esc, -y0 * esc, 0, 0, 1];
  const W = Math.ceil((x1 - x0) * esc), Ht = Math.ceil((y1 - y0) * esc);
  const saida = document.createElement("canvas");
  saida.width = W; saida.height = Ht;
  const g = saida.getContext("2d");
  // A referência é desenhada primeiro; as demais só preenchem o que falta ("destination-over"),
  // assim regiões sobrepostas não ficam duplicadas nem com "fantasmas".
  idx.forEach((i, k) => {
    const src = cv.imread(telas[i]), dst = new cv.Mat();
    const Mm = cv.matFromArray(3, 3, cv.CV_64F, mult(T, H[i]));
    cv.warpPerspective(src, dst, Mm, new cv.Size(W, Ht), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 0));
    const tmp = document.createElement("canvas");
    cv.imshow(tmp, dst);
    g.globalCompositeOperation = k === 0 ? "source-over" : "destination-over";
    g.drawImage(tmp, 0, 0);
    src.delete(); dst.delete(); Mm.delete();
  });
  return { canvas: saida, T, largura: W, altura: Ht };
}

export async function registrar() {
  const status = (t) => (document.getElementById("reg-status").textContent = t);
  const prog = (p) => (document.getElementById("reg-prog").style.width = `${Math.round(p * 100)}%`);
  const paresDiv = document.getElementById("reg-pares");
  const saidaDiv = document.getElementById("reg-mosaicos");
  paresDiv.innerHTML = ""; saidaDiv.innerHTML = "";
  if (estado.fotos.length < 2) { status("Envie pelo menos 2 fotos com partes em comum."); return; }
  await obterCV(status);
  const max = +document.getElementById("reg-res").value;
  const refId = document.getElementById("reg-ref").value;
  const fotos = estado.fotos;
  const num = (i) => i + 1; // numeração igual à da galeria

  status("Detectando pontos de interesse (ORB)…");
  const telas = [], feats = [];
  for (let i = 0; i < fotos.length; i++) {
    telas.push(reduzir(fotos[i].img, max));
    feats.push(caracteristicas(telas[i]));
    prog((i + 1) / fotos.length * 0.3);
    await new Promise((r) => setTimeout(r));
  }

  // Casamos todos os pares uma única vez (grafo de sobreposição).
  const n = fotos.length, casamentos = {};
  let feitos = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    status(`Comparando foto ${num(i)} com foto ${num(j)}…`);
    await new Promise((r) => setTimeout(r));
    const r = casar(feats[i], feats[j]);
    if (plausivel(r)) casamentos[`${i},${j}`] = r;
    prog(0.3 + 0.6 * (++feitos / (n * (n - 1) / 2)));
  }

  // Cada grupo conectado de fotos vira um mosaico. Começamos pela referência escolhida.
  // H[i] leva a foto i ao plano da foto-semente do grupo (encadeando homografias pela melhor ligação).
  const restantes = new Set(fotos.map((_, i) => i));
  const ordem = [fotos.findIndex((f) => f.id === refId), ...fotos.keys()].filter((i) => i >= 0);
  estado.mosaicos = [];
  for (const semente of ordem) {
    if (!restantes.has(semente)) continue;
    restantes.delete(semente);
    const H = { [semente]: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, grupo = [semente];
    const transf = [{ id: fotos[semente].id, H: H[semente], inliers: null, ligadaA: null }];
    let cresceu = true;
    while (cresceu) {
      cresceu = false;
      let melhor = null;
      for (const i of restantes) for (const j of grupo) {
        const r = casamentos[`${Math.min(i, j)},${Math.max(i, j)}`];
        if (r && (!melhor || r.inliers > melhor.r.inliers)) melhor = { i, j, r };
      }
      if (melhor) {
        const { i, j, r } = melhor;
        const Hij = i < j ? r.H : inverter3(r.H); // r.H leva a menor → maior
        H[i] = mult(H[j], Hij);
        grupo.push(i); restantes.delete(i); cresceu = true;
        transf.push({ id: fotos[i].id, H: H[i], inliers: r.inliers, ligadaA: fotos[j].id });
        const [a, b] = i < j ? [i, j] : [j, i];
        paresDiv.appendChild(desenharPares(telas[a], telas[b], feats[a], feats[b], r, `Foto ${num(a)} ↔ foto ${num(b)}`));
      }
    }
    if (grupo.length < 2) continue;
    status(`Compondo o mosaico ${estado.mosaicos.length + 1}…`);
    await new Promise((r) => setTimeout(r));
    const m = compor(grupo, telas, H);
    const k = estado.mosaicos.length + 1;
    estado.mosaicos.push({
      id: `mosaico${k}`, nome: `Mosaico ${k} (fotos ${grupo.map(num).join(", ")})`, canvas: m.canvas,
      largura: m.largura, altura: m.altura,
      transformacoes: transf.map((t) => ({ ...t, H: mult(m.T, t.H).map((v) => +v.toPrecision(6)) })),
    });
    const fig = document.createElement("figure");
    fig.style.margin = "0 0 1rem";
    fig.innerHTML = `<figcaption><b>Mosaico ${k}</b>: fotos ${grupo.map(num).join(", ")} · ${m.largura}×${m.altura} px
      <button data-baixar="${k - 1}" style="margin-left:.5rem">Baixar PNG</button></figcaption>`;
    const caixa = document.createElement("div");
    caixa.className = "area-trabalho"; m.canvas.style.width = "100%"; caixa.appendChild(m.canvas);
    fig.prepend(caixa);
    saidaDiv.appendChild(fig);
  }
  feats.forEach((f) => f.des.delete());
  prog(1);

  saidaDiv.querySelectorAll("[data-baixar]").forEach((b) => (b.onclick = () => {
    const a = document.createElement("a");
    a.download = `mosaico-${+b.dataset.baixar + 1}.png`; a.href = estado.mosaicos[+b.dataset.baixar].canvas.toDataURL("image/png"); a.click();
  }));
  const usadas = new Set(estado.mosaicos.flatMap((m) => m.transformacoes.map((t) => t.id)));
  const fora = fotos.map((f, i) => (usadas.has(f.id) ? null : num(i))).filter(Boolean);
  status(estado.mosaicos.length
    ? `${estado.mosaicos.length} mosaico(s) formado(s) com ${usadas.size} de ${n} fotos.` +
      (fora.length ? ` Sem sobreposição suficiente (use separadamente): foto(s) ${fora.join(", ")}.` : "")
    : "Nenhum par de fotos se alinhou. As fotos precisam mostrar partes em comum, do mesmo ponto de vista.");
  if (!estado.mosaicos.length) saidaDiv.innerHTML = '<p class="suave">Nenhum mosaico.</p>';
  avisar("mosaico");
}

function inverter3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

export function iniciarRegistro() {
  const sel = document.getElementById("reg-ref");
  const atualizar = () => {
    sel.innerHTML = estado.fotos.map((f, i) => `<option value="${f.id}">${i + 1}. ${f.nome}</option>`).join("");
  };
  ouvir("fotos", atualizar);
  document.getElementById("reg-rodar").onclick = () =>
    registrar().catch((e) => { document.getElementById("reg-status").textContent = "Erro: " + e.message; console.error(e); });
}
