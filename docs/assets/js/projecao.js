// Etapa 3 — Projeção das fotos no mapa (ortorretificação simplificada, supondo chão plano).
// Para cada foto, a pessoa marca pares de pontos NO CHÃO: um na foto, o mesmo no mapa/ortofoto.
// Com N ≥ 4 pares, uma homografia (mínimos quadrados) leva a foto ao chão, em metros.
// Todas as fotos projetadas formam um ORTOMOSAICO: a avenida vista de cima, em escala.
import { estado, avisar, ouvir, salvarLocal } from "./estado.js";
import { homografiaMQ, aplicarH, inverter3, sistemaLocal, contornoCorredor, fmt } from "./matematica.js";
import { criarCamadasBase } from "./camadas.js";

const $ = (id) => document.getElementById(id);
let mapa, camadaPares, camadaMosaico = null, marcadorCursor = null, local = null;
let fotoAtual = null, esc = 1, zoom = 1;
let pendentes = []; // pontos clicados na foto à espera do clique no mapa (Ctrl + clique enfileira vários)
let previsto = null, arrasto = null, ignorarClique = false; // marcador de prévia no mapa; par arrastado na foto
let desfeitos = {}; // pares removidos por foto, para Refazer
const cv = () => $("proj-canvas");

/** Pares e homografia da foto (chaveados pelo SHA-256, para sobreviverem a recarregar/importar). */
function geo(f) {
  estado.georef[f.hash] ||= { foto: f.nome, pares: [] };
  return estado.georef[f.hash];
}

function sistema() {
  // origem fixa do sistema local: primeiro ponto de mapa marcado em qualquer foto
  if (local) return local;
  const p = Object.values(estado.georef).flatMap((g) => g.pares)[0];
  local = sistemaLocal(p ? p.mapa : [-23.5614, -46.6559]);
  return local;
}

function recalcular(g) {
  g.H = null; g.rms = null; g.residuos = null;
  if (g.pares.length < 4) return;
  const S = sistema();
  try {
    const r = homografiaMQ(g.pares.map((p) => p.foto), g.pares.map((p) => S.paraMetros(p.mapa)));
    Object.assign(g, { H: r.H.map((v) => +v.toPrecision(10)), rms: +r.rms.toFixed(2), residuos: r.residuos.map((v) => +v.toFixed(2)), origem: S.origem });
  } catch (e) { console.warn(e); }
}

