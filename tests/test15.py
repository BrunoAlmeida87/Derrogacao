# Primeiro backup: um clique so. O nome e pedido e o arquivo sai em seguida.
import json, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl8"; DL.mkdir(exist_ok=True)
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(250)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId", "NCR-001"); pg.fill("#f-func", "FV 01 - Teste"); pg.wait_for_timeout(800)

    # --- 1o backup: sem nome definido ---
    print("nome definido:", repr(pg.evaluate("()=>localStorage.getItem('derrogacao:user')")))
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    pg.click("#backupAllBtn"); pg.wait_for_timeout(500)
    print("pediu o nome:", pg.locator("#userDialog").is_visible())
    assert pg.locator("#userDialog").is_visible()

    pg.fill("#userNameInput", "Bruno Almeida")
    with pg.expect_download(timeout=8000) as dl:      # sem segundo clique no backup
        pg.click("#userSaveBtn")
    d = dl.value
    p1 = DL/d.suggested_filename; d.save_as(str(p1))
    print("arquivo saiu no mesmo clique:", d.suggested_filename)

    # lembrete da pasta de backup
    print("lembrete abriu:", pg.locator("#backupDoneDialog").is_visible())
    assert pg.locator("#backupDoneDialog").is_visible()
    print("   diz o arquivo:", pg.inner_text("#backupDoneFile"))
    print("   copiar caminho desabilitado sem pasta:", pg.locator("#backupCopyPathBtn").is_disabled())
    assert pg.locator("#backupCopyPathBtn").is_disabled()
    pg.fill("#backupFolderInput", r"\\servidor\SBR3\Backups"); pg.wait_for_timeout(300)
    print("   com pasta, botao habilita:", not pg.locator("#backupCopyPathBtn").is_disabled())
    assert not pg.locator("#backupCopyPathBtn").is_disabled()
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)
    dados = json.loads(p1.read_text())
    print("gerado por:", dados.get("exportedBy"))
    assert dados.get("exportedBy") == "Bruno Almeida"
    print("dialogo fechou:", pg.locator("#userDialog").is_hidden())

    # --- 2o backup: nome ja definido, direto ---
    pg.wait_for_timeout(600)
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    with pg.expect_download(timeout=8000) as dl2:
        pg.click("#backupAllBtn")
    print("2o backup direto:", dl2.value.suggested_filename)
    print("pasta lembrada no 2o backup:", pg.input_value("#backupFolderInput"))
    assert pg.input_value("#backupFolderInput") == r"\\servidor\SBR3\Backups"
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)

    # --- desistir nao dispara backup depois ---
    pg.evaluate("()=>localStorage.removeItem('derrogacao:user')")
    pg.reload(); pg.wait_for_timeout(900)
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    pg.click("#backupAllBtn"); pg.wait_for_timeout(400)
    pg.click("#userCancelBtn"); pg.wait_for_timeout(600)
    print("lembrete nao abriu apos desistir:", pg.locator("#backupDoneDialog").is_hidden())
    baixados = []
    pg.on("download", lambda d: baixados.append(d.suggested_filename))
    # abrir de novo pelo rodape do menu e salvar: nao deve gerar arquivo
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    pg.click("#userBtn"); pg.wait_for_timeout(300)
    pg.fill("#userNameInput", "Maria"); pg.click("#userSaveBtn"); pg.wait_for_timeout(1200)
    print("\napos desistir e so registrar o nome, downloads:", baixados, "(deve ser [])")
    assert baixados == []
    b.close()
print("\nERRORS:", errs if errs else "none")
