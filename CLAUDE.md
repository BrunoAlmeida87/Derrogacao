# CLAUDE.md — o que é este sistema e como mexer nele

Contexto para quem chega agora (inclusive eu, numa conversa nova). O `README.md`
explica o sistema **para quem usa**; este arquivo explica **para quem edita**:
as decisões já tomadas, o porquê delas, e as armadilhas.

---

## 1. O que é

Aplicação web que substitui o gerador interno de **relatórios de derrogação
(*Waiver Request*)** de NCRs do programa de submarinos (SBR3/SBR4, marcos J06,
RANAE, Naval Group). O usuário é o **Bruno** e mais duas ou três pessoas da
mesma equipe.

Duas categorias, mesmo layout, exportadas como relatórios **independentes**:
**NCR** e **DEV**. Cada item vira uma página A4 retrato; os anexos viram
páginas A4 paisagem no fim.

Publicado em **https://brunoalmeida87.github.io/Derrogacao/**, a partir da
branch `main` (veja §8).

## 2. Restrições que valem sempre

Não são preferências — são o que faz o sistema servir ao ambiente dele:

- **Nada sai do computador.** O conteúdo é material de programa de defesa. Sem
  nuvem, sem API externa, sem telemetria. Nunca proponha Firebase, Supabase e
  afins.
- **Sem servidor, sem build, sem dependência.** Abrir o `index.html` já
  funciona, inclusive de `file://`. Nada de npm, bundler, framework ou CDN.
- **JavaScript de navegador antigo.** `var`, `function`, sem módulos ES, sem
  `async/await`, sem *optional chaining*. Promises, sim. O código roda em Edge
  corporativo.
- **Um arquivo por assunto**, tudo em português nos comentários e na interface.
  Os rótulos do relatório continuam em inglês porque o documento é em inglês.
- **O PDF é sagrado.** O layout foi reconstruído pixel a pixel a partir dos
  relatórios originais. Mudança de aparência na tela **não pode** vazar para a
  impressão.

## 3. Arquivos

```
index.html                 interface inteira (nenhum template em JS)
manifest.webmanifest       instalação como aplicativo (só no site publicado)
sw.js                      service worker: rede primeiro, cache como reserva
assets/icons/              ícones do aplicativo instalado
assets/css/app.css         estilos do editor
assets/css/report.css      layout do relatório — tela e impressão A4
assets/js/store.js         modelo, persistência, mesclagem, ordenação
assets/js/pasta.js         a pasta da rede como banco de dados (e as imagens)
assets/js/report.js        monta as páginas no padrão do PDF, e as pagina
assets/js/fluxo.js         lê o Waiver Historic, desenha o caminho do waiver e
                           acha o mesmo item no relatório do marco anterior
assets/js/summary.js       apuração, filtros, gráficos SVG, aba Resumo
assets/js/chat.js          a conversa da equipe (aba opcional), pela pasta
assets/js/lado.js          o item preso ao lado do editor, em só leitura
assets/js/app.js           o editor (o maior; ~3000 linhas)
derrogacao.html            o programa inteiro num arquivo só — gerado, e versionado
tools/build-standalone.py  gera (e confere) o derrogacao.html
tests/                     40 suítes Playwright — leia tests/README.md
exemplos/                  .json prontos para importar
.github/workflows/pages.yml  publicação
```

Ordem de carga dos scripts (importa: cada um usa o anterior):
`store.js → pasta.js → report.js → fluxo.js → summary.js → chat.js → lado.js →
app.js`.

## 4. Modelo de dados

**Projeto** = um marco. Guarda as duas abas.

```js
{ id, schema, name, marco, marcoDev,
  coverTitle, coverTitleDev, coverSubtitle, footer, showCoverDate,
  ordem,                       // 'manual' | 'numero' | 'sistema' | 'funcao' | 'situacao'
  ncrs: [], devs: [],
  deleted: [],                 // lápides de exclusão (§6)
  sessions: [],                // histórico de quem mexeu em quê
  lastEditedBy/At, lastBackupBy/At, createdAt, updatedAt }
```

