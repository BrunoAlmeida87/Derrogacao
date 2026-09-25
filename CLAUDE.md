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

Desde a integração com o NCR Control há também a aba **Banco NCR**: as NCRs
do SBR4 importadas do banco NCR, com campos próprios do Waiver (marcos, função
vital, observação), o fluxo de cada NCR desenhado como no NCR Control e o
botão que leva a NCR ao relatório do marco (§5, "Banco NCR").

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
assets/js/log.js           o diário do console: o que está acontecendo, e o
                           que fazer quando dá errado (carrega primeiro)
assets/js/store.js         modelo, persistência, mesclagem, ordenação
assets/js/revisoes.js      o diário: quem escreveu o quê, campo a campo
assets/js/pasta.js         a pasta da rede como banco de dados (e as imagens)
assets/js/report.js        monta as páginas no padrão do PDF, e as pagina
assets/js/fluxo.js         lê o Waiver Historic, desenha o caminho do waiver e
                           acha o mesmo item no relatório do marco anterior
assets/js/herdar.js        leva o item aceito para o marco em que o waiver
                           foi aprovado, já preenchido
assets/js/summary.js       apuração, filtros, gráficos SVG, aba Resumo
assets/js/painel.js        o painel de um marco: tudo o que está indo para ele
assets/js/xlsx.js          escreve a planilha .xlsx (ZIP + XML à mão)
assets/js/tabela.js        aba Tabela: todos os itens de todos os marcos
assets/js/chat.js          a conversa da equipe (aba opcional), pela pasta
assets/js/lado.js          o item preso ao lado do editor, em só leitura
assets/js/xlsxler.js       LÊ .xlsx — cópia literal do motor do NCR Control
assets/js/ncrs.js          banco NCR: modelo, importações, junção da pasta
assets/js/ncrfluxo.js      o fluxo da NCR (trajetória e mapa) do NCR Control
assets/js/ncrview.js       aba Banco NCR: tabela, filtros, ficha
assets/js/kanban.js        aba Kanban: as NCRs de um marco, por situação
assets/js/app.js           o editor (o maior; ~3000 linhas)
derrogacao.html            o programa inteiro num arquivo só — gerado, e versionado
tools/build-standalone.py  gera (e confere) o derrogacao.html
exemplos/                  .json prontos para importar
.github/workflows/pages.yml  publicação
```

Ordem de carga dos scripts (importa: cada um usa o anterior):
`log.js → store.js → revisoes.js → pasta.js → xlsxler.js → ncrs.js →
ncrfluxo.js → report.js → fluxo.js → herdar.js → summary.js → painel.js →
xlsx.js → tabela.js → chat.js → lado.js → ncrview.js → kanban.js → app.js`.
(`log.js` vem primeiro porque todo mundo o usa — e **por isso mesmo não usa
ninguém**: ele não conhece `Store`, `Pasta` nem `app`.)
(`tabela.js` usa `Summary`, `Fluxo`, `Report` e `SummaryView.csvCampo`;
`revisoes.js` usa `Store.CAMPOS_MESCLA`, `valorCampo` e `rotuloCampo`;
`herdar.js` usa `Store`, `Fluxo` e `Report`; `painel.js` usa esses três mais
`Summary` e `SummaryView.blocoLista`; `xlsx.js` não usa ninguém.)

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
  nota,                        // anotação interna livre; NÃO sai no PDF
  observation,                 // a Observação da NCR, vinda do Banco NCR; NÃO sai no PDF
  ncrKey,                      // chave da NCR do banco, quando o item veio de lá
  herdadoDe, herdadoEm,        // veio do marco tal, quando (§5, herdar.js)
  status,                      // acompanhamento; fecha a linha da capa (§4)
  done,                        // espelho de status === 'aceito'
  editedBy, editedAt,          // editedAt é a chave da mesclagem
  syncBase }                   // editedAt na última troca de arquivo
```

Persistência: **IndexedDB** (`derrogacao`, v3, stores `projects`, `snapshots`,
`handles`), com `localStorage` de reserva. `Store.save/list/remove`.

**O banco NCR mora no `snapshots`**, com prefixo na chave — `ncr:<chave>` (uma
linha por NCR) e `ncrmeta:<nome>` (listas, registro das importações, o retrato
para desfazer). Pelo mesmo motivo da base da mesclagem: prateleira nova
obrigaria a subir a versão do IndexedDB, e a versão anterior do programa não
abriria mais o navegador (§10). Uma linha por NCR para editar um campo não
regravar o banco inteiro. `Store.ncrAll/ncrPutMany/ncrMetaGet/ncrMetaPut`.
Nenhuma importação do banco NCR passa perto de `projects`.

**NCR do banco** (em memória, `ncrs.js`):

```js
{ key, numero,                  // key: número normalizado (maiúsculas, sem espaços, "/"->"-")
  fonte:  { campos:{coluna:valor}, titulo, descricao, status, sistema, sbr, sbrPor,
            criadoEm, responsavel, fechamento, arquivo, importadoEm, presente, alterados:[] },
  waiver: { marcoOriginal, marcoAtual, funcaoVital, waiverHistoric, observacao,
            editedBy, editedAt, adicoes:[{projectId, marco, itemId, em, por}] },
  historico: [{id, data, tipo, campo, de, para, obs, responsavel, cls, estimado}] }
```

`fonte` é cópia do banco NCR e é **trocada inteira** a cada importação;
`waiver` só é escrito pela tela e pela correlação; `historico` só cresce.

### A Observation do item (`observation`)
A Observação da NCR, copiada para o item quando a NCR é levada ao relatório.
**Campo próprio, separado da `nota`** (decisão do Bruno): a nota é o recado
de pendência; a observation é o texto que veio da NCR. Segue as regras da
nota: fora do PDF, `data-livre` (editável com o item travado), em
`CAMPOS_VISIVEIS` e `CAMPOS_MESCLA`, **fora da `signature()`**, sem subir o
`SCHEMA` (`extrasDe` a preserva nas versões antigas). O mesmo vale para
`ncrKey`.

**Campos desconhecidos sobrevivem.** `normalizeNcr`/`normalizeProject` remontam
o registro campo a campo — o que não estivesse na lista sumia, e era assim que
uma página velha lendo dados de uma versão nova apagava, em silêncio, o que não
entendia, e regravava a perda na pasta. Agora o que não é conhecido é copiado
de volta intacto (`extrasDe`), e `schema` guarda o maior número já visto. A
segunda linha de defesa está em `app.js`: vendo dados de `schema` maior que o
seu, a sessão passa a **só ler** (`versaoDesatualizada`) até recarregar.

### A anotação do item (`nota`)
Texto livre por item, para o motivo de uma pendência ficar escrito onde o item
está — e não na cabeça de quem parou. O campo `status` já diz *que* está
pendente; a `nota` diz *por quê*.

- **Não sai no PDF do relatório**, como o `status`. Quem monta a folha é o
  `SECTIONS` do `report.js`: campo novo só aparece no papel se for posto lá.
- **Vale com o item travado.** O `textarea` leva `data-livre`, que é o que
  `aplicarTrava()` respeita. Anotar não é editar o documento, e o item aceito é
  justamente onde se escreve "conferir na próxima revisão".
- **Entra em `CAMPOS_VISIVEIS`**, e por isso a busca da lista e a da Tabela a
  alcançam, e a faixa "o que mudou" da mesclagem a mostra.
- **Fica fora de `signature()`, de propósito.** A assinatura desempata duas
  edições com o mesmo `editedAt`, e precisa dar o mesmo resultado nesta versão
  e nas anteriores — se cada uma desempatasse por um critério, as duas bases
  divergiriam para sempre (§10).
- **Não exigiu subir o `SCHEMA`.** `extrasDe` já preserva campo desconhecido,
  então a versão antiga carrega a anotação intacta ao regravar — conferido no
  navegador com o `derrogacao.html` anterior, e não só de memória. Subir o
  número poria toda sessão antiga em só leitura, o que seria um preço alto por
  um campo que ninguém perde.

