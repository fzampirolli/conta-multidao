// Etapa 1 — receber fotos, calcular impressão digital (SHA-256) e mostrar a galeria.
import { estado, avisar, novoId, sha256 } from "./estado.js";

const galeria = document.getElementById("galeria");

async function adicionarArquivo(blob, nome, extra = {}) {
  const buf = await blob.arrayBuffer();
  const hash = await sha256(buf);
  if (estado.fotos.some((f) => f.hash === hash)) return; // evita duplicata
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  estado.fotos.push({
    id: novoId("f"), nome, hash, url, img,
    largura: img.naturalWidth, altura: img.naturalHeight,
    data: extra.data || (blob.lastModified ? new Date(blob.lastModified).toISOString() : null),
    credito: extra.credito || "", licenca: extra.licenca || "", origem: extra.origem || "enviada pelo usuário",
  });
}

export async function adicionarArquivos(arquivos) {
  for (const a of arquivos) if (a.type.startsWith("image/")) await adicionarArquivo(a, a.name);
  desenhar();
  avisar("fotos");
}

export function desenhar() {
  galeria.innerHTML = "";
  estado.fotos.forEach((f, i) => {
    const d = document.createElement("div");
    d.className = "miniatura";
    d.innerHTML = `<img src="${f.url}" alt="">
      <div class="legenda" title="${f.nome}\nSHA-256: ${f.hash}">${i + 1}. ${f.nome}<br>
      ${f.largura}×${f.altura} · <span class="mono">${f.hash.slice(0, 10)}…</span>${f.credito ? `<br>${f.credito}` : ""}</div>
      <button title="Remover">✕</button>`;
    d.querySelector("button").onclick = () => {
      estado.fotos = estado.fotos.filter((x) => x !== f);
      desenhar(); avisar("fotos");
    };
    galeria.appendChild(d);
  });
}

export async function carregarExemplo(botao) {
  botao.disabled = true;
  const base = new URL("casos/paulista-2026-10-11/", location.href);
  const info = await (await fetch(new URL("fotos.json", base))).json();
  let n = 0;
  for (const f of info.fotos.filter((x) => x.exemplo)) {
    botao.textContent = `Baixando exemplo ${++n}…`;
    const blob = await (await fetch(new URL(f.arquivo, base))).blob();
    await adicionarArquivo(blob, f.arquivo, {
      credito: `${f.vista ? f.vista + " · " : ""}Foto: ${f.autor}`, licenca: f.licenca, origem: f.url, data: f.data,
    });
  }
  botao.textContent = "Fotos de exemplo carregadas";
  desenhar(); avisar("fotos");
}

export function iniciarFotos() {
  const entrada = document.getElementById("entrada-fotos");
  const soltar = document.getElementById("soltar");
  entrada.onchange = () => adicionarArquivos(entrada.files);
  soltar.addEventListener("dragover", (e) => { e.preventDefault(); soltar.classList.add("sobre"); });
  soltar.addEventListener("dragleave", () => soltar.classList.remove("sobre"));
  soltar.addEventListener("drop", (e) => {
    e.preventDefault(); soltar.classList.remove("sobre");
    adicionarArquivos(e.dataTransfer.files);
  });
  const ex = document.getElementById("carregar-exemplo");
  ex.onclick = () => carregarExemplo(ex).catch((e) => { ex.textContent = "Erro: " + e.message; });
}
