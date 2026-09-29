# Testes

Suítes de ponta a ponta com o Playwright (Chromium), em Node. Cada uma abre o
programa de verdade — servido por um servidor estático mínimo, ou de
`file://` no caso dos arquivos únicos —, semeia dados de exemplo pela própria
API do programa (`Store`, `Ncrs`) e faz o caminho de quem usa, conferindo o
resultado: a tela, os arquivos baixados (planilha, CSV, backup) e os PDFs
gerados (número de folhas e tamanho do papel, lidos do próprio arquivo).

Nada aqui é o programa: ele continua sem build, sem servidor e sem
dependência. Isto é ferramenta de quem edita (CLAUDE.md, §7).

## Rodar

```bash
npm i -g playwright            # ou: npm i playwright, na raiz
node tests/rodar.js            # todas
node tests/rodar.js kanban     # só as que têm "kanban" no nome
node tests/kanban.test.js      # uma só
```

O Chromium é o do Playwright (`PLAYWRIGHT_BROWSERS_PATH`); para outro, aponte
`DERROG_CHROME`. Os arquivos gerados (downloads, PDFs) vão para
`DERROG_TMP` (padrão: a pasta temporária do sistema, `derrogacao-testes`).
Nenhuma suíte escreve dentro do repositório.

> **"0 erros no console" não quer dizer que passou.** O que vale são as
> conferências (`✓`/`✗`) de cada suíte.

## O que cada uma cobre

| Arquivo | Cobre |
| --- | --- |
| `navegacao.test.js` | ordem e nomes das áreas (Banco NCR, Kanban, Tabela, Waiver NCR, Waiver DEV), chaves internas `ncr`/`dev`, cores, teclado (setas, Home, End, a aba escondida fora da roda), o seletor de relatório só onde ele manda |
| `abertura.test.js` | o marco da vez (`Config.MARCO_INICIAL`): comparação tolerante (`j 9` sim, `J09 Ind` não), preferência sobre o mais recente, a regra de antes sem ele (sem criar relatório), Kanban, Resumo e visualizador |
| `kanban.test.js` | cartões compactos (descrição longa não estica; abrir e fechar não grava), as ações de sempre, a área das encerradas em CEDOC Closure, filtros, a planilha `.xlsx` e a exportação visual em A4/A3, retrato/paisagem, "caber numa folha" |
| `resumo.test.js` | mini cards de marco no lugar do dropdown: "Todos os marcos", troca geral × marco (clique e teclado), filtros juntos, CSV e PDF do escopo, backup do marco sempre inteiro |
| `atualizacao.test.js` | editor sem relógio de 5 min (botão "⟳ Atualizar", conferência de 20 s, conferir ao voltar para a janela, o que se escreve aqui preservado); visualizador com o contador no ⋯ Mais, um temporizador só, a contagem que não recomeça ao trocar de aba, o prazo vencido lá fora que roda ao voltar, a falha que não apaga os dados à vista |
| `banco.test.js` | Banco NCR: zebra e separadores, certos depois de filtrar/ordenar/editar; estados por cima (mouse, foco, fechada, linha presa); cabeçalho alinhado |
| `compat.test.js` | backup antigo abrindo, formato do backup e chaves internas inalterados (a única chave nova é `comunicados`), o PDF do relatório com as folhas de sempre |
| `comunicados.test.js` | comunicados: quais marcos (J09 sim; J08 e J09 Ind não), nada criado sem o clique, a prévia com todos os campos, `comunicados.json` na pasta, "já comunicado", comunicado do colega pela pasta, retenção de 100, backup (com e sem a coleção), diário sem o texto, publicação; no visualizador, o pop-up consolidado, "Abrir waiver", lido que sobrevive ao recarregar, "Depois", histórico, a regra dos 7 dias e a publicação antiga |
| `correcoes.test.js` | os status que fecham a NCR (a lista do Bruno) e o que deixa de pedir waiver; a ficha com os produtos e as deliberações (linhas repetidas, outra aba, listas no JSON); NCR temporária → definitiva ligada pela ficha (vínculo, fluxo, levar adiante, Kanban, editor); a área administrativa (senha, correção com auditoria, a correção que o banco supera, senha errada), o arquivo `derrogacao-ncr-correcoes.json` sem a senha em texto e o visualizador |
| `arquivo-unico.test.js` | `derrogacao.html` e `derrogacao-visualizador.html` gerados na hora e abertos de `file://` sem flag |

A pasta da rede, nos testes, é um diretório OPFS no lugar do seletor do
Windows — a mesma interface `FileSystemDirectoryHandle` que a pasta entrega.
