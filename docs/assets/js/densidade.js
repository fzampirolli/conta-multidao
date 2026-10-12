// Etapa 4 — medir densidade numa amostra da foto.
// ① 4 cantos de um retângulo real conhecido no chão → homografia imagem→chão (metros)
// ② polígono da amostra → área real (m²) via homografia
// ③ cabeças marcadas à mão e/ou ④ soma do mapa de densidade da IA dentro do polígono
import { estado, avisar, ouvir, novoId, salvarLocal, imagensDisponiveis, fonteImagem } from "./estado.js";
import { homografia4, aplicarH, areaPoligono, dentro, fmt } from "./matematica.js";
import { contarIA, somarNoPoligono, mapaDeCalor } from "./ia.js";

const cv = document.getElementById("den-canvas");
const g = cv.getContext("2d");
let ferr = "ref", imgId = null, esc = 1;
let ref = [], poli = [], poliFechado = false, cabecas = [], ia = null, calor = null, iaAmostra = null;

const $ = (id) => document.getElementById(id);
const dica = (t) => ($("den-dica").textContent = t);

/** Metros por pixel, se a imagem já estiver em escala (ortomosaico). */
const mppAtual = () => (imgId === "orto" ? estado.ortomosaico?.metrosPorPixel : null);

function H() {
  const mpp = mppAtual();
  if (mpp) return [mpp, 0, 0, 0, mpp, 0, 0, 0, 1]; // ortomosaico: escala uniforme, sem perspectiva
  if (ref.length < 4) return null;
  const w = +$("ref-larg").value, l = +$("ref-comp").value;
  try { return homografia4(ref, [[0, 0], [w, 0], [w, l], [0, l]]); } catch { return null; }
}
function areaAmostra() {
  const h = H();
  if (!h || !poliFechado || poli.length < 3) return null;
  return areaPoligono(poli.map((p) => aplicarH(h, p)));
}

function desenhar() {
  const f = fonteImagem(imgId);
  $("den-area").classList.toggle("vazia", !f);
  if (!f) { cv.width = 10; cv.height = 10; return; }
  const W = f.naturalWidth || f.width, Ht = f.naturalHeight || f.height;
  const larguraVisivel = $("den-area").clientWidth || 900;
  esc = Math.min(1.5, larguraVisivel / W) * zoom;
  cv.width = Math.round(W * esc); cv.height = Math.round(Ht * esc);
  g.drawImage(f, 0, 0, cv.width, cv.height);
  if (calor && $("den-mapa-calor").checked) {
    g.globalAlpha = 0.65; g.imageSmoothingEnabled = true;
    g.drawImage(calor, 0, 0, ia.mw * ia.fator * esc, ia.mh * ia.fator * esc);
    g.globalAlpha = 1;
  }
  const P = (p) => [p[0] * esc, p[1] * esc];
  // Grade do chão (mostra a perspectiva "desentortada"): linhas a cada 1 m dentro/ao redor do retângulo
  const h = H();
  if (h && !mppAtual()) {
    const inv = inverter(h), w = +$("ref-larg").value, l = +$("ref-comp").value;
    g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 1;
    const ext = 6;
    for (let x = -ext; x <= w + ext; x += 1) linha(inv, [x, -ext], [x, l + ext]);
    for (let y = -ext; y <= l + ext; y += 1) linha(inv, [-ext, y], [w + ext, y]);
  }
  // Retângulo de referência
  g.lineWidth = 2.5; g.strokeStyle = "#ffd23f"; g.fillStyle = "#ffd23f";
  if (ref.length) {
    g.beginPath(); ref.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    if (ref.length === 4) g.closePath();
    g.stroke();
    ref.forEach((p, i) => { g.beginPath(); g.arc(...P(p), 5, 0, 7); g.fill(); g.font = "bold 14px system-ui"; g.fillText(i + 1, P(p)[0] + 7, P(p)[1] - 7); });
  }
  // Polígono da amostra
  if (poli.length) {
    g.strokeStyle = "#3fe0ff"; g.fillStyle = "rgba(63,224,255,.12)"; g.lineWidth = 2.5;
    g.beginPath(); poli.forEach((p, i) => (i ? g.lineTo(...P(p)) : g.moveTo(...P(p))));
    if (poliFechado) { g.closePath(); g.fill(); }
    g.stroke();
    poli.forEach((p) => { g.beginPath(); g.arc(...P(p), 4, 0, 7); g.fillStyle = "#3fe0ff"; g.fill(); });
  }
  // Cabeças
  g.strokeStyle = "#ff3f8e"; g.lineWidth = 2;
  cabecas.forEach((p) => { g.beginPath(); g.arc(...P(p), Math.max(3, 4 * Math.sqrt(esc)), 0, 7); g.stroke(); });
  atualizarKPIs();
}
function linha(inv, a, b) {
  const p = aplicarH(inv, a), q = aplicarH(inv, b);
  if (![...p, ...q].every(isFinite)) return;
  g.beginPath(); g.moveTo(p[0] * esc, p[1] * esc); g.lineTo(q[0] * esc, q[1] * esc); g.stroke();
}
function inverter(m) {
  const [a, b, c, d, e, f, gg, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * gg), C = d * h - e * gg;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * gg, -(a * f - c * d), C, -(a * h - b * gg), a * e - b * d].map((v) => v / det);
}

