//Mapa
var mapa = L.map("mapa").setView([-22.9099, -47.0626], 12);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);

// Estilos Pins
var estiloArea = {
    alto:     { color: "#b3361f", fillColor: "#e63946", fillOpacity: 0.35, weight: 2 },
    moderado: { color: "#8a6a12", fillColor: "#e9a23b", fillOpacity: 0.30, weight: 2 },
    baixo:    { color: "#3f6b3a", fillColor: "#6a994e", fillOpacity: 0.25, weight: 2 }
};

var alertasInpe = [];
var alertasRelatos = [];
var camadaFocos = L.layerGroup().addTo(mapa);      
var zonas = L.featureGroup().addTo(mapa);       
var camadaAreas = L.layerGroup().addTo(mapa);


function criarIcone(nivel) {
    return L.divIcon({
        className: "pin-fogo pin-" + nivel,
        html: '<i class="fa-solid fa-fire"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function escrever(id, texto) {                      
    var el = document.getElementById(id);
    if (el) el.textContent = texto;
}

// Exemplos que dps vou tirar
var areas = [
    {
        tipo: "poligono", nivel: "alto",
        titulo: "Incêndio florestal", local: "Mata ao Norte",
        pontos: [[-22.880, -47.020], [-22.890, -47.010], [-22.900, -47.020], [-22.890, -47.030]]
    },
    {
        tipo: "circulo", nivel: "baixo",
        titulo: "Foco controlado", local: "Região Sul",
        centro: [-22.970, -47.030], raio: 600
    },
    {
        tipo: "retangulo", nivel: "moderado",
        titulo: "Queimada em pasto", local: "Região Oeste",
        limites: [[-22.945, -47.115], [-22.935, -47.105]]
    }
];

areas.forEach(function (ar) {
    var forma;

    if (ar.tipo === "retangulo") {
        forma = L.rectangle(ar.limites, estiloArea[ar.nivel]);
    } else if (ar.tipo === "circulo") {
        forma = L.circle(ar.centro, Object.assign({ radius: ar.raio }, estiloArea[ar.nivel]));
    } else {
        forma = L.polygon(ar.pontos, estiloArea[ar.nivel]);
    }

    forma.addTo(camadaAreas)
         .bindPopup("<strong>" + ar.titulo + "</strong><br>" + ar.local +
                    "<br>Nível: " + ar.nivel + "<br><small>Exemplo fictício</small>");
});


//Localização do Usuario
var pontoUsuario = null;
var circuloRaio = null;
var primeiraVez = true;
var rastreando = false;
var ultimaPosicaoNome = null;
var ultimoTempoNome = 0;

var faixa = document.getElementById("faixa-local");
var botao = document.getElementById("btn-localizar");

if (!botao) console.warn("Não achei #btn-localizar no HTML");
if (!faixa) console.warn("Não achei #faixa-local no HTML");

function atualizarNomeLocal(pos) {
    var agora = Date.now();
    var moveuMuito = !ultimaPosicaoNome || mapa.distance(ultimaPosicaoNome, pos) > 300;
    if (!moveuMuito || agora - ultimoTempoNome < 15000) return;

    ultimaPosicaoNome = pos;
    ultimoTempoNome = agora;

    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=pt-BR" +
              "&lat=" + pos.lat.toFixed(2) + "&lon=" + pos.lng.toFixed(2);

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            var a = d.address || {};
            var bairro = a.suburb || a.neighbourhood || a.city_district || "";
            var cidade = a.city || a.town || a.village || a.municipality || "";
            escrever("local-texto", [bairro, cidade].filter(Boolean).join(", ") || "Local não identificado");
        })
        .catch(function () {
            escrever("local-texto", "Local não identificado");
        });
}

function pararRastreio() {
    posicaoUsuario = null;                  
    renderizarLista();
    mapa.stopLocate();
    rastreando = false;
    primeiraVez = true;
    if (faixa) faixa.hidden = true;
    if (pontoUsuario) { mapa.removeLayer(pontoUsuario); pontoUsuario = null; }
    if (circuloRaio) { mapa.removeLayer(circuloRaio); circuloRaio = null; }
    if (botao) botao.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar minha localização';
}

