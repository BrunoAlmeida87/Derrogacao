# O que o marco anterior respondeu: o mesmo item (mesmo numero) existe no
# relatorio de outro marco, e o card daquele marco no fluxo mostra o Arch
# Answer de la ao passar o mouse — e abre o item ao ser clicado. Nada disso
# pode alterar o relatorio de origem nem aparecer no papel.
import json, os, pathlib
import pypdfium2 as pdfium
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

RESPOSTA = ("Waiver granted for J06 under the condition that the leak test is "
            "repeated before J08. The compensator is to be replaced during the "
            "next docking.")

# --- o relatorio de onde vem a resposta ---
j06 = {
  "id": "p06", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [
    {"id": "a1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
     "archAnswer": RESPOSTA, "archStatus": "Waiver granted", "approvedExpiry": "J08",
     "editedBy": "Maria", "editedAt": "2026-03-02T10:00:00Z", "evidence": []},
    # mesmo numero escrito torto: o pareamento normaliza, como no resto do programa
    {"id": "a2", "ncrId": " ncr-002 ", "archAnswer": "Refused: rework required.",
     "archStatus": "Waiver refused", "evidence": []}
  ],
  "devs": [
    {"id": "ad1", "ncrId": "DEV-78154", "func": "BQ - Compensateurs",
     "archAnswer": "Derogation accepted for J06 only.", "evidence": []}
  ],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-03-02T10:00:00Z"
}