// ---------- Desenho ----------
function desenharFoto() {
  const c = cv(), g = c.getContext("2d");
  $("proj-area").classList.toggle("vazia", !fotoAtual);
  if (!fotoAtual) { c.width = 10; c.height = 10; return; }
  const img = fotoAtual.img, W = img.naturalWidth, H = img.naturalHeight;
  const area = $("proj-area"); // a foto inteira cabe no quadro (largura e altura); o zoom amplia a partir daí
  esc = Math.min(1, (area.clientWidth || 600) / W, (area.clientHeight || 560) / H) * zoom;
  c.width = Math.round(W * esc); c.height = Math.round(H * esc);
  g.drawImage(img, 0, 0, c.width, c.height);
  const gr = geo(fotoAtual);
  gr.pares.forEach((p, i) => marca(g, p.foto, i + 1, gr.residuos?.[i]));
  pendentes.forEach((p, k) => marca(g, p, gr.pares.length + 1 + k, null, true));
}
function marca(g, [x, y], n, res, pend = false) {
  const X = x * esc, Y = y * esc;
  g.lineWidth = 2; g.strokeStyle = pend ? "#ff3f8e" : "#ffd23f"; g.fillStyle = g.strokeStyle;
  g.beginPath(); g.arc(X, Y, 6, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(X - 10, Y); g.lineTo(X + 10, Y); g.moveTo(X, Y - 10); g.lineTo(X, Y + 10); g.stroke();
  g.font = "bold 14px system-ui"; g.fillText(n + (res != null ? ` (${res.toFixed(1)} m)` : ""), X + 8, Y - 8);
}

const iconePar = (cls) => L.divIcon({ className: `marca-par ${cls}`, iconSize: cls ? [22, 22] : [14, 14] });
function parAlterado(gr) { recalcular(gr); salvarLocal(); desenharFoto(); desenharMapa(); avisar("georef"); }

function desenharMapa() {
  camadaPares.clearLayers();
  if (!fotoAtual) return;
  const gr = geo(fotoAtual), S = sistema();
  gr.pares.forEach((p, i) => {
    L.marker(p.mapa, { icon: iconePar(""), draggable: true, title: "Arraste para corrigir" })
      .bindTooltip(`${i + 1}`, { permanent: true, direction: "right", className: "rotulo-par" })
      .on("dragend", (e) => { const ll = e.target.getLatLng(); p.mapa = [+ll.lat.toFixed(7), +ll.lng.toFixed(7)]; parAlterado(gr); })
      .addTo(camadaPares);
    if (gr.H) { // vetor de resíduo: onde a homografia "acha" que o ponto da foto cai
      const q = S.paraLatLon(aplicarH(gr.H, p.foto));
      L.polyline([p.mapa, q], { color: "#e0245e", weight: 2 }).addTo(camadaPares);
    }
  });
  listarPares();
}

function listarPares() {
  const gr = fotoAtual && geo(fotoAtual), el = $("proj-pares");
  if (!gr) { el.innerHTML = ""; return; }
  const n = gr.pares.length;
  el.innerHTML = `<p class="pequeno">${n} par(es) nesta foto. ${n < 4 ? `<b>Faltam ${4 - n}</b> (mínimo 4; recomendado 6 a 10, espalhados).`
      : `Erro médio (RMS): <b class="${gr.rms < 3 ? "ok" : "erro"}">${fmt(gr.rms, 1)} m</b>. ${gr.rms < 3 ? "Bom ajuste." : "Ajuste fraco: revise os pontos com maior erro."}`}</p>
    ${n ? `<table><tr><th>#</th><th class="num">Foto (px)</th><th class="num">Mapa (lat, lon)</th><th class="num">Erro</th><th></th></tr>
    ${gr.pares.map((p, i) => `<tr><td>${i + 1}</td><td class="num">${p.foto.map((v) => v.toFixed(0)).join(", ")}</td>
      <td class="num">${p.mapa.map((v) => v.toFixed(6)).join(", ")}</td><td class="num">${gr.residuos ? gr.residuos[i].toFixed(1) + " m" : "—"}</td>
      <td><button data-del="${i}" title="Apagar par">🗑</button></td></tr>`).join("")}</table>` : ""}
    ${gr.H ? `<details><summary class="pequeno">Matriz H (foto → chão, em metros)</summary><div class="formula">${[0, 3, 6].map((k) => gr.H.slice(k, k + 3).map((v) => v.toExponential(4).padStart(12)).join(" ")).join("\n")}</div></details>` : ""}`;
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    gr.pares.splice(+b.dataset.del, 1); recalcular(gr); salvarLocal(); desenharFoto(); desenharMapa();
  }));
}

function dica(t) { $("proj-dica").textContent = t; }

// ---------- Ortomosaico ----------
/**
 * Projeta todas as fotos com homografia no chão, numa grade em metros.
 * Em cada pixel do chão fica a foto com MELHOR resolução ali (mais pixels por metro).
 * Pixels com menos de `pxPorMetroMin` são descartados: longe demais, esticados demais para servir.
 */