if (botao) {
    botao.addEventListener("click", function () {
        if (!rastreando) {
            mapa.locate({ watch: true, enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
            rastreando = true;
            botao.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Parar de acompanhar';
        } else {
            pararRastreio();
        }
    });
}

mapa.on("locationfound", function (e) {
    if (faixa) faixa.hidden = false;

    posicaoUsuario = e.latlng;                
      renderizarListaSuave();

    if (!pontoUsuario) {
        pontoUsuario = L.circleMarker(e.latlng, {
            radius: 8, color: "#fff", weight: 3, fillColor: "#3f6b3a", fillOpacity: 1
        }).addTo(mapa).bindTooltip("Você", { permanent: true, direction: "right" });

        circuloRaio = L.circle(e.latlng, {
            radius: 5000, color: "#3f6b3a", weight: 2, fillColor: "#3f6b3a", fillOpacity: 0.08
        }).addTo(mapa);
    } else {
        pontoUsuario.setLatLng(e.latlng);
        circuloRaio.setLatLng(e.latlng);
    }

    if (primeiraVez) {
        mapa.fitBounds(circuloRaio.getBounds());
        primeiraVez = false;
    }

    escrever("local-detalhe", "Precisão de ±" + Math.round(e.accuracy) + " m · atualizando em tempo real");
    atualizarNomeLocal(e.latlng);
});

mapa.on("locationerror", function () {
    alert("Não foi possível obter sua localização.");
    pararRastreio();
});

//Atualização Automatica do Inep
var INTERVALO = 10 * 60 * 1000;      
var idsVistos = null;
var ultimaAtualizacaoInpe = 0;
var primeiraCarga = true;

function atualizarFocos() {
    return buscarFocos()
        .then(function (features) {
            console.log("INPE: " + features.length + " foco(s) recebido(s)");

            desenharFocos(features);
            desenharAreas(features, primeiraCarga);
            alertasInpe = featuresParaAlertas(features);
            renderizarLista();

            var novos = idsVistos
                ? features.filter(function (f) { return !idsVistos.has(f.properties.foco_id); })
                : [];
            idsVistos = new Set(features.map(function (f) { return f.properties.foco_id; }));

            if (novos.length) {
                escrever("aviso-novos", novos.length + " novo(s) foco(s) de calor detectado(s)");
            }

            escrever("ultima-atualizacao",
                "Atualizado às " + new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));

            primeiraCarga = false;
            ultimaAtualizacaoInpe = Date.now();
        })
        .catch(function (erro) {
            console.error("Falhou ao atualizar os focos do INPE:", erro);
        });
}

atualizarFocos();

setInterval(function () {
    if (document.visibilityState === "visible") atualizarFocos();
}, INTERVALO);

document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - ultimaAtualizacaoInpe > INTERVALO) {
        atualizarFocos();
    }
});


function desenharRelatos(relatos) {
    camadaRelatos.clearLayers();
    var validos = relatos.filter(relatoValido);

    validos.forEach(function (r) {
        var pin = L.marker([r.lat, r.lng], { icon: criarIconeRelato(r.tipo, r.nivel) })
            .bindPopup(popupRelato(r))
            .addTo(camadaRelatos);
        marcadoresPorId["rel-" + r.id] = pin;
    });

    alertasRelatos = validos.map(function (r) {
        var t = TIPOS[r.tipo] || TIPOS.outro;
        return {
            id: "rel-" + r.id,
            origem: r.exemplo ? "exemplo" : "usuario",
            tipo: r.tipo,
            nivel: r.nivel,
            lat: r.lat,
            lng: r.lng,
            titulo: t.rotulo,
            local: r.local || "",
            detalhe: t.rotulo,
            criadoEm: r.criadoEm
        };
    });

    renderizarLista();
}


