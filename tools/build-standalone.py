#!/usr/bin/env python3
"""
Gera uma versão de arquivo único da aplicação.

O index.html normal carrega seis arquivos ao lado dele. Para usar no próprio
computador — ou deixar numa pasta de rede para a equipe — é mais prático um
.html só, que se abre com dois cliques e não depende de nada em volta.

Uso:  python3 tools/build-standalone.py [versao] [saida]
"""

import html
import pathlib
import re
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent


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

    if faltando:
        raise SystemExit("Arquivos não encontrados: " + ", ".join(faltando))
    if 'href="assets/' in doc or 'src="assets/' in doc:
        raise SystemExit("Sobrou referência a assets/ no arquivo gerado.")
    return doc


def main():
    versao = sys.argv[1] if len(sys.argv) > 1 else "local"
    saida = RAIZ / (sys.argv[2] if len(sys.argv) > 2 else "derrogacao.html")

    doc = embutir(ler("index.html"))

    # a marca de versão vem de uma meta, já que não há mais src carimbado
    doc = doc.replace(
        "<title>",
        '<meta name="app-version" content="%s">\n<title>' % html.escape(versao),
        1,
    )
    saida.write_text(doc, encoding="utf-8")
    print("%s — %.1f KB — versão %s" % (saida.name, saida.stat().st_size / 1024, versao))


if __name__ == "__main__":
    main()
