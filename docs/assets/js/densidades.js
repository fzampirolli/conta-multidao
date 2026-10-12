// Classes de densidade de referência (pessoas por m²) e o guia visual.
// Faixas baseadas em Jacobs (1967), Fruin (1971) e Still (2014, "Introduction to Crowd Science").
import { aleatorio } from "./matematica.js";

export const CLASSES = [
  { id: "esparsa",  nome: "Esparsa",          dMin: 0.3, dModa: 0.6, dMax: 1.0, desc: "Pessoas circulam livremente, com espaços vazios." },
  { id: "moderada", nome: "Moderada",         dMin: 1.0, dModa: 1.5, dMax: 2.0, desc: "Dá para andar desviando; braço a braço com folga." },
  { id: "densa",    nome: "Densa",            dMin: 2.0, dModa: 2.5, dMax: 3.0, desc: "Andar exige pedir licença; ombros quase encostam." },
  { id: "muito",    nome: "Muito densa",      dMin: 3.0, dModa: 3.5, dMax: 4.0, desc: "Contato físico constante; difícil se mover." },
  { id: "extrema",  nome: "Extrema (risco)",  dMin: 4.0, dModa: 5.0, dMax: 6.0, desc: "Pessoas espremidas: risco de esmagamento. Rara em grandes áreas." },
];

/** Desenha um quadro de 5 m × 5 m com pontos distribuídos (amostragem de disco de Poisson simples). */
export function quadroDensidade(densidade, tamanho = 150, semente = 7) {
  const lado = 5, n = Math.round(densidade * lado * lado);
  const rnd = aleatorio(semente + Math.round(densidade * 100));
  const dmin = Math.sqrt(1 / Math.max(densidade, 0.1)) * 0.62; // distância mínima entre pessoas (m)
  const pts = [];
  for (let t = 0; pts.length < n && t < n * 400; t++) {
    const p = [rnd() * lado, rnd() * lado];
    if (pts.every((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 > dmin * dmin)) pts.push(p);
  }
  const e = tamanho / lado, r = Math.max(2.4, 0.13 * e);
  return `<svg viewBox="0 0 ${tamanho} ${tamanho}" width="100%" role="img" aria-label="${densidade} pessoas por metro quadrado">
    <rect width="${tamanho}" height="${tamanho}" rx="6" fill="var(--fundo)" stroke="var(--borda)"/>
    ${[1, 2, 3, 4].map((i) => `<line x1="${i * e}" y1="0" x2="${i * e}" y2="${tamanho}" stroke="var(--borda)" stroke-width=".6"/><line y1="${i * e}" x1="0" y2="${i * e}" x2="${tamanho}" stroke="var(--borda)" stroke-width=".6"/>`).join("")}
    ${pts.map(([x, y]) => `<circle cx="${(x * e).toFixed(1)}" cy="${(y * e).toFixed(1)}" r="${r.toFixed(1)}" fill="var(--acento)"/>`).join("")}
  </svg>`;
}

export function desenharGuia(el) {
  el.innerHTML = [0.5, 1, 2, 3, 4, 5].map((d) => {
    const c = CLASSES.find((k) => d >= k.dMin && d < k.dMax) || CLASSES[CLASSES.length - 1];
    return `<figure>${quadroDensidade(d)}<figcaption><b>${d.toLocaleString("pt-BR")} pessoa${d === 1 ? "" : "s"}/m²</b>${c.nome} · ${Math.round(d * 25)} pessoas no quadro</figcaption></figure>`;
  }).join("");
}
