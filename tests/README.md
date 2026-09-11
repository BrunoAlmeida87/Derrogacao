# Testes

Suítes de ponta a ponta em Playwright (Chromium). Cada arquivo abre a
aplicação de verdade, faz o caminho de um usuário e confere o resultado —
inclusive gerando PDFs e conferindo o que saiu neles.

## Rodar

```bash
pip install playwright pypdf pypdfium2 pillow
python3 -m playwright install chromium        # ou aponte DERROG_CHROME
cd tests && for t in test*.py; do echo "== $t"; python3 "$t"; done
```

Duas variáveis, ambas opcionais:

| Variável | Para que serve | Padrão |
| --- | --- | --- |
| `DERROG_TMP` | onde os testes gravam downloads, capturas e PDFs | `/tmp/derrogacao-testes` |
| `DERROG_CHROME` | caminho do Chromium | o do Playwright nesta máquina |

Alguns testes leem `solo.html` (a versão de arquivo único) dentro de
`DERROG_TMP`. Gere antes:

```bash
python3 tools/build-standalone.py teste && cp derrogacao.html "$DERROG_TMP/solo.html"
```

> **`ERRORS: none` no fim não quer dizer que passou.** Essa linha só reporta o
> console do navegador. O que vale são as asserções e os valores impressos —
> já aconteceu de um teste imprimir `ERRORS: none` enquanto capturava páginas
> em branco.

## O que cada um cobre

| Arquivo | Cobre |
| --- | --- |
| `test.py` | fidelidade do PDF ao relatório original: capa, faixas coloridas, status, certificados |
| `test2.py` | backup e restauração entre dois navegadores, com imagens |
| `test3.py` | evidências, reordenar anexos, **Copiar de…**, aviso de campos vazios, zoom |
| `test4.py` | aba DEV: capa própria, título sem sistema, sem *Waiver Historic* |
| `test5.py` | backup antigo (anterior à aba DEV) continua abrindo |
| `test6.py` | situação do item, ajustes de capa/rodapé, seleção na exportação |
| `test7.py` | menu, lembrete de backup, sugestões, seções recolhíveis, autoria |
| `test8.py` | histórico de sessões: quem mexeu em quê |
| `test9.py` | mesclagem entre duas pessoas pelo arquivo (base comum, conflito, desfazer) |
| `test10.py` | aba Resumo: números, gráficos, tabelas, CSV, resumo em PDF |
| `test11.py` | versão de arquivo único rodando de `file://`, sem recurso externo |
| `test12.py` | data de emissão da capa, opcional |
| `test13.py` | sugestões separadas por categoria (NCR não oferece valores de DEV) |
| `test14.py` | situação de acompanhamento: só *Waiver accepted* conclui; não sai no PDF |
| `test15.py` | primeiro backup num clique só e lembrete da pasta |
| `test16.py` | marco igual criado por duas pessoas mescla em vez de duplicar |
| `test17.py` | comparação dentro do marco; fila de marcos; marco em branco não casa |
| `test18.py` | regras da mesclagem do banco compartilhado (unitário, na página) |
| `test19.py` | pasta da rede como banco: escolher, gravar, reabrir, lápide, histórico |
| `test20.py` | duas pessoas ao mesmo tempo e restauração de uma versão do histórico |
| `test21.py` | edição simultânea: itens diferentes, mesmo item, retrato antes de juntar |
| `test22.py` | ordenação da lista refletida no PDF; arrastar volta ao manual |
| `test23.py` | filtros do Resumo, refletidos nos números, no CSV e no resumo em PDF |
| `test24.py` | índice da capa fechando com o *Arch Status* |

Nos testes da pasta compartilhada (19, 20, 21) o seletor de pastas do Windows
é substituído por um diretório OPFS — mesma interface
`FileSystemDirectoryHandle` que a pasta de rede entrega, então o caminho
exercitado é o de verdade.
