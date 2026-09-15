# Paginacao do resumo e do compilado de fluxos: nenhuma folha pode terminar
# com o texto escorrendo para a borda do papel. Confere as margens de cada
# folha do PDF, o cabecalho repetido da lista e a ausencia de folha em branco.
import json, os, pathlib
import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

VELHO = "2024-01-15T09:00:00.000Z"      # parado ha muito tempo


def ncr(k):
    return {
        "id": "n%d" % k, "ncrId": "NCR-ICN-ESC-13-%04d-2023" % k, "systems": "BX,BQ",
        "func": "FV %02d - Linha bem comprida de funcao, para a coluna encher" % k,
        "description": "d", "currentSituation": "s", "whyNotPossible": "w",
        "arguments": "a", "archStatus": "WAIVER REQUESTED",
        "historic": "J01 & J03 To: J02 & J04\nJ02 & J04 To: J06",
        "status": "solicitado", "editedBy": "Bruno", "editedAt": VELHO,
        "certificates": [], "evidence": []
    }


proj = {
    "id": "rs1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
    "marcoDev": "", "footer": "Gerencia tecnica operacional",
    "ncrs": [ncr(k) for k in range(1, 31)],
    "devs": [dict(ncr(k), id="d%d" % k, ncrId="DEV-%05d" % (70000 + k), systems="")
             for k in range(1, 9)],
    "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
}

MARGENS = {"topo": 19.0, "base": 14.0, "lado": 14.0}   # o resumo usa 15mm nos lados


def confere(caminho, mmin=MARGENS):
    doc = pdfium.PdfDocument(str(caminho))
    piores = {"topo": 999.0, "base": 999.0, "esq": 999.0, "dir": 999.0}
    textos = []
    for i in range(len(doc)):
        pagina = doc[i]
        img = pagina.render(scale=2).to_pil().convert("L")
        w, h = img.size
        bb = img.point(lambda v: 255 if v < 245 else 0).getbbox()
        assert bb, "%s: folha %d saiu em branco" % (caminho.name, i + 1)
        mmx, mmy = 210.0 / w, 297.0 / h
        piores["esq"] = min(piores["esq"], bb[0] * mmx)
        piores["topo"] = min(piores["topo"], bb[1] * mmy)
        piores["dir"] = min(piores["dir"], 210 - bb[2] * mmx)
        piores["base"] = min(piores["base"], 297 - bb[3] * mmy)
        textos.append(pagina.get_textpage().get_text_range())
    print("  %s: %d folha(s) | margens topo %.1f base %.1f esq %.1f dir %.1f" %
          (caminho.name, len(doc), piores["topo"], piores["base"], piores["esq"], piores["dir"]))
    assert piores["topo"] >= mmin["topo"], "texto subiu demais: %.1f mm" % piores["topo"]
    assert piores["base"] >= mmin["base"], "texto desceu demais: %.1f mm" % piores["base"]
    assert piores["esq"] >= mmin["lado"], "texto encostou a esquerda: %.1f mm" % piores["esq"]
    assert piores["dir"] >= mmin["lado"], "texto encostou a direita: %.1f mm" % piores["dir"]
    return textos


errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1500, "height": 1000})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.evaluate("async p => { await Store.save(p) }", proj)
    pg.reload(); pg.wait_for_timeout(900)

    # ===== resumo do marco em PDF =====
    pg.click(".tab[data-kind=resumo]"); pg.wait_for_timeout(700)
    pg.click(".sm-link"); pg.wait_for_timeout(600)
    pg.click("text=Resumo em PDF"); pg.wait_for_timeout(900)
    folhas = pg.locator("#printRoot .rep-page").count()
    print("resumo — folhas montadas:", folhas)
    assert folhas > 1, "38 itens nao cabem numa folha so"
    pg.pdf(path=str(SP / "resumo-paginado.pdf"), print_background=True, prefer_css_page_size=True)

    # ===== compilado de fluxos em PDF =====
    pg.click(".tab[data-kind=fluxos]"); pg.wait_for_timeout(700)
    pg.click("text=Fluxos em PDF"); pg.wait_for_timeout(900)
    fx = pg.locator("#printRoot .rep-page").count()
    print("fluxos — folhas montadas:", fx)
    assert fx > 1, "38 fluxos nao cabem numa folha so"
    pg.pdf(path=str(SP / "fluxos-paginado.pdf"), print_background=True, prefer_css_page_size=True)
    b.close()

print("\nconferindo os PDFs:")
tr = confere(SP / "resumo-paginado.pdf")
tf = confere(SP / "fluxos-paginado.pdf")

conts = [t for t in tr if "(cont.)" in t]
print("resumo — folhas de continuacao:", len(conts))
assert conts, "a continuacao do resumo deveria estar marcada com (cont.)"

cabs = [t for t in tr if "Itens" in t]          # o titulo do bloco, nao o KPI
print("resumo — folhas com o bloco Itens:", len(cabs),
      "| com o bloco Parados:", len([t for t in tr if "Parados há" in t]))
assert len(cabs) > 1, "o cabecalho da lista deveria repetir em cada folha"
assert len([t for t in tr if "Parados há" in t]) > 1, "o bloco de parados tambem repete o cabecalho"

# o numero quebra de linha na coluna estreita: comparar sem os espacos
def corrido(textos):
    return "".join("".join(t.split()) for t in textos)

primeiro = "NCR-ICN-ESC-13-0001-2023"
ultimo = "NCR-ICN-ESC-13-0030-2023"
resumo, fluxos = corrido(tr), corrido(tf)
assert primeiro in resumo and ultimo in resumo, \
    "nenhum item pode se perder entre as folhas do resumo"
assert "DEV-70008" in resumo, "as DEVs tambem entram na lista do resumo"

print("fluxos — folhas de continuacao:", len([t for t in tf if "(cont.)" in t]))
assert primeiro in fluxos, "o compilado de fluxos perdeu o primeiro item"
assert "DEV-70008" in fluxos, "o compilado de fluxos perdeu a ultima DEV"

print("\nERRORS:", json.dumps(errs, indent=1) if errs else "none")
