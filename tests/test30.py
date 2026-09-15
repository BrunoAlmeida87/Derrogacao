# O fluxo dos waivers: lido do Waiver Historic de cada item, mostrado no
# proprio item, no pop-up, na aba Fluxos e no PDF do compilado.
import json, os, pathlib
import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

proj = {
  "id": "fx1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [
    # o exemplo do Bruno: duas linhas soltas que formam uma corrente
    {"id": "n1", "ncrId": "NCR-CORRENTE", "systems": "RM", "func": "FV 01 - Sea water",
     "historic": "J06 To: J08\nJ04 To: J06", "evidence": []},
    # dois marcos que desembocam no mesmo: viram uma coluna so
    {"id": "n2", "ncrId": "NCR-JUNCAO", "systems": "HP", "func": "FV 09 - Damage control",
     "historic": "J06Cer To: J06\nJ01 & J03 To: J06", "evidence": []},
    # campo vazio: nao inventa card nenhum
    {"id": "n3", "ncrId": "NCR-SEM-HIST", "systems": "EX", "func": "FV 36 - Pressure hull",
     "historic": "", "evidence": []},
    # item aceito: travado para escrever, mas o fluxo continua a ver
    {"id": "n4", "ncrId": "NCR-ACEITA", "systems": "BF", "func": "FV 20 - Electric supply",
     "historic": "J02 & J04 To: J06", "status": "aceito", "done": True, "evidence": []}
  ],
  "devs": [
    {"id": "d1", "ncrId": "DEV-78154", "func": "BQ - Modification des compensateurs",
     "historic": "J01 & J03 To: J02 & J04\nJ02 & J04 To: J06", "evidence": []}
  ],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 1000})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("async p => { await Store.save(p) }", proj)
    pg.reload(); pg.wait_for_timeout(1000)

    # --- a leitura do campo, caso a caso (unitario, na propria pagina) ------
    casos = pg.evaluate("""() => {
      var f = function (t) {
        var a = Fluxo.analisar(t);
        return { caminho: Fluxo.caminhoTexto(a), cards: a.nos.length, avisos: a.avisos.length };
      };
      return {
        corrente:  f('J06 To: J08\\nJ04 To: J06'),
        juncao:    f('J06Cer To: J06\\nJ01 & J03 To: J06'),
        tresPasso: f('J01 & J03 To: J02 & J04\\nJ02 & J04 To: J06'),
        soltos:    f('J08\\nJ05'),
        bagunca:   f('j1 & j3 to: j2&j4\\nJ02 & J04 To: J06'),
        circulo:   f('J06 To: J08\\nJ08 To: J06'),
        vazio:     f('   ')
      };
    }""")
    print("corrente :", casos["corrente"])
    print("juncao   :", casos["juncao"])
    print("3 passos :", casos["tresPasso"])
    print("soltos   :", casos["soltos"])
    print("bagunca  :", casos["bagunca"])
    print("circulo  :", casos["circulo"])
    assert casos["corrente"]["caminho"] == "J04 → J06 → J08", "as setas mandam na ordem"
    assert casos["juncao"]["caminho"] == "J01 & J03 + J06Cer → J06", "dois marcos no mesmo destino"
    assert casos["tresPasso"]["caminho"] == "J01 & J03 → J02 & J04 → J06"
    # sem setas, a ordem e a do programa: J05 antes de J08
    assert casos["soltos"]["caminho"] == "J05 + J08", "sem seta, vale a ordem dos marcos"
    assert casos["bagunca"]["caminho"] == "J01 & J03 → J02 & J04 → J06", "j1, J01 e j 1 sao o mesmo marco"
    assert casos["circulo"]["avisos"] == 1, "seta em circulo tem de virar aviso, nao travar"
    assert casos["vazio"]["cards"] == 0

    # --- dentro do item: o desenho acompanha o que esta escrito -------------
    pg.locator(".ncr-item", has_text="NCR-CORRENTE").first.click(); pg.wait_for_timeout(500)
    cards = lambda: pg.locator(".fx-bloco .fx-card").count()
    # <text> de SVG nao tem innerText; o conteudo vem por text_content
    rotulos = lambda: pg.locator(".fx-bloco .fx-card-txt").all_text_contents()
    print("cards no item:", rotulos())
    assert rotulos() == ["J04", "J06", "J08"], "os cards saem na ordem do fluxo"

    # escrever mais uma linha acrescenta o card, sem redesenhar o formulario
    pg.focus("#f-historic")
    pg.evaluate("""() => {
      var t = document.getElementById('f-historic');
      t.value = t.value + '\\nJ08 To: J12';
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }""")
    pg.wait_for_timeout(400)
    print("apos escrever mais uma linha:", rotulos())
    assert rotulos() == ["J04", "J06", "J08", "J12"], "card novo aparece conforme se escreve"
    assert pg.evaluate("()=>document.activeElement.id") == "f-historic", "o cursor nao pode sair do campo"

    # --- o pop-up ----------------------------------------------------------
    pg.click("#fluxoAbrirBtn"); pg.wait_for_timeout(400)
    print("titulo do pop-up:", pg.locator("#fluxoItem").inner_text())
    print("caminho:", pg.locator("#fluxoCaminho").inner_text())
    assert "J04 → J06 → J08 → J12" in pg.locator("#fluxoCaminho").inner_text()
    destaque = pg.locator("#fluxoPalco .fx-card.is-destaque .fx-card-txt").all_text_contents()
    print("card em destaque (marco do relatorio):", destaque)
    assert destaque == ["J06"], "o marco do proprio relatorio fica em destaque"
    pg.click("#fluxoCloseBtn"); pg.wait_for_timeout(200)

    # o campo nao pode ter sido alterado pelo desenho
    guardado = pg.evaluate("""async () => {
      const ps = await Store.list();
      return ps.filter(p => p.id === 'fx1')[0].ncrs.filter(n => n.ncrId === 'NCR-CORRENTE')[0].historic;
    }""")
    print("campo gravado:", json.dumps(guardado))
    assert guardado == "J06 To: J08\nJ04 To: J06\nJ08 To: J12"

    # --- item aceito: travado para escrever, livre para ver ----------------
    pg.locator(".ncr-item", has_text="NCR-ACEITA").first.click(); pg.wait_for_timeout(500)
    travado = pg.evaluate("()=>document.getElementById('f-historic').readOnly")
    botao = pg.evaluate("()=>document.getElementById('fluxoAbrirBtn').disabled")
    print("item aceito — campo travado:", travado, "| botao do fluxo travado:", botao)
    assert travado and not botao, "travar e para nao escrever sem querer, nao para deixar de ver"
    pg.click("#fluxoAbrirBtn"); pg.wait_for_timeout(300)
    assert pg.locator("#fluxoDialog").evaluate("d => d.open")
    pg.click("#fluxoCloseBtn"); pg.wait_for_timeout(200)

    # --- a aba do compilado ------------------------------------------------
    pg.click('.tab[data-kind="fluxos"]'); pg.wait_for_timeout(700)
    linhas = pg.locator(".fx-linha")
    print("linhas na aba:", linhas.count())
    assert linhas.count() == 5, "quatro NCRs e uma DEV"
    print("cabecalho:", pg.locator(".fx-info").inner_text().replace("\n", " "))
    assert "4 de 5" in pg.locator(".fx-info").inner_text(), "so quatro tem waiver anterior escrito"

    blocos = pg.locator(".sm-card-head h3").all_inner_texts()
    print("blocos:", blocos)
    assert blocos == ["NCRs", "DEVs"], "NCR e DEV separados"

    pg.locator(".fx-check input").check(); pg.wait_for_timeout(400)
    print("escondendo quem nao tem fluxo:", pg.locator(".fx-linha").count())
    assert pg.locator(".fx-linha").count() == 4
    pg.locator(".fx-check input").uncheck(); pg.wait_for_timeout(300)

    pg.fill('#fluxosScroll input[type="search"]', "J12"); pg.wait_for_timeout(400)
    achados = pg.locator(".fx-linha-num").all_inner_texts()
    print("busca por um marco do fluxo:", achados)
    assert achados == ["NCR-CORRENTE"], "a busca alcanca os marcos do fluxo"
    pg.fill('#fluxosScroll input[type="search"]', ""); pg.wait_for_timeout(300)

    # clicar no número leva ao item
    pg.locator(".fx-linha-num a", has_text="DEV-78154").click(); pg.wait_for_timeout(500)
    print("abriu o item pela aba:", pg.locator("#f-ncrId").input_value(),
          "| aba:", pg.locator('.tab[aria-selected="true"]').inner_text().strip())
    assert pg.locator("#f-ncrId").input_value() == "DEV-78154"

    # --- o compilado em PDF ------------------------------------------------
    pg.click('.tab[data-kind="fluxos"]'); pg.wait_for_timeout(600)
    pg.evaluate("() => { window.print = function () { window.__imprimiu = true; }; }")
    pg.locator(".sm-bar-actions .btn", has_text="Fluxos em PDF").click()
    pg.wait_for_timeout(900)
    folhas = pg.evaluate("()=>document.querySelectorAll('#printRoot .rep-page').length")
    print("folhas montadas:", folhas, "| imprimiu:", pg.evaluate("()=>window.__imprimiu === true"))
    assert pg.evaluate("()=>window.__imprimiu === true")
    assert pg.evaluate("()=>document.querySelectorAll('#printRoot .fx-card').length") >= 12, \
        "os cards tem de ir para a folha"
    pg.pdf(path=str(SP / "fluxos.pdf"), print_background=True, prefer_css_page_size=True)
    b.close()

doc = pdfium.PdfDocument(str(SP / "fluxos.pdf"))
print("paginas no PDF:", len(doc))
assert len(doc) == folhas, "a conta de folhas da tela tem de bater com o papel"
texto = ""
for i in range(len(doc)):
    pagina = doc[i]
    texto += pagina.get_textpage().get_text_range()
    img = pagina.render(scale=2).to_pil().convert("L")
    w, h = img.size
    bb = img.point(lambda v: 255 if v < 245 else 0).getbbox()
    assert bb, "pagina %d em branco" % i
    topo, base = bb[1] * 297.0 / h, 297 - bb[3] * 297.0 / h
    print("  folha", i, "topo %.1f mm | base %.1f mm" % (topo, base))
    assert topo >= 19 and base >= 14, "o fluxo nao pode encostar na borda do papel"

for marco in ["J04", "J06", "J08", "J12", "J06Cer", "J01 & J03"]:
    assert marco in texto, "o card %s tem de sair impresso" % marco
print("cards impressos: ok")

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
