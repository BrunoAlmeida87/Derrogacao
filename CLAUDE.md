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
assets/js/fluxo.js         lê o Waiver Historic e desenha o caminho do waiver
assets/js/summary.js       apuração, filtros, gráficos SVG, aba Resumo
assets/js/app.js           o editor (o maior; ~3000 linhas)
derrogacao.html            o programa inteiro num arquivo só — gerado, e versionado
tools/build-standalone.py  gera (e confere) o derrogacao.html
tests/                     31 suítes Playwright — leia tests/README.md
exemplos/                  .json prontos para importar
.github/workflows/pages.yml  publicação
```

Ordem de carga dos scripts (importa: cada um usa o anterior):
`store.js → pasta.js → report.js → fluxo.js → summary.js → app.js`.

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
  capturava páginas em branco. Confira o artefato.
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
- **SVG sem `width`/`height` sai em branco na impressão.** Com só o `viewBox`
  ele ocupa espaço na tela e nada no papel: o layout de impressão do Chrome não
  deduz o tamanho como o da tela. Os desenhos do fluxo levam os dois atributos.
- **As media queries de tela estreita valem na impressão** — a folha tem
  210 mm. Uma regra `@media (max-width: 900px)` mudou a altura das linhas só no
  papel, e a paginação, que mede na tela, errou a conta de folhas. O que entra
  na folha tem layout próprio sob `.rep-page`, sem depender da largura.
- **O service worker é rede-primeiro, de propósito.** Cache-primeiro traria de
  volta o problema de HTML novo com JS velho que o `?v=<sha>` existe para
  evitar. O `sw.js` também é carimbado na publicação: sem mudar de conteúdo,
  o navegador não o atualiza.

## 7. Como testar

`tests/README.md` tem o passo a passo. Em resumo: 31 suítes Playwright que
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
| `derrogacao.html` versionado na `main`, com conferência no CI | quem baixa o repositório leva o programa pronto; a conferência é o preço de guardar conteúdo derivado |
| Lista do resumo impresso em `div`, não em `<table>` | a paginação move filhos diretos do bloco; linha de tabela mora no `<tbody>` e não migraria sem partir a tabela |
