# Auditoria profunda — setembro de 2026

Feita sobre `claude/relaxed-keller-pngvj6`, commit `c9b0b2b`. Tudo aqui foi
verificado no navegador (Chromium do Playwright), não por leitura de código
apenas — quando a conclusão veio só da leitura, está dito.

## 0. Escopo pedido × escopo existente

O pedido citava `AGENTS.md`, a pasta `analise/`, `docs/index.html` e um
controle de atomicidade por `meta.revisao`. **Nada disso existe neste
repositório** (`grep -rn "revisao\|meta\." --include=*.js` só encontra a leitura
da `<meta name="app-version">` em `app.js:2779`). Os equivalentes reais são
`CLAUDE.md`, `README.md` e `index.html` na raiz. A ausência de `meta.revisao`
não é um detalhe de nomenclatura: **o banco na pasta não tem nenhum campo de
revisão**, e é isso que o item R1 descreve.

---

## 1. Erros comprovados

### E1 — Falha ao gravar na pasta destrói o texto do colega (severidade: ALTA)

**Arquivo/linhas:** `assets/js/app.js:2221-2295` (`sincronizar`), especialmente
o `.catch` de 2277-2292.

**Cenário de reprodução**
1. Duas pessoas na mesma pasta de rede. A NCR-001 está aberta na tela de Bruno.
2. Maria grava uma versão mais nova da NCR-001 na pasta.
3. A pasta de rede cai (ou a permissão é revogada, ou o disco enche) — a
   *leitura* de Bruno ainda funciona, a *gravação* falha.
4. Bruno continua digitando.

**Impacto** — `sincronizar()` lê, chama `Store.mergeListas` (que **altera
`state.projects` no lugar**) e só depois grava. Se a gravação falha, o `.catch`
apenas marca o chip como "erro": não salva o resultado no IndexedDB e **não
redesenha o formulário**. A memória já tem o texto de Maria; a tela ainda mostra
o de Bruno. A tecla seguinte grava o texto velho por cima — e, como agora ele
tem `editedAt` mais recente, a próxima sincronização bem-sucedida apaga a versão
de Maria **também na pasta**. É exatamente a armadilha do `CLAUDE.md` §6
("redesenhe quando o item aberto mudar por fora"), disparada por uma falha de
escrita.

**Evidência** (`scratchpad/probe_falha.py`, com `Pasta.gravar` rejeitando):
```
A) texto na TELA .............: "meu texto"
B) texto salvo no NAVEGADOR ..: "meu texto"
B2) texto na MEMORIA do app ..: "TEXTO DO COLEGA — NAO PODE SUMIR"
B3) => o merge ocorreu na memoria e a tela ficou velha? True
C) depois de digitar mais ....: "meu texto continuo escrevendo"
D) o texto do colega sobreviveu? False
```

**Correção recomendada** — a mesclagem não pode ficar aplicada pela metade.
Guardar um retrato de `state.projects` antes de `mergeListas` e desfazê-lo se a
gravação falhar; ou (melhor) mesclar sobre uma cópia e só adotá-la depois da
gravação bem-sucedida. Em qualquer caso, salvar localmente e redesenhar a tela
sempre que o merge for adotado.

**Teste de regressão** — `tests/test25.py`: simular falha de `Pasta.gravar`
depois de uma alteração externa e exigir que (a) o texto do colega não suma e
(b) a tela não fique mostrando um texto que já não é o gravado.

---

### E2 — Excluir um relatório inteiro não sobrevive à sincronização (ALTA)

**Arquivo/linhas:** `assets/js/app.js:2521-2533`.

**Cenário** — pasta ligada, menu ⋯ → *Excluir este relatório* → confirmar. A
próxima sincronização traz o relatório de volta, inteiro.

**Impacto** — a exclusão não deixa nenhuma marca: `Store.remove` apaga do
IndexedDB, mas `Store.mergeListas` não encontra correspondente local e recria o
relatório a partir do arquivo da pasta (`store.js:604-612`). O usuário vê o
toast "Relatório excluído" e o relatório reaparece minutos depois. A exclusão
também nunca chega aos colegas.