function atualizarKPIs() {
  const a = areaAmostra();
  const nDentro = poliFechado ? cabecas.filter((p) => dentro(p[0], p[1], poli)).length : cabecas.length;
  iaAmostra = ia && poliFechado ? somarNoPoligono(ia, poli, dentro) : null;
  $("k-area").textContent = a ? fmt(a, 1) : "—";
  $("k-manual").textContent = nDentro;
  $("k-ia").textContent = iaAmostra != null ? fmt(iaAmostra, 0) : "—";
  const n = nDentro > 0 ? nDentro : iaAmostra;
  $("k-dens").textContent = a && n ? fmt(n / a, 2) : "—";
  // Checagem física: acima de ~6 pessoas/m² as pessoas literalmente não cabem (Still, 2014).
  const d = a && n ? n / a : 0;
  $("k-dens").parentElement.style.outline = d > 6 ? "2px solid var(--erro)" : "";
  if (d > 6) dica(`⚠️ ${fmt(d, 1)} pessoas/m² é fisicamente implausível (máx. ≈ 6). Confira as medidas do retângulo de referência ou conte à mão: a IA pode estar contando mãos e bandeiras como cabeças.`);
  if (nDentro > 0 && iaAmostra) $("k-ia").title = `IA/manual = ${fmt(iaAmostra / nDentro, 2)}`;
  $("den-salvar").disabled = !(a && n);
}

let zoom = 1;
function pontoDoClique(e) {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) * (cv.width / r.width)) / esc, ((e.clientY - r.top) * (cv.height / r.height)) / esc];
}

cv.addEventListener("click", (e) => {
  if (!imgId) return;
  const p = pontoDoClique(e);
  const perto = (q, px = 10) => Math.hypot((q[0] - p[0]) * esc, (q[1] - p[1]) * esc) < px;
  if (ferr === "ref") {
    if (ref.length >= 4) ref = [];
    ref.push(p);
    dica(ref.length < 4 ? `Canto ${ref.length + 1} de 4 (sentido horário, começando pelo canto da "largura").`
      : "Referência pronta! A grade branca mostra metros no chão. Agora desenhe o trecho da amostra (②).");
    if (ref.length === 4) selecionar("amostra");
  } else if (ferr === "amostra") {
    if (poliFechado) { poli = []; poliFechado = false; }
    if (poli.length >= 3 && perto(poli[0], 14)) { poliFechado = true; dica("Amostra fechada. Conte as cabeças (③) e/ou use a IA (④)."); }
    else { poli.push(p); dica("Clique no primeiro ponto para fechar o polígono."); }
  } else if (ferr === "cabecas") {
    const i = cabecas.findIndex((q) => perto(q, 7));
    if (i >= 0) cabecas.splice(i, 1); else cabecas.push(p);
  }
  desenhar();
});

