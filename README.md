# Alerta Fogo

## Descrição
Aplicativo desenvolvido para alertar para os usuários sobre incêndios iminentes que acontecem dentro de uma cidade (Campinas).

## Tecnologias Utilizadas
- HTML5, CSS3, JavaScript
- Banco de Dados: SQLite
- Caso Necessário será utilizado uma linguagem de Mobile (Ex: Swift/ React)

## Estrutura do Projeto
Explicação da estrutura de pastas e arquivos do projeto:
- api/ - Contém scripts de backend para manipulação do banco de dados.
- Docs - Documentos sobre a PaginaWeb/Aplicativo AlertaFogo
- AlertaFogo - Contém as Fotos utilizadas na pagina do Site
- js - Contém arquivos JavaScript para funcionalidades do frontend.
- css - Contém arquivos CSS para estilização do frontend.
- html - Contém arquivos HTML para as páginas do site.

## Protótipo
Link para o protótipo no Figma: https://www.figma.com/design/HrHzpJbnl8Zfj18xfcN5tD/Sem-t%C3%ADtulo?node-id=0-1&t=r6co2pmuehQL5kAJ-1

## Integrantes
- Arthur Henrique Silva Gerotto - HTML (Riscos Proximos), JS (Riscos Proximos), css (Geral)
- Matheus Balbine Simões - HTML( Riscos Proximos), css( Geral)
- Raquel Rubio de Souza - API (Geral), Pesquisa de Mercado (Geral)
- Sophia Batista Joriatti - HTML( Informar Foco), css( Informar Foco), Banco de Dados ( Informar Foco)
- Júlia Tiemi Muramoto - HTML (Pagina Desenvolvedores, Orientações), css (Pagina Desenvolvedores, Orientações)

## Status do Projeto
Em desenvolvimento.
- Primeira versão estimada para: [04/12/2026]


# Guia do banco de dados 

Passo a passo para rodar o servidor, enviar relatos, ver os dados e excluir itens.
Os comandos são para o **cmd do Windows**.

---

## 1. Visão geral

O formulário "Informar foco" envia os dados para um servidor Node, que grava num banco **SQLite** (um único arquivo, sem instalar nada).

```
Navegador (Informar_Foco.html)
        │  fetch POST /api/relatos
        ▼
server.js  ──►  db.js  ──►  alerte_fogo.db   (relatos e focos)
        │
        └──►  uploads/   (fotos enviadas)
```

### Relato e foco

O banco tem duas tabelas principais:

| Tabela | O que é |
|---|---|
| `relatos` | Cada envio do formulário: tipo, descrição, endereço escrito, latitude, longitude, foto e data. |
| `focos` | O conjunto de relatos sobre o mesmo incêndio. Guarda a posição, o endereço e as datas do primeiro e do último relato. |

O número de alertas de um foco é a **quantidade de relatos** dele. Dois relatos no mesmo local formam **um foco com 2 alertas**.

### Regra de agrupamento

Um relato novo entra num foco já existente quando:

- está a até **300 metros** da posição do foco; e
- o último relato daquele foco chegou há no máximo **24 horas**.

Caso contrário, nasce um foco novo. O tipo de ocorrência (Vegetação, Fumaça, Outro) não influencia.

Para mudar esses valores, edite as duas constantes no topo do `db.js`:

```js
const RAIO_AGRUPAMENTO_M = 300;
const JANELA_HORAS = 24;
```

---

## 2. Arquivos e pastas

A pasta do servidor (`json`) deve ficar **ao lado** das pastas do site:

```
Projeto_App-Site_Alerta_Fogo\
├── css\
├── fonts\
├── html\
├── Icons\
├── js\
└── json\                  ← o backend fica aqui
    ├── server.js          servidor (rotas e upload de fotos)
    ├── db.js              banco, agrupamento em focos e exclusão
    ├── gerenciar.js       comandos para listar e apagar
    ├── package.json
    ├── alerte_fogo.db     criado sozinho (o banco)
    └── uploads\           criada sozinha (as fotos)
```

Só as pastas `html`, `css`, `js`, `Icons` e `fonts` ficam públicas no navegador. O banco e o `server.js` **não** são expostos. Se o site usar outra pasta (por exemplo `img`), acrescente o nome dela em `PASTAS_PUBLICAS`, no topo do `server.js`.

