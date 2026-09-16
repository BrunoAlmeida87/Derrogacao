# O item preso ao lado: escolher pelo diálogo ou com Shift no card do fluxo,
# ler em só leitura enquanto se escreve do outro lado, copiar um bloco, abrir
# o item de lá, fechar. E o que ele NÃO faz: escrever no item de origem,
# aparecer nas abas de tela cheia ou ir para o papel.
import json, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

RESP = ("Waiver granted for J06 under the condition that the leak test is repeated "
        "before J08. The compensator is to be replaced during the next docking.")

j06 = {
  "id": "p06", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [{"id": "a1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
            "description": "Leak found at the sea water circuit flange.",
            "currentSituation": "Flange replaced by a temporary one.",
            "whyNotPossible": "The spare part is not available before J08.",
            "arguments": "The temporary flange was tested at 1.5x working pressure.",
            "archAnswer": RESP, "archStatus": "Waiver granted", "approvedExpiry": "J08",
            "requestExpiry": "J08", "historic": "J04 To: J06",
            "certificates": ["CERT-2026-113"],
            "editedBy": "Maria", "editedAt": "2026-03-02T10:00:00Z",
            "status": "aceito", "done": True,
            "evidence": [{"id": "e1", "ref": "Photo of the flange",
                          "note": "after the repair", "images": []}]}],
  "devs": [], "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-03-02T10:00:00Z"
}
j08 = {
  "id": "p08", "schema": 1, "name": "RANAE J08", "marco": "RANAE J08",
  "ncrs": [{"id": "b1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
            "historic": "J06 To: J08", "evidence": []},
           {"id": "b2", "ncrId": "NCR-050", "historic": "", "evidence": []}],
  "devs": [], "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-04-02T10:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1600, "height": 1000})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("async ps => { for (const p of ps) await Store.save(p); }", [j06, j08])
    pg.reload(); pg.wait_for_timeout(1200)
    pg.select_option("#projectSelect", "p08"); pg.wait_for_timeout(800)
    pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(600)

    print("coluna escondida de saida:", pg.locator("#ladoPane").is_hidden())
    assert pg.locator("#ladoPane").is_hidden(), "sem escolher nada, a coluna nao existe"

    # --- Shift no card do fluxo prende sem trocar de tela ------------------
    pg.locator(".fx-bloco .fx-card.is-achado").first.click(modifiers=["Shift"])
    pg.wait_for_timeout(900)
    print("coluna:", pg.locator("#ladoPane").is_visible(),
          "|", pg.inner_text("#ladoTitulo"), "|", pg.inner_text("#ladoOnde"))
    assert pg.locator("#ladoPane").is_visible()
    assert pg.inner_text("#ladoTitulo") == "NCR-001"
    assert "RANAE J06" in pg.inner_text("#ladoOnde")
    print("editor continua onde estava:", pg.input_value("#marcoInput"),
          "|", pg.input_value("#f-ncrId"))
    assert pg.input_value("#marcoInput") == "RANAE J08", \
        "prender ao lado nao pode trocar o relatorio aberto — a diferenca para o clique simples"

    # --- o conteudo de la, inteiro e em so leitura -------------------------
    blocos = pg.locator("#ladoBody .lado-sec-nome").all_text_contents()
    print("blocos:", blocos)
    assert blocos[:5] == ["Description", "Current Situation",
                          "Why is not possible to treat the deviation",
                          "What are the arguments for the derrogation", "Arch Answer"], \
        "as cinco secoes saem na ordem do relatorio"
    assert "Status do waiver" in blocos and "Evidências" in blocos
    corpo = pg.inner_text("#ladoBody")
    assert RESP[:50] in corpo and "Waiver granted" in corpo
    assert "CERT-2026-113" in corpo and "Photo of the flange" in corpo
    assert "Waiver accepted" in corpo and "Maria" in corpo, "situacao e autoria de la"
    print("campos editaveis dentro da coluna:",
          pg.locator("#ladoPane input, #ladoPane textarea, #ladoPane select").count())
    assert pg.locator("#ladoPane input, #ladoPane textarea, #ladoPane select").count() == 0, \
        "a coluna nao tem um campo sequer: e o que garante que nada e escrito la"
    assert pg.locator("#ladoBody .fx-card").count() == 2, "o fluxo de la tambem aparece"
    print("aviso a vista:", pg.inner_text(".lado-aviso").replace("\n", " ")[:60])
    assert "Só leitura" in pg.inner_text(".lado-aviso")

    # --- escrever deste lado com o outro a vista ---------------------------
    pg.fill("#f-description", "Same flange, still leaking at J08.")
    pg.wait_for_timeout(1200)
    depois = pg.evaluate("""async () => {
      const ps = await Store.list();
      const a = ps.filter(p => p.id === 'p06')[0].ncrs[0];
      const b = ps.filter(p => p.id === 'p08')[0].ncrs.filter(n => n.id === 'b1')[0];
      return { origem: a.description, aqui: b.description, respostaLa: a.archAnswer };
    }""")
    print("depois de escrever aqui:", json.dumps(depois, ensure_ascii=False)[:150])
    assert depois["aqui"] == "Same flange, still leaking at J08.", "o texto foi para o item aberto"
    assert depois["origem"] == "Leak found at the sea water circuit flange.", \
        "o item preso ao lado nao pode receber uma letra do que se escreve aqui"
    assert depois["respostaLa"] == RESP
    assert RESP[:40] in pg.inner_text("#ladoBody"), "a coluna continua mostrando o de la"

    # --- copiar um bloco ---------------------------------------------------
    pg.locator("#ladoBody .lado-sec", has_text="Arch Answer").first.locator(".lado-copiar").click()
    pg.wait_for_timeout(600)
    print("aviso da copia:", pg.inner_text("#toast"))
    assert "copiado" in pg.inner_text("#toast")

    # --- abas de tela cheia nao tem editor: a coluna some e volta ----------
    pg.click('.tab[data-kind="resumo"]'); pg.wait_for_timeout(700)
    print("na aba Resumo, coluna escondida:", pg.locator("#ladoPane").is_hidden())
    assert pg.locator("#ladoPane").is_hidden()
    pg.click('.tab[data-kind="ncr"]'); pg.wait_for_timeout(600)
    assert pg.locator("#ladoPane").is_visible(), "voltando para a NCR, a coluna volta"

    # --- sobrevive ao recarregar (a escolha e deste navegador) -------------
    pg.reload(); pg.wait_for_timeout(1600)
    print("apos recarregar:", pg.locator("#ladoPane").is_visible(),
          "|", pg.inner_text("#ladoTitulo"), "|", pg.inner_text("#ladoOnde"))
    assert pg.locator("#ladoPane").is_visible() and "RANAE J06" in pg.inner_text("#ladoOnde")

    # --- trocar pelo diálogo ----------------------------------------------
    pg.click("#ladoTrocarBtn"); pg.wait_for_timeout(600)
    opcoes = pg.locator(".lado-op strong").all_text_contents()
    print("itens oferecidos:", opcoes)
    assert len(opcoes) == 3, "os dois relatorios inteiros entram na lista"
    pg.fill('#ladoEscolhaBody input[type="search"]', "NCR-050"); pg.wait_for_timeout(400)
    print("apos buscar:", pg.locator(".lado-op strong").all_text_contents())
    assert pg.locator(".lado-op strong").all_text_contents() == ["NCR · NCR-050"]
    pg.locator(".lado-op").first.click(); pg.wait_for_timeout(700)
    print("agora ao lado:", pg.inner_text("#ladoTitulo"), "|", pg.inner_text("#ladoOnde"))
    assert pg.inner_text("#ladoTitulo") == "NCR-050"
    assert "é o item aberto" not in pg.inner_text("#ladoOnde")

    # --- "abrir" troca de relatorio; "fechar" nao apaga nada --------------
    pg.click("#ladoTrocarBtn"); pg.wait_for_timeout(500)
    pg.fill('#ladoEscolhaBody input[type="search"]', "RANAE J06"); pg.wait_for_timeout(400)
    pg.locator(".lado-op").first.click(); pg.wait_for_timeout(700)
    pg.click("#ladoAbrirBtn"); pg.wait_for_timeout(1300)
    print("apos 'abrir':", pg.input_value("#marcoInput"), "|", pg.input_value("#f-ncrId"),
          "| ao lado:", pg.inner_text("#ladoOnde"))
    assert pg.input_value("#marcoInput") == "RANAE J06"
    assert "é o item aberto à esquerda" in pg.inner_text("#ladoOnde"), \
        "abrindo o que estava ao lado, a coluna diz que e o mesmo item"

    pg.click("#ladoFecharBtn"); pg.wait_for_timeout(600)
    print("fechada:", pg.locator("#ladoPane").is_hidden())
    assert pg.locator("#ladoPane").is_hidden()
    guardado = pg.evaluate("""async () => {
      const a = (await Store.list()).filter(p => p.id === 'p06')[0].ncrs[0];
      return [a.archAnswer.slice(0, 20), a.certificates.length, a.evidence.length];
    }""")
    print("o item de origem, intacto:", guardado)
    assert guardado == ["Waiver granted for J", 1, 1]

    # --- o papel nao tem coluna ao lado ------------------------------------
    pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(500)
    # com a coluna fechada, quem reabre e o botao do proprio editor
    botao = pg.locator("#editorScroll .card h3 button", has_text="ao lado").first
    print("botao no editor:", botao.inner_text())
    botao.click(); pg.wait_for_timeout(600)
    pg.locator(".lado-op").first.click(); pg.wait_for_timeout(700)
    assert pg.locator("#ladoPane").is_visible(), "o botao do editor reabre a coluna"
    pg.evaluate("() => { window.print = function () { window.__imprimiu = true; }; }")
    pg.click("#pdfBtn"); pg.wait_for_timeout(1200)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(1500)
    pg.emulate_media(media="print")
    escondida = pg.evaluate("""() => ({
      noPrintRoot: document.querySelectorAll('#printRoot .lado-sec').length,
      display: getComputedStyle(document.getElementById('ladoPane')).display,
      blocos: document.querySelectorAll('#ladoBody .lado-sec').length
    })""")
    print("no papel:", escondida, "| imprimiu:", pg.evaluate("()=>window.__imprimiu === true"))
    assert escondida["blocos"] > 0, "a coluna continua montada — o que muda e so a impressao"
    assert escondida["noPrintRoot"] == 0, "a coluna nao entra nas folhas do relatorio"
    assert escondida["display"] == "none", "e nao sai no papel"
    pg.emulate_media(media="screen")
    b.close()

print("\nERRORS:", json.dumps(errs, indent=1) if errs else "none")