**Evidência** (`scratchpad/probe_app.py`):
```
A) pasta tem 1 relatorio(s) e 2 NCRs
1) apos excluir o relatorio e sincronizar, o navegador tem:
   [{"marco":"X","ncrs":0},{"marco":"RANAE J06","ncrs":2}]
```

**Correção** — lápide de relatório (`project.deleted` só cobre item). Ou uma
lista de relatórios excluídos no payload da pasta, respeitada por
`mergeListas`. Alternativa mínima e honesta: com a pasta ligada, avisar que a
exclusão só vale neste navegador.

**Teste** — `tests/test26.py`: excluir o relatório, sincronizar, exigir que ele
não volte.

---

### E3 — Exclusão aceita na tela de mesclagem não deixa lápide (ALTA)

**Arquivo/linhas:** `assets/js/app.js:2043-2047` (bloco `dels.forEach`).
`Store.tombstone` é chamado **em um único lugar do programa** (`app.js:540`, o
botão Excluir da lateral).

**Cenário** — Maria exclui a NCR-002 e manda o `.json`. Bruno abre, o grupo
"Excluídos pelo colega" aparece, ele marca e aplica. Com a pasta ligada, a
NCR-002 volta na sincronização seguinte.

**Evidência** (`scratchpad/probe_merge_del.py`):
```
1) grupos na tela de mesclagem: ['Excluídos pelo colega (1)']
2) apos aceitar a exclusao: [{"marco":"RANAE J06","ncrs":["NCR-001"],"lapides":0}]
3) apos sincronizar com a pasta: [{"marco":"RANAE J06","ncrs":["NCR-001","NCR-002"],"lapides":0}]
```

**Correção** — `Store.tombstone(local, e.kind, e.mine)` antes do `splice`.

**Teste** — `tests/test27.py`: o fluxo acima, exigindo `lapides: 1` e que a
NCR-002 não volte.

---

### E4 — Planilha CSV abre fórmulas no Excel (ALTA neste contexto)

**Arquivo/linhas:** `assets/js/summary.js:459-462` (`csvCampo`).

**Cenário** — qualquer campo de texto que comece com `=`, `+`, `-` ou `@`. Num
banco compartilhado, o conteúdo vem de outras pessoas e de `.json` recebidos.

**Impacto** — `"=cmd|'/c calc'!A1"` é DDE: o Excel oferece executar. Aspas não
protegem — o Excel desfaz as aspas antes de avaliar. `=HYPERLINK(...)` exfiltra
em um clique. Material de programa de defesa aberto numa máquina corporativa.

**Evidência** (`scratchpad/probe_sec.py`):
```
campos que o Excel trata como formula:
['"=cmd|\'/c calc\'!A1"', '"+1+1"', '"=1+1"', '"=HYPERLINK(""http://x"")"']
```

**Correção** — prefixar com apóstrofo (ou tabulação) todo campo que comece com
`= + - @ \t \r`, no `csvCampo`.

**Teste** — `tests/test28.py`: gerar o CSV de um item com esses prefixos e
exigir que nenhum campo comece com um caractere de fórmula.

---

### E5 — Imagem com `src` remoto num `.json` faz o navegador buscar na rede (ALTA)

**Arquivo/linhas:** `assets/js/report.js:209` e `assets/js/app.js:1007`
(`im.src = img.src`). Sem CSP em `index.html`.

**Cenário** — um `.json` (da pasta ou de e-mail) traz
`images:[{src:"http://servidor-externo/x.png"}]`. Basta abrir a pré-visualização
ou o item para o navegador buscar a URL.

