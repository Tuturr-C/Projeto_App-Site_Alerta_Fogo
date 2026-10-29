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