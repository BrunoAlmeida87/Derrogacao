# Waiver Request — Gerador de Relatórios de Derrogação de NCR

Aplicação web que substitui o gerador interno de relatórios de derrogação
(*Waiver Request*). Funciona inteiramente no navegador: não há servidor, não há
login e nenhum dado sai do computador.

**Aplicação:** https://brunoalmeida87.github.io/Derrogacao/

## O que faz

- **Aba Banco NCR.** As NCRs do **SBR4** importadas do banco NCR (o mesmo
  export que o NCR Control lê), com **Marco Original**, **Marco Atual**,
  **Função Vital** e **Observação** preenchidos aqui, o **fluxo de cada NCR**
  desenhado como no NCR Control e o botão que leva a NCR ao relatório de
  Waiver do marco. Ver [Aba Banco NCR](#aba-banco-ncr).

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
- **Duplicar.** O botão **Duplicar** cria, ao lado do item aberto, uma cópia
  independente dele — anexos incluídos — com o número marcado como `(cópia)`
  para você trocar. É o caminho mais curto quando várias NCRs do mesmo sistema
  se repetem quase iguais.
- **O caminho do waiver, em fluxo.** Cada item tem, embaixo do *Waiver
  Historic*, o desenho do que aquelas linhas dizem: `J04 To: J06` mais
  `J06 To: J08` viram **J04 → J06 → J08**. Os cards aparecem conforme o campo
  é preenchido, e o botão **⤳ Ver fluxo** abre o desenho em tamanho grande. A
  aba **Fluxos** reúne todos os itens do relatório aberto, NCR e DEV, e sai em
  PDF.
- **O que o marco anterior respondeu.** Se a mesma NCR (ou DEV) também está no
  relatório de um marco que aparece no fluxo, aquele card ganha um ponto:
  passe o mouse e leia o *Arch Answer* de lá, sem sair do que está fazendo.
  Clicando, o item de lá abre.
- **Ver outra NCR ao lado enquanto escreve.** Uma coluna à direita mostra
  qualquer item — deste relatório ou de outro marco — em **só leitura**,
  enquanto você preenche o da esquerda normalmente. Cada bloco tem
  **copiar**.
- **Busca em todo o texto.** O campo da lista lateral procura no número, no
  sistema e na função, mas também dentro das descrições, do *Arch Status*, dos
  certificados e até nas legendas das fotos.
- **Item aceito abre travado.** Quem chegou em *Waiver accepted* é documento
  fechado: os campos ficam em somente leitura até você clicar em **Editar
  mesmo assim**. Evita que um clique distraído sobrescreva — e se espalhe para
  todo mundo pela pasta compartilhada.
- **Desfazer a exclusão.** Excluiu sem querer? O aviso que aparece no pé da
  tela traz **↩ Desfazer** por alguns segundos, e o item volta inteiro.
- **Conferência antes de exportar.** A janela de exportação lista as NCRs com
  campos essenciais em branco, com link direto para corrigir.
- **Exportação em PDF** no mesmo padrão do relatório original: capa com o índice
  de NCRs (`NCR-…|HP|FV09 - …|WAIVER ACCEPTED`), páginas A4 retrato para as
  NCRs, páginas A4 paisagem para as evidências, mesmas cores de faixa e mesmo
  rodapé.
- **Texto que não cabe na folha continua na seguinte.** O layout é de uma
  folha por item, mas quando o texto passa disso a página continua numa folha
  de continuação de verdade — com as mesmas margens, o mesmo rodapé e o
  título repetido com `(cont.)`. A janela de exportação diz, antes de gerar,
  quantas folhas sairão e quais itens passaram de uma.
- **Backup e restauração** em arquivo `.json`, para levar o trabalho a outro
  computador ou passar para outra pessoa.
- **Instalar como aplicativo e usar sem rede.** No Edge ou no Chrome, o menu do
  navegador oferece **Instalar**: o programa ganha ícone próprio, abre em
  janela separada, funciona com a rede fora do ar e — o que mais importa no
  dia a dia — o navegador passa a guardar a permissão da pasta compartilhada,
  em vez de pedir a cada sessão.
- **Uma pasta da rede como banco de dados**: o programa lê e grava direto nela,
  e quem abrir apontando para a mesma pasta vê o trabalho de todos, sem importar
  nada. Com histórico automático de versões. O caminho combinado pela equipe já
  vem preenchido — escolher a pasta é uma vez por computador.
- **Uma tabela com tudo** (aba **Tabela**): uma linha por item de todos os
  marcos, com busca geral, filtros, colunas que você escolhe e ordena, e
  exportação em **Excel (.xlsx)**, CSV ou PDF.

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

## Anotação do item

Cada NCR e cada DEV tem um bloco **Observação interna**, logo abaixo da
identificação, com cara de papel de recado. Serve para o caso mais comum: o
preenchimento está parado e o motivo precisa ficar escrito em algum lugar —
*“esperando o certificado do fornecedor, cobrar na reunião de quinta”*.

- **Não sai no relatório em PDF.** É recado interno, como a Situação do item.
- **Vale mesmo no item aceito**, que abre travado: anotar não é editar o
  documento. É onde se escreve “conferir o certificado na próxima revisão”.
- **O item anotado ganha um 📝 na lista**, então dá para varrer a lateral e ver
  onde alguém parou sem abrir um por um.
- **A busca alcança o texto da anotação** — tanto a da lista quanto a da aba
  Tabela, onde ela também é uma coluna (desligada por padrão) e um filtro
  (*📝 só com observação*).
- **Apagar anotação** limpa o campo, com **Desfazer** no aviso que aparece.

A anotação viaja com o item: vai no backup, vai para a pasta da equipe e segue
a mesma regra dos outros campos (vale a edição mais recente).

## Situação do item (controle interno)

Cada NCR e cada DEV tem uma **situação de acompanhamento**, escolhida ao pé do
formulário:

| Situação | O que quer dizer |
| --- | --- |
| **Em preenchimento** | ainda sendo escrito (é como todo item nasce) |
| **Waiver requested** | enviado, aguardando resposta |
| **Improve justification** | voltou pedindo justificativa melhor |
| **Waiver accepted** | aceito |

Ela aparece na lista lateral (a cor da barra à esquerda de cada item), na aba
**Resumo**, na aba **Tabela** e na planilha. E, no PDF, **é ela que fecha a
linha de cada item no índice da capa**:

```
NCR-ICN-ESC-13-1098-2023|RM|Sea water circuit integrity|Waiver accepted
```

Antes ali ia o *Arch Status Waiver*. Mudou porque o Arch Status é texto livre e
muitas vezes está em branco, enquanto a situação é sempre uma das quatro. Na
capa ela sai **em inglês**, porque o documento é em inglês — *Em preenchimento*
vira *Under preparation*; as outras três já são inglês.

O campo **Arch Status Waiver** continua existindo, continua independente e
continua **impresso na página do item**, no bloco de status à direita, junto com
as datas e o Waiver Historic. Nada mais mudou no relatório.

**Um item só conta como concluído quando chega em "Waiver accepted".** É isso
que acende o ✓ verde na lista, alimenta o contador de progresso e o filtro
*esconder aceitos*.

Ao **copiar NCRs de outro relatório**, a cópia recomeça em *Em preenchimento*:
o waiver é concedido por marco, não viaja junto com o texto.

## Levar um waiver aceito para o marco seguinte

Waiver aceito não acaba: ele vale até um marco à frente, e o item vai ter de
ser reescrito lá. O programa faz essa cópia.

Com o item em **Waiver accepted** e o marco escrito em **Waiver Approved
Expiry (before)** — `J09`, por exemplo —, aparece ao pé do formulário o botão
**⤵ Levar para o J09**. Um clique e a NCR vira uma cópia no relatório do J09:

- **em *Em preenchimento***, não aceita: o waiver do J08 foi aceito, o do J09
  ainda nem foi pedido;
- **com o Waiver Historic já preenchido**, no formato do relatório — a linha
  `J08 To: J09` entra sozinha, embaixo do que já estava escrito;
- **com o mesmo número**, que é o que liga a NCR-001 do J08 à do J09 no fluxo;
- **com o texto do pedido inteiro** (Description, Current Situation, Why is not
  possible, Arguments, sistemas, função, certificados e anexos);
- **com o Arch Answer, o Arch Status e as duas datas em branco** — eram a
  resposta do J08, e o J09 ainda não respondeu nada;
- **marcada como herdada**: um `⤵` na lista e uma faixa roxa no alto do editor
  lembrando que há coisa para revisar. Quando você terminar de conferir, clique
  em **Já conferi** e a marca sai.

**A NCR do marco de origem não muda em nada.** Ela continua sendo o registro do
que aconteceu no J08 — inclusive para o ponto no card do fluxo, que lê o Arch
Answer do marco anterior direto de lá.

Duas coisas que o programa recusa, e por quê:

- **O relatório do marco de destino tem de existir** neste navegador. O botão
  fica apagado e explica o que falta. Criar um marco sozinho, a partir de um
  campo de texto, encheria a lista de marcos escritos com erro de digitação — e
  cada um deles viajaria para a pasta da equipe.
- **Levar duas vezes.** Se o J09 já tiver uma NCR com esse número, o botão diz
  isso. Dois itens com o mesmo número no mesmo marco viram um só na
  sincronização do colega.

Backups gravados antes desta versão continuam abrindo normalmente — o que
estava marcado como concluído entra como *Waiver accepted*, e o resto como
*Em preenchimento*.

## Exportar em PDF: escolher os relatórios e recortar por situação

Em **Exportar PDF…** a janela tem duas escolhas:

- **Relatórios** — marque um, vários, ou clique em **Marcar todos** para gerar
  um arquivo único com todos em sequência. **Limpar** desmarca tudo.
- **Situação dos itens** — clique nas pastilhas para imprimir **só** os itens
  numa situação (por exemplo, só os *Waiver requested*, para mandar ao
  arquiteto o que está pendente). Dá para marcar mais de uma. **Todas as
  situações** volta ao relatório inteiro, que é como a janela sempre abre.

Cada pastilha mostra quantos itens existem naquela situação, e cada relatório
passa a dizer quantos itens dele entram no recorte. Relatório que fica sem
nenhum é desmarcado sozinho — ele não geraria folha.

**Quando há recorte, a capa avisa**, em inglês, logo abaixo do subtítulo:

```
Partial list — filtered by status: Waiver accepted.
```

Isso é de propósito: um *Waiver Request* parcial que não diz que é parcial
acaba lido como o pedido inteiro. Sem filtro, a capa sai exatamente como
sempre saiu.

**O recorte não fica guardado**: fechou a janela, na próxima vez ela abre
outra vez com o relatório inteiro. Assim ninguém exporta meio relatório sem
perceber.

## Ver o que o programa está fazendo (console)

Aperte **F12** e abra a aba **Console**. O programa escreve ali, em português,
cada etapa do que está acontecendo: a abertura, cada conversa com a pasta da
equipe, o que a mesclagem trouxe, a exportação em PDF. Quando algo dá errado,
a linha vem em três partes — **o que falhou**, **o que isso significa** e **o
que fazer**.

**Não precisa decorar nada.** Em **⋯ Mais → 🩺 Diagnóstico e diário do
console** há uma janela com tudo isso em botões, e cada um explica o que faz
antes de você clicar:

- **Quanto detalhe você quer ver** — *Só problemas*, *Normal* (o padrão) ou
  *Tudo*. Problema aparece em qualquer nível, inclusive no silêncio: o nível
  cala o que deu certo, nunca o que deu errado.
- **Ver o diagnóstico** — o retrato de agora: quantos relatórios e itens
  existem aqui, qual está aberto, como está a pasta, quantos avisos e erros
  houve nesta sessão.
- **Ver as últimas linhas** — o que o programa registrou desde que você abriu.
- **Copiar para um e-mail** — junta os dois e põe na área de transferência.

A mesma janela mostra ali embaixo o que foi registrado, sem precisar do F12.

Quem preferir digitar, os comandos continuam valendo (e estão escritos ao lado
de cada botão):

| Comando | O que faz |
| --- | --- |
| `Derrogacao.ajuda()` | esta lista, dentro do console |
| `Derrogacao.tudo()` | mostra também o miúdo: cada gravação, cada tempo |
| `Derrogacao.normal()` | o padrão: abertura, pasta, mesclagem, problemas |
| `Derrogacao.silencio()` | só o que der errado |
| `Derrogacao.diagnostico()` | retrato de agora: quantos relatórios, itens, a pasta |
| `Derrogacao.diario()` | as últimas linhas, de uma vez |
| `Derrogacao.copiar()` | copia o diagnóstico + as linhas, para colar num e-mail |

A escolha do nível fica **neste navegador**. **Nada disso sai do computador** —
é console e só. E **o texto das NCRs nunca é registrado**: vão nomes de campo,
contagens e números, nunca o que está escrito dentro do campo.

Quando algo estiver estranho, o caminho mais curto é: `Derrogacao.copiar()` e
colar num e-mail. Vem tudo o que se precisaria perguntar.

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

O mesmo arquivo está no repositório, na raiz — `derrogacao.html`. Quem baixa
o projeto inteiro já leva o programa pronto, sem precisar publicar nada.

Salve o arquivo e abra com dois cliques. Não precisa de servidor, instalação
nem conexão — funciona inclusive numa pasta de rede, onde cada pessoa abre a
sua cópia.

> **Os dados não são compartilhados entre as versões.** O navegador guarda o
> armazenamento por origem: o que você escreve no site fica no site, e o que
> escreve no arquivo local fica no arquivo local — mesmo estando na mesma
> máquina. Para levar o trabalho de um para o outro, use **★ Salvar backup de
> tudo** de um lado e **Abrir arquivo…** do outro.

O arquivo é gerado por `tools/build-standalone.py`: a publicação o refaz a
cada commit, carimbado com a versão do site, e a cópia versionada na raiz é
conferida a cada envio (`--conferir`), para não envelhecer em silêncio.

## O caminho do waiver (aba Fluxos)

O campo **Waiver Historic** é escrito à mão, uma entrada por linha, no formato
do relatório. Cada linha é uma seta:

```
J01 & J03 To: J02 & J04
J02 & J04 To: J06
J06Cer To: J06
```

Juntando as setas aparece o caminho: **J01 & J03 → J02 & J04 → J06**, com o
`J06Cer` desembocando no mesmo J06. Nada é inventado — um marco que ninguém
escreveu não aparece — e nada é alterado: o texto continua sendo a verdade, o
desenho é só a leitura dele.

- **`J01 & J03` é um card só.** Os números do mesmo lado da seta andam juntos,
  como no relatório.
- **`J1`, `J01` e `J 01` são o mesmo marco**, e `RANAE J06` também é J06.
- **`J06Cer` é o certificado**, e fica logo antes do J06 dele.
- **O card do marco deste relatório sai destacado**, para se achar de relance.
- Quando as setas não dizem quem vem antes, vale a ordem do programa:
  J01 & J03 · J02 & J04 · J05 · J06 · J07 · J08 · J09 · J10 · J11 · J12 ·
  **RANAE** · **TRAP** — os dois últimos são os marcos depois do J12, e não têm
  número. Escritos de qualquer jeito (`RANAE`, `Ranae`, `RANAE final`) são o
  mesmo card. Atenção: `RANAE J06` continua sendo o **J06** — havendo número no
  texto, é o número que manda.
- Uma linha sem `To:` vira um card sozinho, e o pop-up avisa. Setas em círculo
  (`J06 To: J08` com `J08 To: J06`) também viram aviso, em vez de travar.

Na aba **Fluxos** está o compilado, em três leituras da mesma coisa:

- **Lista** — um fluxo por item, NCR e DEV separados, na ordem do PDF.
- **Mapa do marco** — todos os fluxos somados num desenho só. A seta engorda
  com o número de itens que passam por ela e cada card diz quantos itens o
  atravessam: é o desenho que responde *de onde vem o grosso do trabalho deste
  marco*. Abaixo dele, quantos marcos cada item já atravessou — um item em
  quatro colunas é um waiver renovado três vezes.
- **Matriz de/para** — uma linha por seta escrita, da mais usada para a menos,
  com o percentual sobre os itens que têm fluxo.
- **Painel do marco** — abaixo.

### Painel do marco: o que está chegando no J09

As outras três leituras respondem *por onde o waiver passou*. Esta responde a
pergunta do outro lado do balcão, que é a que se leva para a reunião: **o que
está vindo para este marco?**

Escolha o marco em **Chegando no marco** e a folha se monta:

- quantos itens vêm para ele, quantos são NCR e quantos DEV, de quantos marcos
  diferentes;
- quantos já estão aceitos, quantos estão parados há 30+ dias;
- **já no relatório de J09** × **aceitos, falta trazer** — o segundo é a sua
  lista de tarefas: itens aceitos no marco anterior que ainda não foram
  copiados para cá (veja *Levar um waiver aceito para o marco seguinte*);
- uma rosca com a situação de todos eles, uma barra com **de onde vêm** e outra
  com os sistemas mais atingidos;
- e a lista, item por item, dizendo em que relatório cada um mora hoje — com um
  ✓ nos que já foram trazidos.

Duas coisas a saber:

- **Entra quem já chegou ou quem está a caminho.** *Já chegou* é ter uma seta
  terminando neste marco no *Waiver Historic*. *A caminho* é o documento dizer
  que o waiver vale até aqui (*Approved Expiry*, ou *Request Expiry* enquanto a
  resposta não veio) estando o item ainda em outro marco. Passar pelo marco no
  meio do caminho não conta: quem já saiu do J08 não está indo para o J08.
- **Por isso o painel funciona antes de o marco começar.** O Waiver Historic de
  um item do J08 termina em J08 — ele nunca diz que vai para o J09 —, então é
  a data de validade que põe o item no painel do J09. É o que permite planejar
  o J09 sem ter copiado nada ainda.
- **O painel olha todos os relatórios deste navegador e ignora os filtros da
  aba** (busca, tipo, *Passa por*, *Itens de*) — por isso eles somem quando o
  painel está aberto. Quem recorta o painel é o seletor de marco, e mais nada.

**Esta vista em PDF** exporta o painel em duas folhas A4: os números e os
gráficos numa, a lista na outra (que continua por quantas folhas precisar, com
o cabeçalho repetido).

Em **Itens de** escolha entre o relatório aberto e **todos os marcos** deste
navegador; em **Passa por**, clique nos marcos para ver só os itens cujo fluxo
passa por eles (dá para marcar mais de um). Há ainda a busca, o filtro por tipo
e a opção de esconder quem não tem nada escrito. **Esta vista em PDF** gera em
A4 exatamente o que está na tela, com o recorte escrito na folha e a paginação
de sempre.

### O card com um ponto: a resposta do marco anterior

Cada marco é um relatório à parte, e o mesmo item costuma atravessar vários — a
`NCR-001` do J06 vira a `NCR-001` do J08. Quando o card de um marco do fluxo
tem, **neste navegador**, um relatório daquele marco com o mesmo número, o card
ganha um **ponto no canto**:

- **Passe o mouse** (ou chegue nele pelo Tab) e aparece o que aquele relatório
  diz sobre este item: *Arch Answer*, *Arch Status*, *Approved Expiry*, quem
  escreveu e quando. Um texto muito comprido vem cortado, com o aviso.
- **Clique no card** e o item de lá abre — o relatório troca junto, e o que
  você estava escrevendo é gravado antes.
- **Sem ponto, não há nada a ver**: ou aquele marco não tem relatório neste
  computador, ou o relatório dele não tem este número. Nada é adivinhado.

O pareamento é o mesmo do resto do programa: o marco pelo texto (`RANAE J06`,
`J06` e `J 6` são o mesmo; `J06Cer` não é o J06) e o item pelo número, sem
ligar para maiúsculas e espaços. É leitura, só leitura: abrir o balão não
escreve nada no outro relatório.

Como a busca só enxerga o que está neste navegador, ela funciona melhor com a
**pasta da rede ligada** — é ela que traz os relatórios dos outros marcos para
cá.

## Ver uma NCR ao lado da outra

Escrever a `NCR-001` do J08 olhando a do J06 é o caso mais comum — e trocar de
relatório para consultar, e voltar, perde o fio. O botão **⇥ Ver outra ao
lado**, no alto do cartão *Identificação*, abre uma coluna à direita com o item
que você escolher: **deste relatório ou de qualquer outro marco** que esteja
neste navegador.

- A coluna mostra o item **inteiro**: as cinco seções nas cores do relatório, o
  bloco do waiver (com o fluxo desenhado), certificados e evidências, mais a
  situação interna e quem editou por último.
- **É só leitura, e a tela diz isso.** Para escrever no item de lá, clique em
  **abrir** no alto da coluna — aí ele passa a ser o item aberto. Para trazer
  um texto para cá, use **copiar** no bloco e cole no campo.
- **Atalho pelo fluxo**: no card com ponto (acima), **Shift+clique** deixa
  aquele item na coluna em vez de trocar de tela.
- **trocar** escolhe outro item, **✕** fecha a coluna. A escolha fica guardada
  neste navegador: ao reabrir o programa, a coluna volta como estava.
- Nas abas **Resumo**, **Fluxos** e **Conversa** a coluna se recolhe — ali não
  há editor ao lado de quê —, e volta ao entrar na NCR ou na DEV.
- Ela não sai no PDF nem no backup: é uma janela de consulta, não parte do
  documento.

> **Por que não dois editores?** Porque hoje cada campo do formulário escreve
> no item *selecionado*: dois formulários abertos gravariam os dois no mesmo
> item. Enquanto isso não mudar, a coluna ao lado mostra e não escreve — é a
> diferença entre consultar com segurança e perder trabalho sem perceber.

## Tudo em tabela (aba Tabela)

As outras abas olham para o relatório aberto. A **Tabela** olha para o conjunto:
uma linha por item de **todos os marcos deste navegador**, NCR e DEV juntos.
Serve para a pergunta que não tem resposta em nenhuma outra tela — *onde está a
NCR-018?* — sem abrir marco por marco.

- **Busca geral**: varre todo o texto do item, não só o número. Procurar pelo
  certificado, por um trecho do *Arch Answer* ou pela legenda de uma foto
  funciona igual.
- **Marcos, em pastilhas**: clique para recortar, e **dá para marcar vários** —
  J08 e J09 juntos, por exemplo. *todos os marcos* limpa. O número na pastilha
  é quantos itens aquele relatório tem.
- **Filtros**: tipo, situação, sistema, *Arch Status*, com ou sem anexo, e só
  os parados há 30+ dias. São os mesmos do Resumo, para os dois contarem a
  mesma coisa.
- **A trajetória, em três colunas** — já vêm ligadas, e lidas ao lado de
  *Marco* contam a linha inteira:

  | Veio de | Marco | Vai para | Já levada? |
  | --- | --- | --- | --- |
  | J06 | J08 | J09 | não |

  **Veio de** sai do *Waiver Historic* (a última seta do texto é a chegada
  neste marco). **Vai para** sai do documento — *Waiver Approved Expiry*, e na
  falta dele o *Waiver Request Expiry* —, porque o histórico não sabe do
  futuro: no relatório do J08 ele termina em J08. **Já levada?** diz se a cópia
  já existe no relatório do destino, e só cobra ("não") depois que o waiver foi
  aceito.

  Ordenar por **Vai para** e filtrar por *Waiver accepted* dá a lista do que
  falta levar para o próximo marco.
- **Caminho do waiver**: as duas pontas numa coluna só. O que está entre
  parênteses ainda não aconteceu:

  ```
  J04 → J06 → J08 → (J09)    ainda não foi levada para o J09
  J06 → J08 → J09            a cópia já está no J09
  ```
- **Colunas**: em **Colunas** você marca o que quer ver (são 30 no total, do
  número ao *Why not possible*) e usa as setas ↑ ↓ para mudar a ordem delas —
  na tela, no Excel e no PDF. A escolha fica guardada **neste navegador**.
- **Ordenar**: clique no título da coluna. Isso **não altera** a ordem dos itens
  no relatório nem no PDF — a tabela é leitura.
- **Clique numa linha** e o item abre no editor, trocando de relatório se for
  preciso.

### Levar o waiver inteiro para o Excel

Em **Colunas → Mostrar todas** a tabela passa a trazer **todo o texto do
waiver**, uma coluna por campo: Description, Current Situation, Why not
possible, Arguments, Arch Answer, Waiver Historic, as datas, o Arch Status, os
certificados, a observação interna, o caminho do waiver — e também **o que está
escrito dentro dos anexos**: a referência de cada um, a observação de cada um e
a legenda de cada imagem, separados por ` | ` na ordem em que estão no item.

Nada é cortado na exportação: um *Description* de mil caracteres sai inteiro na
célula. O que **não** vai é a foto em si — a planilha leva o texto dela, não a
imagem; para as imagens o caminho é o PDF do relatório ou o backup `.json`.

Isso vale para o Excel e para o CSV. Para o **PDF**, acima de umas dez colunas
a folha fica apertada mesmo deitada: ali é melhor escolher as colunas que
interessam.

### Exportar

- **⤓ Exportar Excel** gera um `.xlsx` de verdade — filtros já armados no
  cabeçalho, primeira linha congelada, número saindo como número. Vai com uma
  segunda aba, *Recorte*, dizendo quando foi gerado, por quem, quantos itens e
  qual filtro estava aplicado: planilha que anda pela empresa sem dizer de que
  recorte veio acaba lida como se fosse o total.
- **CSV** para quem prefere o texto cru.
- **PDF** com a mesma tabela em folhas A4 — deitadas quando há muita coluna,
  com o cabeçalho repetido em cada folha.

> O Excel sai com o que está **à vista**: as colunas escolhidas, o recorte dos
> filtros e a ordem da tela. Para o total, limpe os filtros antes.

## Aba Banco NCR

Uma tabela das **NCRs do SBR4**, trazidas do banco NCR, para acompanhar e
correlacionar cada uma com os relatórios de Waiver. Ela não substitui nada: os
relatórios continuam onde estavam e **nenhuma importação do banco NCR os
altera**.

### Duas partes em cada NCR

| Parte | O que tem | Quem escreve |
| --- | --- | --- |
| **Dados do banco NCR** | número, título, descrição, status, sistema, datas, responsável e **todas** as colunas do export | a importação — substituídos a cada nova foto do banco |
| **Dados do Waiver** | Marco Original, Marco Atual, Função Vital, Waiver Historic, Observação e o registro de cada vez que a NCR foi levada a um relatório | você, aqui — **nenhuma importação apaga ou sobrescreve** |

A NCR é identificada pelo **número** (`NCR-ICN-ESC-14-0832-2025`), normalizado
como o NCR Control faz (maiúsculas, sem espaços). É o que o banco, a planilha
de correlação e os relatórios têm em comum.

### A tela

- **A tabela é a página inteira** e mostra **todas** as NCRs, rolando para
  baixo; o cabeçalho fica grudado no alto. A barra lateral vira um trilho
  estreito, só com as abas.
- **Barra de cima** (sempre à vista): busca em qualquer campo, **● Destacar
  fechadas** (pinta de vermelho as NCRs com status *Closed*, *CEDOC
  Closure*…), **Só abertas**, **Colunas…**, **Excel**, **CSV** e **Recolher
  painel**.
- **Painel recolhível**: as importações, os números do banco (que também
  filtram, com um clique) e os **filtros de múltipla escolha** — Status,
  Sistema, Marco Original, Marco Atual, Função Vital, Correlação, Waiver e
  presença no último export. Marque quantas opções quiser em cada um; o
  recorte ativo aparece numa faixa acima da tabela, com **Limpar**.
- **Marco Original, Marco Atual e Função Vital** são escolhidos direto na
  tabela. A célula mostra o valor; o clique abre a lista. **A tela não pula
  para o topo** ao gravar, e a linha que deixou de atender ao filtro **fica à
  vista, marcada em amarelo**, até você mudar o filtro — ela não some no meio
  da edição.
- As opções das listas vêm da aba *Possibilidades da Mascara* e podem ser
  editadas em **Listas…**.
- **Excel e CSV** saem com o que está à vista (colunas e filtro), e o Excel
  leva uma aba **Recorte** dizendo qual filtro produziu a planilha.

### A ficha da NCR

Clicar no número abre a ficha, **quase na tela inteira**, com tudo por
extenso:

- **Dados do Waiver** (editáveis) e os **relatórios** em que a NCR está;
- **Dados do banco NCR**, todas as colunas, com os campos que mudaram na
  última importação em destaque;
- **Fluxo da NCR — o mesmo desenho do NCR Control**, nas duas leituras:
  **Trajetória** (um passo por linha, na ordem do tempo, com dias em cada
  etapa, retornos e reincidências) e **Mapa do fluxo** (todas as etapas, as
  percorridas e as não percorridas). Sai do histórico importado; sem histórico,
  mostra só o status atual e diz isso.
- o **histórico** completo, em tabela.

### As três importações

Todas terminam numa **tela de resumo**: quantas NCRs vieram, quantas são
novas, quantas mudaram, quantas ficaram de fora e por quê, e a lista dos
registros com problema.

- **Importar / Atualizar Banco NCR** — o **export do Excel** (o mesmo arquivo
  que vai para `imports/` do NCR Control; as colunas são reconhecidas pelo
  cabeçalho) ou o **`ncr.json`** da pasta `BD/` do NCR Control. Só as NCRs do
  **SBR4** entram: vale a coluna *SBR* do export e, se ela estiver vazia, o
  número (`NCR-…-14-…` é o SBR4). NCR existente tem os dados do banco
  atualizados; NCR nova é acrescentada; NCR que sumiu do export **fica**,
  marcada como "fora do último export".
- **Importar correlação** — o JSON de correlação ou a própria planilha (aba
  *Correlação NCR*; a aba *Possibilidades da Mascara* alimenta as listas). Por
  padrão **só completa o que está em branco**: reimportar não desfaz o que foi
  corrigido à mão. NCR que ainda não está no banco fica guardada e entra
  sozinha quando aparecer numa importação do banco.
- **Importar histórico NCR** — o `historico.json` do NCR Control (serve como
  está). Os eventos são associados pela NCR e só se acrescentam.

O JSON de correlação tem dados do programa: guarde-o na pasta da equipe,
**não no repositório** (que é público).

### Proteção antes de cada importação

O estado do banco NCR é guardado antes de qualquer importação. Na tela de
resumo dá para **baixar essa cópia** ou **desfazer a importação**; o botão
*Desfazer última importação* também fica no painel. Com a pasta da rede
ligada, uma cópia vai para `historico-ncr\`. **Exportar backup** (e o
*Salvar backup de tudo* do menu) leva os relatórios **e** o banco NCR num
arquivo só; *Restaurar de um backup…* traz o banco NCR de volta.

### Levar a NCR para o relatório de Waiver

Quando o **Marco Atual** é igual ao marco de um relatório existente, a coluna
*Waiver* mostra o botão **+ J09 Waiver**. Ele cria um item novo no relatório
com:

- **Description** ← a descrição do banco NCR;
- **Observation** ← a Observação da NCR — campo próprio do item, **separado da
  Observação interna (anotação)**, e que também **não sai no PDF**;
- **Função**, **Sistema(s)** e **Waiver Historic** já preenchidos
  (`09 - Coordinate damage control` vira `FV09 - COORDINATE DAMAGE CONTROL`).

Se a NCR já estiver no relatório, nada é duplicado e aparece o aviso. A coluna
*Waiver* mostra em quais relatórios a NCR está (`J06`, `J09`…); clicar abre o
item. Os itens que já existiam nos relatórios são reconhecidos pelo número.
**Mudar o Marco Atual não desfaz vínculos**: a NCR continua no relatório
anterior e passa a oferecer também o do marco novo. Na ficha há
*Adicionar a outro relatório…*, para escolher à mão (ex.: `J06 Ind`, que só
casa com um relatório de marco igual).

### Na pasta da rede

O banco NCR vai para dois arquivos ao lado de `derrogacao-dados.json`:
`derrogacao-ncr-banco.json` (os dados do banco; muda nas importações) e
`derrogacao-ncr-waiver.json` (os campos do Waiver; pequeno, muda a cada campo
preenchido). Vale a edição mais recente, NCR a NCR, e nada é apagado. Antes de
juntar uma mudança de fora, a sua versão dos campos do Waiver é guardada em
`historico-ncr\`.

## Conversa da equipe (aba opcional)

Recados entre quem trabalha no mesmo marco, **sem servidor e sem nuvem**: a
conversa é um arquivo (`conversas.json`) dentro da mesma pasta da rede que já
guarda os dados. Cada um escreve no seu navegador, o recado vai para o arquivo
e volta para os outros na sincronização seguinte.

**Vem desligada.** Para ligar: **⋯ Mais → Ajustes de capa e rodapé →
Conversa da equipe → Mostrar a aba Conversa**. Ligar vale só para o seu
navegador: cada pessoa liga o seu.

Na aba há dois tipos de conversa:

- **Geral** — todo mundo que abre a pasta.
- **Conversa direta** — você e mais uma pessoa. A lista de pessoas sai de quem
  já assinou alguma coisa na pasta (editou um item, escreveu no geral).

Três coisas que precisam ficar claras antes de usar:

- **Sem a pasta da rede não há conversa.** O que você escrever fica só neste
  navegador, e ninguém recebe.
- **Não é canal seguro.** Tudo fica no mesmo arquivo, inclusive as conversas
  diretas: quem abre a pasta pode ler o que não é endereçado a ele. Serve para
  organizar o assunto, não para esconder. Assunto que não pode ser lido por
  quem tem acesso à pasta não vai aqui.
- **O nome é o que cada um digitou**, como no resto do programa. Não há senha,
  então não há como provar quem escreveu.

Detalhes de uso: **Enter** envia e **Shift+Enter** quebra a linha; o ✕ no seu
próprio recado apaga para todo mundo; um ponto no alto da aba avisa que chegou
coisa nova. Os recados ficam **90 dias** (ou os 1.000 últimos) e não entram no
backup nem em nenhuma página do PDF — relatório é relatório.

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
- **Parados há 30+ dias** — os itens pendentes em que ninguém toca há um mês ou
  mais, do mais esquecido para o menos, com o número de dias e quem mexeu por
  último. Waiver aceito não conta: está pronto, não parado. O bloco sai também
  no **Resumo em PDF**, e o CSV ganha a coluna *Dias sem edição*.

### Filtros

Abaixo do seletor de marco há uma linha de filtros, que se somam:

| Filtro | Serve para |
| --- | --- |
| **Tipo** | separar NCR de DEV |
| **Situação** | ver só o que está em preenchimento, solicitado, a rever ou aceito |
| **Sistema** | um sistema específico (`HP`, `EX`, `BF`…), com a contagem de cada um |
| **Arch Status** | o texto que vai impresso no relatório, inclusive `(em branco)` |
| **Evidência** | só itens com anexo, ou só os sem |
| **Buscar no texto** | procura em todo o texto do item: número, sistema, função, os cinco blocos, *Arch Status*, certificados e legendas das evidências |

Os números, os gráficos e as tabelas passam a contar **só o que está
filtrado** — e é isso que sai no **Resumo em PDF** (que traz uma linha dizendo
qual foi o recorte) e na **planilha CSV**. O **Backup deste marco** é a exceção
proposital: sai sempre inteiro, porque backup pela metade não é backup.

Escolhendo um marco no seletor (ou clicando no nome dele na tabela), a aba passa
ao detalhe daquele marco: os mesmos gráficos, a lista completa de NCRs e DEVs e a
contagem por certificado impactado. Nesse modo aparecem três exportações:

| Botão | O que sai |
| --- | --- |
| **Resumo em PDF** | Folhas A4 com os números, os gráficos e a lista de itens — com quantas folhas forem precisas, o título repetido e as mesmas margens em todas |
| **Planilha (CSV)** | Uma linha por NCR/DEV, com todos os campos — abre no Excel |
| **Backup deste marco** | O `.json` só desse marco, para enviar a alguém |

Um texto que comece por `=`, `+`, `-` ou `@` sai da planilha com um apóstrofo à
frente: sem isso o Excel o trataria como fórmula. O apóstrofo não aparece na
célula.

Os gráficos são SVG escrito à mão — sem biblioteca externa, imprimem em vetor e
funcionam com o arquivo aberto direto do disco. A paleta foi validada para
daltonismo (separação CVD ΔE ≥ 8 em todos os pares adjacentes), e cada segmento
leva o número escrito dentro, de modo que a leitura nunca depende só da cor.

## A pasta da rede como banco de dados

O caminho recomendado para trabalhar em grupo. Em vez de cada pessoa guardar a
sua cópia e trocar arquivos, o programa **lê e grava direto numa pasta
combinada**: quem abre apontando para a mesma pasta vê o trabalho de todos, sem
importar nada.

Em **⋯ Mais → 🗄 Pasta da rede como banco de dados** — ou no aviso que aparece
no alto da tela enquanto a pasta não estiver ligada.

### O caminho já vem preenchido

O caminho combinado pela equipe é

```
G:\DOP\GTO\3_INTERNO\01_SAFE TO DIVE\10_SISTEMA DE DERROGAÇÃO\00_BD
```

e já vem escrito na janela e no aviso do alto, com um botão **Copiar o
caminho** para colar na barra de endereço da janela do Windows. Se a pasta
mudar de lugar, escreva o novo caminho ali — ele viaja com os dados, então
quem abrir depois já vê o certo — e **Usar o caminho padrão** volta ao
combinado.

> **Por que ainda é preciso clicar em “Escolher a pasta…”:** nenhum navegador
> abre uma pasta por caminho, nem com ele digitado. Quem escolhe é sempre a
> pessoa, na janela do Windows — é uma regra de segurança do navegador, e vale
> para qualquer site ou programa aberto nele. O que o programa guarda depois
> disso é a autorização daquela pasta, e é ela que dispensa escolher de novo a
> cada vez. Instalando o programa como aplicativo, some também o pedido de
> permissão de cada sessão.

### Como funciona

A pasta guarda:

```
Derrogacao\
  derrogacao-dados.json     <- o banco: todos os marcos, NCRs e DEVs
  imagens\
    3f2a...-9c1.jpg                 <- as fotos das evidências, uma por arquivo
    ...
  historico\
    2026-09-11_14h32_bruno.json     <- versões datadas, automáticas
    ...
```

As **fotos ficam em arquivos próprios**, e o `derrogacao-dados.json` guarda só o
nome de cada uma. Cada foto sobe uma vez; dali em diante o que vai e vem pela
rede é o texto, que é pequeno. As versões do histórico apontam para os mesmos
arquivos, em vez de carregar uma cópia das imagens cada uma. Uma foto só é
apagada da pasta quando **nenhum item e nenhuma versão guardada** a citam mais —
e, ainda assim, nunca antes de sete dias, para nunca competir com a gravação de
outra pessoa. A janela **🗄 Pasta da rede…** mostra quanto a pasta está
ocupando, dividido entre dados, imagens e histórico.

- **Ao abrir**, o programa lê a pasta e junta com o que está aqui.
- **Ao salvar** (poucos segundos depois de parar de digitar), ele relê a pasta,
  junta as suas alterações às dos outros e grava o resultado. Reler antes de
  gravar é o que impede apagar o trabalho de quem salvou no meio do caminho.
- **De vinte em vinte segundos**, verifica se alguém gravou lá fora; se gravou,
  traz. Duas pessoas com o programa aberto se enxergam sem recarregar nada.
- Tudo continua salvo **também neste navegador**, então a pasta cair não
  interrompe o trabalho de ninguém.
- **Se os dados tiverem sido gravados por uma versão mais nova do programa**,
  esta página passa a só ler: ela mostra o trabalho de todos, mas não regrava a
  pasta — senão apagaria, em silêncio, os campos que ainda não conhece. O aviso
  aparece na tela e na janela da pasta, e basta recarregar a página (Ctrl+F5)
  para voltar ao normal.

### Duas pessoas mexendo ao mesmo tempo

Isto funciona, e vale saber como — porque até esta versão havia um buraco aqui.

Quando você e um colega mexem no mesmo item ao mesmo tempo:

- **Campos diferentes** (você no *Arch Answer*, ele no *Current Situation*):
  os dois textos ficam. Ninguém perde nada.
- **O mesmo campo**: um vence pelo horário, e **o texto que saiu vai para o
  Histórico do texto**, com um botão para pôr de volta. A tela avisa, e o
  console também.
- **Enquanto você digita**: a tela pode se atualizar para mostrar o que o
  colega escreveu — mas **o cursor fica onde estava**. Antes desta versão o
  campo era recriado e o teclado deixava de escrever nele; se você já viu isso
  acontecer, era esse defeito.

O que estava errado, e foi consertado: a pasta não tem trava de arquivo. Entre
o programa ler a pasta e gravar nela, o colega pode gravar uma cópia que nunca
viu o que você acabou de escrever, e o arquivo dele passa por cima. Isso, por
si, não era grave — o seu texto continuava no seu computador. O problema é que
o programa passava a **acreditar** que a pasta tinha o seu texto, e na rodada
seguinte concluía "o colega apagou isso" — e apagava de vez.

Agora cada gravação anota de qual versão do arquivo ela partiu, e o programa
sabe distinguir "ele apagou" de "ele nunca viu". No segundo caso o seu texto é
**regravado**, não apagado, e as duas máquinas voltam a convergir. Você vê no
console: *"a cópia que chegou não viu a minha última gravação"*.

### A regra de quem vence

A junção é **campo a campo**, não item a item. O programa guarda um retrato do
que o seu computador viu na pasta da última vez, e é com ele que compara:

- campo que **só você** mexeu → fica o seu;
- campo que **só o outro** mexeu → entra o dele;
- campo que **ninguém** mexeu → não se toca nele;
- campo em que **os dois escreveram** → aí sim vale a edição mais recente, e o
  texto que saiu vai inteiro para o histórico do item, com um botão que o traz
  de volta.

É isso que resolve o caso de quem fica horas sem sincronizar: você escreveu o
*Arch Answer*, o colega estava fora e mexeu na *Description*, ele volta — e os
dois textos ficam. Antes o item inteiro de quem tivesse a hora mais recente
ganhava, e o outro sumia sem aviso.

Não há tela de conflito aqui, ao contrário da importação manual de arquivo: a
gravação acontece sozinha, e ninguém pode ficar parado esperando outra pessoa
decidir.

Quando alguma coisa sua for realmente substituída, o programa não deixa passar
em branco: o item ganha a marca **⇄** na lista e, ao abri-lo, uma faixa
vermelha diz em quantos campos os dois escreveram ao mesmo tempo, com **Ver o
texto que saiu**. Ele está guardado, não perdido.

A regra **converge**: mesmo que duas gravações se atropelem, a sincronização
seguinte de cada lado traz de volta o que faltou. Não há trava de arquivo — o
que torna isso seguro não é uma trava, é a junção convergir.

Na prática:

| Situação | O que acontece |
| --- | --- |
| Duas pessoas em **itens diferentes** (o caso comum) | nada se perde |
| Duas pessoas no **mesmo item**, em **campos diferentes** | nada se perde: os dois textos ficam |
| Duas pessoas no **mesmo campo** | fica a edição mais recente; a outra fica no histórico do item, a um clique de voltar |
| Alguém fica **horas sem sincronizar** e volta | só os campos que ele mexeu entram; o resto do seu trabalho continua |
| O item aberto na sua tela muda por fora | a tela é redesenhada e um aviso diz quem alterou |
| O item aberto é excluído por outra pessoa | a lista volta para o primeiro item, com aviso |
| O **relatório** aberto é excluído por outra pessoa | a tela passa ao primeiro relatório, com aviso |

Um detalhe que continua valendo: **os anexos não se juntam pela metade**. Se os
dois mexeram nas evidências do mesmo item, fica a lista de quem editou por
último — e o histórico registra que a outra existiu, ainda que uma foto não
volte por um clique.

E como o relógio ainda decide o empate de um mesmo campo, o programa avisa
quando o relógio deste computador está atrasado em relação ao de quem gravou na
pasta. Vale acertar a hora do Windows quando esse aviso aparecer.

Mesmo assim: **antes de juntar qualquer mudança vinda de fora, o programa
guarda o seu estado no histórico** — o texto substituído nunca desaparece sem
deixar cópia.

**Exclusões deixam lápide.** Sem isso, o item apagado por uma pessoa voltaria na
próxima sincronização, vindo do computador de quem ainda não soube. A lápide é
sempre carimbada depois da versão que apagou, mesmo que o relógio da máquina
esteja adiantado. Vale para as três formas de excluir: o botão **Excluir** da
lateral, o grupo *Excluídos pelo colega* da tela de mesclagem e o
**Excluir este relatório** do menu — este último deixa lápide de relatório
inteiro, que também viaja na pasta. Restaurar uma versão do histórico desfaz
a lápide do que voltar.

### Histórico do texto: quem escreveu o quê

Não confunda com o **⋯ Mais → Histórico de alterações**, que lista *sessões*
(quem mexeu em quais itens). Este aqui é o texto em si, campo a campo.

No cartão de identificação de cada NCR ou DEV há o botão **🕘 Histórico do
texto**. Ele
abre a lista das alterações daquele item, da mais recente para a mais antiga:

- **quem** escreveu, **quando** e **em qual campo**;
- o texto que a pessoa escreveu, e **Ver como estava antes**;
- **Pôr este texto de volta**, que escreve o texto de volta no campo (com
  *Desfazer* logo em seguida, caso tenha sido engano).

As linhas em vermelho, marcadas **escrito por cima**, são as importantes: é
quando duas pessoas escreveram no mesmo campo e um dos textos teve de sair. O
que saiu está ali inteiro.

Dá para olhar só **este item**, **este relatório** ou **todos os relatórios**, e
há uma busca que procura no texto, no nome do campo e em quem escreveu — é
assim que se acha de novo um parágrafo que alguém lembra de ter escrito e não
sabe mais onde.

O histórico viaja pela pasta, num arquivo `revisoes.json` ao lado dos dados,
então você vê também o que os outros escreveram. Ele **não entra no PDF nem no
backup**: é registro de trabalho, não documento.

Duas honestidades: ele **começa a contar a partir desta versão do programa** —
o que foi escrito antes não tem linha — e guarda as últimas 1500 alterações de
até um ano, que é o que cabe no armazenamento do navegador.

### O histórico completo é a rede de proteção

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

### Quando a pasta para de responder

Se a rede cair, se a pasta for renomeada ou se o navegador perder a permissão,
o programa **não fica calado**: aparece uma faixa vermelha no alto dizendo que
o seu trabalho continua salvo no computador, mas que ninguém mais o está vendo
— com **há quanto tempo** isso dura e um botão **Religar a pasta agora**.

Esse aviso não some com "Agora não": ficar horas escrevendo sem saber que se
está sozinho é justamente o que produz, depois, dois textos no mesmo campo.

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
manifest.webmanifest     instalação como aplicativo
sw.js                    service worker: abre sem rede
assets/icons/            ícones do aplicativo instalado
assets/css/app.css       estilos do editor
assets/css/report.css    layout do relatório (tela e impressão A4)
assets/js/log.js         o diário do console, em português
assets/js/store.js       modelo de dados, persistência (IndexedDB) e mesclagem
assets/js/revisoes.js    o histórico do texto: quem escreveu o quê, campo a campo
assets/js/pasta.js       a pasta da rede como banco de dados
assets/js/report.js      montagem das páginas no padrão do PDF, com paginação
assets/js/lado.js        o item preso ao lado, em só leitura
assets/js/fluxo.js       leitura do Waiver Historic, desenho do fluxo e a
                         resposta do marco anterior
assets/js/herdar.js      leva o item aceito para o marco seguinte
assets/js/summary.js     apuração, gráficos SVG e a aba de resumo
assets/js/painel.js      o painel de um marco: o que está chegando nele
assets/js/xlsx.js        gera a planilha .xlsx (sem biblioteca)
assets/js/tabela.js      a aba Tabela: todos os itens, filtros e exportação
assets/js/chat.js        a conversa da equipe, dentro da pasta da rede
assets/js/xlsxler.js     LÊ planilhas .xlsx (o motor do NCR Control)
assets/js/ncrs.js        banco NCR: importações, correlação, histórico, junção
assets/js/ncrfluxo.js    o desenho do fluxo da NCR, igual ao do NCR Control
assets/js/ncrview.js     aba Banco NCR: tabela, filtros e ficha
assets/js/app.js         lógica do editor
derrogacao.html          o programa inteiro num arquivo só (gerado)
tools/build-standalone.py  gera a versão de arquivo único
exemplos/                relatórios .json prontos para importar
CLAUDE.md                notas de manutenção: decisões, armadilhas, porquês
```

Não há dependências externas nem etapa de build: abrir o `index.html` já
funciona, inclusive a partir do disco local.

Backups gerados antes da aba DEV existir continuam abrindo normalmente — a
lista de DEVs nasce vazia.