function selecionar(f) {
  ferr = f;
  document.querySelectorAll("[data-ferr]").forEach((b) => b.classList.toggle("ativo", b.dataset.ferr === f));
  dica({
    ref: "Marque os 4 cantos de um retângulo de tamanho conhecido no chão, em ordem (sentido horário).",
    amostra: "Clique para marcar os vértices do trecho da amostra; clique no 1º ponto para fechar.",
    cabecas: "Clique em cada cabeça dentro da amostra. Clique de novo numa marca para apagá-la. Use o zoom (+) para enxergar melhor.",
  }[f]);
}

async function rodarIA() {
  const f = fonteImagem(imgId);
  if (!f) return;
  const b = $("den-ia"); b.disabled = true;
  const prog = (p) => ($("den-prog").style.width = `${Math.round(p * 100)}%`);
  try {
    ia = await contarIA(f, 2048, imgId, prog, dica);
    calor = mapaDeCalor(ia);
    dica(`IA: ${fmt(ia.total)} pessoas detectadas na imagem inteira.`);
    $("ia-foto-inteira").innerHTML = `
      <div class="aviso"><b>IA na imagem inteira: ${fmt(ia.total)} pessoas visíveis.</b><br>
      Em fotos panorâmicas, cabeças distantes ficam com poucos pixels e a IA tende a <b>subcontar</b>.
      Use a IA para medir a <b>densidade numa amostra próxima</b>, não para o total.
      <div class="grupo-botoes"><button id="teste-escala">Fazer teste de escala</button></div>
      <div id="res-escala"></div></div>`;
    $("teste-escala").onclick = testeEscala;
  } catch (e) { dica("Erro na IA: " + e.message); console.error(e); }
  b.disabled = false; desenhar();
}

async function testeEscala() {
  const f = fonteImagem(imgId), el = $("res-escala");
  const prog = (p) => ($("den-prog").style.width = `${Math.round(p * 100)}%`);
  const linhas = [];
  for (const lado of [1024, 2048, 3072]) {
    el.innerHTML = `Processando a ${lado} px…`;
    const r = await contarIA(f, lado, imgId, prog);
    const naAmostra = poliFechado ? somarNoPoligono(r, poli, dentro) : null;
    linhas.push(`<tr><td>${lado} px</td><td class="num">${fmt(r.total)}</td><td class="num">${naAmostra != null ? fmt(naAmostra) : "—"}</td></tr>`);
    el.innerHTML = `<table><tr><th>Escala</th><th class="num">Total</th><th class="num">Na amostra</th></tr>${linhas.join("")}</table>`;
  }
  el.innerHTML += `<p class="pequeno">Se os números <b>mudam muito</b> com a escala, a IA não está "enxergando" bem as pessoas
    (cabeças pequenas demais). Valores <b>estáveis</b> indicam medição confiável naquele trecho.</p>`;
}

