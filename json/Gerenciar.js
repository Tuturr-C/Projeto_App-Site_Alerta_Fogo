// Ferramenta de linha de comando para ver e apagar dados do banco.
// Uso:  node gerenciar.js <comando> [argumento]
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Não cria um banco vazio por engano: confere se o arquivo existe antes de abrir.
const CAMINHO_BANCO = process.env.DB_PATH || path.join(__dirname, 'alerte_fogo.db');
if (!fs.existsSync(CAMINHO_BANCO)) {
  console.error(`Banco não encontrado em ${CAMINHO_BANCO}`);
  console.error('Rode este comando dentro da pasta do server.js e inicie o servidor ao menos uma vez (npm start) para o banco ser criado.');
  process.exit(1);
}
const bd = require('./db');

const [comando, argumento] = process.argv.slice(2);

function ajuda() {
  console.log(`
Comandos:
  listar                       mostra os focos (com o total de alertas) e os relatos de cada um
  apagar-relato <id>           apaga UM relato (e a foto dele); se o foco ficar vazio, apaga o foco
  apagar-foco <id>             apaga um foco com TODOS os relatos e fotos dele
  apagar-descricao "<texto>"   apaga todos os relatos com exatamente essa descrição (ex.: teste)
  apagar-tudo                  apaga TODOS os relatos, focos e fotos (pede confirmação)

Exemplos:
  node gerenciar.js listar
  node gerenciar.js apagar-relato 5
  node gerenciar.js apagar-foco 2
  node gerenciar.js apagar-descricao "teste"
`);
}

function mostrarResultado(r) {
  console.log(`Apagados: ${r.relatos} relato(s), ${r.focos} foco(s) e ${r.fotos} foto(s).`);
}

function exigirNumero(valor, nome) {
  const n = parseInt(valor, 10);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`Informe o ${nome} (um número). Exemplo: node gerenciar.js ${comando} 3`);
    process.exit(1);
  }
  return n;
}

function perguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(texto, (r) => { rl.close(); resolve(r.trim()); }));
}

function listar() {
  const focos = bd.listarFocos();
  if (!focos.length) return console.log('Nenhum foco registrado.');

  console.log('\nFOCOS (cada foco agrupa os relatos feitos no mesmo local)\n');
  console.table(focos.map((f) => ({
    foco: f.id,
    alertas: f.total_alertas,
    local: (f.local_nome || `${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}`).slice(0, 50),
    primeiro: f.criado_em,
    ultimo: f.atualizado_em,
  })));

  console.log('RELATOS\n');
  console.table(focos.flatMap((f) => f.relatos.map((r) => ({
    relato: r.id,
    foco: r.foco_id,
    tipo: r.tipo,
    descricao: r.descricao.length > 40 ? r.descricao.slice(0, 37) + '...' : r.descricao,
    foto: r.foto_url ? 'sim' : 'não',
    data: r.criado_em,
  }))));
}

(async () => {
  switch (comando) {
    case 'listar':
      listar();
      break;

    case 'apagar-relato': {
      const id = exigirNumero(argumento, 'id do relato');
      mostrarResultado(bd.apagarRelatos([id]));
      break;
    }

    case 'apagar-foco': {
      const id = exigirNumero(argumento, 'id do foco');
      const ids = bd.idsDoFoco(id);
      if (!ids.length) return console.log('Esse foco não existe ou já está vazio.');
      mostrarResultado(bd.apagarRelatos(ids));
      break;
    }

    case 'apagar-descricao': {
      if (!argumento) {
        console.error('Informe o texto entre aspas. Exemplo: node gerenciar.js apagar-descricao "teste"');
        process.exit(1);
      }
      const ids = bd.idsPorDescricao(argumento);
      if (!ids.length) return console.log('Nenhum relato com essa descrição.');
      mostrarResultado(bd.apagarRelatos(ids));
      break;
    }

    case 'apagar-tudo': {
      const resposta = await perguntar('Isso apaga TODOS os relatos, focos e fotos. Digite SIM para continuar: ');
      if (resposta !== 'SIM') return console.log('Cancelado. Nada foi apagado.');
      mostrarResultado(bd.apagarTudo());
      break;
    }

    default:
      ajuda();
  }
})();