**Item** (NCR ou DEV — mesma forma):

```js
{ id, ncrId, systems, func,
  description, currentSituation, whyNotPossible, arguments, archAnswer,
  requestExpiry, archStatus, approvedExpiry, historic,
  certificates: [],
  evidence: [{id, ref, note, orientation,
              images:[{id, src, caption, arquivo}]}],   // arquivo: nome na pasta (§5)
  status,                      // acompanhamento interno; NÃO sai no PDF
  done,                        // espelho de status === 'aceito'
  editedBy, editedAt,          // editedAt é a chave da mesclagem
  syncBase }                   // editedAt na última troca de arquivo
```

Persistência: **IndexedDB** (`derrogacao`, v3, stores `projects`, `snapshots`,
`handles`), com `localStorage` de reserva. `Store.save/list/remove`.

**Campos desconhecidos sobrevivem.** `normalizeNcr`/`normalizeProject` remontam
o registro campo a campo — o que não estivesse na lista sumia, e era assim que
uma página velha lendo dados de uma versão nova apagava, em silêncio, o que não
entendia, e regravava a perda na pasta. Agora o que não é conhecido é copiado
de volta intacto (`extrasDe`), e `schema` guarda o maior número já visto. A
segunda linha de defesa está em `app.js`: vendo dados de `schema` maior que o
seu, a sessão passa a **só ler** (`versaoDesatualizada`) até recarregar.

### Dois campos que parecem o mesmo e não são

- **`archStatus`** é texto livre e **vai impresso** no relatório
  (*Arch Status Waiver*).
- **`status`** é controle interno, **nunca** aparece no PDF do relatório. Quatro
  valores, nesta ordem: `preenchendo`, `solicitado`, `justificar`, `aceito`
  (Em preenchimento → Waiver requested → Improve justification → Waiver
  accepted). **Só `aceito` conta como concluído.** Quem mexe nisso é
  `Store.setStatus`, e só ele — `done` nunca se descola.

## 5. Mecanismos, e por que são assim

### Exportação em PDF = impressão do navegador
Não há biblioteca de PDF. `report.js` monta as folhas em `#printRoot`,
`report.css` aplica `@page { size: A4; margin: 0 }` e `window.print()` faz o
resto. Páginas de evidência usam uma página nomeada
(`@page rep-landscape`). Foi decisão consciente: fidelidade total ao original,
zero dependências, e o usuário escolhe onde salvar.

### Paginação: as margens são padding, e padding não se repete
As margens da folha são `padding` da `.rep-page`, e a impressão sai com
`@page { margin: 0 }` — é isso que permite mandar **Margens: Nenhuma** na
janela de impressão e ainda assim sair no lugar certo. O preço: um texto que
passe do fim da folha continuaria na seguinte **colado na borda do papel**
(medido: 0,0 mm). Por isso `report.js` pagina antes de imprimir:

- `paginar()` mede a folha montada e, enquanto ela transborda, tira do fim os
  blocos marcados `data-fluido` e os leva para uma folha de continuação de
  verdade — com as mesmas margens, o rodapé repetido e o título com `(cont.)`.
  Uma seção sozinha maior que a folha é partida no texto (`partirSecao`, busca
  binária pelo ponto de corte, sem partir palavra).
- O índice da capa é `data-lista`: ali a unidade é cada linha.
- A conta só existe com layout; como o `#printRoot` fica `display:none`,
  `abrirMedida()` dá layout a ele fora da vista enquanto mede.
- A margem de segurança contra o arredondamento da impressão é a classe
  `.rep-medindo`, que encurta a área útil em 1,5 mm **durante a medição** — não
  se mexe no `limite`, que é a folha inteira: `min-height: 297mm` faz toda
  folha medir exatamente isso, e descontar dali marcaria tudo como transbordo.
