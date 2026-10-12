// Funções matemáticas puras (sem dependências), usadas em todo o site.
// Cada função é pequena e comentada para que qualquer pessoa possa conferir o cálculo.

// ---------- Geometria plana ----------

/** Área de um polígono pela fórmula do laço (shoelace). pts = [[x,y],...] */
export function areaPoligono(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Ponto dentro de polígono (ray casting). */
export function dentro(x, y, pts) {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

// ---------- Homografia (transformação projetiva) ----------
// Uma homografia H (3x3) leva pontos de um plano a outro plano:
//   [x', y', w'] = H · [x, y, 1]   →   (x'/w', y'/w')
// Com 4 pares de pontos (sem 3 alinhados) H fica determinada (método DLT).

/** Resolve A·x = b por eliminação de Gauss com pivotamento parcial. */
function resolver(A, b) {
  const n = b.length;
  const M = A.map((linha, i) => [...linha, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("Pontos degenerados (3 alinhados?)");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/** Homografia a partir de 4 pares origem→destino. Retorna matriz 3x3 (array de 9). */
export function homografia4(origem, destino) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = origem[i], [u, v] = destino[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = resolver(A, b);
  return [...h, 1];
}

/** Aplica homografia H a um ponto. */
export function aplicarH(H, [x, y]) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// ---------- Geodésia (mapas) ----------
const R_TERRA = 6378137; // raio equatorial WGS84 (m), mesmo valor usado por Leaflet/Turf

/** Área (m²) de um polígono em coordenadas geográficas [[lat,lon],...] — excesso esférico. */
export function areaGeodesica(latlons) {
  if (latlons.length < 3) return 0;
  const rad = Math.PI / 180;
  let s = 0;
  for (let i = 0; i < latlons.length; i++) {
    const [la1, lo1] = latlons[i];
    const [la2, lo2] = latlons[(i + 1) % latlons.length];
    s += (lo2 - lo1) * rad * (2 + Math.sin(la1 * rad) + Math.sin(la2 * rad));
  }
  return Math.abs((s * R_TERRA * R_TERRA) / 2);
}

/** Distância (m) entre dois pontos [lat,lon] — fórmula de haversine. */
export function distancia([la1, lo1], [la2, lo2]) {
  const rad = Math.PI / 180;
  const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R_TERRA * Math.asin(Math.sqrt(a));
}

/** Comprimento (m) de uma linha [[lat,lon],...]. */
export function comprimento(linha) {
  let L = 0;
  for (let i = 1; i < linha.length; i++) L += distancia(linha[i - 1], linha[i]);
  return L;
}

/** Contorno aproximado (polígono) de um corredor: linha central + largura (m). Só para desenhar. */
export function contornoCorredor(linha, largura) {
  if (linha.length < 2) return [];
  const lat0 = linha[0][0] * Math.PI / 180;
  const mx = 111320 * Math.cos(lat0), my = 110540; // metros por grau (aprox. local)
  const P = linha.map(([la, lo]) => [lo * mx, la * my]);
  const esq = [], dir = [], h = largura / 2;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
    esq.push([P[i][0] + nx * h, P[i][1] + ny * h]);
    dir.push([P[i][0] - nx * h, P[i][1] - ny * h]);
  }
  return [...esq, ...dir.reverse()].map(([x, y]) => [y / my, x / mx]);
}

// ---------- Estatística ----------

/** Gerador pseudoaleatório com semente (mulberry32) — resultados reprodutíveis. */
export function aleatorio(semente = 2026) {
  let a = semente >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Amostra de uma distribuição triangular (mínimo, moda, máximo). */
export function triangular(u, min, moda, max) {
  if (max <= min) return min;
  const c = (moda - min) / (max - min);
  return u < c ? min + Math.sqrt(u * (max - min) * (moda - min))
               : max - Math.sqrt((1 - u) * (max - min) * (max - moda));
}

/**
 * Simulação de Monte Carlo do total de pessoas.
 * zonas: [{area, erroArea (fração, ex. 0.1), dMin, dModa, dMax}]
 * Para cada simulação: área ~ Uniforme(A(1-e), A(1+e)); densidade ~ Triangular(min, moda, max).
 * Total = Σ área × densidade.
 * correlacionado = true: o MESMO sorteio vale para todas as zonas (erros de largura e de julgamento
 * da densidade costumam afetar todas juntas). É o cenário mais prudente (intervalo mais largo).
 */
export function monteCarlo(zonas, n = 20000, semente = 2026, correlacionado = true) {
  const rnd = aleatorio(semente);
  const tot = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let s = 0;
    const uA = rnd(), uD = rnd();
    for (const z of zonas) {
      const ua = correlacionado ? uA : rnd(), ud = correlacionado ? uD : rnd();
      const a = z.area * (1 + z.erroArea * (2 * ua - 1));
      const d = triangular(ud, z.dMin, z.dModa, z.dMax);
      s += a * d;
    }
    tot[k] = s;
  }
  tot.sort();
  const q = (p) => tot[Math.min(n - 1, Math.floor(p * n))];
  return { amostras: tot, p05: q(0.05), p25: q(0.25), mediana: q(0.5), p75: q(0.75), p95: q(0.95) };
}

/** Arredonda para 2 algarismos significativos (evita falsa precisão). */
export function arred(x, sig = 2) {
  if (!isFinite(x) || x === 0) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(Math.abs(x))) - sig + 1);
  return Math.round(x / p) * p;
}

export const fmt = (x, dec = 0) =>
  Number(x).toLocaleString("pt-BR", { maximumFractionDigits: dec, minimumFractionDigits: dec });

// ---------- Homografia por mínimos quadrados (N ≥ 4 pares), com normalização de Hartley ----------

/** Normaliza pontos: centro na origem, distância média √2. Retorna {pts, T} (T 3x3). */
function normalizar(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p[0], 0) / n, cy = pts.reduce((s, p) => s + p[1], 0) / n;
  const d = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n || 1;
  const k = Math.SQRT2 / d;
  return { pts: pts.map(([x, y]) => [(x - cx) * k, (y - cy) * k]), T: [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1] };
}

export function mult3(A, B) {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j];
  return C;
}

