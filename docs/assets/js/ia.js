// Contagem por IA: modelo DM-Count (Wang et al., NeurIPS 2020), pesos UCF-QNRF, quantizado (int8),
// executado no navegador com onnxruntime-web. A rede produz um "mapa de densidade":
// cada pixel diz quantas pessoas (fração) há ali; a soma do mapa é a contagem.
import { carregarScript } from "./estado.js";

const ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/";
const MODELO = new URL("../../modelos/dmcount_qnrf_int8.onnx", import.meta.url).href;
const MEDIA = [0.485, 0.456, 0.406], DESVIO = [0.229, 0.224, 0.225]; // normalização ImageNet
const BLOCO = 512;

let sessao = null;
async function obterSessao(status) {
  if (sessao) return sessao;
  status?.("Carregando o modelo de IA (≈22 MB, só na primeira vez)…");
  await carregarScript(ORT + "ort.min.js");
  const ort = window.ort;
  ort.env.wasm.wasmPaths = ORT;
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
  sessao = await ort.InferenceSession.create(MODELO, { executionProviders: ["wasm"] });
  return sessao;
}

const cache = new Map();

/**
 * Conta pessoas numa imagem.
 * @param fonte  HTMLImageElement ou canvas
 * @param ladoMax lado maior (px) em que a imagem é processada — define a escala
 * @returns {mapa, mw, mh, fator, total} — fator = px da imagem original por célula do mapa
 */
export async function contarIA(fonte, ladoMax = 2048, chave = null, progresso, status) {
  const k = chave && `${chave}@${ladoMax}`;
  if (k && cache.has(k)) return cache.get(k);
  const s = await obterSessao(status);
  const ort = window.ort;
  const W0 = fonte.naturalWidth || fonte.width, H0 = fonte.naturalHeight || fonte.height;
  const esc = Math.min(4, ladoMax / Math.max(W0, H0));
  const W = Math.round(W0 * esc), H = Math.round(H0 * esc);
  const tela = document.createElement("canvas");
  tela.width = W; tela.height = H;
  const g = tela.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingQuality = "high";
  g.drawImage(fonte, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;

  const mw = Math.ceil(W / 8), mh = Math.ceil(H / 8);
  const mapa = new Float32Array(mw * mh);
  const blocos = [];
  for (let y = 0; y < H; y += BLOCO) for (let x = 0; x < W; x += BLOCO) blocos.push([x, y]);
  let feitos = 0;
  status?.("IA analisando a imagem…");
  for (const [bx, by] of blocos) {
    const bw = Math.min(BLOCO, W - bx), bh = Math.min(BLOCO, H - by);
    const pw = Math.ceil(bw / 16) * 16, ph = Math.ceil(bh / 16) * 16; // múltiplo de 16 exigido pela rede
    const t = new Float32Array(3 * pw * ph);
    for (let y = 0; y < ph; y++) {
      const yy = by + Math.min(y, bh - 1); // repete a borda no preenchimento
      for (let x = 0; x < pw; x++) {
        const xx = bx + Math.min(x, bw - 1), o = 4 * (yy * W + xx), d = y * pw + x;
        for (let c = 0; c < 3; c++) t[c * pw * ph + d] = (px[o + c] / 255 - MEDIA[c]) / DESVIO[c];
      }
    }
    const saida = await s.run({ imagem: new ort.Tensor("float32", t, [1, 3, ph, pw]) });
    const d = saida.densidade, dw = d.dims[3];
    const vw = Math.ceil(bw / 8), vh = Math.ceil(bh / 8);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const my = by / 8 + y, mx = bx / 8 + x;
      if (my < mh && mx < mw) mapa[my * mw + mx] += d.data[y * dw + x];
    }
    progresso?.(++feitos / blocos.length);
    await new Promise((r) => setTimeout(r));
  }
  const total = mapa.reduce((a, b) => a + b, 0);
  const r = { mapa, mw, mh, fator: 8 / esc, total, ladoMax, escala: esc };
  if (k) cache.set(k, r);
  return r;
}

/** Soma o mapa de densidade dentro de um polígono (coordenadas da imagem original). */
export function somarNoPoligono(r, poligono, dentro) {
  let s = 0;
  for (let y = 0; y < r.mh; y++) for (let x = 0; x < r.mw; x++) {
    if (dentro((x + 0.5) * r.fator, (y + 0.5) * r.fator, poligono)) s += r.mapa[y * r.mw + x];
  }
  return s;
}

/** Gera um canvas colorido (mapa de calor) do tamanho do mapa de densidade. */
export function mapaDeCalor(r) {
  const c = document.createElement("canvas");
  c.width = r.mw; c.height = r.mh;
  const g = c.getContext("2d"), im = g.createImageData(r.mw, r.mh);
  const ord = Array.from(r.mapa).filter((v) => v > 1e-4).sort((a, b) => a - b);
  const topo = ord[Math.floor(ord.length * 0.99)] || 1;
  for (let i = 0; i < r.mapa.length; i++) {
    const v = Math.min(1, r.mapa[i] / topo);
    // escala "viridis" simplificada
    const R = Math.round(255 * Math.min(1, Math.max(0, 1.6 * v - 0.4)));
    const G = Math.round(255 * Math.min(1, 0.15 + 0.9 * v));
    const B = Math.round(255 * Math.max(0, 0.55 - 0.6 * v));
    const o = 4 * i;
    im.data[o] = R; im.data[o + 1] = G; im.data[o + 2] = B; im.data[o + 3] = v < 0.03 ? 0 : Math.round(80 + 150 * v);
  }
  g.putImageData(im, 0, 0);
  return c;
}
