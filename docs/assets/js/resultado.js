// Etapa 5 — combinar zonas (área × densidade) com incerteza (Monte Carlo) e gerar o relatório.
import { estado, avisar, ouvir, salvarLocal, VERSAO_METODO } from "./estado.js";
import { monteCarlo, arred, fmt } from "./matematica.js";

const N_SIM = 20000, SEMENTE = 2026;
let correlacionado = true;

export function calcular() {
  const zonas = estado.zonas.map((z) => ({
    area: z.area, erroArea: z.erroArea, dMin: z.densidade.dMin, dModa: z.densidade.dModa, dMax: z.densidade.dMax,
  }));
  return zonas.length ? monteCarlo(zonas, N_SIM, SEMENTE, correlacionado) : null;
}

function histograma(r) {
  const c = document.createElement("canvas");
  c.width = 720; c.height = 220; c.style.width = "100%";
  const g = c.getContext("2d"), a = r.amostras;
  const min = a[0], max = a[a.length - 1], nb = 48, cont = new Array(nb).fill(0);
  for (const v of a) cont[Math.min(nb - 1, Math.floor(((v - min) / (max - min || 1)) * nb))]++;
  const top = Math.max(...cont), bw = (c.width - 40) / nb, base = c.height - 30;
  const css = getComputedStyle(document.documentElement);
  const acento = css.getPropertyValue("--acento").trim(), suave = css.getPropertyValue("--suave").trim();
  cont.forEach((n, i) => {
    const v = min + ((i + 0.5) / nb) * (max - min);
    g.fillStyle = v >= r.p05 && v <= r.p95 ? acento : suave;
    g.globalAlpha = v >= r.p05 && v <= r.p95 ? 0.9 : 0.35;
    const h = (n / top) * (base - 10);
    g.fillRect(20 + i * bw, base - h, bw - 1.5, h);
  });
  g.globalAlpha = 1; g.fillStyle = suave; g.font = "12px system-ui"; g.textAlign = "center";
  for (const [v, t] of [[r.p05, "5%"], [r.mediana, "mediana"], [r.p95, "95%"]]) {
    const x = 20 + ((v - min) / (max - min || 1)) * (c.width - 40);
    g.fillRect(x - 0.5, 8, 1, base - 8);
    g.fillText(`${t}: ${fmt(arred(v, 3))}`, x, c.height - 10);
  }
  return c;
}

