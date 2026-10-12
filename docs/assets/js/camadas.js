// Camadas de mapa base compartilhadas (todas com licença aberta).
export function criarCamadasBase(mapa, inicial = "osm") {
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 21, maxNativeZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
  // Ortofoto 2020 da Prefeitura de São Paulo (GeoSampa), ~10–20 cm/pixel, CC BY-SA 4.0. Só cobre o município de SP.
  const ortoSP = L.tileLayer.wms("https://raster.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms", {
    layers: "ORTO_RGB_2020", format: "image/jpeg", maxZoom: 21, crossOrigin: true,
    attribution: 'Ortofoto 2020 © <a href="https://geosampa.prefeitura.sp.gov.br">Prefeitura de São Paulo/GeoSampa</a> (CC BY-SA 4.0)',
  });
  const camadas = { "Mapa (OpenStreetMap)": osm, "Ortofoto São Paulo 2020 (GeoSampa)": ortoSP };
  (inicial === "orto" ? ortoSP : osm).addTo(mapa);
  L.control.layers(camadas, null, { collapsed: false }).addTo(mapa);
  return camadas;
}