- Quem cabe numa folha continua saindo exatamente como antes.
- **Listas partidas linha a linha**: um bloco `data-lista` entrega os próprios
  filhos como unidades, e os filhos marcados `data-cabecalho` não migram — são
  repetidos no alto de cada continuação. É assim que a lista de itens do
  resumo atravessa quatro folhas sem perder o título nem os rótulos das
  colunas. Uma lista que ficasse só com o cabeçalho é removida.
- A mesma máquina serve ao **relatório**, ao **resumo** e aos **fluxos**: os
  três chamam `Report.paginar`. O resumo foi o último a entrar (era uma folha
  só, que transbordava com poucos itens); a lista dele não é um `<table>`
  justamente por isso — linha de tabela mora dentro do `<tbody>`, e mudar de
  folha exigiria partir a tabela.

### Ordem da lista = ordem do PDF
`project.ordem` escolhe; `Store.ordenar(project, kind)` devolve um vetor
**novo**. O vetor real nunca é reescrito, então dá para voltar ao manual sem
perder nada. Arrastar um item fixa a ordem à vista como manual. `report.js`
usa `Store.ordenar`, e por isso a capa, as páginas e as evidências saem na
mesma sequência.

### Duas mesclagens diferentes, de propósito
1. **Arquivo aberto à mão** (`Store.diffProject`) → mesclagem a três pontas
   usando `syncBase`, com tela de conflito. Faz sentido: alguém te entregou um
   arquivo, você decide.
2. **Pasta compartilhada** (`Store.mergeLWW`) → *vale a edição mais recente*,
   sem tela. Faz sentido: a gravação acontece sozinha e ninguém pode ficar
   parado esperando o outro decidir. A rede de proteção é o histórico (abaixo).

O pareamento é: **relatório** por id e, na falta, por **marco normalizado**
(`Store.marcoChave`, só o campo `marco` — `name` nasce "Novo relatório" para
todos); **item** por id e, na falta, por **número** (`Store.numeroChave`).
Sempre **dentro do mesmo marco**: a `NCR-001` do J06 e a do J07 são itens
distintos.

### A pasta da rede como banco (`pasta.js`)
File System Access API (`showDirectoryPicker`), Chrome/Edge, **funciona também
em `file://`**. A pasta guarda `derrogacao-dados.json`, `imagens/` e
`historico/`.

- Ao abrir: lê e junta. Ao salvar: **relê, junta, grava** (é o que evita apagar
  o trabalho de quem salvou no meio). A cada 20 s confere se mudou lá fora.
- Não há trava de arquivo — a API não tem. O que dá segurança é a mesclagem
  convergir: uma gravação atropelada se recupera na sincronização seguinte.
- **Histórico**: grava o estado local em `historico/` **antes de juntar**
  qualquer mudança externa (arquivo marcado `-antes`), mais uma versão a cada
  10 min, guardando as últimas 40. Restaurar **só ressuscita o que sumiu**
  (`Store.reviver`), registrado como edição de quem restaurou — é isso que faz
  o item sobreviver no computador dos outros.
- **Imagens em arquivos próprios** (`imagens/<id do registro>.jpg`). No JSON da
  pasta fica só `arquivo`; o `src` em base64 é removido na hora de montar o
  retrato (`montaPayload`) e devolvido na leitura (`hidratarImagens`, que
  reaproveita o que já está aqui e só lê do disco o que falta). Motivo: antes
  cada gravação reescrevia os megabytes de todas as fotos, e cada uma das 40
  versões do histórico era outra cópia inteira. **O backup `.json` continua
  embutindo tudo** — esse precisa viajar sozinho por e-mail.
  Ordem que importa: grava-se a imagem **antes** do JSON que a cita.
  A poda (`Pasta.podarImagens`) só apaga o que nenhum item **e nenhuma versão
  do histórico** citam, e nunca com menos de 7 dias — entre gravar a foto e
  gravar o JSON existe um instante em que ela parece órfã para quem estiver
  lendo. Roda no máximo de hora em hora (`limparImagensOrfas`).