### Dois campos que parecem o mesmo e não são

- **`archStatus`** é texto livre e **vai impresso na página do item**, no
  bloco de status (*Arch Status Waiver*). Continua ali, intocado.
- **`status`** é o acompanhamento do editor. Quatro valores, nesta ordem:
  `preenchendo`, `solicitado`, `justificar`, `aceito` (Em preenchimento →
  Waiver requested → Improve justification → Waiver accepted). **Só `aceito`
  conta como concluído.** Quem mexe nisso é `Store.setStatus`, e só ele —
  `done` nunca se descola.

**Onde o `status` aparece no PDF, e só onde:** desde o pedido do Bruno, é ele
que **fecha a linha de cada item no índice da capa** — o lugar onde antes ia o
`archStatus` (§10). O motivo: o Arch Status é texto livre e muitas vezes está
em branco, enquanto a situação é sempre uma das quatro e diz de relance em que
pé o waiver está. Vai em inglês, pelo campo `en` de `Store.STATUS`, porque a
folha é um documento em inglês; "Em preenchimento" sai como *Under
preparation*. Em nenhum outro lugar do PDF ele aparece — a página do item
continua sendo o `SECTIONS` do `report.js`, e a `nota` continua fora de tudo.

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

### A mesclagem é campo a campo (e por que ela não era)

Era o item inteiro, e o item inteiro é grande demais para ser a unidade. Duas
pessoas mexendo em campos diferentes da mesma NCR não estão em conflito
nenhum — mas uma delas perdia tudo, em silêncio. Foi o que o Bruno relatou:
alguém fica horas sem sincronizar, volta, e o texto que já estava escrito
some. Não precisa nem de relógio errado para acontecer: basta a pessoa ter
mexido no item depois de o colega ter gravado.

O que faltava era a **terceira ponta**: o texto que os dois tinham antes de
se separarem. `Store.baseDe(projects)` guarda esse retrato — só texto, campo
a campo, sem imagem nem carimbo — e `mergeLWW` o recebe. Com ele:

- campo que só eu mudei → fica o meu;
- campo que só o outro mudou → entra o dele;
- campo que os dois mudaram → **aí sim** alguém ganha, pelo `editedAt` (com
  a assinatura no empate), e o texto que perdeu vai inteiro para o diário,
  com um botão que o traz de volta;
- campo que ninguém mudou → não se mexe.

Sem base — item recém-criado, navegador que nunca sincronizou — vale o item
inteiro, como antes. É degradação segura, não caso especial.

**As evidências não se mesclam campo a campo**, porque são listas com
imagens e meia lista de anexos seria um item que ninguém montou. Mas o
retrato guarda uma chave delas (`evidChave`, a mesma do `signature`), então
elas vão para o lado de quem mexeu nelas, em vez de acompanharem o vencedor
do desempate.

### Duas pessoas ao mesmo tempo: qual base vale (o conserto do atropelo)

A mesclagem campo a campo precisa de uma terceira ponta honesta. Até aqui ela
era sempre `mesclaBase` — **o que eu gravei** na rodada passada. Está certo
quando a minha gravação sobreviveu. Só que **não há trava de arquivo**: entre
a minha leitura e a minha gravação o colega pode gravar uma cópia que nunca
viu o meu campo, e o arquivo dele passa por cima do meu.

Aí a base mentia, e o estrago era silencioso:

```
base = "meu texto"    (mentira: a pasta não tem isso)
aqui = "meu texto"
lá   = ""             (a cópia dele, que nunca viu o meu)
→ "só ele mexeu; ele apagou" → o meu texto sumia de vez,
  sem conflito, sem aviso e sem linha de histórico.
```

Era exatamente o que o Bruno relatou: *"as vezes perdemos dados ou status que
havíamos modificado"*. Reproduzido no navegador com duas abas numa pasta
compartilhada de verdade (`juntos.py`), e as duas máquinas chegavam a ficar
com **situações diferentes** para o mesmo item, sem convergir nunca.

**A resposta não é escolher outra base fixa.** Duas tentativas falharam antes
da certa, e vale registrar as duas para ninguém repetir:

1. *Base = o que eu reli logo depois de gravar.* Fecha nada: o atropelo
   acontece depois da releitura.
2. *Base = o que a pasta tinha quando eu li.* Conserta o atropelo e **quebra o
   "pôr de volta"**: o colega que restaura um texto exatamente no valor que eu
   tinha lido passa a parecer "não mexeu", e a restauração nunca me alcança
   (o `duas_maquinas.py` pegou isso).

O que decide é saber **se a cópia que chegou viu a minha gravação** — e isso é
causalidade, não relógio: uma cópia mais nova não é uma cópia que viu. Quem
responde é o próprio arquivo. Cada gravação anota de que versão do arquivo ela
partiu (`baseadoEm`, o `lastModified` que o disco deu), e o disco é o mesmo
relógio para todo mundo:

| o arquivo que chegou | base que vale |
| --- | --- |
| ainda é o meu (`lastModified` igual ao da minha gravação) | o que eu **gravei** |
| partiu da minha gravação (`baseadoEm >= meuCarimbo`) | o que eu **gravei** |
| partiu de antes dela | o que eu **li** |

No terceiro caso o meu campo volta a contar como "só eu mexi" — é regravado na
rodada seguinte em vez de apagado — e as duas máquinas convergem. O console
diz isso na hora ("a cópia que chegou não viu a minha última gravação") e a
gravação é repetida (`gravarPendente`).

Arquivo gravado por uma versão antiga do programa não traz `baseadoEm`: aí
vale a regra de antes, que é o que já existia. Não foi preciso subir o
`SCHEMA` — o campo vive no envelope do arquivo da pasta, não no item.

**Três bases, então** (`Store.saveBase(base, diario, lida, carimbo)`, na prateleira
`snapshots` do IndexedDB, com a chave `mesclaBase`):

- `base` só avança **depois de a gravação na pasta dar certo**. Avançá-la
  antes faria a junção seguinte ler o meu trabalho ainda não gravado como
  "coisa que o outro escreveu" — e a regra que existe para salvar o texto
  seria a que o apagaria.
- `lida` é o retrato da pasta **na leitura daquela mesma rodada**, e avança
  junto com `base`: as duas descrevem a mesma rodada e não podem andar
  separadas.
- `carimbo` é o `lastModified` da minha última gravação, que é o que faz a
  tabela acima funcionar.
- `diario` avança a cada captura do histórico, com ou sem pasta.

E elas moram na prateleira que já existia, de propósito: criar outra
obrigaria a subir a versão do IndexedDB, e a página da versão anterior
abrindo o mesmo navegador depois disso não conseguiria mais abrir o banco.

O relógio ainda decide **um** caso — os dois no mesmo campo. Por isso a
sessão avisa quando o `updatedAt` do arquivo está no futuro em relação ao
relógio daqui (`conferirRelogio`): só essa direção é conclusiva, porque um
carimbo velho pode ser só alguém que não mexe no arquivo desde ontem.

### O diário de alterações (`revisoes.js`)

A pasta já guardava versões inteiras (`historico/`), que servem para o
estrago grande: voltar tudo a como estava às 14h. Elas respondem mal a
pergunta miúda, que é a que aparece no dia a dia — *"quem apagou o meu texto
do Arch Answer, e o que estava escrito lá?"*. Aqui cada alteração de campo é
uma linha: quem, quando, qual campo, o que estava, o que passou a estar.

- **Sai da mesma base da mesclagem.** O que está aqui, comparado com o
  retrato da última captura, é exatamente o que esta pessoa escreveu — sem
  gravar nada a cada tecla.
- **Cada um anota só o que escreveu.** Anotar também o que chegou dos outros
  duplicaria a linha em cada computador, com ids diferentes.
