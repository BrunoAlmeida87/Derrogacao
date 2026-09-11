# Waiver Request — Gerador de Relatórios de Derrogação de NCR

Aplicação web que substitui o gerador interno de relatórios de derrogação
(*Waiver Request*). Funciona inteiramente no navegador: não há servidor, não há
login e nenhum dado sai do computador.

**Aplicação:** https://brunoalmeida87.github.io/Derrogacao/

## O que faz

- **Duas abas: NCR e DEV.** As duas categorias seguem o mesmo layout e são
  preenchidas ao mesmo tempo, cada uma com o seu marco, e **exportadas como
  dois PDFs independentes**. As diferenças da DEV, conforme o relatório
  original: capa com prefixo `DEV:`, número e descrição num campo só
  (`DEV-78154|BQ - Modification des compensateurs`) e sem a linha
  *Waiver Historic*.
- **Um relatório por marco.** O marco (ex.: `RANAE J06` na aba NCR, `J05 DQR`
  na aba DEV) fica no topo e entra no título da capa. Vários relatórios podem
  conviver no mesmo navegador — o seletor **Relatório** alterna entre eles, e
  cada um carrega as suas duas abas.
- **Data de emissão.** A capa do PDF traz, discreta no canto inferior direito,
  a data em que o relatório foi gerado. Pode ser desligada em
  **⋯ Mais → Ajustes de capa e rodapé**.
- **Uma página por item.** Cada NCR ou DEV inserida vira um item na lista
  lateral e uma página no PDF, com todos os campos de derrogação:
  *Description*, *Current Situation*, *Why is not possible to treat the
  deviation*, *What are the arguments for the derrogation* e *Arch Answer*,
  além de *Waiver Request Expiry*, *Arch Status Waiver*, *Waiver Approved
  Expiry*, *Waiver Historic* e *Certificate Impacted*.
- **Imagens ao fim de cada NCR.** Cada anexo gera uma página de evidência,
  com o link `Go to Evidence` na página da NCR e `Back to <NCR>` na página do
  anexo. Imagens entram por clique, arrastar-e-soltar ou colar (Ctrl+V), com
  legenda opcional. O anexo sai em paisagem (padrão do relatório original) ou
  em retrato, à sua escolha.
- **Reaproveitamento entre marcos.** **Copiar de…** traz NCRs já escritas de
  outro relatório, com ou sem as imagens, como cópias independentes.
- **Conferência antes de exportar.** A janela de exportação lista as NCRs com
  campos essenciais em branco, com link direto para corrigir.
- **Exportação em PDF** no mesmo padrão do relatório original: capa com o índice
  de NCRs (`NCR-…|HP|FV09 - …|WAIVER ACCEPTED`), páginas A4 retrato para as
  NCRs, páginas A4 paisagem para as evidências, mesmas cores de faixa e mesmo
  rodapé.
- **Backup e restauração** em arquivo `.json`, para levar o trabalho a outro
  computador ou passar para outra pessoa.
- **Uma pasta da rede como banco de dados**: o programa lê e grava direto nela,
  e quem abrir apontando para a mesma pasta vê o trabalho de todos, sem importar
  nada. Com histórico automático de versões.

## Como usar

1. Escolha a aba **NCR** ou **DEV** e preencha o **Marco** no topo (cada aba
   tem o seu; a DEV usa o marco da NCR se ficar em branco).
2. **+ Nova NCR** / **+ Nova DEV** na lateral esquerda e preencha os campos de
   identificação. O título da página é montado como `NCR-...|RM|FV 01 - ...`
   ou `DEV-78154|BQ - ...`, igual ao original.
3. Preencha os textos da derrogação. O salvamento é automático.
   Para um marco que repete NCRs de outro relatório, use **Copiar de…**.