- **Guarda de versão**: lendo dados com `schema` maior que o desta página, a
  sessão para de gravar (só lê) e avisa. Sem isso, a página velha regravaria a
  pasta sem os campos que não conhece. Ver §4.
- **O que foi substituído por fora** não passa mais em branco: `mergeLWW`
  devolve `substituidos` (campo a campo, sem base64), o item ganha a marca `⇄`
  na lista e uma faixa com *estava aqui* × *passou a ser*.
- O "crachá" (handle) fica no IndexedDB, store `handles`. **Não é um caminho** e
  não viaja: cada pessoa escolhe a pasta uma vez, por navegador. O campo de
  caminho no diálogo é texto informativo que viaja nos dados, só para dizer ao
  próximo *onde* apontar.

### Lápides
Excluir um item empilha `{id, kind, ncrId, at, by}` em `project.deleted`. Sem
isso, o item apagado por uma pessoa voltaria pela sincronização de quem ainda
não soube. O carimbo é sempre **posterior à versão excluída**
(`Store.depoisDe`), para não ressuscitar por relógio adiantado.

**Toda exclusão precisa passar por aqui** — são três portas: `deleteNcr()`, o
grupo *Excluídos pelo colega* de `applyMerge()` e o *Excluir este relatório*.
As duas últimas já esqueceram a lápide uma vez, e o item voltava minutos depois.

Relatório inteiro tem lápide própria (`Store.tombstoneProjeto`), guardada no
`localStorage` — o relatório já não existe para guardá-la — e enviada no campo
`relatoriosExcluidos` do arquivo da pasta. Vale enquanto ninguém editou um item
dele depois do carimbo, a mesma regra da lápide de item. `Store.reviver` apaga
a lápide do que restaura.

### O fluxo do waiver (`fluxo.js`)
O campo `historic` é texto livre, uma entrada por linha (`J01 & J03 To: J06`).
`Fluxo.analisar` lê cada linha como uma **seta** e devolve cards, setas e
colunas; `Fluxo.svg` desenha. O texto nunca é alterado — o desenho é leitura.

- A coluna de um card é **uma a mais que a de quem aponta para ele**. É isso
  que faz `J06 To: J08` + `J04 To: J06` virarem J04 → J06 → J08 sem ninguém
  dizer a ordem, e faz dois marcos que vão ao mesmo destino se juntarem.
- Quando as setas não decidem, vale `Fluxo.ORDEM` (J01 & J03 · J02 & J04 · J05
  · J06 · J07 · J08 · J09 · J10 · J11 · J12), com `<marco>Cer` meio ponto antes
  do marco dele.
- Setas em círculo não travam: há um teto de colunas, a seta que fecha o
  círculo é ignorada e o pop-up avisa.
- O que não tem marco nenhum no texto (`RANAE`) vira card tracejado no fim, em
  vez de sumir.
- A aba **Fluxos** (`renderFluxos` em `app.js`) é o compilado do relatório
  aberto, e o PDF dela usa `Report.paginar` — a mesma paginação do relatório.

### A resposta do marco anterior (o ponto no card)
Cada marco é um projeto à parte e o mesmo item atravessa vários: a `NCR-001` do
J06 vira a `NCR-001` do J08. Então a resposta que o J06 deu **já está neste
navegador** — é só procurar. `Fluxo.indice(projects, kind, atualId)` monta a
procura (um registro por relatório, com o marco entendido por `Fluxo.marco` e
os itens indexados por `Store.numeroChave`) e `Fluxo.anterior(idx, no, item)`
responde por card. `Fluxo.svg` recebe isso em `opts.antes` e, achando, põe o
ponto no canto, o balão no `mouseenter`/`focus` e o clique em `opts.abrir`.