---

## 3. Instalar e iniciar

Você precisa do **Node.js** instalado (confira com `node --version`).

**3.1. Entrar na pasta do servidor**

```
cd caminho\do\projeto\json
```

> Erro `ENOENT ... package.json`? Você está na pasta errada. O comando precisa rodar **dentro** da pasta que tem o `package.json`.

**3.2. Instalar as dependências (só na primeira vez)**

```
npm install
```

**3.3. Iniciar o servidor**

```
npm start
```

O esperado é aparecer `Rodando em http://localhost:3000`. Deixe esse terminal aberto. Para parar, use `Ctrl+C`.

Na primeira vez que o servidor sobe com esta versão, um banco antigo é **convertido sozinho**: os relatos que já existiam são agrupados em focos. Nada se perde.

**3.4. Abrir a página**

```
http://localhost:3000/html/Informar_Foco.html
```

Abra sempre por esse endereço. Se abrir o arquivo direto ou pelo Live Server, o envio do formulário não funciona.

---

## 4. Enviar um relato

1. Marque o local de uma destas formas:
   - clique no mapa (ou arraste o pino);
   - clique no lápis, digite um endereço e clique em **Buscar**;
   - clique em **Meu local** (GPS).
2. Escolha o tipo de ocorrência e escreva a descrição (até 500 caracteres).
3. Se quiser, adicione uma foto (JPG, PNG ou WEBP, até 10 MB).
4. Clique em **Enviar relato**.

O servidor responde com o resultado do agrupamento:

```json
{ "ok": true, "id": 7, "foco_id": 4, "novo_foco": false, "total_alertas": 2 }
```

- `novo_foco: true` — o relato abriu um foco novo.
- `novo_foco: false` — o relato foi somado a um foco que já existia perto dali. `total_alertas` mostra quantos alertas o foco tem agora.

### Testar sem a página (opcional)

```
curl.exe -X POST http://localhost:3000/api/relatos -F "tipo=vegetacao" -F "descricao=teste" -F "latitude=-22.9" -F "longitude=-47.06" -F "origem_local=mapa"
```

No PowerShell use `curl.exe`, não `curl`.

---

## 5. Ver os dados

### No navegador

| Endereço | O que mostra |
|---|---|
| `http://localhost:3000/api/focos` | Focos, cada um com `total_alertas` e a lista de `relatos`. |
| `http://localhost:3000/api/focos/1` | Um foco só (troque o 1 pelo id). |
| `http://localhost:3000/api/focos?lat=-22.9&lng=-47.06&raio_km=10` | Só os focos próximos, do mais perto ao mais longe (campo `distancia_km`). |
| `http://localhost:3000/api/relatos` | Lista simples de relatos, sem agrupar. Cada um traz o `foco_id`. |

Cada relato traz `local_nome` (o endereço escrito) e `foto_url`. Para ver a foto, abra `http://localhost:3000` seguido do `foto_url`, por exemplo `http://localhost:3000/uploads/3f2a....jpg`. Relatos sem foto vêm com `foto_url` nulo.

### No terminal

```
node gerenciar.js listar
```

Mostra uma tabela com os focos (id, total de alertas, local, primeiro e último relato) e outra com os relatos (id, foco, tipo, descrição, se tem foto e a data).

### Em programa visual

Abra o arquivo `alerte_fogo.db` no **DB Browser for SQLite** (gratuito). Procure as tabelas `focos` e `relatos`. Abra em modo somente leitura e feche o programa antes de enviar novos relatos, para não travar o banco.

---

## 6. Excluir itens

Rode no cmd, **dentro da pasta `json`**. Pode ser com o servidor ligado.

| Comando | O que faz |
|---|---|
| `node gerenciar.js listar` | Mostra os ids para você escolher o que apagar. |
| `node gerenciar.js apagar-relato 5` | Apaga o relato 5 e a foto dele. |
| `node gerenciar.js apagar-foco 2` | Apaga o foco 2 com **todos** os relatos e fotos dele. |
| `node gerenciar.js apagar-descricao "teste"` | Apaga todos os relatos com exatamente essa descrição (não diferencia maiúsculas). |
| `node gerenciar.js apagar-tudo` | Apaga tudo (relatos, focos e fotos) e faz os ids voltarem para 1. Pede que você digite `SIM`. |