4. Em **Evidências**, use **+ Novo anexo** e adicione as imagens necessárias.
5. **Pré-visualizar** mostra as folhas exatamente como sairão no PDF.
6. Marque a **situação do item** ao pé do formulário. O salvamento já é
   automático a cada tecla; a situação serve para acompanhar em que pé está
   cada derrogação.
7. **Exportar PDF…** abre a lista de todos os relatórios disponíveis, separados
   por marco e por NCR/DEV. Marque um para gerar o arquivo isolado, ou vários
   para gerar um arquivo único com todos em sequência, cada um começando na
   sua capa. A janela de impressão do navegador se abre; escolha:
   - Destino: **Salvar como PDF**
   - Margens: **Nenhuma**
   - **Gráficos de plano de fundo**: marcado
   - **Cabeçalhos e rodapés**: desmarcado

A lista lateral mostra **quantos itens já estão em waiver accepted** e tem um
filtro **esconder aceitos**, para achar rápido o que ainda falta.

### A ordem da lista é a ordem do PDF

O seletor **Ordem**, na lateral, vale para os dois ao mesmo tempo — a lista na
tela e as páginas no relatório, incluindo o índice da capa:

| Ordem | Como fica |
| --- | --- |
| **Manual (arrastando)** | a ordem que você montou; é a de fábrica |
| **Número** | alfanumérica pelo número — `NCR-9` vem antes de `NCR-10`, não depois |
| **Sistema** | pelas letras do sistema (`BB`, `BC`, `BF`, `HP`…), depois pelo número |
| **Função** | pelo texto da função (`FV01`, `FV09`, `FV20`…), depois pelo número |
| **Situação** | de *em preenchimento* até *waiver accepted* |

Escolher uma ordem automática **não reescreve nada**: a ordem manual continua
guardada por baixo, e basta voltar a *Manual* para recuperá-la. Se quiser
partir de uma ordenação automática e ajustar na mão, use **fixar** — ou
simplesmente arraste um item, que a ordem à vista vira a nova ordem manual. Os cinco blocos de texto são
recolhíveis (**Recolher preenchidos**), e campos que se repetem muito
(`PÓS TRAP`, `WAIVER ACCEPTED`, sistemas, funções, certificados) sugerem
valores já usados nos outros relatórios — **cada aba com o seu vocabulário**:
na NCR só aparecem valores de NCRs, na DEV só valores de DEVs.

Cada aba tem a sua cor (NCR em roxo, DEV em azul-petróleo, Resumo em âmbar),
que tinge a lateral e os realces da tela; e cada bloco de texto do formulário
leva a cor da faixa correspondente no PDF.

Campos vazios mostram um **exemplo do padrão** em letra menor e itálico,
prefixado por `ex.:` — é só um modelo do formato esperado, nunca um valor
gravado. Nos **Ajustes**, o texto de fundo aparece como `padrão: …`: ali ele é
mesmo o valor usado quando o campo fica em branco.

Os títulos de capa, o rodapé, a data de emissão e o marco alternativo da capa
da DEV ficam em **⋯ Mais → Ajustes de capa e rodapé** — textos fixos que quase
nunca mudam.

## Situação do item (controle interno)

Cada NCR e cada DEV tem uma **situação de acompanhamento**, escolhida ao pé do
formulário:

| Situação | O que quer dizer |
| --- | --- |
| **Em preenchimento** | ainda sendo escrito (é como todo item nasce) |
| **Waiver requested** | enviado, aguardando resposta |
| **Improve justification** | voltou pedindo justificativa melhor |
| **Waiver accepted** | aceito |

Ela é **só para controle interno e não sai em nenhuma página do PDF do
relatório** — aparece na lista lateral (a cor da barra à esquerda de cada item),
na aba **Resumo** e na planilha CSV. O campo **Arch Status Waiver**, que é o que
vai impresso no relatório, continua existindo e é independente desta situação:
um serve para o documento, o outro para você saber onde o trabalho está.