export function desenharResultado() {
  const el = document.getElementById("res-conteudo");
  const r = calcular();
  if (!r) { el.innerHTML = '<p class="suave">Desenhe ao menos uma zona no mapa (etapa 3) para ver a estimativa.</p>'; return; }
  const areaTot = estado.zonas.reduce((s, z) => s + z.area, 0);
  const cap4 = areaTot * 4, cap6 = areaTot * 6;
  const linhas = estado.zonas.map((z) => {
    const fonte = z.densidade.fonte === "classe" ? "classe de referência" : z.densidade.fonte === "amostra" ? "amostra medida na foto"
      : z.densidade.ref ? `julgamento visual (classe "${z.densidade.ref}")` : "valor informado";
    return `<tr><td>${z.nome}</td><td class="num">${fmt(z.area)} ± ${Math.round(z.erroArea * 100)}%</td>
      <td class="num">${z.densidade.dMin} · <b>${z.densidade.dModa}</b> · ${z.densidade.dMax}</td><td>${fonte}</td>
      <td class="num">${fmt(z.area * z.densidade.dModa)}</td></tr>`;
  }).join("");
  const larg = Math.max(...estado.zonas.map((z) => z.nome.length));
  const formula = estado.zonas.map((z) => `  ${z.nome.padEnd(larg)} ${fmt(z.area).padStart(10)} m² × ${String(z.densidade.dModa).padStart(4)} pessoas/m² = ${fmt(z.area * z.densidade.dModa).padStart(9)}`).join("\n");
  const pontual = estado.zonas.reduce((s, z) => s + z.area * z.densidade.dModa, 0);
  const alertas = [];
  if (estado.zonas.some((z) => z.densidade.dModa > 5)) alertas.push("Há zona com densidade provável acima de 5 pessoas/m², valor raríssimo em grandes áreas (só ocorre em aglomerações perigosas). Confira as amostras.");
  if (r.mediana > cap4) alertas.push("A estimativa supera a capacidade da área a 4 pessoas/m². Revise as densidades.");
  el.innerHTML = `
    ${alertas.map((a) => `<div class="aviso">⚠️ ${a}</div>`).join("")}
    <div class="resultado-grande">
      <div class="meio">Estimativa de público presente ao mesmo tempo (intervalo de 90%)</div>
      <div class="faixa">${fmt(arred(r.p05))} a ${fmt(arred(r.p95))} pessoas</div>
      <div class="meio">valor mais provável (mediana): <b>${fmt(arred(r.mediana))}</b></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(areaTot)} m²</div><div class="r">área total ocupada (${estado.zonas.length} zona${estado.zonas.length > 1 ? "s" : ""})</div></div>
      <div class="kpi"><div class="v">${fmt(r.mediana / areaTot, 2)}</div><div class="r">densidade média (pessoas/m²)</div></div>
      <div class="kpi"><div class="v">${fmt(arred(cap4))}</div><div class="r">capacidade a 4 pessoas/m² (lotação máxima segura)</div></div>
      <div class="kpi"><div class="v">${estado.amostras.length}</div><div class="r">amostras medidas nas fotos</div></div>
    </div>
    <h3>Como o número foi calculado</h3>
    <div class="formula">Total = Σ (área da zona × densidade da zona)\n\n${formula}\n  ${"".padEnd(larg)} ${"".padStart(10)}    ${"".padStart(4)}               ${"―".repeat(9)}\n  Estimativa pontual (valores prováveis): ${fmt(pontual)} pessoas</div>
    <table style="margin-top:.8rem"><tr><th>Zona</th><th class="num">Área (m²)</th><th class="num">Densidade mín · provável · máx</th><th>Origem da densidade</th><th class="num">Pessoas (provável)</th></tr>${linhas}</table>
    <h3>Incerteza: simulação de Monte Carlo</h3>
    <p class="pequeno">Repetimos o cálculo ${fmt(N_SIM)} vezes sorteando, em cada zona, uma área dentro da margem de erro
      e uma densidade entre o mínimo e o máximo (distribuição triangular). O histograma mostra os resultados;
      a faixa colorida contém 90% deles. Semente fixa (${SEMENTE}): qualquer pessoa obtém os mesmos números.</p>
    <label class="pequeno"><input type="checkbox" id="mc-corr" ${correlacionado ? "checked" : ""}>
      Erros correlacionados entre zonas (recomendado): o mesmo sorteio de largura e de densidade vale para todas as zonas,
      porque um erro de medida ou de julgamento costuma afetar todas juntas. Desmarque para sorteios independentes (intervalo mais estreito).</label>
    <div id="hist"></div>
    <details class="explica"><summary>Checagem de plausibilidade física</summary>
      Nesta área cabem no máximo cerca de <b>${fmt(arred(cap4))}</b> pessoas a 4/m² (multidão muito apertada), ou
      <b>${fmt(arred(cap6))}</b> a 6/m² (esmagamento, perigoso). Qualquer número anunciado acima disso
      para o <b>mesmo momento</b> exige uma área maior. Números maiores podem se referir ao total de pessoas que
      <b>passaram</b> pelo local ao longo do dia (rotatividade), o que esta ferramenta não mede.
    </details>
    <details class="explica"><summary>Limitações (leia antes de divulgar)</summary>
      <ul>
        <li>A estimativa vale para o <b>momento</b> das fotos, não para o dia inteiro.</li>
        <li>A densidade raramente é uniforme: amostras em pontos diferentes (centro, bordas) reduzem o erro.</li>
        <li>Árvores, bandeiras, toldos e marquises escondem pessoas; inclua essa área só se houver evidência de ocupação.</li>
        <li>A IA foi treinada com outras multidões e pode errar com chuva, guarda-chuvas, contraluz ou ângulos rasantes.</li>
      </ul>
    </details>`;
  el.querySelector("#hist").appendChild(histograma(r));
  el.querySelector("#mc-corr").onchange = (e) => { correlacionado = e.target.checked; desenharResultado(); };
}

export function relatorio() {
  const r = calcular();
  return {
    ferramenta: "Conta Multidão", versaoMetodo: VERSAO_METODO, geradoEm: new Date().toISOString(),
    metodo: "Total = Σ área × densidade (Jacobs); densidade medida em amostras com homografia de referência; incerteza por Monte Carlo (triangular para densidade, uniforme para área).",
    parametrosSimulacao: { simulacoes: N_SIM, semente: SEMENTE, errosCorrelacionados: correlacionado },
    resultado: r && { p05: Math.round(r.p05), p25: Math.round(r.p25), mediana: Math.round(r.mediana), p75: Math.round(r.p75), p95: Math.round(r.p95) },
    fotos: estado.fotos.map((f) => ({ nome: f.nome, sha256: f.hash, largura: f.largura, altura: f.altura, data: f.data, credito: f.credito, licenca: f.licenca, origem: f.origem })),
    registro: estado.mosaicos.map((m) => ({
      mosaico: m.nome, largura: m.largura, altura: m.altura,
      transformacoes: m.transformacoes.map((t) => ({ foto: estado.fotos.find((f) => f.id === t.id)?.nome, H: t.H, inliers: t.inliers })),
    })),
    georef: estado.georef,
    ortomosaico: estado.ortomosaico && { bounds: estado.ortomosaico.bounds, metrosPorPixel: estado.ortomosaico.metrosPorPixel, fotos: estado.ortomosaico.fotos, pxPorMetroMin: estado.ortomosaico.pxPorMetroMin },
    zonas: estado.zonas,
    amostras: estado.amostras,
  };
}

export function iniciarResultado() {
  ["zonas", "amostras", "importado"].forEach((e) => ouvir(e, () => document.getElementById("painel-resultado").classList.contains("ativo") && desenharResultado()));
  document.getElementById("res-json").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(relatorio(), null, 2)], { type: "application/json" }));
    a.download = `relatorio-conta-multidao-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  document.getElementById("res-imprimir").onclick = () => window.print();
  document.getElementById("res-importar").onchange = async (e) => {
    const d = JSON.parse(await e.target.files[0].text());
    estado.zonas = d.zonas || []; estado.amostras = d.amostras || []; estado.georef = d.georef || estado.georef;
    salvarLocal(); avisar("importado"); desenharResultado();
  };
}
