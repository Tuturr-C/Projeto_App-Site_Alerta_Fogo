

// Mapa 
var mapa = L.map("mapa").setView([-22.9099, -47.0626], 12);

L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);

//Estado e camadas
var camadaFocos = L.layerGroup().addTo(mapa);
var camadaAreas = L.layerGroup().addTo(mapa);
var camadaRelatos = L.layerGroup().addTo(mapa);

var marcadoresPorId = {};
var alertasInpe = [];
var alertasRelatos = [];
var posicaoUsuario = null;

var LIMITE_LISTA = 8;

// Nível do card lateral (por quantidade de focos na região)
var NIVEIS_CARD = [
    { id: "critico",  min: 10, rotulo: "RISCO CRÍTICO",
      titulo: "Perigo imediato",
      texto: "Vários focos ativos na região. Evite áreas de mato e siga as orientações da Defesa Civil." },
    { id: "alto",     min: 5,  rotulo: "RISCO ALTO",
      titulo: "Atenção redobrada hoje",
      texto: "Vários focos detectados na região. Evite queimadas e mantenha distância dos focos." },
    { id: "moderado", min: 1,  rotulo: "RISCO MODERADO",
      titulo: "Fique atento",
      texto: "Há focos detectados na região. Acompanhe as atualizações." },
    { id: "baixo",    min: 0,  rotulo: "RISCO BAIXO",
      titulo: "Sem focos no momento",
      texto: "Nenhum foco detectado nas últimas 48h na região." }
];

// Nível de cada foco
var PESO_NIVEL = { critico: 4, alto: 3, moderado: 2, baixo: 1 };
var ROTULO_NIVEL = { critico: "Crítico", alto: "Alto", moderado: "Moderado", baixo: "Baixo" };

var TIPOS = {
    calor: { rotulo: "Foco de calor", icone: "fa-fire-flame-curved" },
    outro: { rotulo: "Alerta", icone: "fa-triangle-exclamation" }
};
var ROTULO_ORIGEM = { inpe: "Fonte: INPE", usuario: "Relato de usuário", exemplo: "Exemplo fictício" };

var estiloArea = {
    critico:  { color: "#7b0d1e", fillColor: "#7b0d1e", fillOpacity: 0.35, weight: 2 },
    alto:     { color: "#b3361f", fillColor: "#e63946", fillOpacity: 0.35, weight: 2 },
    moderado: { color: "#8a6a12", fillColor: "#e9a23b", fillOpacity: 0.30, weight: 2 },
    baixo:    { color: "#3f6b3a", fillColor: "#6a994e", fillOpacity: 0.25, weight: 2 }
};


function escrever(id, texto) {
    var el = document.getElementById(id);
    if (el) el.textContent = texto;
}

function escaparHtml(valor) {
    return String(valor == null ? "" : valor).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
}

function formatarDistancia(m) {
    if (m < 1000) return Math.round(m) + " m";
    return (m / 1000).toFixed(1).replace(".", ",") + " km";
}

