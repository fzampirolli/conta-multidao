// Etapa 3 — desenhar zonas no mapa (OpenStreetMap + Leaflet) e calcular a área em m².
import { estado, avisar, ouvir, novoId, salvarLocal } from "./estado.js";
import { areaGeodesica, comprimento, contornoCorredor, fmt } from "./matematica.js";
import { CLASSES } from "./densidades.js";

let mapa, camadaZonas, camadaRascunho, modo = "corredor", rascunho = [], enquadrarAoMostrar = false;

/** Chamado quando a etapa do mapa fica visível (Leaflet precisa saber o tamanho real). */
export function mapaVisivel() {
  mapa.invalidateSize();
  if (enquadrarAoMostrar) {
    mapa.fitBounds(L.latLngBounds(estado.zonas.flatMap((z) => z.pontos)), { padding: [20, 20] });
    enquadrarAoMostrar = false;
  }
}
const CORES = ["#0f6e7a", "#6d4bb3", "#b5651d", "#2f7d32", "#9c2a6a", "#33658a"];

function areaZona(z) {
  return z.tipo === "corredor" ? comprimento(z.pontos) * z.largura : areaGeodesica(z.pontos);
}

function desenharZonas() {
  camadaZonas.clearLayers();
  estado.zonas.forEach((z, i) => {
    const cor = CORES[i % CORES.length];
    const forma = z.tipo === "corredor" ? contornoCorredor(z.pontos, z.largura) : z.pontos;
    L.polygon(forma, { color: cor, weight: 2, fillOpacity: 0.25 }).addTo(camadaZonas)
      .bindTooltip(`${z.nome}: ${fmt(z.area)} m²`, { sticky: true });
    if (z.tipo === "corredor") L.polyline(z.pontos, { color: cor, weight: 1, dashArray: "4 4" }).addTo(camadaZonas);
  });
}

