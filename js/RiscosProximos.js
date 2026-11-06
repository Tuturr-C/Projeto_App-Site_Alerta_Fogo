    // Define a cordenada e configurações do Mapa (Campinas)
var mapa = L.map("mapa").setView([-22.9099, -47.0626], 12);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:'&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(mapa);


// Configuração do Icone
var iconeFogo = L.divIcon({
    className: "pin-fogo",
    html: '<i class="fa-solid fa-fire"></i>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
});


var marcador = null;
function onMapClick(e) {
    if (marcador) {
        marcador.setLatLng(e.latlng);
    } else {
        marcador = L.marker(e.latlng, { icon: iconeFogo }).addTo(mapa);
    }

    document.getElementById("lat").value = e.latlng.lat.toFixed(6);
    document.getElementById("lng").value = e.latlng.lng.toFixed(6);
}

mapa.on("click", onMapClick);


var pontoUsuario = null;
var circuloRaio = null;
var primeiraVez = true;
var rastreando = false;
var ultimaBusca = null;
var ultimoTempo = 0;

var faixa = document.getElementById("faixa-local");
var botao = document.getElementById("btn-localizar");

// Busca o nome do local, sem exagerar nas consultas
function atualizarNomeLocal(pos) {
    var agora = Date.now();
    var moveuMuito = !ultimaBusca || mapa.distance(ultimaBusca, pos) > 300;   // metros
    if (!moveuMuito || agora - ultimoTempo < 15000) return;                   // no máx. a cada 15 s

    ultimaBusca = pos;
    ultimoTempo = agora;

    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=pt-BR" +
              "&lat=" + pos.lat.toFixed(2) + "&lon=" + pos.lng.toFixed(2);

    fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (d) {
            var a = d.address || {};
            var bairro = a.suburb || a.neighbourhood || a.city_district || "";
            var cidade = a.city || a.town || a.village || a.municipality || "";
            document.getElementById("local-texto").textContent =
                [bairro, cidade].filter(Boolean).join(", ") || "Local não identificado";
        })
        .catch(function () {
            document.getElementById("local-texto").textContent = "Local não identificado";
        });
}

// Liga e desliga o acompanhamento
botao.addEventListener("click", function () {
    if (!rastreando) {
        mapa.locate({ watch: true, enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
        rastreando = true;
        botao.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Parar de acompanhar';
    } else {
        pararRastreio();
    }
});

function pararRastreio() {
    mapa.stopLocate();
    rastreando = false;
    primeiraVez = true;
    faixa.hidden = true;
    if (pontoUsuario) { mapa.removeLayer(pontoUsuario); pontoUsuario = null; }
    if (circuloRaio) { mapa.removeLayer(circuloRaio); circuloRaio = null; }
    botao.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Usar minha localização';
}


mapa.on("locationfound", function (e) {
    faixa.hidden = false;                         

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

    document.getElementById("local-detalhe").textContent =
        "Precisão de ±" + Math.round(e.accuracy) + " m · atualizando em tempo real";

    atualizarNomeLocal(e.latlng);
});

mapa.on("locationerror", function () {
    alert("Não foi possível obter sua localização.");
    pararRastreio();
});