// Ponto de entrada: liga as etapas da ferramenta.
import { estado, carregarLocal, ouvir } from "./estado.js";
import { iniciarFotos } from "./fotos.js";
import { iniciarRegistro } from "./registro.js";
import { iniciarArea } from "./area.js";
import { iniciarDensidade } from "./densidade.js";
import { iniciarResultado, desenharResultado } from "./resultado.js";
import { desenharGuia } from "./densidades.js";

carregarLocal();
iniciarFotos();
iniciarRegistro();
const mapa = iniciarArea();
const densidade = iniciarDensidade();
iniciarResultado();
desenharGuia(document.getElementById("guia-densidade"));

const botoes = document.querySelectorAll(".etapas button");
function irPara(etapa) {
  botoes.forEach((b) => b.classList.toggle("ativo", b.dataset.etapa === etapa));
  document.querySelectorAll(".painel").forEach((p) => p.classList.toggle("ativo", p.id === `painel-${etapa}`));
  if (etapa === "area") setTimeout(() => mapa.invalidateSize(), 50);
  if (etapa === "densidade") setTimeout(densidade.redesenhar, 50);
  if (etapa === "resultado") desenharResultado();
  history.replaceState(null, "", `#${etapa}`);
}
botoes.forEach((b) => (b.onclick = () => irPara(b.dataset.etapa)));

// marca etapas concluídas
const marcar = () => {
  const feito = { fotos: estado.fotos.length > 0, registro: estado.mosaicos.length > 0, area: estado.zonas.length > 0, densidade: estado.amostras.length > 0 };
  botoes.forEach((b) => b.classList.toggle("feito", !!feito[b.dataset.etapa] && !b.classList.contains("ativo")));
};
["fotos", "mosaico", "zonas", "amostras", "importado"].forEach((e) => ouvir(e, marcar));
botoes.forEach((b) => b.addEventListener("click", marcar));

const inicial = location.hash.slice(1);
if (["fotos", "registro", "area", "densidade", "resultado"].includes(inicial)) {
  document.getElementById("ferramenta").scrollIntoView();
  irPara(inicial);
}
marcar();
