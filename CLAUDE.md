# Conta Multidão: contexto para continuar o trabalho

Ferramenta web **genérica, apartidária e didática** para estimar público de manifestações a partir de fotos.
Site estático em `docs/` (GitHub Pages: https://fzampirolli.github.io/conta-multidao/), sem etapa de build (módulos ES).
Histórico completo da conversa que criou o projeto: `notas/conversa-2026-10-12.md`.

## Etapas do site (docs/index.html)
1. **Fotos** (`fotos.js`): SHA-256 de cada foto; fotos de exemplo em `docs/casos/paulista-2026-10-11/fotos.json` (campo `exemplo`).
2. **Registro** (`registro.js`): OpenCV.js (jsdelivr @techstark). ORB → teste da razão → RANSAC → homografia; um mosaico por grupo conectado.
   Cuidado: o objeto `cv` é "thenable"; nunca retorná-lo de função `async` (trava a página).
3. **Projeção no mapa** (`projecao.js`): pares foto ↔ mapa (chaveados pelo SHA-256 da foto em `estado.georef`), homografia por mínimos quadrados
   (`homografiaMQ` em `matematica.js`), ortomosaico com a melhor resolução por pixel, limiar de px/m e recorte às zonas.
   Base: ortofoto 2020 do GeoSampa (WMS `ORTO_RGB_2020`, CC BY-SA 4.0, aceita EPSG:3857 e CORS). Não usar Google Maps (termos proíbem).
4. **Área** (`area.js`): Leaflet + OSM; zonas "corredor" (linha + largura) ou polígono.
5. **Densidade** (`densidade.js`): retângulo de referência (homografia) ou ortomosaico já em escala; contagem manual e IA (`ia.js`).
   IA: DM-Count UCF-QNRF em ONNX int8 (`docs/modelos/dmcount_qnrf_int8.onnx`, 22 MB), onnxruntime-web 1.20.1, blocos de 512 px.
6. **Resultado** (`resultado.js`): Σ área × densidade; Monte Carlo (20.000, semente 2026, erros correlacionados por padrão); relatório JSON.
   Relatórios podem ser abertos por `?relatorio=caminho.json` (mesma origem).

## Estudo de caso: Av. Paulista, 11/10/2026
- Única fonte com licença aberta: álbum Flickr "Lula Oficial" (CC BY-SA 4.0); viés de seleção declarado.
- Horário de captura **desconhecido**: o EXIF só tem a hora de edição do Lightroom.
- Vistas: 3 fotos para o Paraíso (55581805947, 55582830431, 55583249180) e 3 para a Consolação (55583249175, 55583639030, 55583675910).
- Câmeras calibradas por pontos de fuga (`python/projecao/`, parâmetros em `dados/paulista-2026-10-11/`):
  vista 1 a ≈63 m de altura, ≈100 m antes do MASP; vista 2 a ≈18 m, na ponta SE do MASP.
- Resultado publicado (revisão de 12/10/2026): de 210 mil a 380 mil pessoas (mediana ≈290 mil). Núcleo apoiado em contagem manual com a grade
  junto ao palanque (4,96 e 1,84/m² no mesmo trecho, em duas fotos); demais zonas por classe visual decrescente; relatos não verificados
  (≈2/m² na estação Paulista do metrô; multidões nas transversais, não incluídas). Nunca dizer que o autor esteve no ato. Versão anterior: 140–280 mil.

## Convenções
- Textos em português, tom didático e neutro; o mesmo método vale para qualquer lado político.
- Git: identidade neutra local ("Conta Multidão", noreply). Push: `git -c credential.helper='!gh auth git-credential' push origin main`.
- Testes: `cd docs && python3 -m http.server 8765` e Playwright no `.venv` (Chrome em `/usr/bin/google-chrome`).
- Python: `.venv/` (lwcc, onnx, onnxruntime, playwright). O pacote lwcc tem um bug no caminho dos pesos (`/.lwcc`), corrigido localmente no venv.

## Ideias pendentes
- Transferir o repositório para uma organização ou domínio neutro (pedido do autor).
- Fotos independentes (imprensa ou cidadãos, licença aberta) do trecho Augusta–Consolação.
- Ferramenta de calibração por pontos de fuga dentro do site; WebGPU para a IA.
- Correção da altura das cabeças (≈1,6 m) na densidade e grade no plano das cabeças (pedida, ainda não feita).
- Zoom pela roda na aba Projeção ainda desloca a página (na aba Densidade já foi corrigido).