export async function gerarOrtomosaico(mpp = 0.3, pxPorMetroMin = 3, progresso, recortarZonas = false) {
  const S = sistema();
  const itens = estado.fotos.map((f) => ({ f, g: estado.georef[f.hash] })).filter((x) => x.g?.H);
  if (!itens.length) throw new Error("Nenhuma foto com 4 ou mais pares.");
  // Pegada (footprint) de cada foto no chão
  for (const it of itens) {
    const H = it.g.H, Hi = inverter3(H);
    // garante w > 0 nos pontos de controle (convenção de sinal da homografia)
    const g0 = S.paraMetros(it.g.pares[0].mapa);
    const sgn = Math.sign(Hi[6] * g0[0] + Hi[7] * g0[1] + Hi[8]) || 1;
    it.Hi = Hi.map((v) => v * sgn);
    it.detHi = Math.abs(it.Hi[0] * (it.Hi[4] * it.Hi[8] - it.Hi[5] * it.Hi[7]) - it.Hi[1] * (it.Hi[3] * it.Hi[8] - it.Hi[5] * it.Hi[6]) + it.Hi[2] * (it.Hi[3] * it.Hi[7] - it.Hi[4] * it.Hi[6]));
    const W = it.f.largura, Ht = it.f.altura;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let y = 0; y <= Ht; y += Ht / 60) for (let x = 0; x <= W; x += W / 60) {
      const w = H[6] * x + H[7] * y + H[8];
      const [gx, gy] = aplicarH(H, [x, y]);
      const w2 = it.Hi[6] * gx + it.Hi[7] * gy + it.Hi[8];
      if (!(w2 > 0) || !isFinite(gx) || w === 0) continue;
      if (Math.sqrt(it.detHi / w2 ** 3) < pxPorMetroMin) continue;
      if (Math.hypot(gx - g0[0], gy - g0[1]) > 3500) continue; // perto do horizonte: longe demais
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
    }
    it.bbox = isFinite(x0) ? [x0, y0, x1, y1] : null;
  }
  const validos = itens.filter((it) => it.bbox);
  let X0 = Math.min(...validos.map((i) => i.bbox[0])), Y0 = Math.min(...validos.map((i) => i.bbox[1]));
  let X1 = Math.max(...validos.map((i) => i.bbox[2])), Y1 = Math.max(...validos.map((i) => i.bbox[3]));
  if (recortarZonas && estado.zonas.length) {
    const pz = estado.zonas.flatMap((z) => (z.tipo === "corredor" ? contornoCorredor(z.pontos, z.largura) : z.pontos)).map((ll) => S.paraMetros(ll));
    X0 = Math.max(X0, Math.min(...pz.map((p) => p[0]))); X1 = Math.min(X1, Math.max(...pz.map((p) => p[0])));
    Y0 = Math.max(Y0, Math.min(...pz.map((p) => p[1]))); Y1 = Math.min(Y1, Math.max(...pz.map((p) => p[1])));
  }
  const MAXPX = 30e6;
  while (((X1 - X0) / mpp) * ((Y1 - Y0) / mpp) > MAXPX) mpp *= 1.25;
  const W = Math.ceil((X1 - X0) / mpp), Ht = Math.ceil((Y1 - Y0) / mpp);
  const saida = new ImageData(W, Ht), melhor = new Float32Array(W * Ht), dados = saida.data;
  // Recorte opcional: só pinta dentro das zonas (evita prédios e árvores "deitados" fora da rua)
  let mascara = null;
  if (recortarZonas && estado.zonas.length) {
    const mc = document.createElement("canvas"); mc.width = W; mc.height = Ht;
    const mg = mc.getContext("2d", { willReadFrequently: true }); mg.fillStyle = "#fff";
    for (const z of estado.zonas) {
      const contorno = z.tipo === "corredor" ? contornoCorredor(z.pontos, z.largura) : z.pontos;
      mg.beginPath();
      contorno.forEach((ll, i) => { const [x, y] = S.paraMetros(ll); const X = (x - X0) / mpp, Y = (Y1 - y) / mpp; i ? mg.lineTo(X, Y) : mg.moveTo(X, Y); });
      mg.closePath(); mg.fill();
    }
    const md = mg.getImageData(0, 0, W, Ht).data;
    mascara = new Uint8Array(W * Ht);
    for (let i = 0; i < mascara.length; i++) mascara[i] = md[4 * i + 3] > 0;
  }
  let k = 0;
  for (const it of validos) {
    const img = it.f.img, iw = img.naturalWidth, ih = img.naturalHeight;
    const tmp = document.createElement("canvas"); tmp.width = iw; tmp.height = ih;
    const tg = tmp.getContext("2d", { willReadFrequently: true }); tg.drawImage(img, 0, 0);
    const px = tg.getImageData(0, 0, iw, ih).data, Hi = it.Hi;
    const [bx0, by0, bx1, by1] = it.bbox;
    const i0 = Math.max(0, Math.floor((bx0 - X0) / mpp)), i1 = Math.min(W, Math.ceil((bx1 - X0) / mpp));
    const j0 = Math.max(0, Math.floor((Y1 - by1) / mpp)), j1 = Math.min(Ht, Math.ceil((Y1 - by0) / mpp));
    for (let j = j0; j < j1; j++) {
      const gy = Y1 - (j + 0.5) * mpp;
      for (let i = i0; i < i1; i++) {
        const gx = X0 + (i + 0.5) * mpp;
        const w2 = Hi[6] * gx + Hi[7] * gy + Hi[8];
        if (w2 <= 0) continue;
        const s = Math.sqrt(it.detHi / (w2 * w2 * w2)); // pixels da foto por metro de chão
        const o = j * W + i;
        if (s < pxPorMetroMin || s <= melhor[o] || (mascara && !mascara[o])) continue;
        const u = (Hi[0] * gx + Hi[1] * gy + Hi[2]) / w2, v = (Hi[3] * gx + Hi[4] * gy + Hi[5]) / w2;
        if (u < 0 || v < 0 || u >= iw - 1 || v >= ih - 1) continue;
        const ux = u | 0, vy = v | 0, fx = u - ux, fy = v - vy, b = 4 * (vy * iw + ux);
        for (let c = 0; c < 3; c++) {
          const a = px[b + c] * (1 - fx) + px[b + 4 + c] * fx;
          const d = px[b + 4 * iw + c] * (1 - fx) + px[b + 4 * iw + 4 + c] * fx;
          dados[4 * o + c] = a * (1 - fy) + d * fy;
        }
        dados[4 * o + 3] = 255; melhor[o] = s;
      }
      if (j % 64 === 0) { progresso?.((k + (j - j0) / (j1 - j0 || 1)) / validos.length); await new Promise((r) => setTimeout(r)); }
    }
    k++;
  }
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = Ht;
  canvas.getContext("2d").putImageData(saida, 0, 0);
  const bounds = [S.paraLatLon([X0, Y0]), S.paraLatLon([X1, Y1])];
  estado.ortomosaico = { id: "orto", nome: `Ortomosaico (${validos.length} fotos, ${mpp.toFixed(2)} m/px)`, canvas, bounds,
    metrosPorPixel: mpp, largura: W, altura: Ht, fotos: validos.map((it) => it.f.nome), pxPorMetroMin, recortado: !!mascara,
    ...mapaResolucao(melhor, W, Ht, mpp), resolucao: melhor, X0, Y1 };
  return estado.ortomosaico;
}