var marcadoresPorId = {};          
var posicaoUsuario = null;
var LIMITE_LISTA = 8;              
var PESO_NIVEL = { alto: 3, moderado: 2, baixo: 1 };
var NIVEIS = { alto: "Alto", moderado: "Moderado", baixo: "Baixo" };
var TIPOS = {
    calor: { rotulo: "Foco de calor", icone: "fa-fire-flame-curved" },
    outro: { rotulo: "Alerta", icone: "fa-triangle-exclamation" }
};
var ROTULO_ORIGEM = { inpe: "Fonte: INPE", usuario: "Relato de usuário", exemplo: "Exemplo fictício" };

function escaparHtml(valor) {
    return String(valor == null ? "" : valor).replace(/[&<>"']/g, function (caractere) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        }[caractere];
    });
}

function formatarDistancia(m) {
    if (m < 1000) return Math.round(m) + " m";
    return (m / 1000).toFixed(1).replace(".", ",") + " km";
}

function ordenarAlertas(lista) {
    if (posicaoUsuario) {
        
        lista.forEach(function (a) { a.distancia = mapa.distance(posicaoUsuario, [a.lat, a.lng]); });
        lista.sort(function (a, b) { return a.distancia - b.distancia; });
    } else {
        
        lista.sort(function (a, b) {
            return (PESO_NIVEL[b.nivel] - PESO_NIVEL[a.nivel]) ||
                   (new Date(b.criadoEm) - new Date(a.criadoEm));
        });
    }
    return lista;
}

function renderizarLista() {
    var caixa = document.getElementById("lista-alertas");
    if (!caixa) return;

    var lista = ordenarAlertas(alertasInpe.concat(alertasRelatos));
    var visiveis = lista.slice(0, LIMITE_LISTA);

    escrever("contador-alertas", lista.length + (lista.length === 1 ? " alerta" : " alertas"));
    escrever("lista-dica", posicaoUsuario
        ? "Ordenados do mais perto para o mais longe"
        : "Ative sua localização para ordenar por distância");

    if (!visiveis.length) {
        caixa.innerHTML = '<p class="lista-vazia">Nenhum alerta informado nas últimas 48 h. ' +
                          'Isso não garante que não haja fogo na região. Em emergência, ligue 193.</p>';
        return;
    }

    caixa.innerHTML = visiveis.map(function (a) {
        var t = TIPOS[a.tipo] || TIPOS.outro;
        var dist = posicaoUsuario ? " • a " + formatarDistancia(a.distancia) : "";

        return '<article class="alerta-item" data-id="' + escaparHtml(a.id) + '" tabindex="0" role="button">' +
                   '<span class="alerta-icone"><i class="fa-solid ' + t.icone + '"></i></span>' +
                   '<div class="alerta-conteudo">' +
                       '<strong>' + escaparHtml(a.titulo) + (a.local ? " · " + escaparHtml(a.local) : "") + '</strong>' +
                       '<span>' + escaparHtml(a.detalhe || t.rotulo) + dist + '</span>' +
                       '<small class="tag tag-' + a.nivel + '">' + NIVEIS[a.nivel] + '</small>' +
                   '</div>' +
                   '<small>' + ROTULO_ORIGEM[a.origem] + '</small>' +
               '</article>';
    }).join("");
}


var ultimoRender = 0;
function renderizarListaSuave() {
    if (Date.now() - ultimoRender < 5000) return;
    ultimoRender = Date.now();
    renderizarLista();
}


function abrirAlerta(card) {
    var pin = marcadoresPorId[card.getAttribute("data-id")];
    if (!pin) return;
    mapa.flyTo(pin.getLatLng(), 14);
    pin.openPopup();
}

var caixaLista = document.getElementById("lista-alertas");
if (caixaLista) {
    caixaLista.addEventListener("click", function (ev) {
        var card = ev.target.closest(".alerta-item");
        if (card) abrirAlerta(card);
    });
    caixaLista.addEventListener("keydown", function (ev) {
        var card = ev.target.closest(".alerta-item");
        if (card && ev.key === "Enter") abrirAlerta(card);
    });
}