**Um item só conta como concluído quando chega em "Waiver accepted".** É isso
que acende o ✓ verde na lista, alimenta o contador de progresso e o filtro
*esconder aceitos*.

Ao **copiar NCRs de outro relatório**, a cópia recomeça em *Em preenchimento*:
o waiver é concedido por marco, não viaja junto com o texto.

Backups gravados antes desta versão continuam abrindo normalmente — o que
estava marcado como concluído entra como *Waiver accepted*, e o resto como
*Em preenchimento*.

## Backup, cache e trabalho compartilhado

Os relatórios ficam no **IndexedDB do navegador** (com `localStorage` como
reserva). Isso significa que continuam disponíveis ao fechar e reabrir o
navegador, mas **são apagados se você limpar os dados do site**. A aplicação
pede ao navegador para marcar o armazenamento como persistente, o que reduz o
risco, porém não elimina.

Por isso, no menu **⋯ Mais** (canto direito da barra superior):

- **★ Backup total** é a opção recomendada: salva **todos** os relatórios deste
  navegador — todos os marcos, NCRs e DEVs — num arquivo só. Use este no dia a
  dia; assim não há como restaurar mais tarde e descobrir que faltou alguma
  coisa.
- **Backup só deste** salva apenas o relatório aberto (as duas abas dele). Serve
  para mandar um marco específico a um colega.
- **Abrir arquivo…** lê um `.json` — também funciona arrastando o arquivo para
  qualquer ponto da janela.

Os arquivos saem com **data e hora** no nome
(`WaiverRequest_TODOS_20251001_14h32.json`), para que dois backups do mesmo dia
não se confundam na pasta de rede.

Para trabalhar em outro computador ou passar o trabalho adiante: gere o backup,
envie o arquivo, e a outra pessoa abre a mesma URL e usa **Restaurar**. Se o
relatório importado já existir naquele navegador, a aplicação pergunta se deve
substituir a versão existente ou importar como cópia nova.

Imagens são reduzidas para no máximo 1600 px e recomprimidas em JPEG ao serem
inseridas, para manter os arquivos de backup e o armazenamento em tamanho
razoável. O indicador **salvo no navegador** mostra, ao passar o mouse, quanto
espaço os dados ocupam.

## Usar sem internet, no próprio computador

O `index.html` sozinho **não funciona** — ele carrega seis arquivos ao lado dele.
Para uso local existe uma versão de **arquivo único**, com todo o CSS e o
JavaScript embutidos:

**https://brunoalmeida87.github.io/Derrogacao/derrogacao.html**
(ou pelo menu **⋯ Mais → ⤓ Baixar para usar sem internet**)

Salve o arquivo e abra com dois cliques. Não precisa de servidor, instalação
nem conexão — funciona inclusive numa pasta de rede, onde cada pessoa abre a
sua cópia.

> **Os dados não são compartilhados entre as versões.** O navegador guarda o
> armazenamento por origem: o que você escreve no site fica no site, e o que
> escreve no arquivo local fica no arquivo local — mesmo estando na mesma
> máquina. Para levar o trabalho de um para o outro, use **★ Salvar backup de
> tudo** de um lado e **Abrir arquivo…** do outro.

O arquivo é gerado a cada publicação por `tools/build-standalone.py`, então
acompanha sempre a versão do site.

## Aba Resumo

A terceira aba reúne **todos os marcos deste navegador**, não só o relatório
aberto:

- **Números do escopo**: itens em derrogação (com a divisão NCR/DEV), em
  *waiver accepted*, em andamento e páginas de evidência.
- **Progresso por marco** — barras empilhadas de *waiver accepted* sobre o total.
- **Situação dos itens** — as quatro situações de acompanhamento, na ordem do
  fluxo, com a cor de cada uma.
- **Itens por sistema** — um item que cita vários sistemas (`BX,BQ,BD`) conta em
  cada um; acima de dez sistemas o excedente vira "Outros".
