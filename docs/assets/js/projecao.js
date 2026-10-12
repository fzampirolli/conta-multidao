// Etapa 3 — Projeção das fotos no mapa (ortorretificação simplificada, supondo chão plano).
// Para cada foto, a pessoa marca pares de pontos NO CHÃO: um na foto, o mesmo no mapa/ortofoto.
// Com N ≥ 4 pares, uma homografia (mínimos quadrados) leva a foto ao chão, em metros.
// Todas as fotos projetadas formam um ORTOMOSAICO: a avenida vista de cima, em escala.
import { estado, avisar, ouvir, salvarLocal } from "./estado.js";
import { homografiaMQ, aplicarH, inverter3, sistemaLocal, contornoCorredor, fmt } from "./matematica.js";
import { criarCamadasBase } from "./camadas.js";

const $ = (id) => document.getElementById(id);
let mapa, camadaPares, camadaMosaico = null, marcadorCursor = null, local = null;
let fotoAtual = null, pendente = null, esc = 1, zoom = 1;
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
  if (!fotoAtual) { c.width = 10; c.height = 10; return; }
  const img = fotoAtual.img, W = img.naturalWidth, H = img.naturalHeight;
  esc = Math.min(1, ($("proj-area").clientWidth || 600) / W) * zoom;
  c.width = Math.round(W * esc); c.height = Math.round(H * esc);
  g.drawImage(img, 0, 0, c.width, c.height);
  const gr = geo(fotoAtual);
  gr.pares.forEach((p, i) => marca(g, p.foto, i + 1, gr.residuos?.[i]));
  if (pendente) marca(g, pendente, gr.pares.length + 1, null, true);
}
function marca(g, [x, y], n, res, pend = false) {
  const X = x * esc, Y = y * esc;
  g.lineWidth = 2; g.strokeStyle = pend ? "#ff3f8e" : "#ffd23f"; g.fillStyle = g.strokeStyle;
  g.beginPath(); g.arc(X, Y, 6, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(X - 10, Y); g.lineTo(X + 10, Y); g.moveTo(X, Y - 10); g.lineTo(X, Y + 10); g.stroke();
  g.font = "bold 14px system-ui"; g.fillText(n + (res != null ? ` (${res.toFixed(1)} m)` : ""), X + 8, Y - 8);
}

function desenharMapa() {
  camadaPares.clearLayers();
  if (!fotoAtual) return;
  const gr = geo(fotoAtual), S = sistema();
  gr.pares.forEach((p, i) => {
    L.circleMarker(p.mapa, { radius: 6, color: "#111", weight: 2, fillColor: "#ffd23f", fillOpacity: 1 })
      .bindTooltip(`${i + 1}`, { permanent: true, direction: "right", className: "rotulo-par" }).addTo(camadaPares);
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
    metrosPorPixel: mpp, largura: W, altura: Ht, fotos: validos.map((it) => it.f.nome), pxPorMetroMin, recortado: !!mascara };
  return estado.ortomosaico;
}

function mostrarMosaicoNoMapa() {
  if (camadaMosaico) mapa.removeLayer(camadaMosaico);
  const m = estado.ortomosaico;
  if (!m) return;
  camadaMosaico = L.imageOverlay(m.canvas.toDataURL("image/png"), m.bounds, { opacity: +$("proj-opac").value }).addTo(mapa);
  mapa.fitBounds(m.bounds);
}

// ---------- Interação ----------
function cliqueFoto(e) {
  if (!fotoAtual) return;
  const r = cv().getBoundingClientRect();
  pendente = [((e.clientX - r.left) * (cv().width / r.width)) / esc, ((e.clientY - r.top) * (cv().height / r.height)) / esc];
  dica(`Agora clique no MESMO ponto no mapa (par ${geo(fotoAtual).pares.length + 1}).`);
  desenharFoto();
}
function cliqueMapa(e) {
  if (!fotoAtual) return;
  if (!pendente) { dica("Primeiro clique no ponto na FOTO, depois no mapa."); return; }
  const gr = geo(fotoAtual);
  gr.pares.push({ foto: pendente.map((v) => +v.toFixed(1)), mapa: [+e.latlng.lat.toFixed(7), +e.latlng.lng.toFixed(7)] });
  pendente = null; recalcular(gr); salvarLocal();
  dica(gr.pares.length < 4 ? `Par salvo. Marque mais ${4 - gr.pares.length}.` : "Par salvo. Passe o mouse sobre a foto para conferir onde cada ponto cai no mapa.");
  desenharFoto(); desenharMapa(); avisar("georef");
}
function moverFoto(e) {
  const gr = fotoAtual && geo(fotoAtual);
  if (!gr?.H) return;
  const r = cv().getBoundingClientRect();
  const p = [((e.clientX - r.left) * (cv().width / r.width)) / esc, ((e.clientY - r.top) * (cv().height / r.height)) / esc];
  const w = gr.H[6] * p[0] + gr.H[7] * p[1] + gr.H[8];
  const ll = sistema().paraLatLon(aplicarH(gr.H, p));
  if (!isFinite(ll[0]) || Math.abs(ll[0] - sistema().origem[0]) > 0.05) return;
  marcadorCursor ||= L.circleMarker(ll, { radius: 7, color: "#e0245e", weight: 3, fill: false }).addTo(mapa);
  marcadorCursor.setLatLng(ll);
}

function trocarFoto() {
  fotoAtual = estado.fotos.find((f) => f.id === $("proj-foto").value) || null;
  pendente = null; desenharFoto(); desenharMapa();
  const gr = fotoAtual && geo(fotoAtual);
  if (gr?.pares.length) mapa.fitBounds(L.latLngBounds(gr.pares.map((p) => p.mapa)).pad(0.5));
  dica(fotoAtual ? "Clique num ponto do CHÃO na foto (canto de faixa de pedestres, base de poste, quina de calçada) e depois no mesmo ponto no mapa." : "Envie fotos na etapa 1.");
}

export function projecaoVisivel() {
  mapa.invalidateSize(); desenharFoto();
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
  $("proj-desfazer").onclick = () => { if (!fotoAtual) return; const g = geo(fotoAtual); if (pendente) pendente = null; else g.pares.pop(); recalcular(g); salvarLocal(); desenharFoto(); desenharMapa(); avisar("georef"); };
  for (const [t, f] of [["−", 1 / 1.5], ["+", 1.5]]) {
    const b = document.createElement("button"); b.textContent = t; b.title = "Zoom na foto";
    b.onclick = () => { zoom = Math.max(0.5, Math.min(8, zoom * f)); desenharFoto(); };
    $("proj-zoom").appendChild(b);
  }
  $("proj-opac").oninput = () => camadaMosaico?.setOpacity(+$("proj-opac").value);
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
  return mapa;
}