// ---------- Mapa de resolução ----------
// Quantos pixels da foto original cobrem 1 metro de chão. Uma cabeça tem ≈0,2 m e uma pessoa ocupa ≈0,5 m de largura;
// as classes dizem o que dá para fazer com a imagem naquele trecho.
export const CLASSES_RESOLUCAO = [
  { min: 0, cor: [255, 255, 204], rotulo: "menos de 3", uso: "só mostra se há gente (uma pessoa ocupa 1 a 2 px)" },
  { min: 3, cor: [161, 218, 180], rotulo: "3 a 10", uso: "textura da multidão: densidade só por comparação visual" },
  { min: 10, cor: [65, 182, 196], rotulo: "10 a 25", uso: "cabeças com 2 a 5 px: a IA pode funcionar, com cautela" },
  { min: 25, cor: [34, 94, 168], rotulo: "25 ou mais", uso: "cabeças com 5 px ou mais: dá para contar pessoas" },
];
const classeDe = (s) => { let k = 0; while (k + 1 < CLASSES_RESOLUCAO.length && s >= CLASSES_RESOLUCAO[k + 1].min) k++; return k; };

function mapaResolucao(melhor, W, Ht, mpp) {
  const img = new ImageData(W, Ht), d = img.data, area = CLASSES_RESOLUCAO.map(() => 0);
  for (let o = 0; o < melhor.length; o++) {
    if (!melhor[o]) continue;
    const k = classeDe(melhor[o]), [r, g, b] = CLASSES_RESOLUCAO[k].cor;
    d[4 * o] = r; d[4 * o + 1] = g; d[4 * o + 2] = b; d[4 * o + 3] = 255;
    area[k] += mpp * mpp;
  }
  const canvasResolucao = document.createElement("canvas"); canvasResolucao.width = W; canvasResolucao.height = Ht;
  canvasResolucao.getContext("2d").putImageData(img, 0, 0);
  return { canvasResolucao, areaPorClasse: area.map((a) => Math.round(a)) };
}