function desenharRascunho() {
  camadaRascunho.clearLayers();
  rascunho.forEach((p) => L.circleMarker(p, { radius: 5, color: "#111", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(camadaRascunho));
  if (rascunho.length > 1) {
    if (modo === "corredor") {
      const larg = 30;
      L.polyline(rascunho, { color: "#111", weight: 2 }).addTo(camadaRascunho);
      L.polygon(contornoCorredor(rascunho, larg), { color: "#111", weight: 1, dashArray: "3 5", fillOpacity: 0.08 }).addTo(camadaRascunho);
    } else {
      L.polygon(rascunho, { color: "#111", weight: 2, dashArray: "4 4", fillOpacity: 0.1 }).addTo(camadaRascunho);
    }
  }
}

function opcoesDensidade(z) {
  const op = [
    ...CLASSES.map((c) => `<option value="classe:${c.id}">${c.nome} (${c.dMin}–${c.dMax}/m²)</option>`),
    ...estado.amostras.map((a, i) => `<option value="amostra:${a.id}">Amostra ${i + 1}: ${a.densidade.toFixed(2)}/m²</option>`),
    `<option value="manual">Personalizada</option>`,
  ];
  const atual = z.densidade.fonte === "manual" ? "manual" : `${z.densidade.fonte}:${z.densidade.ref}`;
  return op.join("").replace(`value="${atual}"`, `value="${atual}" selected`);
}

export function aplicarFonte(z, valor) {
  const [fonte, ref] = valor.split(":");
  z.densidade.fonte = fonte; z.densidade.ref = ref;
  if (fonte === "classe") {
    const c = CLASSES.find((k) => k.id === ref);
    Object.assign(z.densidade, { dMin: c.dMin, dModa: c.dModa, dMax: c.dMax });
  } else if (fonte === "amostra") {
    const a = estado.amostras.find((k) => k.id === ref);
    // incerteza padrão de ±20% para uma amostra (contagem + medida de referência)
    Object.assign(z.densidade, { dMin: +(a.densidade * 0.8).toFixed(2), dModa: +a.densidade.toFixed(2), dMax: +(a.densidade * 1.2).toFixed(2) });
  }
}

export function desenharLista() {
  const el = document.getElementById("lista-zonas");
  if (!estado.zonas.length) { el.innerHTML = '<p class="suave">Nenhuma zona ainda.</p>'; return; }
  el.innerHTML = estado.zonas.map((z, i) => `
    <div class="cartao" style="padding:.7rem .8rem;margin-bottom:.6rem;border-left:5px solid ${CORES[i % CORES.length]}" data-z="${z.id}">
      <div class="barra" style="margin:0"><input type="text" value="${z.nome}" data-campo="nome" style="flex:1;min-width:8em">
        <button data-acao="ver" title="Ver no mapa">🔎</button><button data-acao="apagar" title="Apagar">🗑</button></div>
      <div>${z.tipo === "corredor"
        ? `Comprimento ${fmt(comprimento(z.pontos))} m × largura <input type="number" data-campo="largura" value="${z.largura}" min="1" step="1"> m`
        : "Polígono"} = <b>${fmt(z.area)} m²</b></div>
      <div>Incerteza da área ± <input type="number" data-campo="erroArea" value="${Math.round(z.erroArea * 100)}" min="0" max="80" step="1"> %</div>
      <div style="margin-top:.3rem">Densidade: <select data-campo="fonte" style="width:100%">${opcoesDensidade(z)}</select></div>
      <div>mín <input type="number" data-campo="dMin" value="${z.densidade.dMin}" step="0.1" min="0">
           provável <input type="number" data-campo="dModa" value="${z.densidade.dModa}" step="0.1" min="0">
           máx <input type="number" data-campo="dMax" value="${z.densidade.dMax}" step="0.1" min="0"> /m²</div>
    </div>`).join("");
  el.querySelectorAll("[data-z]").forEach((div) => {
    const z = estado.zonas.find((k) => k.id === div.dataset.z);
    div.querySelectorAll("[data-campo]").forEach((inp) => inp.onchange = () => {
      const c = inp.dataset.campo, v = inp.value;
      if (c === "nome") z.nome = v;
      else if (c === "largura") { z.largura = +v; z.area = areaZona(z); }
      else if (c === "erroArea") z.erroArea = +v / 100;
      else if (c === "fonte") { if (v !== "manual") aplicarFonte(z, v); else z.densidade.fonte = "manual"; }
      else { z.densidade[c] = +v; z.densidade.fonte = "manual"; }
      atualizar();
    });
    div.querySelector('[data-acao="apagar"]').onclick = () => { estado.zonas = estado.zonas.filter((k) => k !== z); atualizar(); };
    div.querySelector('[data-acao="ver"]').onclick = () => mapa.fitBounds(L.latLngBounds(z.pontos), { maxZoom: 18 });
  });
}

function atualizar() {
  desenharZonas(); desenharLista(); salvarLocal(); avisar("zonas");
}

function concluirZona() {
  const min = modo === "corredor" ? 2 : 3;
  if (rascunho.length < min) { alertaMapa(`Marque pelo menos ${min} pontos.`); return; }
  const z = {
    id: novoId("z"), nome: `Zona ${estado.zonas.length + 1}`, tipo: modo, pontos: rascunho.map((p) => [+p[0].toFixed(7), +p[1].toFixed(7)]),
    largura: 30, erroArea: 0.1, densidade: { fonte: "classe", ref: "densa", dMin: 2, dModa: 2.5, dMax: 3 },
  };
  z.area = areaZona(z);
  estado.zonas.push(z);
  rascunho = []; desenharRascunho(); atualizar();
}

function alertaMapa(t) {
  const p = L.popup().setLatLng(mapa.getCenter()).setContent(t);
  p.openOn(mapa);
}

export function iniciarArea() {
  mapa = L.map("mapa", { doubleClickZoom: false }).setView(estado.mapaCentro || [-23.5614, -46.6559], estado.mapaCentro ? 16 : 15);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(mapa);
  L.control.scale({ imperial: false }).addTo(mapa);
  camadaZonas = L.layerGroup().addTo(mapa);
  camadaRascunho = L.layerGroup().addTo(mapa);
  mapa.on("click", (e) => { rascunho.push([e.latlng.lat, e.latlng.lng]); desenharRascunho(); });
  mapa.on("dblclick", concluirZona);
  mapa.on("moveend", () => { const c = mapa.getCenter(); estado.mapaCentro = [c.lat, c.lng]; salvarLocal(); });

  const bC = document.getElementById("modo-corredor"), bP = document.getElementById("modo-poligono");
  bC.onclick = () => { modo = "corredor"; bC.classList.add("ativo"); bP.classList.remove("ativo"); desenharRascunho(); };
  bP.onclick = () => { modo = "poligono"; bP.classList.add("ativo"); bC.classList.remove("ativo"); desenharRascunho(); };
  document.getElementById("fechar-zona").onclick = concluirZona;
  document.getElementById("desfazer-ponto").onclick = () => { rascunho.pop(); desenharRascunho(); };

  const buscar = async () => {
    const q = document.getElementById("busca-local").value.trim();
    if (!q) return;
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "pt-BR" } });
    const d = await r.json();
    if (d[0]) mapa.fitBounds([[+d[0].boundingbox[0], +d[0].boundingbox[2]], [+d[0].boundingbox[1], +d[0].boundingbox[3]]], { maxZoom: 17 });
    else alertaMapa("Local não encontrado.");
  };
  document.getElementById("buscar").onclick = buscar;
  document.getElementById("busca-local").onkeydown = (e) => e.key === "Enter" && buscar();

  ouvir("amostras", desenharLista);
  ouvir("importado", () => { atualizar(); enquadrarAoMostrar = estado.zonas.length > 0; });
  desenharZonas(); desenharLista();
  return mapa;
}
