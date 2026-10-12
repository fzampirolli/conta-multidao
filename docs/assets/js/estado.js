// Estado compartilhado entre as etapas + um barramento de eventos simples.
export const VERSAO_METODO = "1.0";

export const estado = {
  fotos: [],      // {id, nome, hash, largura, altura, url, origem, credito, licenca}
  mosaicos: [],   // {id, nome, canvas, largura, altura, transformacoes:[{id, H, inliers, ligadaA}]}
  zonas: [],      // {id, nome, tipo, pontos:[[lat,lon]], largura, area, erroArea, densidade:{fonte, dMin, dModa, dMax, amostraId}}
  amostras: [],   // {id, imagemId, referencia, poligono, areaM2, cabecas, contagemIA, densidade}
  georef: {},     // por SHA-256 da foto: {foto, pares:[{foto:[x,y], mapa:[lat,lon]}], H, rms, residuos, origem}
  ortomosaico: null, // {canvas, bounds, metrosPorPixel, ...}
  mapaCentro: null,
};

const ouvintes = {};
export function ouvir(evento, fn) { (ouvintes[evento] ||= []).push(fn); }
export function avisar(evento, dado) { (ouvintes[evento] || []).forEach((fn) => fn(dado)); }

let contador = 0;
export const novoId = (p) => `${p}${Date.now().toString(36)}${(contador++).toString(36)}`;

/** Imagens disponíveis para medir densidade: mosaicos (se houver) + fotos. */
export function imagensDisponiveis() {
  return [...(estado.ortomosaico ? [{ id: "orto", nome: estado.ortomosaico.nome }] : []),
          ...estado.mosaicos.map((m) => ({ id: m.id, nome: m.nome })),
          ...estado.fotos.map((f, i) => ({ id: f.id, nome: `Foto ${i + 1}: ${f.nome}` }))];
}

/** Retorna uma fonte desenhável (HTMLImageElement ou canvas) para um id de imagem. */
export function fonteImagem(id) {
  if (id === "orto") return estado.ortomosaico?.canvas;
  const m = estado.mosaicos.find((k) => k.id === id);
  if (m) return m.canvas;
  return estado.fotos.find((f) => f.id === id)?.img;
}

// Salva o que é leve (sem pixels) no navegador, para não perder o trabalho ao recarregar.
export function salvarLocal() {
  const leve = {
    zonas: estado.zonas,
    amostras: estado.amostras.map(({ mapaIA, ...a }) => a),
    mapaCentro: estado.mapaCentro,
    georef: estado.georef,
  };
  try { localStorage.setItem("conta-multidao", JSON.stringify(leve)); } catch {}
}
export function carregarLocal() {
  try {
    const d = JSON.parse(localStorage.getItem("conta-multidao") || "null");
    if (d) Object.assign(estado, { zonas: d.zonas || [], amostras: d.amostras || [], mapaCentro: d.mapaCentro, georef: d.georef || {} });
  } catch {}
}

/** SHA-256 de um ArrayBuffer, em hexadecimal. */
export async function sha256(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Carrega um script externo uma única vez. */
const scripts = {};
export function carregarScript(src) {
  return (scripts[src] ||= new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = src; s.async = true; s.onload = ok;
    s.onerror = () => falha(new Error("Falha ao carregar " + src));
    document.head.appendChild(s);
  }));
}
