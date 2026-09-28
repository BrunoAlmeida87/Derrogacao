#!/usr/bin/env python3
"""Gera o PDF do MANUAL-VISUALIZADOR.md, para deixar na pasta da rede.

    python3 tools/manual-pdf.py [saida.pdf]

O Markdown continua sendo a fonte (é o que o GitHub mostra e o que se edita);
o PDF é derivado e NÃO é versionado — gere de novo quando o manual mudar.

Precisa de duas coisas que o programa não usa (é ferramenta de quem edita,
como a pasta tests/):
  - o pacote Python `markdown`  (pip install markdown)
  - um Chromium, Chrome ou Edge (o caminho vai em CHROME, se não for achado)

A quebra de páginas é o que dá trabalho, e é por isso que este arquivo existe:
o Markdown vira uma sequência plana de parágrafos, e o navegador partia um
assunto ao meio — o título no pé de uma folha e o texto na seguinte, a
imagem longe da frase que a apresenta. Aqui a sequência é reagrupada antes
de imprimir:

  - cada capítulo (##) começa em folha nova;
  - cada seção (###), e o começo de cada capítulo até a primeira seção, é um
    bloco que não se parte (`break-inside: avoid`) — cabendo numa folha, vai
    inteiro para a seguinte em vez de ser cortado;
  - dentro dele, o título fica preso ao que vem logo depois, e a frase que
    termina em ":" fica presa à lista, tabela ou imagem que ela anuncia —
    para quando a seção é maior que uma folha e precisa mesmo ser partida;
  - linha de tabela, item de lista, citação, bloco de código e imagem nunca
    se partem.
"""
import glob
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

RAIZ = pathlib.Path(__file__).resolve().parent.parent
FONTE = RAIZ / "MANUAL-VISUALIZADOR.md"

try:
    import markdown
    from markdown.extensions.toc import TocExtension
except ImportError:
    raise SystemExit("Falta o pacote 'markdown': pip install markdown")


def slug(valor, _sep):
    """A âncora como o GitHub faz, para os links do sumário valerem nos dois."""
    v = re.sub(r"<[^>]+>", "", valor).strip().lower()
    v = re.sub(r"[^\w\- ]", "", v, flags=re.U)
    return v.replace(" ", "-")


def html_do_manual():
    src = FONTE.read_text(encoding="utf-8")
    # o python-markdown quer 4 espaços na lista aninhada; o GitHub aceita 3
    src = re.sub(r"(?m)^   - ", "    - ", src)
    src = src.replace("](docs/", "](" + (RAIZ / "docs").as_uri() + "/")
    return markdown.markdown(src, extensions=["tables", "fenced_code",
                                              TocExtension(slugify=slug)])


def texto(el):
    return "".join(el.itertext()).strip()


def anuncia(el):
    """Parágrafo que apresenta o que vem a seguir ("Clicando nela:")."""
    return el.tag == "p" and texto(el).endswith(":")


def so_imagem(el):
    return el.tag == "p" and len(el) == 1 and el[0].tag == "img" and not texto(el)


def bloco(classe, filhos):
    b = ET.Element("div", {"class": classe})
    b.extend(filhos)
    return b


def colar(filhos):
    """Prende o título ao primeiro elemento, e a frase com ':' ao que anuncia."""
    out = []
    i = 0
    while i < len(filhos):
        el = filhos[i]
        grupo = [el]
        while (grupo[-1].tag in ("h2", "h3") or anuncia(grupo[-1])) and i + 1 < len(filhos):
            i += 1
            grupo.append(filhos[i])
        # a imagem vai junto do que vem antes dela (a frase, a lista, o aviso)
        if i + 1 < len(filhos) and so_imagem(filhos[i + 1]):
            i += 1
            grupo.append(filhos[i])
        out.append(bloco("junto", grupo) if len(grupo) > 1 else el)
        i += 1
    return out


