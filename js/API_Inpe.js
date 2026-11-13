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
    var url = montarUrl(-47.295277, -23.125570, -46.717627, -22.684889);  // Região de Campinas


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


function valido(n) {
        return !isNaN(n) && n >= 0;       
    }

    function nivelDoFoco(p) {
        var risco = Number(p.risco_fogo);
        if (valido(risco)) {
            if (risco >= 0.7) return "alto";
            if (risco >= 0.4) return "moderado";
            return "baixo";
        }
        var frp = Number(p.frp);
        var secos = Number(p.numero_dias_sem_chuva);
        var pontos = 0;
        if (valido(frp))   pontos += frp >= 50 ? 2 : (frp >= 15 ? 1 : 0);
        if (valido(secos)) pontos += secos >= 10 ? 2 : (secos >= 4 ? 1 : 0);
        if (pontos >= 3) return "alto";
        if (pontos >= 1) return "moderado";
        return "baixo";
    }

    function popupFoco(p) {
        var quando = new Date(p.data_hora_gmt).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short"
        });
        var horas = Math.round((Date.now() - new Date(p.data_hora_gmt)) / 3600000);
        var cidade = (p.municipio || "").toLowerCase().replace(/(^|\s)\S/g, function (l) { return l.toUpperCase(); });

        return "<strong>Foco de calor detectado</strong><br>" + cidade + "<br>" +
            quando + " (há " + horas + " h)<br>" +
            "Satélite: " + p.satelite + "<br>" +
            (valido(Number(p.frp)) ? "Intensidade (FRP): " + p.frp + " MW<br>" : "") +
            "<small>Fonte: INPE Queimadas</small>";
    }


     function desenharFocos(features) {
        camadaFocos.clearLayers();
        L.geoJSON(features, {
            pointToLayer: function (feature, latlng) {
                return L.marker(latlng, { icon: criarIcone(nivelDoFoco(feature.properties)) });
            },
            onEachFeature: function (feature, layer) {
            layer.bindPopup(popupFoco(feature.properties));
            marcadoresPorId["inpe-" + feature.properties.foco_id] = layer;   // novo
            }

        }).addTo(camadaFocos);
    }

    function desenharAreas(features, enquadrar) {
        zonas.clearLayers();
        features.forEach(function (f) {
            var lat = f.geometry.coordinates[1];  
            var lng = f.geometry.coordinates[0];
            var nivel = nivelDoFoco(f.properties);

            L.circle([lat, lng], Object.assign({ radius: 500 }, estiloArea[nivel]))
                .bindPopup(popupFoco(f.properties))
                .addTo(zonas);
        });
        if (enquadrar && zonas.getLayers().length) {
            mapa.fitBounds(zonas.getBounds(), { maxZoom: 12 });
        }
    }

    function capitalizar(txt) {
    return (txt || "").toLowerCase().replace(/(^|\s)\S/g, function (l) { return l.toUpperCase(); });
}

function featuresParaAlertas(features) {
    return features.map(function (f) {
        var p = f.properties;
        return {
            id: "inpe-" + p.foco_id,
            origem: "inpe",
            tipo: "calor",
            nivel: nivelDoFoco(p),
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            titulo: "Foco de calor",
            local: capitalizar(p.municipio),
            detalhe: "Satélite " + p.satelite,
            criadoEm: p.data_hora_gmt
        };
    });
}