- **Tabela de marcos**, com percentual aceito e quem editou por último.

### Filtros

Abaixo do seletor de marco há uma linha de filtros, que se somam:

| Filtro | Serve para |
| --- | --- |
| **Tipo** | separar NCR de DEV |
| **Situação** | ver só o que está em preenchimento, solicitado, a rever ou aceito |
| **Sistema** | um sistema específico (`HP`, `EX`, `BF`…), com a contagem de cada um |
| **Arch Status** | o texto que vai impresso no relatório, inclusive `(em branco)` |
| **Evidência** | só itens com anexo, ou só os sem |
| **Buscar no texto** | procura no número, sistema, função, nos blocos de texto e nos certificados |

Os números, os gráficos e as tabelas passam a contar **só o que está
filtrado** — e é isso que sai no **Resumo em PDF** (que traz uma linha dizendo
qual foi o recorte) e na **planilha CSV**. O **Backup deste marco** é a exceção
proposital: sai sempre inteiro, porque backup pela metade não é backup.

Escolhendo um marco no seletor (ou clicando no nome dele na tabela), a aba passa
ao detalhe daquele marco: os mesmos gráficos, a lista completa de NCRs e DEVs e a
contagem por certificado impactado. Nesse modo aparecem três exportações:

| Botão | O que sai |
| --- | --- |
| **Resumo em PDF** | Uma folha A4 com os números, os gráficos e a tabela de itens |
| **Planilha (CSV)** | Uma linha por NCR/DEV, com todos os campos — abre no Excel |
| **Backup deste marco** | O `.json` só desse marco, para enviar a alguém |

Os gráficos são SVG escrito à mão — sem biblioteca externa, imprimem em vetor e
funcionam com o arquivo aberto direto do disco. A paleta foi validada para
daltonismo (separação CVD ΔE ≥ 8 em todos os pares adjacentes), e cada segmento
leva o número escrito dentro, de modo que a leitura nunca depende só da cor.

## A pasta da rede como banco de dados

O caminho recomendado para trabalhar em grupo. Em vez de cada pessoa guardar a
sua cópia e trocar arquivos, o programa **lê e grava direto numa pasta
combinada**: quem abre apontando para a mesma pasta vê o trabalho de todos, sem
importar nada.

Em **⋯ Mais → 🗄 Pasta da rede como banco de dados**.

### Como funciona

A pasta guarda:

```
Derrogacao\
  derrogacao-dados.json     <- o banco: todos os marcos, NCRs e DEVs
  historico\
    2026-09-11_14h32_bruno.json     <- versões datadas, automáticas
    ...
```

- **Ao abrir**, o programa lê a pasta e junta com o que está aqui.
- **Ao salvar** (poucos segundos depois de parar de digitar), ele relê a pasta,
  junta as suas alterações às dos outros e grava o resultado. Reler antes de
  gravar é o que impede apagar o trabalho de quem salvou no meio do caminho.
- **De vinte em vinte segundos**, verifica se alguém gravou lá fora; se gravou,
  traz. Duas pessoas com o programa aberto se enxergam sem recarregar nada.
- Tudo continua salvo **também neste navegador**, então a pasta cair não
  interrompe o trabalho de ninguém.

### A regra de quem vence

Item a item, **vale a edição mais recente**. Não há tela de conflito aqui, ao
contrário da importação manual de arquivo: a gravação acontece sozinha, e
ninguém pode ficar parado esperando outra pessoa decidir.

A regra **converge**: mesmo que duas gravações se atropelem, a sincronização
seguinte de cada lado traz de volta o que faltou, porque cada um ainda tem os
seus itens com a sua hora de edição. Não há trava de arquivo — o que torna isso
seguro não é uma trava, é a mesclagem convergir.

Na prática:

