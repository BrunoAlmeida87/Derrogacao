#!/usr/bin/env python3
"""
Gera uma versão de arquivo único da aplicação.

O index.html normal carrega seis arquivos ao lado dele. Para usar no próprio
computador — ou deixar numa pasta de rede para a equipe — é mais prático um
.html só, que se abre com dois cliques e não depende de nada em volta.

O arquivo gerado é versionado na `main` (derrogacao.html), para quem baixa o
repositório já levar o programa inteiro. Como é conteúdo derivado, ele
envelhece em silêncio se alguém mexer no index.html e esquecer de gerar de
novo — daí o modo de conferência:

Uso:  python3 tools/build-standalone.py [versao] [saida]
      python3 tools/build-standalone.py --conferir [arquivo]
"""

import html
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent
MARCA = re.compile(r'<meta name="app-version" content="([^"]*)">\n')


def ler(rel: str) -> str:
    return (RAIZ / rel).read_text(encoding="utf-8")


def embutir(doc: str) -> str:
    """Troca cada <link>/<script> externo pelo conteúdo do arquivo."""
    faltando = []

    def css(m):
        rel = m.group(1)
        if not (RAIZ / rel).exists():
            faltando.append(rel)
            return m.group(0)
        return "<style>\n/* %s */\n%s\n</style>" % (rel, ler(rel))

    def js(m):
        rel = m.group(1)
        if not (RAIZ / rel).exists():
            faltando.append(rel)
            return m.group(0)
        corpo = ler(rel)
        # um </script> dentro de string quebraria o bloco embutido
        corpo = corpo.replace("</script>", "<\\/script>")
        return "<script>\n/* %s */\n%s\n</script>" % (rel, corpo)

    doc = re.sub(r'<link rel="stylesheet" href="([^"?]+)[^"]*">', css, doc)
    doc = re.sub(r'<script src="([^"?]+)[^"]*"></script>', js, doc)

    # O arquivo único é um arquivo só: não há manifesto nem service worker
    # para acompanhar, e de file:// o navegador nem tentaria. Sai também a
    # diretiva da CSP que só existia para o manifesto — sem manifesto ela é
    # permissão dada a ninguém, e a CSP do arquivo único fica mais apertada
    # do que a da página.
    doc = re.sub(r'\s*<link rel="manifest"[^>]*>', "", doc)
    doc = doc.replace(" manifest-src 'self';", "")

    if faltando:
        raise SystemExit("Arquivos não encontrados: " + ", ".join(faltando))
    if 'href="assets/' in doc or 'src="assets/' in doc:
        raise SystemExit("Sobrou referência a assets/ no arquivo gerado.")
    return doc


def montar(versao: str) -> str:
    doc = embutir(ler("index.html"))
    # a marca de versão vem de uma meta, já que não há mais src carimbado
    return doc.replace(
        "<title>",
        '<meta name="app-version" content="%s">\n<title>' % html.escape(versao),
        1,
    )


def conferir(saida: pathlib.Path) -> int:
    """O arquivo único gravado ainda corresponde ao index.html e aos assets?

    A versão gravada nele é a da última publicação, então a conferência
    reconstrói com essa mesma marca: o que se compara é o conteúdo.
    """
    if not saida.exists():
        print("FALTA: %s não existe. Rode tools/build-standalone.py." % saida.name)
        return 1
    atual = saida.read_text(encoding="utf-8")
    m = MARCA.search(atual)
    esperado = montar(m.group(1) if m else "local")
    if atual == esperado:
        print("%s está em dia com o index.html e os assets." % saida.name)
        return 0
    print("DESATUALIZADO: %s não corresponde mais ao index.html/assets.\n"
          "Rode: python3 tools/build-standalone.py" % saida.name)
    return 1


def main():
    args = sys.argv[1:]
    if args and args[0] == "--conferir":
        alvo = RAIZ / (args[1] if len(args) > 1 else "derrogacao.html")
        raise SystemExit(conferir(alvo))

    versao = args[0] if args else "local"
    saida = RAIZ / (args[1] if len(args) > 1 else "derrogacao.html")
    saida.write_text(montar(versao), encoding="utf-8")
    print("%s — %.1f KB — versão %s" % (saida.name, saida.stat().st_size / 1024, versao))


if __name__ == "__main__":
    main()
