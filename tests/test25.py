# Paginacao do relatorio: o texto que passa do fim da folha continua numa
# folha de verdade, com as mesmas margens — nunca colado na borda do papel.
# Confere tambem o indice da capa comprido e o aviso de folhas no dialogo.
import json, os, pathlib
import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

LONGO = ("Durante a instalacao do mastro ESM verificou-se que os parafusos de fixacao "
         "nao encaixavam no conjunto, por serem curtos demais. ") * 40

proj = {
  "id": "pg1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "footer": "Gerencia tecnica operacional",
  "ncrs": [
    {"id": "a1", "ncrId": "NCR-CURTA", "systems": "RM", "func": "FV 01 - Sea water",
     "description": "curta", "currentSituation": "cabe numa folha so",
     "whyNotPossible": "x", "arguments": "y", "archAnswer": "z",
     "archStatus": "WAIVER ACCEPTED", "certificates": ["S02 RMZ2010"], "evidence": []},
    {"id": "a2", "ncrId": "NCR-LONGA", "systems": "ME", "func": "FV 05 - Propel",
     "description": LONGO, "currentSituation": LONGO * 2, "whyNotPossible": LONGO,
     "arguments": LONGO, "archAnswer": "Waiver accepted",
     "archStatus": "WAIVER ACCEPTED", "certificates": ["Shipyard Certificate"], "evidence": []}
  ] + [{"id": "f%d" % k, "ncrId": "NCR-INDICE-%03d" % k, "systems": "BX",
        "func": "FV 09 - Linha comprida de indice para encher a capa",
        "archStatus": "WAIVER ACCEPTED", "evidence": []} for k in range(1, 61)],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1500, "height": 1000})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("async p => { await Store.save(p) }", proj)
    pg.reload(); pg.wait_for_timeout(900)

    # --- o dialogo de exportacao avisa quais itens passam de uma folha ---
    pg.click("#pdfBtn"); pg.wait_for_timeout(1200)
    aviso = pg.locator("#pdfFolhas").inner_text()
    print("aviso de folhas:", aviso)
    assert "NCR-LONGA" in aviso, "o item longo deveria ser apontado no dialogo"
    assert "NCR-CURTA" not in aviso, "o item curto cabe numa folha e nao deve aparecer"

    pg.click("#pdfGoBtn"); pg.wait_for_timeout(900)
    pg.pdf(path=str(SP / "paginacao.pdf"), print_background=True, prefer_css_page_size=True)
    b.close()

doc = pdfium.PdfDocument(str(SP / "paginacao.pdf"))
print("paginas no PDF:", len(doc))
assert len(doc) > 62, "capa + 62 itens, com continuacoes"

piores = {"topo": 999.0, "base": 999.0, "esq": 999.0, "dir": 999.0}
conts = 0
rodapes = 0
for i in range(len(doc)):
    pagina = doc[i]
    img = pagina.render(scale=2).to_pil().convert("L")
    w, h = img.size
    bb = img.point(lambda v: 255 if v < 245 else 0).getbbox()
    assert bb, "pagina %d saiu em branco" % i
    mmx, mmy = 210.0 / w, 297.0 / h
    piores["esq"] = min(piores["esq"], bb[0] * mmx)
    piores["topo"] = min(piores["topo"], bb[1] * mmy)
    piores["dir"] = min(piores["dir"], 210 - bb[2] * mmx)
    piores["base"] = min(piores["base"], 297 - bb[3] * mmy)
    texto = pagina.get_textpage().get_text_range()
    if "(cont.)" in texto: conts += 1
    if "Gerencia tecnica operacional" in texto: rodapes += 1

print("menores margens (mm): topo %.1f | base %.1f | esq %.1f | dir %.1f" %
      (piores["topo"], piores["base"], piores["esq"], piores["dir"]))
# as margens do layout sao 20mm no topo, 15mm na base e 25mm nos lados
assert piores["topo"] >= 19, "texto subiu demais: %.1f mm do topo" % piores["topo"]
assert piores["base"] >= 14, "texto desceu demais: %.1f mm da base" % piores["base"]
assert piores["esq"] >= 24, "texto encostou na margem esquerda"
assert piores["dir"] >= 24, "texto encostou na margem direita"

print("folhas de continuacao:", conts)
assert conts >= 3, "capa comprida e item longo deveriam gerar continuacoes"
print("folhas com rodape:", rodapes)
assert rodapes >= 62, "o rodape repete em toda folha de item, continuacoes incluidas"

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