function legendaResolucao() {
  const m = estado.ortomosaico, el = $("proj-legenda");
  if (!m || $("proj-camada").value !== "resolucao") { el.innerHTML = ""; return; }
  const total = m.areaPorClasse.reduce((a, b) => a + b, 0) || 1;
  el.innerHTML = `<table><tr><th></th><th class="num">Pixels da foto por metro</th><th class="num">Área</th><th>O que dá para fazer</th></tr>
    ${CLASSES_RESOLUCAO.map((c, k) => `<tr><td><span class="amostra-cor" style="background:rgb(${c.cor})"></span></td>
      <td class="num">${c.rotulo}</td><td class="num">${fmt(m.areaPorClasse[k])} m² (${fmt(100 * m.areaPorClasse[k] / total, 1)}%)</td><td>${c.uso}</td></tr>`).join("")}</table>
    <p class="pequeno suave">A resolução é a da <b>foto original</b> em cada ponto do chão. O ortomosaico em si tem
    ${fmt(1 / m.metrosPorPixel, 1)} px/m (${fmt(m.metrosPorPixel, 2)} m/px), suficiente para ver a extensão da multidão,
    mas não para contar pessoas: nos trechos azuis, meça a densidade na <b>foto original</b> (etapa 5). Passe o mouse no mapa para ver o valor de cada ponto.</p>`;
}

function mostrarResolucaoNoCursor(e) {
  const m = estado.ortomosaico;
  if (!m?.resolucao || $("proj-camada").value !== "resolucao") { fecharDicaResolucao(); return; }
  const [gx, gy] = sistema().paraMetros([e.latlng.lat, e.latlng.lng]);
  const i = Math.floor((gx - m.X0) / m.metrosPorPixel), j = Math.floor((m.Y1 - gy) / m.metrosPorPixel);
  const s = i >= 0 && j >= 0 && i < m.largura && j < m.altura ? m.resolucao[j * m.largura + i] : 0;
  if (!s) { fecharDicaResolucao(); return; }
  dicaResolucao ||= L.tooltip({ direction: "top", offset: [0, -8] });
  dicaResolucao.setLatLng(e.latlng).setContent(`${fmt(s, 1)} px/m · uma pessoa (0,5 m) ≈ ${fmt(s / 2, 1)} px`);
  if (!mapa.hasLayer(dicaResolucao)) dicaResolucao.addTo(mapa);
}
let dicaResolucao = null;
function fecharDicaResolucao() {
  if (dicaResolucao && mapa.hasLayer(dicaResolucao)) mapa.removeLayer(dicaResolucao);
}

function mostrarMosaicoNoMapa() {
  if (camadaMosaico) mapa.removeLayer(camadaMosaico);
  const m = estado.ortomosaico;
  if (!m) return;
  const c = $("proj-camada").value === "resolucao" ? m.canvasResolucao : m.canvas;
  camadaMosaico = L.imageOverlay(c.toDataURL("image/png"), m.bounds, { opacity: +$("proj-opac").value }).addTo(mapa);
  legendaResolucao();
}

