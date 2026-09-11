# A comparacao acontece DENTRO do marco: a mesma NCR em marcos diferentes e
# outro item. E um "backup de tudo" com varios marcos repetidos abre uma tela
# para cada um, em fila.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl10"; DL.mkdir(exist_ok=True)
URL = "file:///home/user/Derrogacao/index.html"
errs = []

def prep(ctx, nome):
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(nome + ": " + str(e)))
    pg.on("console", lambda m: errs.append(nome + ": " + m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(600)
    pg.evaluate("(n)=>localStorage.setItem('derrogacao:user',n)", nome)
    pg.reload(); pg.wait_for_timeout(700)
    return pg

def item(pg, num, desc):
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId", num); pg.fill("#f-systems", "RM")
    pg.fill("#f-func", "FV 01 - Sea water"); pg.fill("#f-description", desc)
    pg.wait_for_timeout(350)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)

    # --- Bruno: dois marcos, a MESMA NCR-001 em cada um, com textos diferentes
    c1 = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    bruno = prep(c1, "Bruno")
    bruno.fill("#marcoInput", "RANAE J06"); bruno.wait_for_timeout(300)
    item(bruno, "NCR-001", "J06 pelo Bruno")
    bruno.click("#newProjectTopBtn"); bruno.wait_for_timeout(900)
    bruno.fill("#marcoInput", "RANAE J07"); bruno.wait_for_timeout(400)
    item(bruno, "NCR-001", "J07 pelo Bruno")
    bruno.wait_for_timeout(700)

    # --- Maria: os mesmos dois marcos, do zero, com a mesma NCR-001 ---
    c2 = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    maria = prep(c2, "Maria")
    maria.fill("#marcoInput", "RANAE J06"); maria.wait_for_timeout(300)
    item(maria, "NCR-001", "J06 pela MARIA")
    item(maria, "NCR-050", "so no J06 da Maria")
    maria.click("#newProjectTopBtn"); maria.wait_for_timeout(900)
    maria.fill("#marcoInput", "RANAE J07"); maria.wait_for_timeout(400)
    item(maria, "NCR-001", "J07 pela MARIA")
    maria.wait_for_timeout(700)
    maria.click("#menuBtn"); maria.wait_for_timeout(250)
    with maria.expect_download() as dl:
        maria.click("#backupAllBtn")
    arq = DL/dl.value.suggested_filename; dl.value.save_as(str(arq))
    maria.click("#backupDoneBtn"); maria.wait_for_timeout(300)
    print("backup de tudo da Maria:", dl.value.suggested_filename)

    # --- Bruno importa: dois marcos repetidos, uma tela para cada ---
    bruno.set_input_files("#restoreInput", str(arq)); bruno.wait_for_timeout(1800)
    print("\nrelatorios do Bruno:", bruno.locator("#projectSelect option").count(), "(deve continuar 2)")
    assert bruno.locator("#projectSelect option").count() == 2

    def tela():
        marco = bruno.input_value("#marcoInput")
        fila = bruno.inner_text(".mg-fila") if bruno.locator(".mg-fila").count() else "(ultimo)"
        grupos = {}
        for g in bruno.locator(".mg-group").all():
            grupos[g.locator(".mg-group-head strong").inner_text()] = g.locator(".mg-label").all_inner_texts()
        return marco, fila, grupos

    m1, f1, g1 = tela()
    print("\n1a tela — marco:", m1)
    print("   fila:", f1[:60])
    print("   grupos:", g1)
    assert bruno.locator("#mergeDialog").is_visible()

    bruno.click("#mergeApplyBtn"); bruno.wait_for_timeout(1600)
    print("\n2a tela abriu sozinha:", bruno.locator("#mergeDialog").is_visible())
    assert bruno.locator("#mergeDialog").is_visible(), "o 2o marco deveria abrir em seguida"
    m2, f2, g2 = tela()
    print("2a tela — marco:", m2)
    print("   grupos:", g2)
    assert m1 != m2, "as duas telas tem de ser de marcos diferentes"
    bruno.click("#mergeApplyBtn"); bruno.wait_for_timeout(1600)
    print("\nfila terminou:", bruno.locator("#mergeDialog").is_hidden())

    # --- cada marco manteve a SUA NCR-001, sem contaminar o outro ---
    def descricao(marco):
        bruno.select_option("#projectSelect",
            label=[o for o in bruno.locator("#projectSelect option").all_inner_texts() if marco in o][0])
        bruno.wait_for_timeout(900)
        bruno.locator(".ncr-item", has_text="NCR-001").first.click(); bruno.wait_for_timeout(500)
        return bruno.input_value("#f-description"), bruno.locator(".ncr-item-id").all_inner_texts()

    d06, itens06 = descricao("RANAE J06")
    d07, itens07 = descricao("RANAE J07")
    print("\nJ06 -> NCR-001:", repr(d06), "| itens:", itens06)
    print("J07 -> NCR-001:", repr(d07), "| itens:", itens07)
    assert d06 == "J06 pelo Bruno", d06
    assert d07 == "J07 pelo Bruno", d07
    assert "NCR-050" in itens06 and "NCR-050" not in itens07, (itens06, itens07)

    # --- relatorio sem marco nao casa com outro sem marco ---
    bruno.click("#newProjectTopBtn"); bruno.wait_for_timeout(900)   # marco vazio
    item(bruno, "NCR-900", "sem marco, do Bruno")
    bruno.wait_for_timeout(600)
    antes = bruno.locator("#projectSelect option").count()
    maria2 = prep(b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True), "Maria2")
    item(maria2, "NCR-901", "sem marco, da Maria")   # tambem sem marco
    maria2.wait_for_timeout(600)
    maria2.click("#menuBtn"); maria2.wait_for_timeout(250)
    with maria2.expect_download() as dl3:
        maria2.click("#backupAllBtn")
    arq3 = DL/("semmarco_" + dl3.value.suggested_filename); dl3.value.save_as(str(arq3))
    maria2.click("#backupDoneBtn"); maria2.wait_for_timeout(300)
    bruno.set_input_files("#restoreInput", str(arq3)); bruno.wait_for_timeout(1600)
    print("\nsem marco — mesclagem aberta:", bruno.locator("#mergeDialog").is_visible(),
          "| relatorios:", antes, "->", bruno.locator("#projectSelect option").count())
    assert not bruno.locator("#mergeDialog").is_visible(), "sem marco nao identifica relatorio"
    assert bruno.locator("#projectSelect option").count() == antes + 1
    b.close()
print("\nERRORS:", errs if errs else "none")
