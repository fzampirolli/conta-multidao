// Ponto de entrada: liga as etapas da ferramenta.
import { estado, carregarLocal, ouvir, avisar } from "./estado.js";
import { iniciarFotos } from "./fotos.js";
import { iniciarRegistro } from "./registro.js";
import { iniciarProjecao, projecaoVisivel } from "./projecao.js";
import { iniciarArea, mapaVisivel } from "./area.js";
import { iniciarDensidade } from "./densidade.js";
import { iniciarResultado, desenharResultado } from "./resultado.js";
import { desenharGuia } from "./densidades.js";

carregarLocal();
iniciarFotos();
iniciarRegistro();
iniciarProjecao();
iniciarArea();
const densidade = iniciarDensidade();
iniciarResultado();
desenharGuia(document.getElementById("guia-densidade"));

const botoes = document.querySelectorAll(".etapas button");
function irPara(etapa) {
  botoes.forEach((b) => b.classList.toggle("ativo", b.dataset.etapa === etapa));
  document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("ativo", p.id === `painel-${etapa}`));
  if (etapa === "area") setTimeout(mapaVisivel, 50);
  if (etapa === "projecao") setTimeout(projecaoVisivel, 50);
  if (etapa === "densidade") setTimeout(densidade.redesenhar, 50);
  if (etapa === "resultado") desenharResultado();
  history.replaceState(null, "", `#${etapa}`);
}
botoes.forEach((b) => (b.onclick = () => irPara(b.dataset.etapa)));

// marca etapas concluídas
const marcar = () => {
  const feito = { fotos: estado.fotos.length > 0, registro: estado.mosaicos.length > 0, projecao: !!estado.ortomosaico, area: estado.zonas.length > 0, densidade: estado.amostras.length > 0 };
  botoes.forEach((b) => b.classList.toggle("feito", !!feito[b.dataset.etapa] && !b.classList.contains("ativo")));
};
["fotos", "mosaico", "ortomosaico", "zonas", "amostras", "importado"].forEach((e) => ouvir(e, marcar));
botoes.forEach((b) => b.addEventListener("click", marcar));

const inicial = location.hash.slice(1);
if (["fotos", "registro", "projecao", "area", "densidade", "resultado"].includes(inicial)) {
  document.getElementById("ferramenta").scrollIntoView();
  irPara(inicial);
}
marcar();

// Abrir um relatório publicado (ex.: estudo de caso): ?relatorio=casos/.../relatorio.json
// Só aceita arquivos do próprio site, por segurança.
const param = new URLSearchParams(location.search).get("relatorio");
if (param) {
  const url = new URL(param, location.href);
  if (url.origin === location.origin) {
    fetch(url).then((r) => r.json()).then((d) => {
      estado.zonas = d.zonas || []; estado.amostras = d.amostras || []; estado.georef = d.georef || estado.georef;
      estado.georefImportado = JSON.parse(JSON.stringify(d.georef || {})); // cópia intacta, para "Restaurar pares"
      avisar("importado");
      document.getElementById("ferramenta").scrollIntoView();
      irPara("resultado");
    }).catch((e) => console.error("Relatório inválido:", e));
  }
}
