
/* ---------- BLOCO 1: monta o endereço escrito ---------- */

// Transforma a resposta do Nominatim em algo como
// "Rua Exemplo, 123, Jardim Ipê, Campinas - SP"
function formatarEndereco(d) {
  const a = d.address || {};
  const rua = a.road || a.pedestrian || a.footway || a.path || a.cycleway || '';
  const numero = rua && a.house_number ? `${rua}, ${a.house_number}` : rua;
  const bairro = a.suburb || a.neighbourhood || a.quarter || a.city_district || '';
  const cidade = a.city || a.town || a.village || a.municipality || '';
  const uf = (a['ISO3166-2-lvl4'] || '').replace('BR-', '');
  const lugar = d.name && d.name !== rua ? d.name : ''; // ex.: nome de um parque

  const partes = [lugar, numero, bairro, cidade && (uf ? `${cidade} - ${uf}` : cidade)]
    .filter(Boolean);

  // se a resposta veio sem detalhes, usa as 3 primeiras partes do texto completo
  return partes.length
    ? partes.join(', ')
    : (d.display_name || '').split(',').slice(0, 3).join(',').trim();
}

let ultimaBusca = 0; // evita que uma resposta antiga sobrescreva uma mais nova


/* ---------- BLOCO 2: descobre o endereço de um ponto (mapa, arraste ou GPS) ---------- */

// origem: 'mapa' (padrão) ou 'gps'
async function localPorMapa(lat, lng, origem = 'mapa') {
  const minhaBusca = ++ultimaBusca;
  definirLocal(lat, lng, origem);
  $('local-detalhe').textContent = 'Buscando o nome do lugar…';
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`,
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const d = await r.json();
    if (minhaBusca !== ultimaBusca) return; // chegou uma resposta de uma busca antiga
    const nome = formatarEndereco(d);
    if (nome) definirLocal(lat, lng, origem, nome);
    else $('local-detalhe').textContent = `Sem nome para este ponto. Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    if (minhaBusca === ultimaBusca) {
      $('local-detalhe').textContent = 'Não consegui descobrir o endereço agora. As coordenadas serão salvas.';
    }
  }
}


/* ---------- BLOCO 3: endereço digitado ---------- */

async function buscarEndereco() {
  const q = $('busca-endereco').value.trim();
  if (!q) return;
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&q='
        + encodeURIComponent(q),
      { headers: { 'Accept-Language': 'pt-BR' } }
    );
    const d = await r.json();
    if (!d.length) return mostrar('Endereço não encontrado. Tente marcar direto no mapa.', 'warning');
    const lat = parseFloat(d[0].lat), lng = parseFloat(d[0].lon);
    ultimaBusca++; // cancela qualquer busca por clique que ainda esteja em andamento
    definirLocal(lat, lng, 'endereco', formatarEndereco(d[0]));
    mapa.setView([lat, lng], 16);
    mostrar('');
  } catch {
    mostrar('Não foi possível buscar o endereço agora. Marque no mapa.', 'warning');
  }
}


/* ---------- BLOCO 4: botão "Meu local" (GPS) ---------- */

$('btn-gps').addEventListener('click', () => {
  if (!navigator.geolocation) return mostrar('Seu navegador não suporta geolocalização.', 'warning');
  $('local-detalhe').textContent = 'Obtendo a sua localização…';
  navigator.geolocation.getCurrentPosition(
    (p) => {
      const { latitude, longitude } = p.coords;
      mapa.setView([latitude, longitude], 16);
      localPorMapa(latitude, longitude, 'gps'); // mesma busca de endereço do clique no mapa
      mostrar('');
    },
    () => mostrar('Não foi possível obter seu local. Marque no mapa.', 'warning'),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});