# Conta Multidão

**Estimativa de público de manifestações e eventos a partir de fotos, com método científico aberto, didático e apartidário.**

🌐 **Site:** https://fzampirolli.github.io/conta-multidao/
📘 **Método explicado:** [docs/metodo.html](docs/metodo.html)
🧪 **Estudo de caso:** [Av. Paulista, 11/10/2026](docs/casos/paulista-2026-10-11.html)

---

## O que faz

Qualquer pessoa, sem instalar nada, pode:

1. **Enviar fotos** de um evento. Elas são processadas só no navegador e nunca enviadas a servidores. Cada foto recebe sua impressão digital SHA-256.
2. **Registrar as fotos** num mosaico (ORB → correspondências → RANSAC → homografia), para não contar a mesma pessoa duas vezes.
3. **Desenhar a área ocupada** num mapa do OpenStreetMap, dividida em zonas (trecho de rua com largura, ou polígono).
4. **Medir a densidade** (pessoas/m²) em amostras das fotos:
   - um retângulo de tamanho conhecido no chão define uma homografia que converte pixels em m²;
   - as pessoas são contadas à mão (clique) e/ou pela IA **DM-Count**, que roda no navegador via ONNX;
   - um teste de escala mostra se a IA é confiável naquele trecho.
5. **Ver o resultado com incerteza**: Total = Σ área × densidade, com intervalo de 90% por Monte Carlo (semente fixa), checagem de capacidade física e relatório JSON completo e reprodutível.

## Princípios

| | |
|---|---|
| 🔒 **Privacidade** | Nada sai do computador de quem usa. O site é estático (GitHub Pages). |
| 🔍 **Transparência** | Fórmula preenchida, parâmetros, matrizes e incertezas aparecem na tela e no relatório. |
| ♻️ **Reprodutibilidade** | O relatório tem os hashes das fotos, as zonas, as amostras e a semente. Importe-o e refaça a conta. |
| ⚖️ **Apartidarismo** | O mesmo método e os mesmos padrões valem para qualquer evento ou lado político. |

## Estrutura

```
docs/                    site estático (publicado no GitHub Pages)
  index.html             ferramenta (5 etapas)
  metodo.html            explicação didática do método
  casos/                 estudos de caso (fotos com licença aberta + análise)
  assets/js/             módulos ES, sem etapa de build
    matematica.js        homografia (DLT), áreas geodésicas, Monte Carlo
    registro.js          registro de imagens com OpenCV.js
    ia.js                DM-Count via onnxruntime-web, em blocos de 512 px
    area.js              mapa (Leaflet + OpenStreetMap)
    densidade.js         amostras: referência, polígono, contagem manual/IA
    resultado.js         estimativa, incerteza e relatório
  modelos/               DM-Count (UCF-QNRF) quantizado em int8 (22 MB)
python/
  baixar_flickr.py       coleta fotos com licença aberta e registra a proveniência
  exportar_onnx.py       converte o DM-Count (PyTorch) para ONNX int8
```

## Rodar localmente

```bash
cd docs && python3 -m http.server 8000
# abra http://localhost:8000
```

Para os scripts Python:

```bash
python3 -m venv .venv && .venv/bin/pip install lwcc onnx onnxruntime
.venv/bin/python python/exportar_onnx.py           # recria docs/modelos/*.onnx
export FLICKR_API_KEY=...                          # chave gratuita do Flickr
.venv/bin/python python/baixar_flickr.py --texto "nome do evento" --data AAAA-MM-DD --saida dados/evento
```

## Limitações conhecidas

- A estimativa vale para o **instante** das fotos, não para o total de pessoas que passaram durante o dia.
- A IA foi treinada com outras multidões (UCF-QNRF). Ela **subconta** cabeças muito pequenas e pode **supercontar** com mãos levantadas, bandeiras ou fotos com HDR. Por isso o método prioriza a contagem manual em amostras e mostra o teste de escala.
- O registro automático exige fotos com áreas em comum, tiradas de pontos de vista próximos.

## Créditos e licenças

- Código: licença MIT.
- Fotos do estudo de caso: Ricardo Stuckert / Lula Oficial (Flickr), **CC BY-SA 4.0**. Foi a única fonte com licença aberta encontrada para o evento (veja `docs/casos/paulista-2026-10-11/fotos.json`).
- Modelo: DM-Count (Wang et al., NeurIPS 2020), pesos UCF-QNRF distribuídos pelo pacote [lwcc](https://github.com/tersekmatija/lwcc) (MIT).
- Bibliotecas: OpenCV.js, onnxruntime-web, Leaflet. Mapas © colaboradores do OpenStreetMap.
