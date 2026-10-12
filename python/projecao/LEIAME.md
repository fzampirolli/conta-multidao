# Projeção das fotos no mapa (estudo de caso da Paulista)

Scripts usados para calibrar as câmeras por **pontos de fuga**, porque a multidão cobre o chão e quase não há pontos de controle visíveis.

1. `faixa_ortofoto.py S0 S1 RES`: baixa a ortofoto 2020 do GeoSampa (CC BY-SA 4.0) e monta uma faixa alinhada ao eixo da avenida, com grade em metros (s ao longo, t lateral).
2. `pontos_de_fuga.py foto saida [regiao]`: detecta segmentos (LSD) e estima por RANSAC o ponto de fuga vertical e o da avenida.
3. `bordas_multidao.py foto y0 y1 saida`: ponto de fuga da avenida pelas bordas da mancha da multidão.
4. `modelo_camera.py camXX.json`: K e R pelos pontos de fuga, altura pela largura do carro de som (3,0 m), posição por um ponto conhecido.
   Gera a homografia foto → (s,t) e uma sobreposição de verificação.
5. `grade_perspectiva.py foto camXX_H.json saida`: desenha meios-fios e ruas transversais na perspectiva da foto, para validar o modelo.
6. `pares_controle.py`: gera pares (pixel ↔ lat/lon) para o site, incluindo as fotos que herdam o modelo pelo registro.

Parâmetros e resultados estão em `dados/paulista-2026-10-11/` (`cam10.json`, `cam27.json`, `*_H.json`).
Os caminhos dentro dos scripts apontam para uma pasta de trabalho; ajuste antes de rodar.
