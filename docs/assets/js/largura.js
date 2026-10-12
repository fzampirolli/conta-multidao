// Padrão de largura das áreas de trabalho, igual em todas as abas:
//  1. seletor global (Normal, Larga, Janela inteira), que muda a largura máxima da página;
//  2. divisor arrastável entre as duas colunas (imagem | mapa ou painel) de cada aba que tem duas colunas.
// Tudo fica salvo no navegador. Duplo clique no divisor volta à proporção padrão.
const CHAVE = "conta-multidao-layout";
let salvo = {};
try { salvo = JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch {}
const guardar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(salvo)); } catch {} };

// Mapas e fotos se redesenham no evento "resize" da janela; um por quadro de animação basta.
let agendado = false;
const avisarRedimensionar = () => {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(() => { agendado = false; window.dispatchEvent(new Event("resize")); });
};

function divisivel(el) {
  const id = el.dataset.divisivel, padrao = +el.dataset.padrao || 0.5;
  const div = document.createElement("div");
  div.className = "divisor";
  div.title = "Arraste para ajustar a largura das colunas · duplo clique volta ao padrão";
  div.setAttribute("role", "separator");
  el.insertBefore(div, el.children[1]);
  const por = (f) => el.style.setProperty("--f", Math.min(0.85, Math.max(0.15, f)).toFixed(3));
  por(salvo[id] ?? padrao);
  div.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    div.setPointerCapture(e.pointerId); div.classList.add("ativo");
    const mover = (ev) => {
      const r = el.getBoundingClientRect();
      por((ev.clientX - r.left) / r.width); avisarRedimensionar();
    };
    const soltar = () => {
      div.classList.remove("ativo");
      div.removeEventListener("pointermove", mover); div.removeEventListener("pointerup", soltar);
      salvo[id] = +el.style.getPropertyValue("--f"); guardar(); avisarRedimensionar();
    };
    div.addEventListener("pointermove", mover); div.addEventListener("pointerup", soltar);
  });
  div.addEventListener("dblclick", () => { delete salvo[id]; guardar(); por(padrao); avisarRedimensionar(); });
}

export function iniciarLargura() {
  const sel = document.getElementById("largura-trabalho");
  const aplicar = (v) => { document.documentElement.dataset.largura = v; sel.value = v; avisarRedimensionar(); };
  aplicar(salvo.largura || "larga");
  sel.onchange = () => { salvo.largura = sel.value; guardar(); aplicar(sel.value); };
  document.querySelectorAll("[data-divisivel]").forEach(divisivel);
}