// ---------- Interação ----------
function cliqueFoto(e) {
  if (!fotoAtual) return;
  if (ignorarClique) { ignorarClique = false; return; } // fim de um arrasto, não um clique
  const p = pontoDoMouse(e);
  // Ctrl + clique: modo lote. Enfileira vários pontos na foto; depois cada clique no mapa completa o primeiro da fila.
  if (e.ctrlKey || e.metaKey) pendentes.push(p); else pendentes = [p];
  mostrarProximo(true);
  desenharFoto();
}
/** Prévia (marcador rosa) e dica para o primeiro ponto da fila. */
function mostrarProximo(mover) {
  const gr = geo(fotoAtual);
  if (!pendentes.length) { if (previsto) mapa.removeLayer(previsto); return; }
  const n = gr.pares.length + 1, resto = pendentes.length > 1 ? ` Na fila: ${pendentes.length} pontos (${n} a ${n + pendentes.length - 1}), clique no mapa na mesma ordem.` : "";
  const ll = gr.H && paraChao(gr, pendentes[0]);
  if (ll) {
    if (!mover || pendentes.length === 1) mapa.setView(ll, Math.max(mapa.getZoom(), 19));
    previsto ||= L.marker(ll, { icon: iconePar("prevista"), draggable: true, title: "Arraste até o ponto certo e tecle Enter", zIndexOffset: 1000 });
    previsto.setLatLng(ll).addTo(mapa);
    dica(`Par ${n}: o marcador rosa mostra onde o ponto deve estar. Arraste-o e tecle Enter, ou clique no lugar certo do mapa.${resto} Esc cancela.`);
  } else {
    if (previsto) mapa.removeLayer(previsto);
    dica(`Agora clique no MESMO ponto no mapa (par ${n}).${resto} Esc cancela.`);
  }
}
function cancelarPendente() {
  pendentes = [];
  if (previsto) mapa.removeLayer(previsto);
}
function confirmarPar(latlng) {
  const gr = geo(fotoAtual), p = pendentes.shift();
  gr.pares.push({ foto: p.map((v) => +v.toFixed(1)), mapa: [+latlng.lat.toFixed(7), +latlng.lng.toFixed(7)] });
  desfeitos[fotoAtual.hash] = []; // um par novo encerra a sequência de Refazer
  parAlterado(gr);
  if (pendentes.length) { mostrarProximo(false); return; }
  if (previsto) mapa.removeLayer(previsto);
  dica(gr.pares.length < 4 ? `Par salvo. Marque mais ${4 - gr.pares.length}.` : "Par salvo. Clique no próximo ponto na foto (Ctrl + clique para marcar vários de uma vez). Para corrigir um par, arraste o marcador.");
}
function cliqueMapa(e) {
  if (!fotoAtual) return;
  if (!pendentes.length) { dica("Primeiro clique no ponto na FOTO, depois no mapa."); return; }
  confirmarPar(e.latlng);
}
function desfazer() {
  if (!fotoAtual) return;
  if (pendentes.length) { pendentes.pop(); mostrarProximo(false); desenharFoto(); return; } // primeiro tira da fila
  const g = geo(fotoAtual);
  if (!g.pares.length) return;
  (desfeitos[fotoAtual.hash] ||= []).push(g.pares.pop());
  dica(`Par ${g.pares.length + 1} removido. Use "Refazer" (Ctrl+Y) para recolocá-lo.`);
  parAlterado(g);
}
function refazer() {
  const pilha = fotoAtual && desfeitos[fotoAtual.hash];
  if (!pilha?.length) return;
  const g = geo(fotoAtual);
  g.pares.push(pilha.pop());
  dica(`Par ${g.pares.length} recolocado.`);
  parAlterado(g);
}

// Arrastar um par na foto: aperta sobre a marca, arrasta, solta.
function parSobMouse(e) {
  const gr = fotoAtual && geo(fotoAtual);
  if (!gr) return -1;
  const p = pontoDoMouse(e);
  let melhor = -1, dmin = 12; // px na tela
  gr.pares.forEach((q, i) => { const d = Math.hypot(q.foto[0] - p[0], q.foto[1] - p[1]) * esc; if (d < dmin) { dmin = d; melhor = i; } });
  return melhor;
}
function apertarFoto(e) {
  if (e.button !== 0 || pendentes.length || e.ctrlKey || e.metaKey) return;
  const i = parSobMouse(e);
  if (i < 0) return;
  arrasto = i; ignorarClique = true; e.preventDefault();
}
function arrastarFoto(e) {
  if (arrasto == null) { cv().style.cursor = parSobMouse(e) >= 0 && !pendentes.length && !e.ctrlKey ? "move" : ""; return; }
  const p = pontoDoMouse(e), { largura: W, altura: H } = fotoAtual;
  geo(fotoAtual).pares[arrasto].foto = [+Math.min(W, Math.max(0, p[0])).toFixed(1), +Math.min(H, Math.max(0, p[1])).toFixed(1)];
  desenharFoto();
}
function soltarFoto() {
  if (arrasto == null) return;
  arrasto = null; parAlterado(geo(fotoAtual));
}