**Impacto** — quebra a restrição número um do `CLAUDE.md` ("nada sai do
computador"). O servidor remoto recebe IP, hora e — pela URL — qual item foi
aberto. É um *beacon* de leitura dentro de material de programa.

**Evidência** (`scratchpad/probe_sec.py`):
```
3) requisicoes para fora durante a montagem:
   ['http://127.0.0.1:9/vazou.png', 'http://127.0.0.1:9/vazou.png']
5) CSP no documento: ausente
```

**Correção** — duas camadas: (a) `normalizeImage` aceitar apenas `data:` e
`blob:` em `src`; (b) `<meta http-equiv="Content-Security-Policy">` com
`default-src 'self'; img-src data: blob:; connect-src 'none'`.

**Teste** — `tests/test29.py`: importar um projeto com `src` http e exigir zero
requisições externas.

> XSS propriamente dito **não foi reproduzido**: `report.js`, `summary.js` e
> `app.js` usam `textContent`/`createElement` em todos os caminhos, e o único
> `innerHTML` é `= ''`. Tags nos campos saem como texto literal
> (`window.__xss` e `__xss2` permaneceram `false`).

---

### E6 — Empate de milissegundo faz as duas bases divergirem para sempre (MÉDIA)

**Arquivo/linhas:** `assets/js/store.js:508`
(`var novo = String(dele.editedAt||'') > String(meu.editedAt||'')`).

**Cenário** — dois itens com o **mesmo** `editedAt` e conteúdos diferentes. Cada
lado mantém o seu; nenhuma sincronização futura resolve, porque a regra é
estritamente `>`.

**Impacto** — quebra a convergência que o README promete ("A regra **converge**:
mesmo que duas gravações se atropelem, a sincronização seguinte de cada lado
traz de volta o que faltou"). Aqui não traz.

**Evidência** (`scratchpad/probe_store.py`, caso A):
```
DIF  empate de carimbo converge? -> ["texto de A", "texto de B"]
```

**Correção** — desempate determinístico e simétrico: com `editedAt` igual e
assinaturas diferentes, vence o de menor (ou maior) `Store.signature`. Qualquer
critério serve desde que os dois lados cheguem à mesma conclusão.

**Teste** — o caso A do `probe_store.py`, promovido a asserção.

---

### E7 — A busca do Resumo não procura em dois dos cinco blocos de texto (MÉDIA)

**Arquivo/linhas:** `assets/js/summary.js:70-73`. O palheiro é
`[ncrId, systems, func, description, currentSituation, archAnswer, certificates]`
— faltam `whyNotPossible` e `arguments`.

**Impacto** — o README diz que a busca cobre "os blocos de texto". O filtro
alimenta os números, os gráficos, **o CSV e o resumo em PDF**: um item que só
menciona o termo em "Why is not possible" some do recorte sem aviso.

**Evidência** — leitura do código, confirmada pela lista de campos acima.

**Correção** — incluir `whyNotPossible`, `arguments` e (útil) `historic` e
`archStatus`.

**Teste** — `tests/test30.py`: item cujo termo só existe em `whyNotPossible`,
exigindo que a busca o encontre.

---

### E8 — Metade da suíte não tem nenhuma asserção (MÉDIA)

**Arquivos:** `tests/test.py`, `test2.py`…`test12.py`, `test18.py` — 12 de 24
suítes com `assert` = 0.

**Impacto** — "rodar a suíte inteira antes de publicar" dá uma segurança que
não existe. `test.py`, descrito como "fidelidade do PDF ao relatório original",
gera o PDF e imprime `ERRORS: none` — sai com código 0 mesmo que o PDF venha em
branco. `test18.py`, que é o teste *unitário* das regras de mesclagem da pasta,
imprime a tabela de resultados e não confere nenhum. É o próprio aviso do
`CLAUDE.md` §6 embutido na suíte.

**Evidência**
```
test.py assert=0 print=1      test7.py  assert=0 print=27
test2.py assert=0 print=11    test18.py assert=0 print=2
... (12 arquivos com assert=0)
```

**Correção** — transformar os valores já impressos em asserções. Não exige
reescrever os testes: os números que o humano lia viram `assert`.

---

### E9 — WCAG 2.2 AA: seis falhas comprovadas

Medidas com `scratchpad/probe_a11y.py` na aplicação carregada.

| # | Critério | O que está errado | Onde |
| --- | --- | --- | --- |
| a | **4.1.3 Status Messages** (AA) | Nenhuma região viva no programa inteiro. `#toast` e `#saveState` não têm `role`/`aria-live`. Avisos como "o item que estava aberto foi excluído por outra pessoa" nunca são anunciados. | `index.html:94,357` |
| b | **4.1.2 / 3.3.2** | Seis controles sem nome acessível: `#ncrFilter` (só *placeholder*) e as cinco áreas de texto do conteúdo — `renderEditor` cria o `<label>` e depois o remove (`$('label', f).remove()`, `app.js:709`). | `index.html:132`, `app.js:709` |
| c | **2.5.7 Dragging Movements** (AA, nova na 2.2) | Reordenar na ordem manual só existe por arrastar: 2 itens `draggable`, 0 botões de mover. | `app.js:430-449` |
| d | **1.4.3 Contrast** (AA) | `.ncr-item-sub` = 4,11:1 a 12 px (mínimo 4,5:1). | `app.css` |
| e | **3.1.2 Language of Parts** (AA) | O relatório inteiro é inglês dentro de um documento `lang="pt-BR"`, sem `lang="en"`. | `report.js`, `index.html:2` |
| f | **4.1.2 Name, Role, Value** | `role="tab"` sem `aria-controls`; nenhum `role="tabpanel"`; sem *roving tabindex*. | `index.html:110-120` |

O alvo de 24×24 px (**2.5.8**) passa: a única caixa menor (`#pendingOnly`,
13×13) está dentro de um `<label>` clicável maior.

---

## 2. Riscos prováveis

| # | Risco | Onde | Por quê |
| --- | --- | --- | --- |
| R1 | **Ler-juntar-gravar não é atômico e não há campo de revisão.** Entre `Pasta.ler()` e `Pasta.gravar()` outra pessoa pode gravar; a escrita atropela sem perceber. Pior: `ultimaLeitura` já avançou, então `mudouLaFora()` passa a dizer "não mudou" e esse lado só recupera quando o outro sincronizar de novo. | `pasta.js:88-133`, `app.js:2221` | A convergência cobre o caso comum, mas depende de o outro lado voltar. Não há `If-Match`/revisão porque a File System Access API não oferece; um campo `revisao` no próprio JSON permitiria ao menos detectar e repetir a rodada. |
| R2 | **Reentrância:** `sincronizando = false` é zerado (`app.js:2264`) **antes** do `Promise.all(Store.save)` e do redesenho. O poll de 20 s pode iniciar outra rodada no meio. | `app.js:2262-2276` | Janela curta, mas real. |
| R3 | `ultimaLeitura` é atualizado **antes** do `JSON.parse`. Um arquivo corrompido consome o sinal `externo`, e o retrato "-antes de juntar" não é gravado na rodada seguinte. | `pasta.js:96-102` | Perde justamente a rede de proteção no momento em que ela mais importa. |
| R4 | Fechar a aba até 2,5 s depois da última tecla descarta a gravação na pasta (`gravaTimer`); `beforeunload` só chama `flushSave()`, que é local. | `app.js:108-112`, `app.js:2765` | O trabalho não se perde (fica no navegador), mas só chega aos colegas quando a pessoa reabrir. |
| R5 | `ingest()` captura o objeto `ev` no closure. Se o item for redesenhado por uma sincronização enquanto a imagem é lida, ela entra num objeto descartado. | `app.js:1057-1074` | Imagem some sem erro. |
| R6 | Sem CSP e sem `rel="noopener"`/restrição de origem. | `index.html` | Ver E5. |
| R7 | **Digitação nos campos de identificação degrada com a base:** cada tecla em Número/Sistema/Função redesenha a lista inteira (`refreshList: true`). | `app.js:586-598`, `renderNcrList` | Medido: 5 teclas em 202 ms (200 itens), 608 ms (800), **1455 ms (2000)** — ~290 ms por tecla. Os cinco blocos de texto não sofrem: não redesenham a lista. |

---

## 3. Limitações arquiteturais (não são defeitos; são o preço das decisões tomadas)

- **L1 — Texto sobrescrito não volta pela tela.** `Store.reviver` "só ressuscita
  o que sumiu" (`store.js:559`, verificado: `reviver nao restaura texto
  sobrescrito -> ["texto atual", 0]`). A versão substituída existe no arquivo do
  `historico/`, mas não há caminho na interface para recuperá-la. O README é
  honesto quanto a isso; ainda assim é a lacuna prática mais sentida do LWW.
- **L2 — Não há trava de arquivo.** A API não oferece. É decisão consciente e
  está documentada.
- **L3 — O arquivo inteiro é reescrito a cada sincronização**, com todas as
  imagens em base64. Medido: 4,15 MB com 2000 itens e imagens de 1 px; com fotos
  reais são dezenas de MB gravados a cada 2,5 s de digitação, sobre a rede.
- **L4 — O crachá da pasta é por pessoa e por navegador.** Documentado.
- **L5 — PDF por impressão do navegador.** Documentado, e é o que garante a
  fidelidade.

---

## 4. Hipóteses não verificadas

- **H1** — Numa unidade SMB real, `lastModified` pode ter granularidade de 1 s
  (ou 2 s em FAT). `mudouLaFora()` usa `>` estrito: duas gravações dentro do
  mesmo segundo podem passar despercebidas. Não dá para reproduzir sobre OPFS.
- **H2** — Comportamento ao estourar a cota do IndexedDB com muitas fotos: o
  `catch` de `Store.save` cai para `localStorage`, que é menor ainda. Não
  testado com estouro real.
- **H3** — Duas instâncias do navegador gravando o mesmo arquivo SMB no mesmo
  instante (bloqueio de arquivo do Windows, arquivo `.tmp` do `createWritable`).
- **H4** — Impressão real de 2500 páginas A4 pelo Chrome (montar o DOM leva
  105 ms; imprimir é outra história).

---

## 5. Melhorias

- **M1** — Conflito resolvido com "manter a minha" não atualiza `syncBase`
  (`app.js:2050-2052` só preenche quando vazio): o mesmo conflito reaparece a
  cada importação.
- **M2** — "Desfazer a última mesclagem" promete "tudo que foi mesclado ou
  editado depois disso será descartado", mas relatórios importados inteiros
  (`importBackupFile`, caminho `inteiros`) não passam por `saveSnapshot` e não
  são removidos pelo desfazer.
- **M3** — `SummaryView.render` faz `st = dados.geral; st.marco = 'Todos os
  marcos'` (`summary.js:611-615`), alterando o objeto de estatísticas.
- **M4** — Botões ↑/↓ em cada item da lista resolveriam E9c e ajudariam todo
  mundo, não só quem usa teclado.
- **M5** — `Store.toBackup` altera os objetos vivos (`syncBase`, `lastBackupBy`)
  **antes** de o arquivo existir. Se o download falhar, o estado já mudou.

---

## 6. Mapa regra → implementação → teste

| Regra | Implementação | Teste |
| --- | --- | --- |
| Situação interna ≠ Arch Status; só *aceito* conclui | `store.js` `STATUS`, `setStatus` | `test14` ✔ (com asserções) |
| Ordem da lista = ordem do PDF | `store.js` `ordenar`, `report.js:63` | `test22` ✔ |
| Mesclagem por arquivo (três pontas, `syncBase`) | `store.js` `diffProject` | `test9`, `test16`, `test17` ✔ |
| Mesclagem da pasta (LWW) | `store.js` `mergeLWW` | `test18` ✘ **sem asserções** |
| Lápides | `store.js` `tombstone` / `app.js:540` | `test19` ✔ parcial — **não cobre E2 nem E3** |
| Histórico automático e "-antes de juntar" | `pasta.js` `versionar` | `test20`, `test21` ✔ |
| Restauração só ressuscita o que sumiu | `store.js` `reviver` | `test20` ✔ |
| Filtros do Resumo alimentam CSV e PDF | `summary.js` `passa`, `toCsv` | `test23` ✔ — **não cobre E7** |
| Backup do marco sai inteiro | `summary.js` / `app.js` | `test23` ✔ |
| Índice da capa fecha com Arch Status | `report.js:101-110` | `test24` ✔ |
| Nada sai do computador | — | **sem teste** → E5 |
| CSV seguro para o Excel | — | **sem teste** → E4 |

## 7. Resultado da suíte atual

24/24 saíram com código 0. Isso significa menos do que parece: ver E8.

---

## 8. O que foi corrigido nesta passagem

Cada correção veio depois de um teste que reproduzia a falha, e a suíte inteira
foi executada em seguida.

| # | Situação | Correção | Teste |
| --- | --- | --- | --- |
| E1 | **corrigido** | `sincronizar()` passa a salvar e redesenhar a junção mesmo quando a gravação na pasta falha (`adotar()`); `sincronizando` só é liberado depois disso, o que fecha também R2 | `test25.py` |
| E2 | **corrigido** | Lápide de relatório inteiro (`Store.tombstoneProjeto`), guardada no navegador e enviada no campo `relatoriosExcluidos` do arquivo da pasta; `mergeListas` a respeita; `reviver` a desfaz | `test27.py` |
| E3 | **corrigido** | `applyMerge` chama `Store.tombstone` antes de remover | `test26.py` |
| E4 | **corrigido** | `csvCampo` prefixa com apóstrofo o campo que comece por `= + - @ \t \r` | `test28.py` |
| E5 | **corrigido** | `normalizeImage` só aceita `data:image/` e `blob:`; CSP no `index.html` (verificada: um servidor externo não recebe nada, e o uso de `file://` continua funcionando) | `test28.py` |
| E6 | **corrigido** | Empate de `editedAt` resolvido pela assinatura — mesmo resultado nos dois computadores | `test29.py` |
| E7 | **corrigido** | A busca passa a cobrir os cinco blocos, mais `archStatus` e `historic` | `test29.py` |
| E8 | **parcial** | `test18.py` (as regras de mesclagem da pasta) passou a conferir o que imprime. As outras 11 suítes sem asserção continuam como estavam — convertê-las é uma tarefa à parte, e não convinha mexer nelas na mesma passagem em que elas serviram de rede de proteção | — |
| E9a | **corrigido** | `role="status"` em `#toast`, `#saveState` e `#backupNotice`; o toast aparece antes de receber o texto, senão a mudança não é anunciada | `test30.py` |
| E9b | **corrigido** | `aria-label` em `#ncrFilter` e nas cinco áreas de texto | `test30.py` |
| E9c | **corrigido** | Botões ↑/↓ em cada item, 24×24, com `aria-label` e foco preservado | `test30.py` |
| E9d | **corrigido** | `--muted` de `#6d7383` para `#5f6577` (4,5:1) | `test30.py` |
| E9e | **corrigido** | `lang="en"` nas páginas do relatório, `lang="pt-BR"` nos dois trechos em português | `test30.py` |
| E9f | **corrigido** | `aria-controls`, `role="tabpanel"`, `tabindex` rotativo e setas ← → nas abas | `test30.py` |

**Não mexido de propósito:** R1, R3, R4, R5, R7, todas as limitações
arquiteturais e todas as melhorias. R1 em particular é uma decisão de projeto —
acrescentar um campo de revisão ao arquivo da pasta muda o formato e merece ser
discutido antes, não resolvido de passagem numa auditoria.