O que acontece ao apagar:

- Se o foco ainda tiver outros relatos, ele continua e o número de alertas diminui.
- Se o foco ficar **sem nenhum relato**, ele também é apagado.
- As fotos saem da pasta `uploads` junto com os relatos. Não precisa apagá-las na mão.
- Cada comando mostra o resultado, por exemplo: `Apagados: 2 relato(s), 1 foco(s) e 1 foto(s).`

**Não há como desfazer.** Para guardar uma cópia antes de apagar, pare o servidor e copie o `alerte_fogo.db` para outro lugar.

---

## 7. Endereço escrito no formulário

O arquivo `trecho-endereco.js` tem quatro blocos de JavaScript para colar no `<script>` do `Informar_Foco.html`. Eles escrevem o local por extenso (por exemplo `Rua Exemplo, 123, Jardim Ipê, Campinas - SP`) quando você clica no mapa, busca um endereço ou usa o GPS. O texto aparece no formulário e é salvo na coluna `local_nome`. As instruções de onde colar cada bloco estão no topo do arquivo.

O endereço vem do OpenStreetMap e é aproximado. Em áreas rurais pode vir só com cidade e estado. As coordenadas são sempre guardadas.

### Mensagem de sucesso mostrando o agrupamento (opcional)

No `fetch` de envio, depois de `const json = await resp.json();`, troque a mensagem de sucesso por:

```js
mostrar(json.novo_foco
  ? 'Relato enviado. Obrigado por avisar! Em caso de perigo, ligue 193.'
  : `Seu relato foi somado a um foco já informado aqui perto (agora são ${json.total_alertas} alertas).`, 'success');
```

---

## 8. Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `npm error ENOENT ... package.json` | Entre na pasta `json` antes de rodar `npm install`. |
| `Cannot GET /css/...` | A pasta `json` não está ao lado de `css`, ou a pasta não está em `PASTAS_PUBLICAS`. Ao iniciar, o servidor avisa no terminal qual pasta não achou. |
| Página sem estilo | Abra por `http://localhost:3000/html/...`. Confira o Bootstrap (extensão bloqueando CDN?) e recarregue com Ctrl+Shift+R. |
| Mapa embaralhado | Falta o `leaflet.css` no `<head>`: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`. |
| Cores e bordas sumiram | As variáveis do `:root` do `Informar_Foco.css` precisam ter os nomes que as regras usam (`--borda`, `--fundo`, `--faixa`, `--destaque`, `--destaque-claro`, `--verde`). |
| Erro ao enviar o formulário | Aperte F12, aba **Console**, e olhe também o terminal do servidor. |
| `EADDRINUSE` (porta 3000 em uso) | Feche o outro servidor, ou rode `set PORT=3001` e depois `npm start`. Abra a página na porta 3001. |
| `database is locked` ou conflito do OneDrive | O OneDrive sincroniza o banco e a `node_modules`. Pause a sincronização ao testar, ou mova o projeto para fora do OneDrive (por exemplo `C:\projetos`). |
| Erro no `npm install` do `better-sqlite3` | Instale a versão LTS do Node.js e rode `npm install` de novo. Se persistir, anote a saída de `node --version` e a mensagem de erro. |
| Nome da rua não aparece | Confira os quatro blocos do `trecho-endereco.js` e o Console (F12). O serviço gratuito do OpenStreetMap às vezes demora ou recusa muitas buscas seguidas. |
| `Banco não encontrado` no `gerenciar.js` | Rode dentro da pasta `json` e inicie o servidor ao menos uma vez (`npm start`) para o banco ser criado. |

---

## 9. Antes de apresentar ou subir para o GitHub

- Rode `node gerenciar.js apagar-tudo` para remover relatos e fotos de teste.
- O `.gitignore` já exclui `node_modules/`, `uploads/` e os arquivos do banco (`*.db`, `*.db-wal`, `*.db-shm`). Confira com `git status` que nenhum deles aparece para envio.
- Este conceito é uma demonstração: o envio **não** chega aos bombeiros. Em caso de emergência real, a orientação continua sendo ligar para o **193**.