# --- o relatorio aberto, que veio do J06 ---
j08 = {
  "id": "p08", "schema": 1, "name": "RANAE J08", "marco": "RANAE J08",
  "ncrs": [
    {"id": "b1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
     "historic": "J04 To: J06\nJ06 To: J08", "evidence": []},
    {"id": "b2", "ncrId": "NCR-002", "historic": "J06 To: J08", "evidence": []},
    # numero que nunca existiu no J06: card sem ponto
    {"id": "b3", "ncrId": "NCR-777", "historic": "J06 To: J08", "evidence": []}
  ],
  "devs": [
    {"id": "bd1", "ncrId": "DEV-78154", "func": "BQ - Compensateurs",
     "historic": "J06 To: J08", "evidence": []}
  ],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-04-02T10:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 1000})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("async ps => { for (const p of ps) await Store.save(p); }", [j06, j08])
    pg.reload(); pg.wait_for_timeout(1200)

    # --- a procura, caso a caso (unitario, na propria pagina) ---------------
    casos = pg.evaluate("""async () => {
      const ps = await Store.list();
      const idx = Fluxo.indice(ps, 'ncr', 'p08');
      const idxDev = Fluxo.indice(ps, 'dev', 'p08');
      const p08 = ps.filter(p => p.id === 'p08')[0];
      const item = n => p08.ncrs.filter(x => x.ncrId.trim() === n)[0];
      const busca = (no, it, i) => {
        const r = Fluxo.anterior(i || idx, Fluxo.marco(no), it);
        return r ? { marco: r.marco, resposta: r.archAnswer.slice(0, 24), aqui: r.aqui } : null;
      };
      return {
        achaNoJ06:   busca('J06', item('NCR-001')),
        semJ04:      busca('J04', item('NCR-001')),
        numeroTorto: busca('J06', item('NCR-002')),
        semNumero:   busca('J06', item('NCR-777')),
        eleMesmo:    busca('J08', item('NCR-001')),
        dev:         busca('J06', p08.devs[0], idxDev),
        pares: {
          igual:   Fluxo.mesmoMarco(Fluxo.marco('J06'), Fluxo.marco('RANAE J06')),
          dentro:  Fluxo.mesmoMarco(Fluxo.marco('J01 & J03'), Fluxo.marco('J03')),
          cert:    Fluxo.mesmoMarco(Fluxo.marco('J06Cer'), Fluxo.marco('J06')),
          outro:   Fluxo.mesmoMarco(Fluxo.marco('J06'), Fluxo.marco('J08'))
        }
      };
    }""")
    for k in ["achaNoJ06", "semJ04", "numeroTorto", "semNumero", "eleMesmo", "dev"]:
        print("%-12s" % k, casos[k])
    print("pareamento de marcos:", casos["pares"])
    assert casos["achaNoJ06"] and casos["achaNoJ06"]["marco"] == "RANAE J06", \
        "o J06 esta neste navegador: a resposta tem de vir de la"
    assert casos["achaNoJ06"]["resposta"].startswith("Waiver granted for J06")
    assert casos["semJ04"] is None, "sem relatorio do J04 aqui, nao se inventa resposta"
    assert casos["numeroTorto"] is not None, '" ncr-002 " e "NCR-002" sao o mesmo item'
    assert casos["semNumero"] is None, "numero que nao existe no J06 nao acha nada"
    assert casos["eleMesmo"] is None, "o proprio item aberto nao e resposta de marco nenhum"
    assert casos["dev"] is not None, "a DEV procura no marco das DEVs"
    assert casos["pares"]["igual"] and casos["pares"]["dentro"], \
        '"RANAE J06" e "J06" sao o mesmo marco; "J01 & J03" alcanca o "J03"'
    assert not casos["pares"]["cert"] and not casos["pares"]["outro"], \
        "o card do certificado nao e o marco, e J06 nao e J08"

    # --- no item: so o card que tem resposta leva o ponto ------------------
    pg.select_option("#projectSelect", "p08"); pg.wait_for_timeout(800)
    assert pg.input_value("#marcoInput") == "RANAE J08"
    pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(600)
    todos = pg.locator(".fx-bloco .fx-card-txt").all_text_contents()
    marcados = pg.locator(".fx-bloco .fx-card.is-achado .fx-card-txt").all_text_contents()
    print("\ncards do item:", todos, "| com ponto:", marcados)
    assert todos == ["J04", "J06", "J08"]
    assert marcados == ["J06"], "so o J06 tem relatorio aqui com esta NCR"
    print("aviso no bloco:", pg.inner_text(".fx-bloco-sub"))
    assert "marco já respondeu" in pg.inner_text(".fx-bloco-sub"), \
        "o aviso e o que faz alguem descobrir o ponto"

    # --- passar o mouse mostra o Arch Answer daquele relatorio -------------
    pg.locator(".fx-bloco .fx-card.is-achado").first.hover(); pg.wait_for_timeout(500)
    balao = pg.inner_text(".fx-balao")
    print("\nbalao:\n  " + balao.replace("\n", "\n  "))
    assert pg.locator(".fx-balao").is_visible()
    assert "RANAE J06" in balao and "Maria" in balao
    assert "Waiver granted" in balao and "J08" in balao
    assert RESPOSTA[:60] in balao, "o Arch Answer de la e o que se quer ler"
    assert "NCR-001" in balao

    # tirar o mouse do card fecha o balao
    pg.mouse.move(10, 10); pg.wait_for_timeout(400)
    print("balao apos tirar o mouse:", pg.locator(".fx-balao").is_visible())
    assert not pg.locator(".fx-balao").is_visible()

    # --- item sem par no J06: nenhum ponto ---------------------------------
    pg.locator(".ncr-item", has_text="NCR-777").first.click(); pg.wait_for_timeout(600)
    print("\nNCR-777 — cards com ponto:",
          pg.locator(".fx-bloco .fx-card.is-achado").count(),
          "| aviso:", pg.inner_text(".fx-bloco-sub"))
    assert pg.locator(".fx-bloco .fx-card.is-achado").count() == 0, \
        "numero que nao esta no J06 nao pode ganhar ponto"

    # --- o pop-up: mesmo ponto, e o clique abre o item de la ---------------
    pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(500)
    pg.click("#fluxoAbrirBtn"); pg.wait_for_timeout(500)
    print("\ncaminho no pop-up:", pg.inner_text("#fluxoCaminho"))
    assert "com ponto" in pg.inner_text("#fluxoCaminho")
    pg.locator("#fluxoPalco .fx-card.is-achado").first.hover(); pg.wait_for_timeout(500)
    print("balao dentro do <dialog>:", pg.locator(".fx-balao").is_visible())
    assert pg.locator(".fx-balao").is_visible(), \
        "o pop-up e camada de cima: o balao tem de subir junto"
    pg.locator("#fluxoPalco .fx-card.is-achado").first.click(); pg.wait_for_timeout(1200)
    print("apos clicar — relatorio:", pg.input_value("#marcoInput"),
          "| item:", pg.input_value("#f-ncrId"))
    assert pg.input_value("#marcoInput") == "RANAE J06", "o clique leva ao relatorio do card"
    assert pg.input_value("#f-ncrId") == "NCR-001"
    assert RESPOSTA[:40] in pg.input_value("#f-archAnswer"), "abriu o item certo"
    assert not pg.locator(".fx-balao").is_visible(), "o balao nao fica para tras"

    # --- a aba Fluxos: o mesmo ponto, item por item ------------------------
    pg.select_option("#projectSelect", "p08"); pg.wait_for_timeout(800)
    pg.click('.tab[data-kind="fluxos"]'); pg.wait_for_timeout(800)
    marcados = pg.locator("#fluxosScroll .fx-card.is-achado .fx-card-txt").all_text_contents()
    print("\nna aba Fluxos, cards com ponto:", marcados)
    assert marcados == ["J06", "J06", "J06"], "NCR-001, NCR-002 e a DEV acham o J06"
    print("aviso da aba:", pg.inner_text(".fx-achou"))
    assert "com ponto" in pg.inner_text(".fx-achou")

    # --- o papel nao tem mouse: nem ponto, nem balao -----------------------
    pg.evaluate("() => { window.print = function () { window.__imprimiu = true; }; }")
    pg.locator(".sm-bar-actions .btn", has_text="Fluxos em PDF").click()
    pg.wait_for_timeout(1000)
    impresso = pg.evaluate("""() => ({
      cards: document.querySelectorAll('#printRoot .fx-card').length,
      pontos: document.querySelectorAll('#printRoot .fx-card-marca').length,
      achados: document.querySelectorAll('#printRoot .fx-card.is-achado').length,
      folhas: document.querySelectorAll('#printRoot .rep-page').length
    })""")
    print("\nno papel:", impresso)
    assert impresso["cards"] >= 4 and impresso["pontos"] == 0 and impresso["achados"] == 0, \
        "marca sem balao, no papel, seria pergunta sem resposta"
    pg.pdf(path=str(SP / "fluxos-anteriores.pdf"), print_background=True, prefer_css_page_size=True)

    # --- ler nao escreve: o relatorio de origem fica como estava -----------
    origem = pg.evaluate("""async () => {
      const ps = await Store.list();
      const p = ps.filter(x => x.id === 'p06')[0];
      const n = p.ncrs.filter(x => x.ncrId === 'NCR-001')[0];
      return { archAnswer: n.archAnswer, archStatus: n.archStatus,
               historic: n.historic, quem: n.editedBy, quando: n.editedAt };
    }""")
    print("\nrelatorio de origem depois de tudo:", json.dumps(origem, ensure_ascii=False)[:120])
    assert origem["archAnswer"] == RESPOSTA and origem["archStatus"] == "Waiver granted"
    assert origem["historic"] == "" and origem["quem"] == "Maria", \
        "o fluxo le o outro relatorio; nao escreve nele"
    b.close()

doc = pdfium.PdfDocument(str(SP / "fluxos-anteriores.pdf"))
print("paginas no PDF:", len(doc), "| folhas na tela:", impresso["folhas"])
assert len(doc) == impresso["folhas"]
texto = ""
for i in range(len(doc)):
    texto += doc[i].get_textpage().get_text_range()
assert "J06" in texto and "J08" in texto, "os cards continuam saindo impressos"
assert RESPOSTA[:30] not in texto, "o balao e da tela: nada dele vai para o papel"
print("papel conferido: cards sim, balao nao")

print("\nERRORS:", json.dumps(errs, indent=1) if errs else "none")
