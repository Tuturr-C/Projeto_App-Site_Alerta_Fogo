var WFS_URL = "https://terrabrasilis.dpi.inpe.br/queimadas/geoserver/dados_abertos/ows";
var CAMADA = "dados_abertos:focos_48h_br_todosats";

function montarUrl(lonMin, latMin, lonMax, latMax) {
    var params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: CAMADA,
        outputFormat: "application/json",
        maxFeatures: "500",
        bbox: [lonMin, latMin, lonMax, latMax].join(",") + ",EPSG:4326"
    });
    return WFS_URL + "?" + params.toString();
}

function buscarFocos() {
    var url = montarUrl(-47.295277, -23.125570, -46.717627, -22.684889);   // região de Campinas


    return fetch(url)
        .then(function (resposta) {
            if (!resposta.ok) {
                throw new Error("Erro na resposta INPE " + resposta.status);
            }
            return resposta.json();
        })
        .then(function (geojson) {
            return geojson.features;
        });
}

//TESTE APENAS
buscarFocos()
    .then(function (focos) {
        console.log("Focos recebidos:", focos.length);
        console.log("Primeiro foco:", focos[0]);
    })
    .catch(function (erro) {
        console.error("Falhou:", erro);
    });