function formatarData(iso) {
    if (!iso) return "-";
    var d = new Date(iso.indexOf("Z") === -1 && iso.indexOf("+") === -1 ? iso + "Z" : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Card de risco 
function calcularNivel(qtd) {
    return NIVEIS_CARD.find(function (n) { return qtd >= n.min; });
}

function mostrarAlerta(qtd) {
    var nivel = calcularNivel(qtd);
    var card = document.getElementById("alerta-incendio");
    if (!card) return;

    card.className = "risco-resumo nivel-" + nivel.id;
    escrever("alerta-rotulo", nivel.rotulo);
    escrever("alerta-titulo", nivel.titulo);
    escrever("alerta-texto", nivel.texto);
    escrever("alerta-contagem", qtd + " foco(s) detectado(s) nas últimas 48h");
}

//Condicionais do Card lateral
function nivelDoFoco(props) {
    var r = parseFloat(props.risco_fogo);
    if (isNaN(r) || r < 0) return "moderado";   
    if (r >= 0.7) return "alto";
    if (r >= 0.4) return "moderado";
    return "baixo";
}

function criarIcone(nivel) {
    return L.divIcon({
        className: "pin-fogo pin-" + nivel,
        html: '<i class="fa-solid fa-fire"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function popupFoco(p, nivel) {
    return "<strong>Foco de calor</strong><br>" +
           "Município: " + escaparHtml(p.municipio || "-") + "<br>" +
           "Satélite: " + escaparHtml(p.satelite || "-") + "<br>" +
           "Detectado: " + escaparHtml(formatarData(p.data_hora_gmt)) + "<br>" +
           "Nível: " + ROTULO_NIVEL[nivel] +
           "<br><small>Fonte: INPE</small>";
}

function desenharFocos(features) {
    camadaFocos.clearLayers();

    Object.keys(marcadoresPorId).forEach(function (k) {
        if (k.indexOf("inpe-") === 0) delete marcadoresPorId[k];
    });

    features.forEach(function (f, i) {
        if (!f.geometry || !f.geometry.coordinates) return;
        var lon = f.geometry.coordinates[0];   
        var lat = f.geometry.coordinates[1];
        var p = f.properties || {};
        var nivel = nivelDoFoco(p);

        var pin = L.marker([lat, lon], { icon: criarIcone(nivel) })
            .bindPopup(popupFoco(p, nivel))
            .addTo(camadaFocos);

        marcadoresPorId["inpe-" + (p.foco_id || i)] = pin;
    });
}

// Área dos focos 
function desenharAreas(features) {
    camadaAreas.clearLayers();

    features.forEach(function (f) {
        if (!f.geometry || !f.geometry.coordinates) return;
        var nivel = nivelDoFoco(f.properties || {});
        L.circle([f.geometry.coordinates[1], f.geometry.coordinates[0]],
                 Object.assign({ radius: 1000, interactive: false }, estiloArea[nivel]))
            .addTo(camadaAreas);
    });
}

function featuresParaAlertas(features) {
    return features
        .filter(function (f) { return f.geometry && f.geometry.coordinates; })
        .map(function (f, i) {
            var p = f.properties || {};
            return {
                id: "inpe-" + (p.foco_id || i),
                origem: "inpe",
                tipo: "calor",
                nivel: nivelDoFoco(p),
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
                titulo: "Foco de calor",
                local: p.municipio || "",
                detalhe: (p.satelite ? "Satélite " + p.satelite : "Detectado pelo INPE"),
                criadoEm: p.data_hora_gmt
            };
        });
}

// Relatos de usuários (usado pela página de informar foco) 
function relatoValido(r) {
    return r && typeof r.lat === "number" && typeof r.lng === "number" && isFinite(r.lat) && isFinite(r.lng);
}

function criarIconeRelato(tipo, nivel) {
    var t = TIPOS[tipo] || TIPOS.outro;
    return L.divIcon({
        className: "pin-fogo pin-" + (nivel || "moderado"),
        html: '<i class="fa-solid ' + t.icone + '"></i>',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });
}

function popupRelato(r) {
    var t = TIPOS[r.tipo] || TIPOS.outro;
    return "<strong>" + escaparHtml(t.rotulo) + "</strong><br>" +
           escaparHtml(r.local || "") +
           "<br><small>" + (r.exemplo ? "Exemplo fictício" : "Relato de usuário") + "</small>";
}

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
            nivel: r.nivel || "moderado",
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

//  Lista "Alertas próximos" 
function ordenarAlertas(lista) {
    if (posicaoUsuario) {
        lista.forEach(function (a) { a.distancia = mapa.distance(posicaoUsuario, [a.lat, a.lng]); });
        lista.sort(function (a, b) { return a.distancia - b.distancia; });
    } else {
        lista.sort(function (a, b) {
            return ((PESO_NIVEL[b.nivel] || 0) - (PESO_NIVEL[a.nivel] || 0)) ||
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
                       '<small class="tag tag-' + a.nivel + '">' + (ROTULO_NIVEL[a.nivel] || "") + '</small>' +
                   '</div>' +
                   '<small>' + (ROTULO_ORIGEM[a.origem] || "") + '</small>' +
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

//  Localização do usuário 
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


var INTERVALO = 10 * 60 * 1000;
var idsVistos = null;
var ultimaAtualizacaoInpe = 0;

function atualizarFocos() {
    return buscarFocos()
        .then(function (features) {
            mostrarAlerta(features.length);
            console.log("INPE: " + features.length + " foco(s) recebido(s)");

            desenharAreas(features);
            desenharFocos(features);
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

            ultimaAtualizacaoInpe = Date.now();
        })
        .catch(function (erro) {
            console.error("Falhou ao atualizar os focos do INPE:", erro);
            escrever("alerta-texto", "Não foi possível carregar os focos agora. Tente novamente em instantes.");
            var caixa = document.getElementById("lista-alertas");
            if (caixa && !alertasInpe.length && !alertasRelatos.length) {
                caixa.innerHTML = '<p class="lista-vazia">Não foi possível carregar os alertas agora.</p>';
            }
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