- **Só acha o que está aqui.** Marco sem relatório neste computador fica sem
  ponto; inventar resposta seria pior do que não mostrar nada. Quem traz os
  outros marcos para cá é a pasta da rede.
- **O pareamento é o de sempre**: marco pelo texto (`RANAE J06` = `J06`;
  `J06Cer` ≠ `J06`; `J01 & J03` alcança o `J03` por interseção de números) e
  item por `Store.numeroChave`. Empate: o marco escrito igual vale mais; depois
  o relatório mexido por último.
- **O próprio item aberto nunca é resposta de marco nenhum** — seria ele
  mesmo, e o card do marco atual já vem destacado.
- **O índice é montado uma vez por desenho**, não por card: a aba Fluxos
  pergunta por cada card de cada item.
- **Ler não escreve.** O outro relatório não é tocado; `test33.py` confere.
- O balão vive fora do desenho (`div.fx-balao`, `position: fixed`,
  `pointer-events: none`), porque SVG não quebra linha sozinho. Ele é
  reparentado para o `<dialog>` quando o card está dentro de um: elemento da
  camada de cima não deixa ver quem ficou no `body`. Nada disso vai para o
  papel — a impressão não passa `opts.antes`.

### O item preso ao lado (`lado.js`)
Uma coluna à direita do editor com **outro item, em só leitura**, para escrever
um olhando o outro. `Lado.montar(host, project, item, kind, opts)` desenha; o
`app.js` guarda a escolha (`derrogacao:aoLado` no localStorage — é de quem está
neste navegador, não do relatório), oferece o diálogo de escolha e o
Shift+clique no card do fluxo.

- **Por que não é editável, e o que mudaria isso.** `field()` liga cada campo
  ao item **selecionado** (`currentNcr()` na hora da tecla), e os ids `f-<campo>`
  são únicos na página. Dois formulários abertos escreveriam os dois no mesmo
  item, e metade das buscas por id pegaria o painel errado. Para ter dois
  editores de verdade é preciso amarrar cada campo ao seu item e dar escopo aos
  ids — reforma da camada de formulário, com a trava do item aceito, o colar de
  imagem e o autossalvamento junto. Enquanto isso não for feito, a coluna
  mostra e não escreve, e o `test34.py` confere que escrever aqui não encosta no
  item de lá.
- **Terceira coluna do `.layout`**, fora do `<main>`: os quatro painéis de aba
  do editor ficam intocados. Some nas abas de tela cheia (não há editor ao lado
  de quê) e volta ao entrar na NCR/DEV.
- Redesenha em `renderTabs` e `renderEditor`, então acompanha o que a pasta
  trouxer e o que for salvo aqui — inclusive quando o item preso é o próprio
  aberto (a coluna diz isso).
- Item preso que sumiu (excluído aqui ou pela pasta) fecha a coluna com aviso,
  em vez de mostrar o retrato de algo que não existe mais.
- O botão **copiar** de cada bloco usa `copiarTexto()`, que tem reserva com
  `execCommand`: `navigator.clipboard` não existe em `file://`, e era por isso
  que o arquivo único respondia "cópia indisponível".

### A conversa da equipe (`chat.js`)
Aba opcional, desligada de saída, ligada em **Ajustes** (a escolha vive no
`localStorage`, não no projeto: quem decide ver recado é cada pessoa).

- **Arquivo próprio na pasta**: `conversas.json`, ao lado dos dados. Fora do
  `derrogacao-dados.json` de propósito — aquele é reescrito a cada gravação e
  copiado inteiro em cada uma das 40 versões do histórico, e o papo do dia não
  tem por que engordar isso. Pela mesma razão não entra no backup nem no PDF.
- **União por id, não "vale a mais recente"**: mensagem não se edita. O que
  viaja é o apagar, como lápide — sem isso o recado apagado voltaria pela
  sincronização de quem ainda não soube.
