// Padrão de tamanho, igual em todo o site:
//  1. seletor de Largura (normal, larga, janela inteira) no cabeçalho de todas as páginas, com a escolha compartilhada;
//     seletor de Altura (baixa, média, alta) na barra das etapas da ferramenta;
//  2. divisor arrastável entre as duas colunas (imagem | mapa ou painel) das abas com duas colunas;
//  3. alça arrastável embaixo de cada área de imagem ou mapa, para mudar só a altura dela.
// Tudo fica salvo no navegador. Duplo clique no divisor ou na alça volta ao padrão.
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

function ajustavelEmAltura(el) {
  const id = "h:" + el.dataset.altura;
  const alca = document.createElement("div");
  alca.className = "alca-altura";
  alca.title = "Arraste para ajustar a altura desta área · duplo clique volta à altura geral";
  alca.setAttribute("role", "separator");
  el.after(alca);
  const por = (px) => (px ? el.style.setProperty("--h", `${Math.round(px)}px`) : el.style.removeProperty("--h"));
  por(salvo[id]);
  alca.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    alca.setPointerCapture(e.pointerId); alca.classList.add("ativo");
    // a altura atual da área (no caso de duas colunas, a da primeira)
    const alvo = el.children.length && !el.matches("#mapa, .area-trabalho") ? el.children[0] : el;
    const y0 = e.clientY, h0 = alvo.getBoundingClientRect().height;
    const mover = (ev) => { por(Math.min(3000, Math.max(250, h0 + ev.clientY - y0))); avisarRedimensionar(); };
    const soltar = () => {
      alca.classList.remove("ativo");
      alca.removeEventListener("pointermove", mover); alca.removeEventListener("pointerup", soltar);
      salvo[id] = parseFloat(el.style.getPropertyValue("--h")) || undefined; guardar(); avisarRedimensionar();
    };
    alca.addEventListener("pointermove", mover); alca.addEventListener("pointerup", soltar);
  });
  alca.addEventListener("dblclick", () => { delete salvo[id]; guardar(); por(null); avisarRedimensionar(); });
}

export function iniciarLargura() {
  const sel = document.getElementById("largura-trabalho");
  const aplicar = (v) => { document.documentElement.dataset.largura = v; sel.value = v; avisarRedimensionar(); };
  aplicar(salvo.largura || "larga");
  sel.onchange = () => { salvo.largura = sel.value; guardar(); aplicar(sel.value); };
  const selA = document.getElementById("altura-trabalho");
  if (!selA) return; // páginas de texto (método, estudo de caso) só têm o seletor de largura
  const aplicarA = (v) => { document.documentElement.dataset.alturaGeral = v; selA.value = v; avisarRedimensionar(); };
  aplicarA(salvo.altura || "alta");
  selA.onchange = () => { salvo.altura = selA.value; guardar(); aplicarA(selA.value); };
  document.querySelectorAll("[data-divisivel]").forEach(divisivel);
  document.querySelectorAll("[data-altura]").forEach(ajustavelEmAltura);
}