| Situação | O que acontece |
| --- | --- |
| Duas pessoas em **itens diferentes** (o caso comum) | nada se perde: as duas edições sobrevivem |
| Duas pessoas no **mesmo item** | fica a edição mais recente; a outra versão está no histórico |
| O item aberto na sua tela muda por fora | a tela é redesenhada e um aviso diz quem alterou |
| O item aberto é excluído por outra pessoa | a lista volta para o primeiro item, com aviso |

O caso que realmente custa trabalho é o segundo, e ele é raro quando as NCRs
estão divididas entre as pessoas. Mesmo assim: **antes de juntar qualquer
mudança vinda de fora, o programa guarda o seu estado no histórico** — o texto
substituído nunca desaparece sem deixar cópia.

**Exclusões deixam lápide.** Sem isso, o item apagado por uma pessoa voltaria na
próxima sincronização, vindo do computador de quem ainda não soube. A lápide é
sempre carimbada depois da versão que apagou, mesmo que o relógio da máquina
esteja adiantado.

### O histórico é a rede de proteção

Fica **dentro da própria pasta**, numa subpasta `historico\` criada sozinha — não
é uma segunda pasta a configurar. O motivo é o mesmo de sempre: o navegador só
libera a pasta que a pessoa escolheu, então uma segunda pasta significaria uma
segunda permissão e uma segunda escolha, por pessoa.

São guardadas as últimas 40 versões, em dois momentos:

- **Sempre que chega mudança de fora**, o seu estado atual é gravado *antes* de
  ser juntado (o arquivo sai marcado como *antes de juntar*). É isso que garante
  poder recuperar um texto que a regra "vale quem editou por último" vá
  substituir no instante seguinte.
- **A cada dez minutos** de trabalho, uma versão comum, para haver uma linha do
  tempo e não só os momentos de encontro.

Em **🗄 Pasta da rede…** as versões aparecem listadas, com **Restaurar**.
Restaurar **só traz de volta o que sumiu** — o que está em uso agora não é
tocado nem substituído. A volta é registrada como uma edição sua, que é o que
faz o item sobreviver também no computador dos outros.

### O que cada pessoa precisa fazer

**Uma vez, em cada computador:** abrir **⋯ Mais → 🗄 Pasta da rede…**, clicar em
*Escolher a pasta…* e apontar a pasta combinada. Depois disso é só abrir o
programa.

Isso **não dá para configurar de forma central**, e não é limitação da
aplicação: o navegador não deixa nenhuma página abrir uma pasta por caminho —
quem escolhe é sempre uma pessoa, na janela do Windows. O que o programa recebe
é um "crachá" preso àquele navegador, que não viaja no HTML nem no arquivo de
dados. Por isso o diálogo tem um campo de **caminho da pasta**: é texto, viaja
junto com os dados e serve para a próxima pessoa saber *onde* apontar.

Três detalhes:

- **Precisa do Edge ou do Chrome.** Firefox e Safari não têm essa API. Sem ela,
  o programa funciona como sempre funcionou, com o armazenamento local.
- **Ao reabrir, o navegador pode pedir permissão** uma vez por sessão — um
  clique no `📁` da barra de cima. Instalando o programa como aplicativo (menu
  do navegador → *Instalar*), a permissão fica guardada e nem isso aparece.
- Uma **unidade de rede mapeada** (`Z:`) facilita: todo mundo escolhe a mesma
  coisa visível, sem digitar `\\servidor\...`.

### E o backup?

Continua, e fica mais importante — não menos. Com banco compartilhado um erro
alcança todo mundo no mesmo instante; e o histórico, por morar dentro da própria
pasta, não protege contra a pasta se perder. **★ Salvar backup de tudo** é o que
tira uma cópia *para fora* dela. O aviso do topo passa a dizer isso quando a
pasta está ligada.

## Duas ou mais pessoas ao mesmo tempo

Esta seção descreve a **troca manual de arquivos**, que continua existindo para
quem não usa a pasta compartilhada (por estar noutro navegador, noutra rede, ou
recebendo o trabalho de alguém de fora).

Não há servidor: cada pessoa trabalha na sua cópia, no próprio navegador, e os
arquivos `.json` circulam por uma pasta compartilhada. Por isso **abrir um
arquivo nunca substitui o que você tem** — a aplicação compara item a item.

### Quando o arquivo é do mesmo marco

**Marco igual, um relatório só.** Ao abrir um arquivo, a aplicação procura o
relatório correspondente aqui: primeiro pelo identificador interno (quando o
arquivo saiu de uma cópia deste mesmo relatório) e, na falta dele, **pelo
marco**. Assim, se você e um colega criaram cada um o seu `RANAE J06` do zero,
o arquivo dele **não** vira um segundo `RANAE J06` — cai na tela de mesclagem
contra o que você já tem. A comparação do marco ignora maiúsculas e espaços a
mais, então `ranae j06` e `RANAE  J06` são o mesmo marco. Só quando o marco é
realmente diferente é que o relatório entra inteiro, sem perguntar.

Dentro do relatório, os itens são pareados **pelo identificador interno e, na
falta dele, pelo número da NCR/DEV** — sem isso, a mesma `NCR-001` escrita
pelos dois entraria duplicada.

**O pareamento por número acontece sempre dentro de um mesmo marco.** A
`NCR-001` do `RANAE J06` e a `NCR-001` do `RANAE J07` são itens distintos, com
textos próprios, e nunca são comparadas entre si: cada marco é comparado com o
seu par e só com ele.

Um relatório **sem marco preenchido** não é identificado por marco — entra como
relatório à parte. Dois relatórios ainda em branco não são o mesmo trabalho.

Um **backup de tudo** costuma trazer vários marcos repetidos. Cada um tem a sua
tela, em fila: você resolve um, o próximo aparece, e a tela diz quantos ainda
faltam. Cancelar encerra a fila inteira — abrir o arquivo de novo recomeça.

### Os grupos da tela de mesclagem

| Grupo | O que é | Padrão |
| --- | --- | --- |
| **Novos** | Existem no arquivo e não aqui | acrescentar |
| **Atualizados pelo colega** | Você não mexeu; a versão do arquivo é mais nova | aceitar |
| **Precisam da sua escolha** | Os dois escreveram no mesmo item | **manter a sua** — você escolhe |
| **Excluídos pelo colega** | Existem aqui e sumiram do arquivo | não excluir |

Itens em que **só você** mexeu nem aparecem: ficam como estão, sem risco. A
decisão usa o carimbo da última troca de arquivo (`syncBase`), não apenas a
hora — é isso que permite distinguir "o colega atualizou" de "os dois
mexeram".

Dois detalhes valem para o **primeiro encontro** entre relatórios pareados pelo
marco, que nunca foram o mesmo arquivo:

- itens pareados pelo número vão sempre para *Precisam da sua escolha*, com a
  etiqueta **mesmo número** — não existe base comum, logo não existe versão
  "mais nova", e a decisão é sua;
- **nada é proposto para exclusão**: um item que só você tem não significa que o
  colega o apagou.

Se você já tem dois relatórios repetidos do mesmo marco (de importações feitas
antes disso), o menu **⋯ Mais** oferece **⇄ Juntar com o outro relatório deste
marco**, que abre a mesma tela de mesclagem entre os dois. Depois de conferir,
exclua o repetido.

Antes de aplicar, a aplicação guarda um retrato do estado anterior:
**⋯ Mais → ↩ Desfazer a última mesclagem** volta tudo, se a escolha foi errada.

### Rotina sugerida para a pasta compartilhada

1. Ao começar o dia, **Abrir arquivo…** com a versão que está na pasta.
2. Trabalhe normalmente.
3. Ao terminar, **★ Salvar backup de tudo** e grave na pasta por cima.

O navegador salva o arquivo na **pasta de downloads**, não na pasta
compartilhada — por isso, a cada backup, aparece um lembrete com o nome do
arquivo e o caminho da pasta de backup, com um botão para copiar o caminho.
O caminho é digitado uma vez e fica guardado neste navegador.

Combinar quem cuida de quais NCRs reduz ainda mais o atrito — mas, se dois
mexerem na mesma, a tela de mesclagem mostra o conflito em vez de perder
trabalho em silêncio.

## Quem editou por último

Não há login. Na primeira vez que você gera um backup, o sistema pede o seu
nome e o guarda neste navegador (rodapé do menu **⋯ Mais**). A partir daí, cada
relatório registra **quem editou por último** e **quem gerou o último backup**,
com data e hora — informação que aparece no canto direito da barra superior e
viaja dentro do arquivo `.json`. Ao restaurar o backup de um colega, o sistema
diz de quem veio o arquivo. Nada disso sai nos PDFs.

Se passar mais de uma semana sem backup, aparece um aviso no topo com um botão
para fazê-lo na hora.

### O que cada um alterou

Cada abertura da página é uma **sessão**. Enquanto você trabalha, a lista
lateral marca com um ponto os itens mexidos e mostra *"3 itens alterados nesta
sessão"*. Em **⋯ Mais → Histórico de alterações** ficam todas as sessões do
relatório, da mais recente para a mais antiga, com quem trabalhou, quando, e
quais NCRs/DEVs foram **criadas, editadas ou excluídas**. O botão **Copiar
resumo desta sessão** gera um texto pronto para colar num e-mail.

Cada item guarda também quem o alterou por último, exibido no rodapé do
formulário. Como esse histórico viaja dentro do `.json`, ao restaurar o backup
de um colega você vê exatamente o que ele mexeu na sessão dele. São guardadas as
30 sessões mais recentes de cada relatório.

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Ctrl` + `S` | Gravar imediatamente |
| `Ctrl` + `P` | Abrir a janela de exportação |
| `Esc` | Fechar a pré-visualização |
| `Ctrl` + `V` | Colar imagem no último anexo da NCR aberta |