- Ler-juntar-gravar, como os dados: duas pessoas escrevendo ao mesmo tempo não
  apagam o recado uma da outra.
- **Canal direto = a dupla de nomes em ordem** (`d:bruno|maria`), então os dois
  lados escrevem no mesmo lugar sem combinar nada.
- **Não é canal seguro, e a tela diz isso** — o arquivo é legível por quem
  abre a pasta, e o nome é autodeclarado. O aviso fica sempre à vista, não
  escondido num "saiba mais": tratar a conversa direta como reservada seria um
  engano caro num programa de defesa.
- "Lido" guarda o maior entre agora e o carimbo da mensagem mais nova do
  canal: com o relógio de um colega adiantado, só "agora" nunca zeraria.
- Poda em 90 dias / 1.000 mensagens, senão o arquivo vira o maior da pasta.

### Aba Resumo (`summary.js`)
Gráficos em **SVG escrito à mão** — sem biblioteca, imprimem em vetor e
funcionam de `file://`. Paleta validada para daltonismo. Filtros (tipo,
situação, sistema, arch status, evidência, busca) alteram números, gráficos,
tabelas, **CSV e resumo em PDF** — e o PDF filtrado diz qual foi o recorte. O
**backup do marco sai sempre inteiro**: backup pela metade não é backup.

**Parados há 30+ dias** (`Summary.DIAS_PARADO`): pendentes sem edição há um mês
ou mais, do mais esquecido para o menos. Sai do `editedAt` que já existia — item
aceito nunca conta, porque está pronto, não parado.

### Instalação e uso sem rede
`manifest.webmanifest` + `sw.js`, registrados só em `https:` ou `localhost`
(de `file://` a API nem existe, e o arquivo único não acompanha manifesto — o
`build-standalone.py` remove a linha). Serve a duas coisas: abrir sem rede e
fazer o Edge oferecer **Instalar**, que é o que faz o navegador guardar a
permissão da pasta entre sessões.

## 6. Armadilhas já pagas — não repita

- **`ERRORS: none` não é aprovação.** Um teste já reportou isso enquanto
  capturava páginas em branco. Confira o artefato. Pior: onze suítes
  (`test.py`, `test2`–`test12`) **não têm nenhuma asserção** —
  só imprimem valores. Sair com código 0 ali não quer dizer nada. Ao mexer
  nessas áreas, confira os números impressos, ou transforme-os em `assert`
  (foi o que a `test18` virou).
- **A mesclagem não pode ficar aplicada pela metade.** `Store.mergeListas`
  altera `state.projects` **no lugar**. Se a gravação na pasta falhar depois
  disso, o resultado ainda precisa ser salvo aqui e redesenhado — é o que
  `sincronizar()` faz no `catch` via `adotar()`. Sem isso a tela mostra um
  texto que já não é o do programa e a tecla seguinte o grava por cima do que
  o colega escreveu.
- **Nada sai do computador, e isso se verifica.** `Store.normalizeImage` só
  aceita `data:` e `blob:` em `src`, e há uma CSP no `index.html`. Um `.json`
  recebido com `src` apontando para a rede faria o navegador buscá-lo — um
  aviso de leitura dentro de material de programa.
- **CSV é entrada de programa, não só texto.** Campo que comece por
  `= + - @` sai com apóstrofo à frente (`csvCampo`); aspas não protegem.
- **`[hidden]` perde para `display: flex`.** Existe um
  `[hidden] { display: none !important }` global no `app.css`. Não remova.
- **Não redesenhe o formulário durante a digitação** — perde o cursor.
  `renderItemAuthor()` existe só para atualizar a autoria no lugar. Mas
  **redesenhe quando o item aberto mudar por fora**, senão a tecla seguinte
  sobrescreve, em silêncio, o que o colega escreveu.
- **Carimbo de versão nos assets.** O workflow põe `?v=<sha>` em cada css/js.
  Sem isso o navegador mistura HTML novo com JS velho — já aconteceu e deu
  erro que parecia bug de código.