function teclas(e) {
  if (!$("painel-projecao").classList.contains("ativo") || !fotoAtual) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "Escape" && pendentes.length) { cancelarPendente(); desenharFoto(); dica("Pontos pendentes cancelados."); }
  else if (e.key === "Enter" && pendentes.length && previsto && mapa.hasLayer(previsto)) { e.preventDefault(); confirmarPar(previsto.getLatLng()); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); refazer(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); desfazer(); }
  else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); if (!e.repeat) desfazer(); } // segurar a tecla não apaga tudo
}
/** Ponto da foto → lat/lon no chão, ou null se cair atrás da câmera (acima do horizonte) ou longe demais. */
function paraChao(gr, p) {
  const H = gr.H, w = H[6] * p[0] + H[7] * p[1] + H[8];
  const q = gr.pares[0].foto, w0 = H[6] * q[0] + H[7] * q[1] + H[8]; // os pares estão no chão: definem o lado certo
  if (!(w * w0 > 0)) return null;
  const ll = sistema().paraLatLon(aplicarH(H, p));
  return isFinite(ll[0]) && Math.abs(ll[0] - sistema().origem[0]) < 0.05 ? ll : null;
}
/** Pixels da foto por metro de chão no ponto p (inverso da raiz do jacobiano da homografia). */
function pxPorMetro(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  const det = H[0] * (H[4] * H[8] - H[5] * H[7]) - H[1] * (H[3] * H[8] - H[5] * H[6]) + H[2] * (H[3] * H[7] - H[4] * H[6]);
  return Math.sqrt(Math.abs(w ** 3 / det));
}
const pontoDoMouse = (e) => {
  const r = cv().getBoundingClientRect();
  return [((e.clientX - r.left) * (cv().width / r.width)) / esc, ((e.clientY - r.top) * (cv().height / r.height)) / esc];
};

function moverFoto(e) {
  const gr = fotoAtual && geo(fotoAtual);
  if (!gr?.H) return;
  const ll = paraChao(gr, pontoDoMouse(e));
  if (!ll) return;
  marcadorCursor ||= L.circleMarker(ll, { radius: 7, color: "#e0245e", weight: 3, fill: false }).addTo(mapa);
  marcadorCursor.setLatLng(ll);
  if (!mapa.getBounds().pad(-0.1).contains(ll)) mapa.panTo(ll); // o mapa acompanha o mouse
}

/**
 * Enquadra no mapa o chão que a foto mostra com detalhe (≥ 3 px/m), em vez da avenida inteira.
 * Sem homografia, enquadra os pares já marcados.
 */
function enquadrar() {
  const gr = fotoAtual && geo(fotoAtual);
  if (!gr?.pares.length || !mapa.getSize().x) return;
  let pts = [];
  if (gr.H) {
    const { largura: W, altura: Ht } = fotoAtual;
    for (let j = 0; j <= 20; j++) for (let i = 0; i <= 20; i++) {
      const p = [(i / 20) * W, (j / 20) * Ht], ll = paraChao(gr, p);
      if (ll && pxPorMetro(gr.H, p) >= 3) pts.push(ll);
    }
  }
  if (pts.length < 3) pts = gr.pares.map((p) => p.mapa);
  mapa.fitBounds(L.latLngBounds(pts).pad(0.1), { maxZoom: 20 });
}

function trocarFoto() {
  fotoAtual = estado.fotos.find((f) => f.id === $("proj-foto").value) || null;
  cancelarPendente(); desenharFoto(); desenharMapa();
  enquadrar();
  dica(fotoAtual ? "Clique num ponto do CHÃO na foto (canto de faixa de pedestres, base de poste, quina de calçada) e depois no mesmo ponto no mapa. Use a roda do mouse para ampliar a foto." : "Envie fotos na etapa 1.");
}

export function projecaoVisivel() {
  mapa.invalidateSize(); desenharFoto(); enquadrar();
}