## Publicação

Cada `css` e `js` carregado pelo `index.html` é carimbado, na publicação, com o
SHA do commit (`app.js?v=abc1234`). Sem isso o navegador pode servir um
`index.html` novo junto de um `app.js` antigo guardado em cache — a página abre
com a marcação nova e o código velho, e quebra de formas difíceis de
diagnosticar. A versão em uso aparece no rodapé do menu **⋯ Mais**; se ela não bater
com o último commit, é cache do navegador (Ctrl+F5 resolve).

O site é servido pela branch `gh-pages`, publicada pelo workflow
`.github/workflows/pages.yml` a cada push na `main`. A ativação foi feita uma
única vez em **Settings → Pages → Source: Deploy from a branch → `gh-pages` /
(root)**.

## Estrutura

```
index.html               interface
assets/css/app.css       estilos do editor
assets/css/report.css    layout do relatório (tela e impressão A4)
assets/js/store.js       modelo de dados, persistência (IndexedDB) e mesclagem
assets/js/pasta.js       a pasta da rede como banco de dados
assets/js/report.js      montagem das páginas no padrão do PDF
assets/js/summary.js     apuração, gráficos SVG e a aba de resumo
tools/build-standalone.py  gera a versão de arquivo único
assets/js/app.js         lógica do editor
tests/                   24 suítes de ponta a ponta (Playwright)
exemplos/                relatórios .json prontos para importar
CLAUDE.md                notas de manutenção: decisões, armadilhas, porquês
```

Não há dependências externas nem etapa de build: abrir o `index.html` já
funciona, inclusive a partir do disco local.

Backups gerados antes da aba DEV existir continuam abrindo normalmente — a
lista de DEVs nasce vazia.