- **Ao mudar a interface, confira o PDF.** São folhas de estilo separadas, mas
  `app.css` tem regras que alcançam `.rep-page` (o resumo impresso, por
  exemplo).
- **O `derrogacao.html` é versionado, e é conteúdo derivado.** Mexeu no
  `index.html`, num css ou num js? Rode `python3 tools/build-standalone.py`
  antes de commitar. O workflow `conferir.yml` roda
  `tools/build-standalone.py --conferir` a cada envio e reprova quando os dois
  divergem — sem isso, quem baixasse o repositório levaria uma versão antiga
  do programa achando que levava a de agora.
- **Botão novo na barra lateral pode empurrar os outros para fora.**
  `.sidebar-head-actions` tem 332 px; sem `flex-wrap` a fila escorre por baixo
  do editor e o botão deixa de ser clicável (dois testes caíram assim).
- **A fila de abas tem os mesmos 332 px.** Com `flex: 1` (largura igual para
  todas), a quinta aba cortou o próprio rótulo; e um número dentro dela faria
  a fila quebrar de linha justamente quando chegasse recado. Hoje cada aba
  leva a largura do seu texto, a fila pode quebrar se precisar, e o aviso de
  não lido é um ponto no canto — que não ocupa espaço na fila.
- **SVG sem `width`/`height` sai em branco na impressão.** Com só o `viewBox`
  ele ocupa espaço na tela e nada no papel: o layout de impressão do Chrome não
  deduz o tamanho como o da tela. Os desenhos do fluxo levam os dois atributos.
- **As media queries de tela estreita valem na impressão** — a folha tem
  210 mm. Uma regra `@media (max-width: 900px)` mudou a altura das linhas só no
  papel, e a paginação, que mede na tela, errou a conta de folhas. O que entra
  na folha tem layout próprio sob `.rep-page`, sem depender da largura.
- **Fechar o balão no `scroll` apaga o balão que acabou de abrir.** Rolar
  para trazer o card à vista dispara o evento *depois* do `mouseenter`, e o
  balão sumia sem ninguém entender por quê (um teste pegou isso). Hoje a
  rolagem **reposiciona** o balão junto do card e só fecha quando o card sai
  da tela.
- **O service worker é rede-primeiro, de propósito.** Cache-primeiro traria de
  volta o problema de HTML novo com JS velho que o `?v=<sha>` existe para
  evitar. O `sw.js` também é carimbado na publicação: sem mudar de conteúdo,
  o navegador não o atualiza.

## 7. Como testar

`tests/README.md` tem o passo a passo. Em resumo: 40 suítes Playwright que
abrem a aplicação de verdade, fazem o caminho do usuário e conferem o
resultado, **inclusive o PDF gerado**. Rode a suíte inteira antes de publicar —
já houve mais de uma vez em que uma mudança de interface quebrou um teste de
exportação.

Para a pasta compartilhada, os testes injetam um diretório OPFS no lugar do
seletor do Windows: mesma interface `FileSystemDirectoryHandle`, então o
caminho exercitado é o real.

## 8. Publicação

Dois workflows:

- `.github/workflows/conferir.yml` — a cada envio, confere se o
  `derrogacao.html` versionado ainda corresponde ao `index.html` e aos assets.
- `.github/workflows/pages.yml` — publica.

`main` → workflow `.github/workflows/pages.yml`:
gera `derrogacao.html`, carimba `?v=<sha>` nos assets, força tudo para a branch
`gh-pages`. A API do token não consegue criar o site do Pages; por isso o
espelho em branch, e não `actions/deploy-pages`.

Depois de publicar, confira pela própria `gh-pages`
(`git show origin/gh-pages:index.html | grep 'app.js?v='`) — o proxy de saída
desta máquina às vezes bloqueia `github.io`.

## 9. Como o Bruno trabalha