- **Arquivo próprio na pasta** (`revisoes.json`), pelo motivo da conversa: o
  arquivo de dados é reescrito e copiado inteiro a cada gravação. Não entra
  no backup nem no PDF.
- **União pelo id**, nunca "vale o mais recente": uma alteração que
  aconteceu não deixa de ter acontecido. O que pode mudar é o texto final de
  uma linha ainda aberta — teclas seguidas da mesma pessoa no mesmo campo,
  dentro de dez minutos, esticam a linha em vez de criar outra, e aí vale o
  carimbo maior.
- **Pôr um texto de volta é uma edição como outra qualquer**, com hora nova:
  é isso que faz o texto restaurado valer também no computador dos outros,
  em vez de ser apagado de volta na sincronização seguinte.
- **Os tetos** (1500 linhas, um ano, 4 000 caracteres por campo) existem por
  causa dos ~5 MB de `localStorage` que o programa inteiro divide — a
  conversa já ocupa parte deles.
- **O histórico começa quando esta versão começa.** O que foi escrito antes
  dela não tem linha, e a tela diz isso em vez de fingir um passado.

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
- **Toda escrita na pasta tem segunda chance** (`comSegundaChance`). O Chrome
  não grava por cima: escreve num `.crswap` ao lado e renomeia no fim. Numa
  pasta de rede esse vaivém esbarra no antivírus, no Windows e na outra pessoa
  gravando o mesmo arquivo no mesmo segundo, e o navegador devolve
  `InvalidStateError` ("state cached in an interface object … had changed
  since it was read from disk"), `NoModificationAllowedError`, `AbortError` ou
  `NotReadableError`. Nenhum quer dizer "não vai dar" — querem dizer "agora
  não". A tarefa **pede o crachá do arquivo lá dentro**, porque o crachá
  guarda o retrato (tamanho, data) de quando foi pedido, e é esse retrato
  vencido que o navegador recusa; reaproveitar o de fora repetiria o erro.
  Duas tentativas e o erro sobe — quem chamou é que sabe se era essencial.
  Vale para os dados, as imagens, as versões do histórico, a conversa e o
  diário. Antes disso, uma recusa dessas **perdia a rodada inteira**: nem os
  dados, nem a versão do histórico, nem o diário chegavam na pasta (provado no
  navegador contra a versão anterior).
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

### O marco depois do J12: RANAE e TRAP
`Fluxo.ORDEM` termina em `… J11 · J12 · RANAE · TRAP`. Os dois últimos não têm
número, e por isso cairiam como card solto no fim do desenho (posição 900) em
vez de ficarem na fila. `SEM_NUMERO` os reconhece pelo texto, `naFilaSemNumero`
dá a posição, e `marco()` canoniza a chave: "RANAE final", "Ranae" e "RANAE"
viram **o mesmo card** — senão o mapa do marco contaria o mesmo caminho duas
vezes só porque duas pessoas escreveram diferente.

Cuidado com a armadilha que já existia: **"RANAE J06" continua sendo o J06.**
Havendo número no texto, é o número que manda; o reconhecimento por nome só
vale quando não há nenhum. É o que deixa o marco do RANAE conviver com os
relatórios que a equipe já chama de "RANAE J06", "RANAE J08".

### Levar o item aceito para o marco seguinte (`herdar.js`)
Waiver aceito não acaba: ele vale até um marco à frente, e o item terá de ser
reescrito lá. Era trabalho manual — copiar item por item, lembrando de trocar
o que muda. Agora é um botão, na barra de situação do editor.

- **O destino sai do `Waiver Approved Expiry`**, lido por `Fluxo.marco`. Não há
  campo novo para isso: o campo que já diz até quando o waiver vale é o que diz
  para onde ele vai (§10).
- **O relatório do destino tem de existir.** Criar um marco a partir de um
  campo de texto encheria a lista de marcos escritos com typo — e cada um
  viajaria para a pasta da equipe. Não existindo, o botão fica apagado e diz o
  que falta, por escrito.
- **A cópia chega em "Em preenchimento"**, nunca aceita: o waiver do marco
  anterior foi aceito, o deste ainda nem foi pedido.
- **Com o Waiver Historic já escrito** (`J08 To: J09`), por `Fluxo.comLinha` —
  a mesma função que `analisar` sabe ler de volta. Não há um segundo formato
  de linha no programa.
- **O número é o mesmo, de propósito.** `Store.duplicar` marca a cópia com
  "(cópia)" porque lá o destino é o mesmo relatório; aqui o destino é outro
  marco, e o pareamento é sempre dentro do marco (§5): a NCR-001 do J08 e a do
  J09 são itens distintos, e precisam do mesmo número para se acharem no fluxo.
- **O ciclo anterior vem em branco** (`archAnswer`, `archStatus`, as duas
  datas): eram a resposta do marco que terminou. O texto do pedido —
  description, current situation, why not possible, arguments — vai inteiro,
  porque é o que dá trabalho de escrever.
- **`herdadoDe`** marca a cópia. É o `⤵` na lista e a faixa roxa no alto do
  editor, que sai quando a pessoa clica em "Já conferi" — o lembrete que o
  Bruno pediu ("algumas informações terão que ser alteradas").
- **Levar duas vezes é recusado**, pelo número, dentro do marco: dois itens com
  o mesmo número virariam um só na mesclagem do colega.
- **O item de origem não é tocado.** Ele é o registro do marco dele, e é dele
  que o ponto no card do fluxo lê o Arch Answer do marco anterior.

`herdadoDe` não subiu o `SCHEMA`, pelo mesmo motivo da `nota`: `extrasDe`
preserva campo desconhecido, e subir poria toda sessão antiga em só leitura.
Ele está em `CAMPOS_MESCLA` (converge campo a campo) e **fora** de
`signature()` — o desempate tem de dar o mesmo resultado nas versões
anteriores, senão as bases divergem para sempre (§10).

### De onde veio × para onde vai (e por que o texto não sabe o futuro)

O Waiver Historic conta **de onde o item veio**: no relatório do J08 ele
termina em J08, porque é assim que o relatório é escrito (`J06 To: J08`). Logo
a última seta do texto é sempre a **chegada** neste marco — nunca a saída.

Isso derrubou duas coisas de uma vez, e as duas foram consertadas juntas:

- a coluna "Waiver de → para" da Tabela mostrava o passado com cara de futuro,
  e a coluna "Indo para o marco" chegava a repetir o próprio marco do item;
- o painel do J09 só enxergava as cópias **já levadas** para lá, e ficava vazio
  justamente antes de o marco começar — que é quando ele serve para planejar.

Quem sabe para onde o item vai é o documento, em dois campos, nesta ordem:

```
Waiver Approved Expiry  → até onde o arquiteto APROVOU   (vale mais)
Waiver Request Expiry   → até onde a equipe PEDIU        (reserva)
```

`Herdar.paraOnde(item)` lê os dois e devolve `{no, aprovado}`. Ler o segundo é
o que faz o item ainda em "Waiver requested" aparecer como indo para o J09 —
que é o que interessa para planejar o marco antes de a resposta chegar.
`Herdar.destinoDe` continua estrito (só o aprovado), porque **copiar** o item
é ação e só pode se guiar pelo que foi aprovado; `paraOnde` é leitura.

Um item cujo destino é o próprio marco não está indo a lugar nenhum: o waiver
vale até ali e acabou (`estado: 'aqui'`).

`Herdar.avanco(project, item, kind, projects)` junta tudo num quadro que a
Tabela e o painel leem igual: `semDestino · aqui · levada · aLevar ·
semRelatorio`.

Na Tabela isso virou três colunas que, ao lado de "Marco", leem a linha
inteira de um relance:

```
Veio de  |  Marco  |  Vai para  |  Já levada?
  J06    |   J08   |    J09     |     não
```

"Já levada?" só diz "não" quando o waiver **já foi aceito**: antes disso não
há o que levar, e um "não" ali seria cobrança de uma coisa que ainda não
venceu.

A coluna **"Caminho do waiver"** junta as duas pontas, e o parêntese separa o
que aconteceu do que vai acontecer:

```
J04 → J06 → J08 → (J09)    o destino ainda não foi levado para lá
J06 → J08 → J09            a cópia já está no J09
```

Sem o parêntese, quem lê a planilha entende que a NCR já está no J09.

### O painel de um marco (`painel.js`)
A aba Fluxos responde "por onde passou". O painel responde a pergunta do outro
lado do balcão, que é a que se leva para a reunião: **o que está chegando no
J09?** É a quarta vista da aba Fluxos, e sai em PDF pelo mesmo botão das
outras.

- **O recorte tem duas portas** (ver a seção anterior): **já chegou** (uma
  seta escrita termina neste marco, `Fluxo.chegaEm`) ou **está a caminho** (o
  documento diz que o waiver vale até aqui, `Herdar.paraOnde`, e o item mora
  em outro marco). Passar pelo marco no meio do caminho continua não contando:
  quem já saiu do J08 não está indo para o J08.
- **O seletor de marcos também tem as duas portas.** Sem a segunda, o J09 nem
  aparecia na lista enquanto ninguém tivesse escrito "… To: J09". Marco que
  não tem nada chegando fica fora: seletor cheio de painel vazio é pior do que
  seletor curto.
- **A coluna "Caminho" da lista é `veio de → este marco`**, não o último salto
  do texto — num item do J08 aquele salto é a chegada dele no J08, e no painel
  do J09 seria confusão.
- **Olha todos os relatórios deste navegador**, sempre: o que chega no J09 vem
  do J08, do J06, do RANAE. Por isso a vista esconde os filtros da aba (busca,
  tipo, escopo, "passa por"): eles são do fluxo por item, e oferecer botão que
  não faz nada é pior do que não ter botão.
- **Uma NCR que já foi levada adiante aparece uma vez só** (`semRepetir`): a
  cópia que chegou ganha da original, porque é ela que ainda dá trabalho. Daí
  os dois números que respondem ao dia a dia — *já no relatório de J09* e
  *aceitos, falta trazer*.
- **A contagem do seletor sai da mesma função que monta a lista.** Antes ela
  contava setas, e o seletor dizia "J09 (7)" com seis itens na folha abaixo.
  `Painel.base` lê o fluxo de cada item **uma vez** por desenho, e o seletor e
  a lista comem do mesmo prato.
- **Duas folhas, de propósito** (`opts.parte`). Numa folha só sobrava lugar
  para duas linhas da lista, e o cabeçalho que ficava para trás empurrava o
  gráfico inteiro para a folha seguinte: meia folha em branco e a lista
  apertada logo depois. Separadas, cada uma enche a sua.
- A rosca é SVG escrito à mão, com as cores de `Store.STATUS` (as mesmas do
  trilho da lista e da pílula do resumo) e cada fatia com o número na legenda:
  anel sem rótulo obriga a medir ângulo a olho, e isso não é leitura.

### As três leituras do fluxo (`Fluxo.agregado`, `matriz`, `saltos`)
A lista responde "por onde passou esta NCR". Com trinta itens na mão a pergunta
vira outra — "por onde passa o trabalho deste marco" —, e trinta desenhos lado
a lado não respondem isso.

- `Fluxo.agregado(analises)` soma os fluxos: cada card e cada seta ganham
  `peso` (quantos itens passam ali). O cálculo de colunas saiu de dentro do
  `analisar` para `distribuirColunas`, usado pelos dois.
- Os nós do agregado são **cópias**: o nó da análise de um item carrega o
  `nivel` e a `ordem` daquele desenho, e somar por cima bagunçaria o desenho
  de lá.
- `Fluxo.svg` com `opts.pesos` engorda a seta, escreve o número em cima dela
  (com contorno branco, senão some sobre a linha) e põe a contagem embaixo do
  card — o que exige altura extra por card, senão o número encosta no de cima.
- **Filtro por marco**: `Fluxo.marcosCitados` lista os marcos que os próprios
  textos citam e `Fluxo.passaPor` recorta. Não há lista fixa de marcos aqui —
  o texto continua sendo a verdade (§10).
- **Escopo**: a aba passou a poder olhar todos os relatórios, não só o aberto.
  Com isso, a linha do item tem de abrir o relatório certo antes de selecionar
  (reaproveita `abrirDaTabela`), e o número sozinho deixa de identificar — a
  linha mostra o marco junto.

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
- **Ler não escreve.** O outro relatório não é tocado.
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
  mostra e não escreve: escrever aqui não pode encostar no item de lá.
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

### A aba Tabela (`tabela.js`) e a planilha (`xlsx.js`)
Uma linha por item de **todos os relatórios**, não só do aberto — é a única
tela que responde "onde está a NCR-018?" sem abrir marco por marco.

- **Os filtros são os do Resumo** (`Summary.passa`), mais os marcos. Um filtro
  com o mesmo nome recortando coisas diferentes nas duas abas seria pior do que
  não ter o filtro.
- **Os marcos são pastilhas, e dá para marcar vários** (`f.marcos`, lista de
  ids). Era um `<select>` de escolha única, e comparar dois marcos obrigava a
  trocar de filtro e voltar. As pastilhas são as mesmas do filtro de situação
  do PDF e do "Passa por" da aba Fluxos: a mesma ideia tem de ter a mesma cara
  no programa inteiro. `marcosDoFiltro(f)` entende também o `f.marco` antigo,
  de escolha única, e o primeiro clique numa pastilha o zera — senão os dois
  filtrariam ao mesmo tempo. Relatório vazio continua na fila, com o `0` à
  vista: esconder um marco do filtro faria a pessoa procurar por ele.
- **Colunas escolhidas e reordenadas** ficam no `localStorage`
  (`derrogacao:tabela`), com a ordenação junto: é preferência de quem está
  sentado ali, como a Conversa e o item ao lado. **O filtro não é guardado** —
  reabrir o programa com uma busca velha aplicada esconde itens sem dizer por
  quê.
- **Ordenar aqui não toca em `project.ordem`.** A tabela é leitura; quem manda
  no PDF continua sendo a ordem do relatório. `Tabela.ordenar` trabalha numa
  cópia justamente por isso.
- **`.xlsx` é um ZIP com XML dentro**, e o `xlsx.js` escreve os dois à mão:
  entradas *armazenadas* (método 0, sem compressão) dispensam escrever um
  compressor, e o Excel abre normalmente. Sai com filtro no cabeçalho, primeira
  linha congelada e número como número.
- **Texto vai como `inlineStr`**, que o Excel nunca lê como fórmula — é o que
  protege o `= + - @` sem depender do apóstrofo. No CSV a regra continua sendo
  a do `csvCampo`, agora exportado por `SummaryView` para não haver duas cópias
  dela.
- **A exportação leva o texto dos anexos, não só a contagem.** `Anexos` e
  `Imagens` eram números; o que estava escrito dentro deles — a referência, a
  observação e a legenda de cada foto — não saía em lugar nenhum. Hoje são
  três colunas (`evidRefs`, `evidNotas`, `legendas`), cada anexo separado por
  ` | `. A foto continua fora: a planilha leva o texto dela. Com “Mostrar
  todas”, a exportação carrega o waiver inteiro, sem corte — o `longo: true`
  da coluna é só dica de estilo da tela, não limite de conteúdo.
- **Toda exportação leva uma aba “Recorte”** dizendo data, autor, quantos itens
  e qual filtro estava aplicado. Planilha que anda pela empresa sem dizer de que
  recorte veio acaba lida como se fosse o total.
- **O PDF da tabela vira paisagem acima de cinco colunas** (`rep-page--landscape`,
  a mesma classe das páginas de anexo — `Report.limite` já conhece os 210 mm).
  Retrato com dez colunas partia toda palavra ao meio.

### Banco NCR (`ncrs.js`, `ncrfluxo.js`, `ncrview.js`)
- **Marcos em ordem de fila, não alfabética** (`Fluxo.ordemMarco`/`cmpMarco`,
  a mesma `posicao` do desenho): listas, filtros, ordenação das colunas de
  marco e o caminho da coluna Waiver. `J05 (J06Cer)` é o J05 (o parêntese
  não muda a posição); `Ind` fica logo depois do marco dele.
- **Coluna Waiver = caminho**, como o "Caminho do waiver" da Tabela: os
  vínculos na ordem da fila, cada etiqueta com a cor da situação do item
  (`.st-cor--<status>`, as cores de `Store.STATUS` em três tons — a cor pura
  com letra branca não passa no contraste), e `(J09)` tracejado quando o
  último relatório aponta para um marco onde a NCR ainda não está
  (`Herdar.avanco`, estados `aLevar`/`semRelatorio`).
- **Alerta "fechada com waiver pendente"**: `Ncrs.fechada(rec)` e algum
  vínculo fora de `aceito`. É só tela — etiqueta, KPI, filtro, ficha,
  editor (`renderLigacaoBanco`), lista (`.alerta-dot`) e Kanban. Não vai ao
  PDF.
- **Colunas**: a chave virou `derrogacao:ncrColunas2` quando o padrão mudou
  (pedido do Bruno, com a imagem da janela), para o padrão novo valer uma vez
  para todos. A lista gravada É a ordem — `visiveis()` não reordena. A
  janela tem ↑/↓ (teclado) e arrastar; o cabeçalho da tabela também arrasta
  (`arrastavel`). O Número fica sempre em primeiro.
- **Importação do banco** reaproveita o NCR Control: o mesmo leitor de xlsx
  (`xlsxler.js` é cópia literal do motor dele — o `xlsx.js` daqui escreve, não
  lê), a mesma detecção de cabeçalho e os mesmos aliases de coluna, a mesma
  chave (`chaveNcr`) e o mesmo `grupoSbr`. Aceita também o `ncr.json` do NCR
  Control. **Só SBR4** (`Ncrs.SBR_ALVO`): coluna SBR; vazia, o número
  (`NCR-…-14-…`). Nunca apaga NCR — a que some do export fica com
  `fonte.presente = false`.
- **Correlação** só preenche o vazio (a menos de "substituir"), e a NCR que
  ainda não está no banco vai para `meta.pendentes`, aplicada quando chegar.
- **Vínculo NCR ↔ relatório não é gravado à parte**: é lido dos relatórios
  (item com `ncrKey` igual ou com o mesmo número). Por isso os relatórios
  antigos aparecem vinculados sem migração, e excluir o item desfaz o
  vínculo. `waiver.adicoes` é só o registro histórico. Marco Atual casa com o
  relatório por **igual exato** (`J06 Ind` ≠ `J06`) — decisão do Bruno; na
  ficha há "Adicionar a outro relatório…".
- **Adicionar ao Waiver** passa por `Store.logChange` como item criado à mão
  (sessão, autoria, pasta). Description ← descrição do banco; Observation ←
  Observação; Função ← `FVnn - TEXTO EM MAIÚSCULAS`; Sistema(s) e Waiver
  Historic também. Recusa se a NCR já estiver no relatório.
- **Fechada** (`Ncrs.fechada`): status final do NCR Control (`Closed`,
  `CEDOC Closure`…), ou palavra de fechamento no status, ou data de
  fechamento sem status. É o que pinta a linha de vermelho e o "Só abertas".
- **Fluxo** (`ncrfluxo.js`): porta ES5 de `Detalhe.trajSVG`/`flowSVG` do NCR
  Control, com o `FLUXO_PADRAO`, as `ETAPAS`, `ordemInferida` e `classificar`
  de lá. Usa o `cls` do evento quando vem do NCR Control e refaz a
  classificação quando não vem. Cores escritas por extenso (o desenho não
  depende das variáveis CSS de lá); SVG com `width`/`height` (§6).
- **A tela** (pedidos do Bruno depois de usar): a tabela é a página, com
  todas as NCRs e cabeçalho `sticky` — **sem `overflow` em caixa
  intermediária**, senão o sticky morre (§6); a lateral vira trilho estreito
  nesta aba. Editar uma célula troca **só aquela linha**
  (`NcrView.atualizarLinha`): a rolagem não volta ao topo, e a linha que saiu
  do filtro fica à vista (`st.fixadas`, amarelo) até o filtro mudar. As
  listas da tabela são botões que viram `<select>` no clique — 1.600 linhas ×
  3 listas de até 45 opções montadas de saída seriam ~200 mil elementos.
  Filtros de múltipla escolha; o filtro **não é guardado** (mesma regra da
  Tabela); colunas, painel recolhido e "destacar fechadas" são preferência do
  navegador (`localStorage`). Excel/CSV exportam o que está à vista, com a
  aba "Recorte".
- **Pasta**: `derrogacao-ncr-banco.json` (grande; vale a fonte com
  `importadoEm` mais novo; histórico é união) e `derrogacao-ncr-waiver.json`
  (pequeno; vale o `waiver.editedAt` mais novo). Separados para preencher um
  campo não regravar megabytes pela rede; só se grava o arquivo em que este
  lado tem novidade (`localMaisNovo`). Toda escrita com `comSegundaChance`.
  O poll olha os três arquivos; a ficha aberta (`dialog.nb-dlg`) não segura o
  poll — ela se redesenha quando a NCR muda por fora (`aposMudancaExterna`).
- **Proteção**: antes de cada importação, retrato em `ncrmeta:antes-importacao`
  (+ cópia em `historico-ncr/` com a pasta ligada). Desfazer/restaurar
  (`Ncrs.restaurar`) regrava com carimbos **posteriores** aos atuais — senão
  a pasta traria de volta o que se desfez — e não apaga as NCRs que entraram.
- O **backup de tudo** leva `ncrBase`; abrir um backup junta o banco NCR pelas
  regras da pasta. Versões antigas ignoram a chave nova.

### Aba Kanban (`kanban.js`)
O quadro de um marco. Colunas: **"NCR to be closed"** + as quatro de
`Store.STATUS`. O nome é do Bruno: NCR do marco que não está no Waiver dele
não tem waiver, então tem de ser fechada até o marco — por isso ali a
fechada é verde e a aberta é a que falta (o contrário do resto do programa,
onde fechada é vermelho), e as abertas vêm primeiro. Entram os itens NCR dos relatórios com **o mesmo marco pelo
texto** (`Ncrs.marcoChave`, a regra do Banco NCR), as NCRs do banco com esse
Marco Atual que não estão lá, e os itens de outros marcos que `Herdar.avanco`
diz que vão para ele e ainda não foram (a mesma "segunda porta" do painel).
Deduplicado pela chave da NCR.

- **Arrastar muda a situação** por `mudarSituacaoDe` em `app.js`:
  `Store.setStatus` + `Store.logChange` + `Store.save` + pasta — o mesmo
  caminho do editor, para um item de **qualquer** relatório (o Kanban não
  precisa do relatório aberto). Alternativa sem arrastar: o `<select>` do
  cartão (WCAG 2.5.7). Sair de `aceito` pede confirmação — o item aceito é
  travado no editor, e o Kanban não pode ser a porta dos fundos da trava.
- Soltar um cartão do banco numa coluna = `adicionarAoWaiver(rec, p,
  situacao)`.
- **Sem `overflow` no quadro**: o cabeçalho de cada coluna gruda na rolagem
  da aba (§6).
- O marco escolhido e os filtros não são guardados: abre no marco do
  relatório aberto (sem o "Ind", se os Ind estiverem escondidos).
- **Marcos "Ind" (industriais) ficam fora** — decisão do Bruno: têm pouca
  relevância. Escondidos do seletor por padrão (botão "Marcos industriais"),
  e nunca somados ao marco sem Ind. Cuidado: `Fluxo.marco("J09 Ind")` é o
  J09 (ignora o Ind), então a porta "a caminho" confere o **texto** do
  Expiry (`ehInd`) — senão um waiver até "J09 Ind" cairia no quadro do J09.
- Não há PDF do Kanban.

A **Tabela**, o **Banco NCR** e o **Kanban** usam o trilho estreito na
lateral (pedido do Bruno: "diminua as margens para caber tudo"); a Tabela
também perdeu o padding lateral. Só tela — o PDF da tabela é o de antes.

### Aba Resumo (`summary.js`)
Gráficos em **SVG escrito à mão** — sem biblioteca, imprimem em vetor e
funcionam de `file://`. Paleta validada para daltonismo. Filtros (tipo,
situação, sistema, arch status, evidência, busca) alteram números, gráficos,
tabelas, **CSV e resumo em PDF** — e o PDF filtrado diz qual foi o recorte. O
**backup do marco sai sempre inteiro**: backup pela metade não é backup.

**Parados há 30+ dias** (`Summary.DIAS_PARADO`): pendentes sem edição há um mês
ou mais, do mais esquecido para o menos. Sai do `editedAt` que já existia — item
aceito nunca conta, porque está pronto, não parado.

### O caminho padrão da pasta
`Store.CAMINHO_PADRAO` é o caminho combinado pela equipe
(`G:\DOP\GTO\3_INTERNO\01_SAFE TO DIVE\10_SISTEMA DE DERROGAÇÃO\00_BD`).
Ele é o valor de saída de `Store.getDbFolder()` e aparece no diálogo e no aviso
do alto (`#pastaNotice`), com botão de copiar.

- **Chave própria** (`derrogacao:pastaBanco`). Antes o caminho do banco e o da
  pasta de backup dividiam a mesma chave e um sobrescrevia o outro.
- **Isso não abre pasta nenhuma.** Nenhum navegador abre uma pasta por caminho;
  quem escolhe é a pessoa, na janela do Windows. O que dispensa escolher de novo
  é o crachá guardado no IndexedDB (§ a pasta da rede). O caminho é texto: serve
  para colar na janela e para viajar com os dados.
- **O que dava trabalho de verdade era a permissão de cada sessão**, que só pode
  ser pedida dentro de um gesto. `pedirPermissaoNoPrimeiroGesto` usa o primeiro
  clique em qualquer lugar, por até 2 minutos depois de abrir — passado esse
  tempo a pessoa já está trabalhando e uma janela roubando o foco atrapalharia
  mais do que ajudaria. `pedidoEmVoo` impede duas janelas de permissão ao mesmo
  tempo.
- O caminho que vier no arquivo da pasta sobrepõe o local e é gravado — é o que
  faz a próxima abertura já vir com o caminho certo, sem ninguém digitar.

### O cursor sobrevive ao redesenho do editor
Redesenhar o editor quando o colega muda o item aberto é obrigatório (§6).
O preço, até agora, era brutal: o `innerHTML = ''` destrói o campo em uso, o
foco volta para o corpo da página e **as teclas seguintes não vão para lugar
nenhum**. Quem estava escrevendo continuava escrevendo no vazio — era isto o
"a tela fica atualizando e às vezes perdemos dados".

`guardarCursor()` anota o id do campo focado e a posição da seleção;
`devolverCursor()` os devolve **no fim** do `renderEditor()`, com tudo montado
e as travas já aplicadas (campo travado não aceita foco, e tentar antes o
deixaria no lugar errado). Os ids são fixos (`f-<campo>`), que é o que torna
isso possível.

### Filtrar o PDF por situação
A janela de exportação recorta por situação do item (pastilhas com a mesma cor
do resto do programa) e traz **Marcar todos / Limpar** para os relatórios.
`Report.build`/`buildMany` recebem `opts.filtro`, que atravessa a capa, as
páginas e as evidências pelo mesmo caminho — senão o índice prometeria uma
página que não existe.

- **A capa diz que é recorte** (`rep-cover-recorte`, em inglês, como o resto da
  folha). É a mesma regra da aba "Recorte" das planilhas (§10): um Waiver
  Request parcial que não se anuncia é lido como o pedido inteiro. Sem filtro
  nada é acrescentado — a folha sai idêntica à de sempre, e o PDF continua
  sagrado.
- **O recorte não sobrevive ao fechar a janela**, pelo mesmo motivo do filtro
  da aba Tabela: reabrir e exportar sem perceber que ainda está filtrado é
  mandar meio relatório para o cliente.
- Relatório que fica sem nenhum item no recorte é desmarcado e desabilitado:
  ele não geraria folha.

### O diário do console (`log.js`)
Pedido do Bruno depois do `InvalidStateError`: ver o processamento acontecendo
e ser avisado quando algo dá errado, em vez de descobrir por acaso numa linha
vermelha que ninguém sabe ler.

- **Três níveis**, guardados em `derrogacao:log`: `silencio` (só o que deu
  errado), `normal` (o padrão) e `tudo` (mais cada gravação local e cada
  tempo). Erro aparece **em qualquer nível**, inclusive no silêncio: o nível
  existe para calar o que deu certo.
- **O texto das NCRs nunca é registrado.** É material de programa de defesa e
  o console fica aberto ao lado de quem passa. Vão nomes de campo, contagens,
  tamanhos e ids — nunca o conteúdo. Vale para o `relatarMesclagem` (só os
  rótulos dos campos atropelados) e para o `capturarRevisoes` (só os nomes).
  Há um teste que semeia um texto marcado e reprova se ele aparecer em
  qualquer lugar do diário.
- **Toda falha sai em três partes**: o que falhou, o que isso significa e o
  que a pessoa pode fazer. `Pasta.explicar(e)` traduz os erros do File System
  Access para o caso real — pasta de rede, equipe gravando junto.
- **A mensagem vai como argumento à parte do `console`**, nunca dentro do
  texto de formato: ela pode carregar coisa digitada (o número de uma NCR, o
  nome de um arquivo), e um `%s` perdido faria o console comer a linha
  seguinte. Só a hora e a área, que são escritas no código, entram no `%c`.
- **`Log.etapa`** abre e fecha com o tempo decorrido. Etapa que abre e não
  fecha é exatamente o que se quer enxergar.
- **`Log.vigiar()`** captura `error` e `unhandledrejection`, para nada passar
  em branco.
- **Tem janela, não só comando** (⋯ Mais → *Diagnóstico e diário do console*,
  em seção própria do menu: não é do relatório aberto, é do programa). Cada
  comando vira um botão que faz a coisa, com o comando escrito ao lado para
  quem preferir digitar, e a saída aparece ali mesmo — decorar comando não é
  trabalho de quem usa o programa (§9). O aviso de privacidade fica à vista na
  janela, não escondido.
- **`Derrogacao.*`** é o que a pessoa digita: `ajuda()`, `tudo()`, `normal()`,
  `silencio()`, `diagnostico()`, `diario()`, `copiar()`. `copiar()` junta o
  diagnóstico com as últimas linhas e põe na área de transferência (com a
  reserva do `execCommand`, porque em `file://` não há `navigator.clipboard`).
- **A troca de situação da pasta é notícia; a repetição não.** `pastaDita`
  guarda a última anunciada: `sincronizando` passa a cada 20 s e `off` é só
  "ainda não escolheram pasta" — nenhum dos dois vira linha. A **volta ao
  normal** vira, porque quem viu o vermelho precisa saber que passou.

### O aviso de pasta parada
Perder a pasta em silêncio é o começo do problema que a mesclagem campo a
campo resolve no fim: quem trabalha horas sem saber que está sozinho produz
os dois textos no mesmo campo. Por isso o `#pastaNotice` tem um segundo
papel — com `pastaEstado` em `erro` ou `permissao` ele vira alarme
(`.notice--parada`), diz **há quanto tempo** a pasta não responde
(`ultimoSucesso`) e **ignora o "Agora não"**: aquele botão cala o convite
para escolher a pasta, nunca o alarme de que ela parou.

### Instalação e uso sem rede
`manifest.webmanifest` + `sw.js`, registrados só em `https:` ou `localhost`
(de `file://` a API nem existe, e o arquivo único não acompanha manifesto — o
`build-standalone.py` remove a linha). Serve a duas coisas: abrir sem rede e
fazer o Edge oferecer **Instalar**, que é o que faz o navegador guardar a
permissão da pasta entre sessões.

## 6. Armadilhas já pagas — não repita

- **Console limpo não é aprovação.** Um teste já reportou "nenhum erro"
  enquanto capturava páginas em branco. O console só conta o que o navegador
  reclamou; quem diz se o resultado presta é o artefato — abra o PDF, olhe a
  folha, confira o número.
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
- **A CSP tem `connect-src 'none'`, e isso alcança os testes.** O programa
  nunca chama `fetch`, então nada deve poder chamar — nem um `.json` recebido.
  Teste que queira conferir um arquivo servido não usa `fetch()` de dentro da
  página: pergunte de fora, ou use `Page.getAppManifest` pelo CDP, que é o
  que o navegador faz de verdade.
- **`manifest-src 'self'` não é enfeite.** Sem essa diretiva o Chrome não lê o
  `manifest.webmanifest` (conferido: `Page.getAppManifest` volta sem dados) e o
  Edge deixa de oferecer "instalar" — sem erro nenhum no console. No arquivo
  único ela sai, porque lá não há manifesto para autorizar.
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
- **`overflow: auto` sem altura mata o `position: sticky` de dentro.** O
  cabeçalho da aba Tabela não grudava: quem rolava era a aba inteira, e o
  cabeçalho não tinha a que se prender. A caixa da tabela tem `max-height` e
  rola sozinha — conferido no navegador, não de memória.
- **A base da mesclagem não pode avançar antes da gravação.** É o erro que
  transformaria a proteção em destruição: com `base` igual ao meu estado
  ainda não gravado, todo campo em que eu difiro do arquivo vira "campo que
  só o outro mexeu", e a junção seguinte apaga o meu trabalho inteiro. Por
  isso são duas bases, e por isso a de mesclagem só avança dentro do `then`
  da gravação.
- **Gráfico estreito no papel quer viewBox estreito.** `Summary.barras` nasceu
  com viewBox de 720 para a largura da tela. Numa coluna de 110 mm da folha,
  os 11 px do rótulo saem com menos de meio milímetro — ilegível, e sem erro
  nenhum. Daí o `opts.larg`/`opts.rotulo`: menos unidades de viewBox para a
  mesma largura impressa é letra maior.
- **Lista que quase cabe custa mais do que a que não cabe.** A paginação tira
  unidades do fim uma a uma; quando todas as linhas de um `data-lista` saem, o
  cabeçalho fica — e se ele ainda transbordar por três milímetros, o bloco
  inteiro de antes vai junto. Foi o que deixou meia folha do painel em branco.
  Quando a lista é longa e previsível, é melhor dar folha própria a ela do que
  esperar a paginação resolver.
- **Teste de `file://` com `--allow-file-access-from-files` esconde erro de
  verdade.** O Bruno abre o arquivo único do G: sem flag nenhuma, e o Chrome
  trata cada `file:` como origem única. Os testes daqui passam essa flag para
  a pasta de mentira funcionar; quando a dúvida for sobre o console dele,
  rode **sem** a flag também, senão o erro que ele vê não aparece aqui.
- **Pasta compartilhada não se testa copiando um lado no outro.** Isso é
  "um está com a pasta velha do outro", que é outro caso. Duas pessoas ao
  mesmo tempo só aparece com uma pasta de verdade entre as abas — os arquivos
  bombeados nos dois sentidos, valendo o mais recente (`rede.py`). Foi só com
  isso que o atropelo apareceu.
- **Redesenhar o editor rouba o teclado de quem está escrevendo.** Ver "O
  cursor sobrevive ao redesenho" no §5: o redesenho é obrigatório, devolver o
  foco também.
- **Um `if` solto enfiado no meio rouba o `else` de quem estava antes.**
  Aconteceu no `Painel.apurar`: ao acrescentar um contador entre o
  `if (r.jaChegou)` e o `else if (r.item.done)`, o else passou a pertencer ao
  contador novo e "Aceitos, falta trazer" zerou. Hoje aquele par está com
  chaves, de propósito.
- **Semente de teste tem de ser escrita como o Bruno escreve.** A primeira
  versão do `semear_marcos.js` punha "J08 To: J09" no Waiver Historic do item
  do J08 — o que ninguém faz —, e com isso o painel parecia funcionar e a
  coluna parecia certa. O histórico termina no marco do próprio relatório; o
  futuro está nas datas de validade.
- **Banco do navegador numa versão maior que a pedida trava o programa
  inteiro.** Uma versão de teste da integração do banco NCR subiu o IndexedDB
  para a v4; a versão seguinte pedia a v3, o navegador respondeu `VersionError`
  e nada funcionava — não gravava, não lia os relatórios, não guardava o crachá
  da pasta ("não consigo vincular o banco") —, com os dados todos intactos lá
  dentro. Hoje o `openDb` abre sem pedir versão quando dá `VersionError`, cria
  só a prateleira que faltar, e o `migrarNcrV4` copia uma vez o banco NCR das
  prateleiras de teste (`ncrs`, `ncrmeta`) para o `snapshots`. **Nunca suba o
  `DB_VERSION` sem necessidade**: a versão anterior do programa deixa de abrir
  o navegador para sempre, e isso não tem volta sem apagar o banco.
- **Dois `function` com o mesmo nome no mesmo arquivo: vale o segundo, sem
  aviso.** O `pasta.js` tinha `carimbo()` (a última leitura, exportada) e
  `carimbo(d)` (o nome datado do histórico); o segundo apagava o primeiro, e
  `Pasta.carimbo()` quebraria se chamado. O segundo virou `carimboDeNome`.
- **Não versione dados de NCR.** O repositório é **público**. O JSON de
  correlação, exports e históricos ficam na pasta da equipe.
- **O service worker é rede-primeiro, de propósito.** Cache-primeiro traria de
  volta o problema de HTML novo com JS velho que o `?v=<sha>` existe para
  evitar. O `sw.js` também é carimbado na publicação: sem mudar de conteúdo,
  o navegador não o atualiza.

## 7. Conferir antes de publicar

Não há mais suíte automatizada no repositório. O que resta é olhar, e vale
para toda mudança de interface: **abra o PDF exportado** (relatório, resumo e
fluxos), confira a capa, uma folha de continuação e uma página de evidência.
Mais de uma vez uma mudança de tela vazou para a impressão sem ninguém
perceber — é o §2, "o PDF é sagrado", e agora ninguém confere isso por você.

Abra também de `file://` e pelo `derrogacao.html`: são os dois caminhos que o
Bruno usa e os que mais escapam.

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
| Índice da capa fecha com a **situação do item**, não com o Arch Status | pedido do Bruno: o Arch Status é texto livre e muitas vezes vazio; a situação é sempre uma das quatro e diz de relance em que pé está. O Arch Status continua impresso na página do item (§4) |
| A situação sai em inglês na capa (`Store.STATUS.en`) | a folha é um documento em inglês; "Em preenchimento" seria a única palavra em português dela |
| O marco de destino sai do `Waiver Approved Expiry`, sem campo novo | o campo que já diz até quando o waiver vale é o que diz para onde ele vai; um campo paralelo sairia do ar na primeira vez que alguém editasse só o texto |
| Levar adiante exige o relatório do destino já criado | criar marco a partir de um campo de texto encheria a lista de marcos com typo, e cada um viajaria para a pasta da equipe |
| A cópia herdada mantém o mesmo número | o pareamento é sempre dentro do marco; é o número que liga a NCR-001 do J08 à do J09 no fluxo (ao contrário de `Store.duplicar`, que copia no mesmo relatório) |
| A cópia herdada chega em "Em preenchimento", com o ciclo anterior em branco | o waiver de lá foi aceito, o daqui ainda nem foi pedido; Arch Answer, Arch Status e as datas eram a resposta do marco que terminou |
| `herdadoDe` não sobe o `SCHEMA` e fica fora da `signature()` | mesmos motivos da `nota`: `extrasDe` já preserva, e o desempate tem de ser idêntico ao das versões anteriores |
| RANAE e TRAP entram em `Fluxo.ORDEM` pelo nome, sem número | são os dois marcos depois do J12 e não têm "J"; sem isso cairiam como card solto no fim do desenho. "RANAE J06" continua sendo o J06 — havendo número, é o número que manda |
| O painel recorta por "seta que termina aqui" **ou** "o documento diz que vale até aqui", não por "passa por aqui" | quem já saiu do J08 não está indo para o J08; e o histórico nunca diz o futuro, então sem a segunda porta o painel do J09 ficava vazio antes de o marco começar |
| "Vai para" sai do Approved Expiry (e do Request Expiry na falta), nunca do Waiver Historic | o histórico termina no marco do próprio relatório: a última seta dele é a chegada, não a saída |
| `Herdar.destinoDe` é estrito (só o aprovado); `paraOnde` é generoso (aceita o pedido) | copiar o item é ação e só pode seguir o que foi aprovado; ler para onde ele aponta é leitura, e o pedido já informa |
| "Já levada?" só cobra depois de o waiver ser aceito | antes disso não há o que levar, e o "não" seria cobrança de uma coisa que ainda não venceu |
| O painel ignora os filtros da aba Fluxos e os esconde | eles são do fluxo por item; botão que não faz nada é pior do que botão nenhum |
| No painel, a cópia que já chegou ganha da original | uma NCR levada adiante existe duas vezes neste navegador, e quem ainda dá trabalho é a cópia; daí "já no relatório" × "falta trazer" |
| O painel em PDF sai em duas folhas fixas | numa só, o cabeçalho órfão da lista empurrava os gráficos para a folha seguinte e deixava meia folha em branco |
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
| Uma anotação por item, e não uma conversa por item | é quase sempre recado de uma pessoa só e de vida curta; um vetor de notas exigiria união por id dentro do `mergeLWW`, e o campo passaria a se comportar diferente de todos os outros (escolhido com o Bruno) |
| A anotação não sobe o `SCHEMA` | `extrasDe` já a preserva na versão antiga (provado no navegador); subir poria a equipe inteira em só leitura até todo mundo trocar o arquivo |
| A anotação fica fora da `signature()` | o desempate tem de ser idêntico ao das versões anteriores, senão as bases divergem |
| Aba Tabela olha todos os relatórios; ordenar nela não muda o PDF | a pergunta que ela responde é "em que marco está este item?"; a ordem do relatório tem dono, que é `project.ordem` |
| A planilha leva o texto dos anexos, nunca a imagem | o texto cabe numa célula e é o que se procura depois; a foto tem dois caminhos próprios, o PDF do relatório e o backup `.json` |
| Colunas e ordenação da Tabela no `localStorage`, filtro não | as colunas são de quem está sentado ali; um filtro guardado esconderia itens na abertura seguinte sem dizer por quê |
| `.xlsx` escrito à mão, em vez de CSV ou de biblioteca | sem dependência (§2), e o CSV perde tipo, cabeçalho congelado e filtros — e trata `=` como fórmula |
| Toda exportação leva a aba "Recorte" | planilha filtrada que não diz que está filtrada é lida como se fosse o total |
| Caminho do banco com valor de saída e chave própria | ninguém deveria precisar perguntar onde fica a pasta; e o caminho do backup é outro campo |
| Mesclagem campo a campo, com base guardada, em vez de item inteiro | dois campos diferentes do mesmo item nunca foram conflito; tratá-los como se fossem era perder texto em silêncio |
| A base de mesclagem só avança depois da gravação dar certo | avançá-la antes faz a junção seguinte ler o meu trabalho como sendo do outro, e apagá-lo |
| Duas bases (mesclagem e diário) na mesma prateleira do IndexedDB | criar prateleira nova obriga a subir a versão do banco, e a versão anterior do programa deixaria de abrir o mesmo navegador |
| A base que vale é decidida pelo `baseadoEm` do arquivo, não pelo relógio do item | ser mais novo não é ter visto: só o carimbo do arquivo diz se a cópia que chegou partiu da minha gravação ou de antes dela |
| O recorte do PDF não fica guardado entre aberturas | exportar meio Waiver Request sem perceber é pior do que escolher o filtro de novo |
| A capa avisa quando o PDF é parcial | mesma regra da aba "Recorte": lista filtrada que não diz que é filtrada é lida como o total |
| O relógio só decide quando os dois escreveram no MESMO campo | é o único caso que sobra sem base comum; e nele o texto perdedor é guardado, não descartado |
| Diário de alterações em arquivo próprio, fora do backup e do PDF | mesma razão da conversa: os dados são reescritos e versionados a cada gravação |
| Cada computador anota só o que ele escreveu | anotar o que chega dos outros duplicaria cada linha em cada máquina |
| Restaurar um texto é uma edição nova, com hora nova | só assim ele vale também no computador dos outros, em vez de voltar apagado |
| Permissão da pasta pedida no primeiro clique, por 2 minutos | é o único jeito de atender à regra do gesto sem deixar o aviso esperando um clique no lugar certo |
| Banco NCR no armazém `snapshots`, sem subir o IndexedDB | a versão anterior do programa continua abrindo o mesmo navegador; relatórios intocados |
| Só SBR4 no banco NCR, por enquanto | pedido do Bruno; `Ncrs.SBR_ALVO` |
| Observation em campo próprio, fora do PDF, separado da nota | pedido do Bruno: a nota é recado de pendência; a observation é o texto da NCR |
| Marco Atual casa com relatório só se igual | `J06 Ind`/`J06Cer` podem não ser o `J06`; a ficha oferece escolher à mão |
| Correlação só completa o vazio | reimportar não desfaz correção manual |
| Vínculo lido dos relatórios, não gravado à parte | não dessincroniza; os relatórios antigos já aparecem vinculados |
| Editar na tabela do Banco NCR não redesenha a tabela | a rolagem voltava ao topo e a linha sumia do filtro no meio da edição |
| Exportação do Banco NCR leva o que está à vista, com "Recorte" | pedido do Bruno; mesma regra da aba Tabela |
| JSON de correlação fora do Git | repositório público, dado do programa |
| Marcos em ordem de fila em todo lugar (`Fluxo.cmpMarco`) | pedido do Bruno: "na ordem que combinamos, igual ao extrato da tabela"; alfabética põe J05 (J06Cer) e J06Cer em lugar errado |
| Coluna Waiver colorida pela situação do item | pedido do Bruno; as cores de `Store.STATUS`, em tons que passam no contraste |
| Aviso de NCR fechada com waiver pendente, só na tela | pedido do Bruno; *Waiver accepted* não avisa. O PDF é sagrado (§2) |
| Colunas do Banco NCR reordenáveis, chave nova para o padrão novo | o padrão da imagem do Bruno tinha de valer para quem já tinha escolha gravada |
| Kanban por marco, marco pelo texto igual | mesma regra do Banco NCR (`J09 Ind` ≠ `J09`) |
| Kanban esconde os marcos "Ind" e nunca os soma ao marco sem Ind | decisão do Bruno: o marco industrial tem pouca relevância |
| Primeira coluna do Kanban é "NCR to be closed" | pedido do Bruno: NCR do marco fora do Waiver dele precisa ser fechada |
| Arrastar no Kanban muda a situação; sair de "aceito" confirma | é o gesto natural de um quadro; a confirmação protege a trava do item aceito |