function salvar() {
  const a = areaAmostra();
  const nDentro = cabecas.filter((p) => dentro(p[0], p[1], poli)).length;
  const f = estado.fotos.find((x) => x.id === imgId);
  const metodo = nDentro > 0 ? "manual" : "ia";
  const n = nDentro > 0 ? nDentro : iaAmostra;
  estado.amostras.push({
    id: novoId("a"), imagemId: imgId, imagem: f ? f.nome : imgId === "orto" ? estado.ortomosaico.nome : estado.mosaicos.find((m) => m.id === imgId)?.nome, hashImagem: f?.hash || null,
    referencia: mppAtual() ? { ortomosaico: true, metrosPorPixel: mppAtual() } : { pontos: ref.map((p) => p.map((v) => +v.toFixed(1))), largura: +$("ref-larg").value, comprimento: +$("ref-comp").value },
    poligono: poli.map((p) => p.map((v) => +v.toFixed(1))), areaM2: +a.toFixed(2),
    cabecas: nDentro, posicoesCabecas: cabecas.filter((p) => dentro(p[0], p[1], poli)).map((p) => p.map((v) => +v.toFixed(1))),
    contagemIA: iaAmostra != null ? +iaAmostra.toFixed(1) : null, metodo, densidade: +(n / a).toFixed(3),
  });
  salvarLocal(); listar(); avisar("amostras");
  dica("Amostra salva! Associe-a a uma zona na etapa 3, ou faça outra amostra em outro trecho.");
}

function listar() {
  const el = $("lista-amostras");
  if (!estado.amostras.length) { el.innerHTML = '<p class="suave">Nenhuma amostra ainda.</p>'; return; }
  el.innerHTML = `<table><tr><th>#</th><th>Imagem</th><th class="num">m²</th><th class="num">Pessoas</th><th class="num">/m²</th><th></th></tr>` +
    estado.amostras.map((a, i) => `<tr><td>${i + 1}</td><td>${a.imagem}</td><td class="num">${fmt(a.areaM2, 1)}</td>
      <td class="num">${a.metodo === "manual" ? a.cabecas + " (mão)" : fmt(a.contagemIA) + " (IA)"}</td>
      <td class="num"><b>${fmt(a.densidade, 2)}</b></td><td><button data-del="${a.id}" title="Apagar">🗑</button></td></tr>`).join("") + "</table>";
  el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
    estado.amostras = estado.amostras.filter((a) => a.id !== b.dataset.del); salvarLocal(); listar(); avisar("amostras");
  }));
}

function trocarImagem() {
  imgId = $("den-imagem").value || null;
  ref = []; poli = []; poliFechado = false; cabecas = []; ia = null; calor = null;
  $("ia-foto-inteira").innerHTML = "";
  if (mppAtual()) { selecionar("amostra"); dica(`O ortomosaico já está em escala (${mppAtual().toFixed(2)} m por pixel): desenhe direto o trecho da amostra.`); }
  else selecionar("ref");
  desenhar();
}

export function iniciarDensidade() {
  const sel = $("den-imagem");
  const opcoes = () => {
    const atual = sel.value;
    sel.innerHTML = imagensDisponiveis().map((i) => `<option value="${i.id}">${i.nome}</option>`).join("");
    if ([...sel.options].some((o) => o.value === atual)) sel.value = atual; else trocarImagem();
  };
  ouvir("fotos", opcoes); ouvir("mosaico", opcoes); ouvir("ortomosaico", opcoes); ouvir("importado", listar);
  sel.onchange = trocarImagem;
  document.querySelectorAll("[data-ferr]").forEach((b) => (b.onclick = () => selecionar(b.dataset.ferr)));
  $("den-ia").onclick = rodarIA;
  $("den-limpar").onclick = () => { ref = []; poli = []; poliFechado = false; cabecas = []; selecionar("ref"); desenhar(); };
  $("den-mapa-calor").onchange = desenhar;
  $("den-salvar").onclick = salvar;
  $("ref-larg").onchange = $("ref-comp").onchange = desenhar;
  // zoom
  const barra = $("den-limpar").parentElement;
  for (const [t, f] of [["−", 1 / 1.5], ["+", 1.5]]) {
    const b = document.createElement("button"); b.textContent = t; b.title = "Zoom";
    b.onclick = () => { zoom = Math.max(0.5, Math.min(6, zoom * f)); desenhar(); };
    barra.insertBefore(b, $("den-limpar"));
  }
  window.addEventListener("resize", () => imgId && desenhar());
  listar();
  return { redesenhar: desenhar };
}