- Escreve em português, direto, às vezes com o teclado corrido. Pede uma coisa
  e volta com ajustes depois de usar.
- Quer **entender** o que está sendo feito, não só receber pronto: explicação
  do porquê, e do que não dá.
- Não gosta de opção escondida. Já pediu para tirar coisa do menu e deixar à
  vista, e para o menu não ficar "tudo misturado".
- Quando eu disse que algo era impossível e não era (o `.exe`, a pasta como
  banco), o certo foi testar antes de afirmar. **Verifique no navegador em vez
  de responder de memória.**

## 10. Decisões que já foram tomadas — não desfaça sem perguntar

| Decisão | Por quê |
| --- | --- |
| PDF por impressão do navegador | fidelidade e zero dependência |
| Sem nuvem | política do programa |
| Ordem como modo, não reescrita do vetor | dá para voltar atrás |
| LWW na pasta, três pontas no arquivo | situações diferentes |
| Histórico dentro da pasta | o navegador só libera a pasta escolhida |
| Situação interna separada do Arch Status | um é do documento, o outro do acompanhamento |
| Índice da capa fecha com o Arch Status | o SBR4 traz assim (o SBR3 não trazia) |
| Paginar em vez de mudar as margens para `@page` | mover as margens para a página quebraria quem imprime com "Margens: Nenhuma", que é o que o README manda fazer |
| Imagem em arquivo na pasta, embutida no backup | na pasta o que pesa é reescrever tudo a cada gravação; no backup o arquivo tem de viajar sozinho |
| Item aceito abre travado, com "editar mesmo assim" | a regra da pasta espalha um clique distraído para todo mundo em 20 s |
| Fluxo lido do `historic`, sem campo novo | o texto do relatório é a verdade; um campo paralelo sairia do ar na primeira vez que alguém editasse só o texto |
| Ordem dos marcos fixa em `Fluxo.ORDEM` | as setas mandam; a lista só decide quando o texto não diz (confirmada com o Bruno, com J06 e J10 onde a mensagem dele tinha typo) |
| Cópia nasce com o número marcado `(cópia)` | a mesclagem pareia itens pelo número: dois com o mesmo número viram um só no computador do colega |
| Conversa em arquivo próprio na pasta, fora do backup e do PDF | os dados são reescritos e versionados a cada gravação; o papo não tem por que viajar junto |
| Conversa desligada de saída, ligada por navegador | é a única aba que não serve ao relatório: quem quer, liga |
| A tela diz que a conversa direta não é secreta | ela não é, e deixar isso subentendido seria pior do que não ter a conversa |
| `derrogacao.html` versionado na `main`, com conferência no CI | quem baixa o repositório leva o programa pronto; a conferência é o preço de guardar conteúdo derivado |
| A resposta do marco anterior é só leitura, e só do que está neste navegador | os dados são de quem tem a pasta; inventar resposta, ou escrever no relatório do outro marco, seria pior do que não mostrar nada |
| A coluna ao lado é só leitura | dois formulários abertos escreveriam no mesmo item enquanto `field()` amarrar os campos ao selecionado; consultar sem risco vale mais do que editar em dois lugares |
| A coluna fica fora do `<main>`, como terceira coluna do `.layout` | o editor tem quatro painéis de aba lá dentro; mexer neles para abrir espaço era mexer no que já funciona |
| Balão em `div` sobre o SVG, e não `<title>` do SVG | o `<title>` é uma linha só, sem formatação e com o atraso do navegador; e os dois juntos apareceriam ao mesmo tempo |
| Lista do resumo impresso em `div`, não em `<table>` | a paginação move filhos diretos do bloco; linha de tabela mora no `<tbody>` e não migraria sem partir a tabela |
| Empate de `editedAt` resolvido pela assinatura | `>` sozinho deixava as duas bases divergindo para sempre |
| Reordenar também por botões ↑/↓ | arrastar sozinho exclui quem não consegue o gesto (WCAG 2.5.7) |