export function iniciarProjecao() {
  estado.georef ||= {};
  mapa = L.map("proj-mapa", { doubleClickZoom: false, maxZoom: 21 }).setView([-23.5614, -46.6559], 17);
  criarCamadasBase(mapa, "orto");
  L.control.scale({ imperial: false }).addTo(mapa);
  camadaPares = L.layerGroup().addTo(mapa);
  mapa.on("click", cliqueMapa);
  cv().addEventListener("click", cliqueFoto);
  cv().addEventListener("mousemove", moverFoto);
  cv().addEventListener("mousedown", apertarFoto);
  cv().addEventListener("mousemove", arrastarFoto);
  window.addEventListener("mouseup", soltarFoto);
  document.addEventListener("keydown", teclas);
  // Roda do mouse: zoom na foto mantendo fixo o ponto sob o cursor
  cv().addEventListener("wheel", (e) => {
    if (!fotoAtual) return;
    e.preventDefault();
    const area = $("proj-area"), p = pontoDoMouse(e), r = area.getBoundingClientRect();
    zoom = Math.max(1, Math.min(8, zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
    desenharFoto();
    area.scrollLeft = cv().offsetLeft + p[0] * esc - (e.clientX - r.left);
    area.scrollTop = cv().offsetTop + p[1] * esc - (e.clientY - r.top);
  }, { passive: false });
  const sel = $("proj-foto");
  const opcoes = () => {
    const atual = sel.value;
    sel.innerHTML = estado.fotos.map((f, i) => {
      const n = estado.georef[f.hash]?.pares.length || 0;
      return `<option value="${f.id}">${i + 1}. ${f.nome} — ${n} par(es)</option>`;
    }).join("");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual;
    if (!fotoAtual || fotoAtual.id !== sel.value) trocarFoto();
  };
  ouvir("fotos", opcoes); ouvir("georef", opcoes);
  ouvir("importado", () => { Object.values(estado.georef).forEach(recalcular); opcoes(); desenharMapa(); });
  sel.onchange = trocarFoto;
  $("proj-desfazer").onclick = desfazer;
  $("proj-refazer").onclick = refazer;
  for (const [t, f] of [["−", 1 / 1.5], ["+", 1.5]]) {
    const b = document.createElement("button"); b.textContent = t; b.title = "Zoom na foto";
    b.onclick = () => { zoom = Math.max(0.5, Math.min(8, zoom * f)); desenharFoto(); };
    $("proj-zoom").appendChild(b);
  }
  $("proj-opac").oninput = () => camadaMosaico?.setOpacity(+$("proj-opac").value);
  $("proj-camada").onchange = mostrarMosaicoNoMapa;
  mapa.on("mousemove", mostrarResolucaoNoCursor);
  mapa.on("mouseout", fecharDicaResolucao);
  $("proj-gerar").onclick = async () => {
    const b = $("proj-gerar"); b.disabled = true;
    try {
      const m = await gerarOrtomosaico(+$("proj-res").value, +$("proj-min").value, (p) => ($("proj-prog").style.width = `${Math.round(p * 100)}%`), $("proj-recorte").checked);
      $("proj-prog").style.width = "100%";
      $("proj-status").innerHTML = `<span class="ok">${m.nome}</span>: ${m.largura}×${m.altura} px, cobrindo ${fmt(m.largura * m.metrosPorPixel)} × ${fmt(m.altura * m.metrosPorPixel)} m.
        Ele aparece no mapa ao lado e na etapa "Área", e pode ser usado na etapa "Densidade" (já em escala, sem retângulo de referência).`;
      $("proj-baixar").disabled = false;
      mostrarMosaicoNoMapa(); avisar("ortomosaico");
    } catch (e) { $("proj-status").innerHTML = `<span class="erro">${e.message}</span>`; console.error(e); }
    b.disabled = false;
  };
  $("proj-baixar").onclick = () => {
    const a = document.createElement("a"); a.download = "ortomosaico.png"; a.href = estado.ortomosaico.canvas.toDataURL("image/png"); a.click();
  };
  window.addEventListener("resize", () => fotoAtual && desenharFoto());
  $("proj-tela").onclick = () => (document.fullscreenElement ? document.exitFullscreen() : $("proj-trabalho").requestFullscreen());
  document.addEventListener("fullscreenchange", () => {
    $("proj-tela").textContent = document.fullscreenElement ? "Sair da tela cheia" : "⛶ Tela cheia";
    setTimeout(() => { mapa.invalidateSize(); desenharFoto(); }, 100);
  });
  return mapa;
}
