# Waiver Request — Gerador de Relatórios de Derrogação de NCR

Aplicação web que substitui o gerador interno de relatórios de derrogação
(*Waiver Request*). Funciona inteiramente no navegador: não há servidor, não há
login e nenhum dado sai do computador.

**Aplicação:** https://brunoalmeida87.github.io/Derrogacao/

## O que faz

- **Um relatório por marco.** O marco (ex.: `RANAE J06`) fica no topo e entra no
  título da capa: *Waiver Request For RANAE J06*. Vários relatórios podem
  conviver no mesmo navegador — o seletor **Relatório** alterna entre eles.
- **Uma página por NCR.** Cada NCR inserida vira um item na lista lateral (a
  "aba") e uma página no PDF, com todos os campos de derrogação:
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

1. Preencha o **Marco** no topo.
2. **+ Nova NCR** na lateral esquerda e preencha número, sistema(s) e função.
   O título da página é montado como `NCR-...|RM|FV 01 - ...`, igual ao original.
3. Preencha os textos da derrogação. O salvamento é automático.
   Para um marco que repete NCRs de outro relatório, use **Copiar de…**.
4. Em **Evidências**, use **+ Novo anexo** e adicione as imagens necessárias.
5. **Pré-visualizar** mostra as folhas exatamente como sairão no PDF.
6. **Exportar PDF** abre a janela de impressão. Escolha:
   - Destino: **Salvar como PDF**
   - Margens: **Nenhuma**
   - **Gráficos de plano de fundo**: marcado
   - **Cabeçalhos e rodapés**: desmarcado

A ordem das NCRs na lista é a ordem no PDF — arraste os itens para reordenar.

## Backup, cache e trabalho compartilhado

Os relatórios ficam no **IndexedDB do navegador** (com `localStorage` como
reserva). Isso significa que continuam disponíveis ao fechar e reabrir o
navegador, mas **são apagados se você limpar os dados do site**. A aplicação
pede ao navegador para marcar o armazenamento como persistente, o que reduz o
risco, porém não elimina.

Por isso:

- **Backup** salva o relatório aberto em um `.json` (as imagens vão embutidas).
- **Backup total** salva todos os relatórios deste navegador em um único
  arquivo.
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

## Atalhos

| Atalho | Ação |
| --- | --- |
| `Ctrl` + `S` | Gravar imediatamente |
| `Ctrl` + `P` | Exportar PDF |
| `Esc` | Fechar a pré-visualização |
| `Ctrl` + `V` | Colar imagem no último anexo da NCR aberta |

## Publicação

O site é servido pela branch `gh-pages`, que o workflow
`.github/workflows/pages.yml` mantém idêntica à `main` a cada push. A ativação
é feita uma única vez em **Settings → Pages → Source: Deploy from a branch →
`gh-pages` / (root)**.

## Estrutura

```
index.html               interface
assets/css/app.css       estilos do editor
assets/css/report.css    layout do relatório (tela e impressão A4)
assets/js/store.js       modelo de dados e persistência (IndexedDB)
assets/js/report.js      montagem das páginas no padrão do PDF
assets/js/app.js         lógica do editor
```

Não há dependências externas nem etapa de build: abrir o `index.html` já
funciona, inclusive a partir do disco local.
