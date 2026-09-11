# Marco igual criado por duas pessoas: tem de mesclar, nao duplicar o relatorio.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl9"; DL.mkdir(exist_ok=True)
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

def item(pg, num, func, desc, status=None):
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId", num); pg.fill("#f-systems", "RM"); pg.fill("#f-func", func)
    pg.fill("#f-description", desc)
    if status:
        pg.locator(".status-op", has_text=status).click(); pg.wait_for_timeout(600)
    pg.wait_for_timeout(300)

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)

    # --- Bruno: cria o marco no navegador dele ---
    c1 = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    bruno = prep(c1, "Bruno")
    bruno.fill("#marcoInput", "RANAE J06"); bruno.wait_for_timeout(300)
    item(bruno, "NCR-001", "FV 01 - Sea water", "versao do Bruno", "Waiver accepted")
    item(bruno, "NCR-002", "FV 05 - Propel", "so o Bruno tem esta")
    bruno.wait_for_timeout(700)

    # --- Maria: cria O MESMO marco, do zero, no navegador dela ---
    c2 = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
    maria = prep(c2, "Maria")
    maria.fill("#marcoInput", "ranae j06")     # mesmo marco, digitado diferente
    maria.wait_for_timeout(300)
    item(maria, "NCR-001", "FV 01 - Sea water", "versao da MARIA, diferente")
    item(maria, "NCR-003", "FV 12 - Watertight", "so a Maria tem esta")
    maria.wait_for_timeout(700)

    maria.click("#menuBtn"); maria.wait_for_timeout(250)
    with maria.expect_download() as dl:
        maria.click("#backupAllBtn")
    arq = DL/dl.value.suggested_filename; dl.value.save_as(str(arq))
    maria.click("#backupDoneBtn"); maria.wait_for_timeout(300)
    print("arquivo da Maria:", dl.value.suggested_filename)

    # --- Bruno importa o arquivo da Maria ---
    print("\nrelatorios do Bruno antes:", bruno.locator("#projectSelect option").count())
    bruno.set_input_files("#restoreInput", str(arq)); bruno.wait_for_timeout(1600)

    print("abriu a mesclagem:", bruno.locator("#mergeDialog").is_visible())
    assert bruno.locator("#mergeDialog").is_visible(), "deveria mesclar, nao importar direto"
    print("relatorios do Bruno agora:", bruno.locator("#projectSelect option").count(), "(deve continuar 1)")
    assert bruno.locator("#projectSelect option").count() == 1

    print("aviso de pareamento:", bruno.inner_text("#mergeMatch")[:80])
    grupos = bruno.locator(".mg-group-head strong").all_inner_texts()
    print("grupos:", grupos)
    for g in bruno.locator(".mg-group").all():
        titulo = g.locator(".mg-group-head strong").inner_text()
        print("   ", titulo, "->", g.locator(".mg-label").all_inner_texts())
    print("etiqueta 'mesmo numero':", bruno.locator(".mg-tag").all_inner_texts())

    assert any("Novos (1)" in g for g in grupos), grupos
    assert any("escolha (1)" in g for g in grupos), grupos
    assert not any("Excluídos" in g for g in grupos), "nao pode propor exclusao no 1o encontro"

    # NCR-001 em conflito, padrao "manter a minha"; aceita a nova NCR-003
    bruno.click("#mergeApplyBtn"); bruno.wait_for_timeout(1600)
    ids = bruno.locator(".ncr-item-id").all_inner_texts()
    print("\nNCRs do Bruno apos mesclar:", ids)
    assert ids == ["NCR-001", "NCR-002", "NCR-003"], ids
    bruno.locator(".ncr-item").first.click(); bruno.wait_for_timeout(500)
    print("NCR-001 ficou com a versao:", bruno.input_value("#f-description"))
    assert bruno.input_value("#f-description") == "versao do Bruno"
    print("relatorios no seletor:", bruno.locator("#projectSelect option").count())
    assert bruno.locator("#projectSelect option").count() == 1

    # --- marco diferente entra direto, sem perguntar ---
    maria.fill("#marcoInput", "RANAE J07"); maria.wait_for_timeout(800)
    maria.click("#menuBtn"); maria.wait_for_timeout(250)
    with maria.expect_download() as dl2:
        maria.click("#backupAllBtn")
    arq2 = DL/("j07_" + dl2.value.suggested_filename); dl2.value.save_as(str(arq2))
    maria.click("#backupDoneBtn"); maria.wait_for_timeout(300)
    bruno.set_input_files("#restoreInput", str(arq2)); bruno.wait_for_timeout(1600)
    print("\nmarco diferente — mesclagem aberta:", bruno.locator("#mergeDialog").is_visible(),
          "| relatorios:", bruno.locator("#projectSelect option").count())
    assert not bruno.locator("#mergeDialog").is_visible()
    assert bruno.locator("#projectSelect option").count() == 2

    # --- juntar dois relatorios repetidos que ja estavam aqui ---
    bruno.click("#newProjectTopBtn"); bruno.wait_for_timeout(900)   # cria "RANAE J06" repetido
    bruno.fill("#marcoInput", "RANAE J06"); bruno.wait_for_timeout(900)
    item(bruno, "NCR-009", "FV 20 - Teste", "item preso no repetido")
    bruno.wait_for_timeout(800)
    bruno.click("#menuBtn"); bruno.wait_for_timeout(300)
    print("\nmenu oferece juntar:", bruno.locator("#mergeLocalBtn").is_visible(),
          "|", bruno.inner_text("#mergeLocalWho"))
    assert bruno.locator("#mergeLocalBtn").is_visible()
    bruno.click("#mergeLocalBtn"); bruno.wait_for_timeout(900)
    print("mesclagem local:", bruno.locator(".mg-label").all_inner_texts())
    bruno.click("#mergeApplyBtn"); bruno.wait_for_timeout(1600)
    print("apos juntar:", bruno.locator(".ncr-item-id").all_inner_texts())
    b.close()
print("\nERRORS:", errs if errs else "none")
