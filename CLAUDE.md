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
assets/css/app.css         estilos do editor
assets/css/report.css      layout do relatório — tela e impressão A4
assets/js/store.js         modelo, persistência, mesclagem, ordenação
assets/js/pasta.js         a pasta da rede como banco de dados
assets/js/report.js        monta as páginas no padrão do PDF
assets/js/summary.js       apuração, filtros, gráficos SVG, aba Resumo
assets/js/app.js           o editor (o maior; ~2600 linhas)
tools/build-standalone.py  gera derrogacao.html (arquivo único)
tests/                     24 suítes Playwright — leia tests/README.md
exemplos/                  .json prontos para importar
.github/workflows/pages.yml  publicação
```

Ordem de carga dos scripts (importa: cada um usa o anterior):
`store.js → pasta.js → report.js → summary.js → app.js`.

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
  certificates: [], evidence: [{id, ref, note, orientation, images:[{id,src,caption}]}],
  status,                      // acompanhamento interno; NÃO sai no PDF
  done,                        // espelho de status === 'aceito'
  editedBy, editedAt,          // editedAt é a chave da mesclagem
  syncBase }                   // editedAt na última troca de arquivo
```

Persistência: **IndexedDB** (`derrogacao`, v3, stores `projects`, `snapshots`,
`handles`), com `localStorage` de reserva. `Store.save/list/remove`.

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
em `file://`**. A pasta guarda `derrogacao-dados.json` e `historico/`.

- Ao abrir: lê e junta. Ao salvar: **relê, junta, grava** (é o que evita apagar
  o trabalho de quem salvou no meio). A cada 20 s confere se mudou lá fora.
- Não há trava de arquivo — a API não tem. O que dá segurança é a mesclagem
  convergir: uma gravação atropelada se recupera na sincronização seguinte.
- **Histórico**: grava o estado local em `historico/` **antes de juntar**
  qualquer mudança externa (arquivo marcado `-antes`), mais uma versão a cada
  10 min, guardando as últimas 40. Restaurar **só ressuscita o que sumiu**
  (`Store.reviver`), registrado como edição de quem restaurou — é isso que faz
  o item sobreviver no computador dos outros.
- O "crachá" (handle) fica no IndexedDB, store `handles`. **Não é um caminho** e
  não viaja: cada pessoa escolhe a pasta uma vez, por navegador. O campo de
  caminho no diálogo é texto informativo que viaja nos dados, só para dizer ao
  próximo *onde* apontar.

### Lápides
Excluir um item empilha `{id, kind, ncrId, at, by}` em `project.deleted`. Sem
isso, o item apagado por uma pessoa voltaria pela sincronização de quem ainda
não soube. O carimbo é sempre **posterior à versão excluída**
(`Store.depoisDe`), para não ressuscitar por relógio adiantado.

### Aba Resumo (`summary.js`)
Gráficos em **SVG escrito à mão** — sem biblioteca, imprimem em vetor e
funcionam de `file://`. Paleta validada para daltonismo. Filtros (tipo,
situação, sistema, arch status, evidência, busca) alteram números, gráficos,
tabelas, **CSV e resumo em PDF** — e o PDF filtrado diz qual foi o recorte. O
**backup do marco sai sempre inteiro**: backup pela metade não é backup.

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
- **Não versione `derrogacao.html`** na `main` (está no `.gitignore`); ele é
  gerado na publicação.

## 7. Como testar

`tests/README.md` tem o passo a passo. Em resumo: 24 suítes Playwright que
abrem a aplicação de verdade, fazem o caminho do usuário e conferem o
resultado, **inclusive o PDF gerado**. Rode a suíte inteira antes de publicar —
já houve mais de uma vez em que uma mudança de interface quebrou um teste de
exportação.

Para a pasta compartilhada, os testes injetam um diretório OPFS no lugar do
seletor do Windows: mesma interface `FileSystemDirectoryHandle`, então o
caminho exercitado é o real.

## 8. Publicação

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
