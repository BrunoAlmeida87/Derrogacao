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
  **⋯ → Ajustes de capa e rodapé**.
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
  de NCRs, páginas A4 retrato para as NCRs, páginas A4 paisagem para as
  evidências, mesmas cores de faixa e mesmo rodapé.
- **Backup e restauração** em arquivo `.json`, para levar o trabalho a outro
  computador ou passar para outra pessoa.

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
6. Ao terminar um item, clique em **✓ Concluir** (ou **✓ Concluir e criar
   outra**). O salvamento já é automático a cada tecla — o botão serve para
   confirmar que acabou e marcar o item como pronto, com um ✓ na lista.
7. **Exportar PDF…** abre a lista de todos os relatórios disponíveis, separados
   por marco e por NCR/DEV. Marque um para gerar o arquivo isolado, ou vários
   para gerar um arquivo único com todos em sequência, cada um começando na
   sua capa. A janela de impressão do navegador se abre; escolha:
   - Destino: **Salvar como PDF**
   - Margens: **Nenhuma**
   - **Gráficos de plano de fundo**: marcado
   - **Cabeçalhos e rodapés**: desmarcado

A lista lateral mostra **quantos itens já foram concluídos** e tem um filtro
**só pendentes**, para achar rápido o que ainda falta. A ordem da lista é a
ordem no PDF — arraste os itens para reordenar. Os cinco blocos de texto são
recolhíveis (**Recolher preenchidos**), e campos que se repetem muito
(`PÓS TRAP`, `WAIVER ACCEPTED`, sistemas, certificados) sugerem valores já
usados nos outros relatórios.

Os títulos de capa, o rodapé e o marco alternativo da capa da DEV ficam em
**Ajustes**, ao lado do campo Marco — são textos fixos que quase nunca mudam.

## Backup, cache e trabalho compartilhado

Os relatórios ficam no **IndexedDB do navegador** (com `localStorage` como
reserva). Isso significa que continuam disponíveis ao fechar e reabrir o
navegador, mas **são apagados se você limpar os dados do site**. A aplicação
pede ao navegador para marcar o armazenamento como persistente, o que reduz o
risco, porém não elimina.

Por isso:

Ambos ficam no menu **⋯**, no canto direito da barra superior.

- **★ Backup total** é a opção recomendada: salva **todos** os relatórios deste
  navegador — todos os marcos, NCRs e DEVs — num arquivo só. Use este no dia a
  dia; assim não há como restaurar mais tarde e descobrir que faltou alguma
  coisa.
- **Backup só deste** salva apenas o relatório aberto (as duas abas dele). Serve
  para mandar um marco específico a um colega.
- **Restaurar** lê um `.json` — também funciona arrastando o arquivo para
  qualquer ponto da janela.

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
(ou pelo menu **⋯ → ⤓ Baixar para usar sem internet**)

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

- **Números do escopo**: itens em derrogação (com a divisão NCR/DEV), concluídos,
  pendentes e páginas de evidência.
- **Progresso por marco** — barras empilhadas de concluídos sobre o total.
- **Situação do waiver** — Aceito / Solicitado / Sem resposta, lido do campo
  *Arch Status Waiver*.
- **Itens por sistema** — um item que cita vários sistemas (`BX,BQ,BD`) conta em
  cada um; acima de dez sistemas o excedente vira "Outros".
- **Tabela de marcos**, com percentual concluído e quem editou por último.

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

## Duas ou mais pessoas ao mesmo tempo

Não há servidor: cada pessoa trabalha na sua cópia, no próprio navegador, e os
arquivos `.json` circulam por uma pasta compartilhada. Por isso **abrir um
arquivo nunca substitui o que você tem** — a aplicação compara item a item.

Ao abrir um arquivo de um relatório que já existe aqui, a tela de mesclagem
separa o que mudou em quatro grupos:

| Grupo | O que é | Padrão |
| --- | --- | --- |
| **Novos** | Existem no arquivo e não aqui | acrescentar |
| **Atualizados pelo colega** | Você não mexeu; a versão do arquivo é mais nova | aceitar |
| **Conflitos** | Os dois mexeram no mesmo item | **manter a sua** — você escolhe |
| **Excluídos pelo colega** | Existem aqui e sumiram do arquivo | não excluir |

Itens em que **só você** mexeu nem aparecem: ficam como estão, sem risco. A
decisão usa o carimbo da última troca de arquivo (`syncBase`), não apenas a
hora — é isso que permite distinguir "o colega atualizou" de "os dois
mexeram".

Antes de aplicar, a aplicação guarda um retrato do estado anterior:
**⋯ → ↩ Desfazer a última mesclagem** volta tudo, se a escolha foi errada.

### Rotina sugerida para a pasta compartilhada

1. Ao começar o dia, **Abrir arquivo…** com a versão que está na pasta.
2. Trabalhe normalmente.
3. Ao terminar, **★ Salvar backup de tudo** e grave na pasta por cima.

Combinar quem cuida de quais NCRs reduz ainda mais o atrito — mas, se dois
mexerem na mesma, a tela de mesclagem mostra o conflito em vez de perder
trabalho em silêncio.

## Quem editou por último

Não há login. Na primeira vez que você gera um backup, o sistema pede o seu
nome e o guarda neste navegador (menu **⋯ → Você**). A partir daí, cada
relatório registra **quem editou por último** e **quem gerou o último backup**,
com data e hora — informação que aparece no canto direito da barra superior e
viaja dentro do arquivo `.json`. Ao restaurar o backup de um colega, o sistema
diz de quem veio o arquivo. Nada disso sai nos PDFs.

Se passar mais de uma semana sem backup, aparece um aviso no topo com um botão
para fazê-lo na hora.

### O que cada um alterou

Cada abertura da página é uma **sessão**. Enquanto você trabalha, a lista
lateral marca com um ponto os itens mexidos e mostra *"3 itens alterados nesta
sessão"*. Em **⋯ → Histórico de alterações** ficam todas as sessões do
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
diagnosticar. A versão em uso aparece no rodapé do menu **⋯**; se ela não bater
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
assets/js/store.js       modelo de dados e persistência (IndexedDB)
assets/js/report.js      montagem das páginas no padrão do PDF
assets/js/summary.js     apuração, gráficos SVG e a aba de resumo
tools/build-standalone.py  gera a versão de arquivo único
assets/js/app.js         lógica do editor
```

Não há dependências externas nem etapa de build: abrir o `index.html` já
funciona, inclusive a partir do disco local.

Backups gerados antes da aba DEV existir continuam abrindo normalmente — a
lista de DEVs nasce vazia.