def reagrupar(html):
    raiz = ET.fromstring("<div>" + html + "</div>")
    corpo = ET.Element("div")
    capitulo = None   # a <section> do ## atual
    secao = []        # os elementos da seção (###) em andamento
    abertura = []     # o título do manual e o sumário, antes do primeiro ##

    def fechar_secao():
        if secao and capitulo is not None:
            capitulo.append(bloco("secao", colar(secao)))
        del secao[:]

    for el in list(raiz):
        if el.tag == "hr":
            continue
        if el.tag == "h2":
            fechar_secao()
            # o sumário fica na primeira folha, com o título do manual
            classe = "sumario" if texto(el) == "Sumário" else "capitulo"
            capitulo = ET.SubElement(corpo, "section", {"class": classe})
            secao.append(el)
        elif el.tag == "h3":
            fechar_secao()
            secao.append(el)
        elif capitulo is None:
            abertura.append(el)
        else:
            secao.append(el)
    fechar_secao()
    capa = bloco("abertura", colar(abertura))
    corpo.insert(0, capa)
    return "".join(ET.tostring(f, encoding="unicode", method="html") for f in corpo)


CSS = """
@page {
  size: A4; margin: 15mm 15mm 17mm;
  @bottom-center {
    content: "Manual do Visualizador de Derrogações · página " counter(page) " de " counter(pages);
    font: 7.5pt 'Segoe UI', 'DejaVu Sans', Arial, sans-serif; color: #777;
  }
}
body { font-family: 'Segoe UI', 'DejaVu Sans', Arial, 'OpenSymbol', 'Noto Color Emoji', sans-serif;
       font-size: 10pt; line-height: 1.42; color: #1d2330; margin: 0; }
h1 { color: #4a1480; font-size: 22pt; margin: 0 0 4pt; }
h2 { color: #4a1480; font-size: 15pt; border-bottom: 2px solid #4a1480;
     padding-bottom: 3pt; margin: 0 0 8pt; }
h3 { color: #2b3140; font-size: 12pt; margin: 12pt 0 5pt; }

/* a regra da quebra de páginas (ver o topo deste arquivo) */
.capitulo { break-before: page; }
.secao, .junto, .abertura > .junto { break-inside: avoid; }
h2, h3 { break-after: avoid; }
tr, li, blockquote, pre, img, p { break-inside: avoid; }
p { orphans: 3; widows: 3; }

table { border-collapse: collapse; width: 100%; margin: 5pt 0 9pt; font-size: 9pt; }
th, td { border: 1px solid #c9ccd6; padding: 3pt 5pt; vertical-align: top; text-align: left; }
th { background: #efe8f7; }
thead { display: table-header-group; }
code { font-family: Consolas, 'DejaVu Sans Mono', monospace; font-size: 8.8pt;
       background: #f2f3f7; padding: 0 2pt; border-radius: 2pt; }
pre { background: #f2f3f7; border: 1px solid #dde0e8; padding: 6pt 8pt; font-size: 8pt;
      line-height: 1.3; white-space: pre-wrap; }
pre code { background: none; padding: 0; }
blockquote { margin: 7pt 0; padding: 5pt 10pt; border-left: 4px solid #c28a00; background: #fff8e6; }
blockquote p { margin: 2pt 0; }
img { display: block; max-width: 100%; max-height: 105mm; margin: 5pt auto 8pt;
      border: 1px solid #c9ccd6; }
a { color: #4a1480; text-decoration: none; }
ul, ol { padding-left: 16pt; margin: 4pt 0 7pt; }
li { margin: 2pt 0; }
p { margin: 4pt 0 6pt; }
"""


def achar_chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    candidatos = ["chromium", "chromium-browser", "google-chrome", "microsoft-edge", "msedge"]
    for nome in candidatos:
        if shutil.which(nome):
            return shutil.which(nome)
    for padrao in ["/opt/pw-browsers/chromium-*/chrome-linux/chrome",
                   r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                   r"C:\Program Files\Google\Chrome\Application\chrome.exe"]:
        achados = sorted(glob.glob(padrao))
        if achados:
            return achados[-1]
    raise SystemExit("Não achei Chromium, Chrome nem Edge. Informe o caminho em CHROME=...")


def main():
    saida = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "MANUAL-VISUALIZADOR.pdf").resolve()
    doc = ('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
           "<title>Manual do Visualizador de Derrogações</title><style>" + CSS +
           "</style></head><body>" + reagrupar(html_do_manual()) + "</body></html>")
    with tempfile.TemporaryDirectory() as tmp:
        pagina = pathlib.Path(tmp) / "manual.html"
        pagina.write_text(doc, encoding="utf-8")
        subprocess.run([achar_chrome(), "--headless", "--disable-gpu", "--no-sandbox",
                        "--allow-file-access-from-files", "--no-pdf-header-footer",
                        "--print-to-pdf=" + str(saida), pagina.as_uri()],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("gerado:", saida)


if __name__ == "__main__":
    main()