export function inverter3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/**
 * Homografia origem→destino com N ≥ 4 pares, por mínimos quadrados (equações normais do DLT com h33 = 1).
 * Retorna {H, residuos (distância no destino), rms}.
 */
export function homografiaMQ(origem, destino) {
  const n = origem.length;
  if (n < 4) throw new Error("São necessários pelo menos 4 pares de pontos");
  const O = normalizar(origem), D = normalizar(destino);
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0)), Atb = new Array(8).fill(0);
  const add = (lin, b) => {
    for (let i = 0; i < 8; i++) { Atb[i] += lin[i] * b; for (let j = 0; j < 8; j++) AtA[i][j] += lin[i] * lin[j]; }
  };
  for (let i = 0; i < n; i++) {
    const [x, y] = O.pts[i], [u, v] = D.pts[i];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = resolver(AtA, Atb);
  const Hn = [...h, 1];
  const H = mult3(inverter3(D.T), mult3(Hn, O.T));
  const H9 = H.map((v) => v / H[8]);
  const residuos = origem.map((p, i) => {
    const q = aplicarH(H9, p);
    return Math.hypot(q[0] - destino[i][0], q[1] - destino[i][1]);
  });
  const rms = Math.sqrt(residuos.reduce((s, r) => s + r * r, 0) / n);
  return { H: H9, residuos, rms };
}

// ---------- Sistema métrico local (metros a leste/norte de uma origem) ----------
export function sistemaLocal([lat0, lon0]) {
  const mx = 111320 * Math.cos((lat0 * Math.PI) / 180), my = 110540;
  return {
    origem: [lat0, lon0],
    paraMetros: ([la, lo]) => [(lo - lon0) * mx, (la - lat0) * my],
    paraLatLon: ([x, y]) => [lat0 + y / my, lon0 + x / mx],
  };
}
