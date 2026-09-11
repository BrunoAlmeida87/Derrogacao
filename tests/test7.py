import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL=SP/"dl2"; DL.mkdir(exist_ok=True)
errs=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    ctx=b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)

    def item(num, sysn, done=False):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems",sysn)
        pg.fill("#f-func","FV 01 - Sea water circuit integrity")
        pg.fill("#f-description","desc "+num); pg.fill("#f-currentSituation","sit")
        pg.fill("#f-whyNotPossible","why"); pg.fill("#f-arguments","args")
        pg.fill("#f-requestExpiry","PÓS TRAP"); pg.fill("#f-archStatus","WAIVER ACCEPTED")
        if done:
            pg.locator(".status-op", has_text="Waiver accepted").click(); pg.wait_for_timeout(500)

    # ---- barra superior enxuta + menu ----
    print("botoes visiveis:", [x.inner_text().strip() for x in pg.locator(".topbar-actions > .btn, .menu > .btn").all()])
    print("Duplicar removido:", pg.locator("#dupNcrBtn").count()==0)
    print("menu fechado:", pg.locator("#menuPop").is_hidden())
    pg.click("#menuBtn"); pg.wait_for_timeout(250)
    print("itens do menu:", [x.inner_text().split(chr(10))[0].strip() for x in pg.locator(".menu-item").all()])
    pg.click("#menuBtn"); pg.wait_for_timeout(200)

    # ---- lembrete de backup (sem backup nunca feito) ----
    pg.fill("#marcoInput","RANAE J06")
    item("NCR-001","RM", done=True)
    item("NCR-002","ME")
    item("NCR-003","BQ")
    pg.wait_for_timeout(800)
    print("\nlembrete visivel:", pg.locator("#backupNotice").is_visible())
    print("texto:", pg.inner_text("#backupNoticeText")[:70])

    # ---- progresso e filtro de pendentes ----
    print("\nprogresso:", pg.inner_text("#progressText"), "| itens:", pg.locator(".ncr-item").count())
    pg.check("#pendingOnly"); pg.wait_for_timeout(300)
    print("so pendentes:", pg.locator(".ncr-item").count(),
          "| ids:", pg.locator(".ncr-item-id").all_inner_texts())
    pg.uncheck("#pendingOnly"); pg.wait_for_timeout(300)

    # ---- sugestoes ----
    pg.locator(".ncr-item").nth(2).click(); pg.wait_for_timeout(400)
    print("\nsugestoes archStatus:", pg.eval_on_selector("#dl-ncr-archStatus","d=>[...d.options].map(o=>o.value)"))
    print("sugestoes systems:", pg.eval_on_selector("#dl-ncr-systems","d=>[...d.options].map(o=>o.value)"))
    print("campo ligado a datalist:", pg.get_attribute("#f-archStatus","list"))

    # ---- secoes recolhiveis ----
    print("\nsecoes:", pg.locator(".sec").count(), "| abertas:",
          sum(1 for d in pg.locator(".sec").all() if d.get_attribute("open") is not None))
    print("resumo 1:", pg.locator(".sec summary").first.inner_text().replace(chr(10)," "))
    pg.click("text=Recolher preenchidos"); pg.wait_for_timeout(400)
    print("apos recolher, abertas:", sum(1 for d in pg.locator(".sec").all() if d.get_attribute("open") is not None))
    print("preview do 1o bloco:", pg.locator(".sec-peek").first.inner_text())

    # ---- nome exigido no backup ----
    pg.click("#menuBtn"); pg.wait_for_timeout(200); pg.click("#backupAllBtn"); pg.wait_for_timeout(400)
    print("\ndialogo de nome abriu:", pg.locator("#userDialog").is_visible())
    pg.fill("#userNameInput","Bruno Almeida"); pg.click("#userSaveBtn"); pg.wait_for_timeout(900)
    # o backup segue no mesmo clique e o lembrete da pasta aparece
    print("backup seguiu sozinho:", pg.locator("#backupDoneDialog").is_visible())
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)
    print("rotulo do menu:", pg.locator("#userBtnLabel").inner_text())
    print("atribuicao:", pg.inner_text("#editedBy"))

    # ---- backup registra autor ----
    pg.click("#menuBtn"); pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click("#backupAllBtn")
    d=dl.value; path=DL/d.suggested_filename; d.save_as(str(path)); pg.wait_for_timeout(900)
    print("lembrete da pasta:", pg.locator("#backupDoneDialog").is_visible(),
          "|", pg.inner_text("#backupDoneFile")[:40])
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)
    data=json.loads(path.read_text())
    print("\nbackup por:", data.get("exportedBy"), "| arquivo:", d.suggested_filename)
    print("projeto marcado:", data["projects"][0]["lastBackupBy"], "/", data["projects"][0]["lastEditedBy"])
    print("lembrete sumiu:", pg.locator("#backupNotice").is_hidden())
    print("atribuicao agora:", pg.inner_text("#editedBy"))
    pg.screenshot(path=str(SP/"ui-final.png"))

    # ---- restauracao mostra a origem ----
    ctx2=b.new_context(viewport={"width":1400,"height":900}, accept_downloads=True)
    pg2=ctx2.new_page(); pg2.on("pageerror",lambda e:errs.append("p2:"+str(e)))
    msgs=[]
    pg2.on("dialog",lambda d:(msgs.append(d.message), d.accept()))
    pg2.goto("file:///home/user/Derrogacao/index.html"); pg2.wait_for_timeout(700)
    pg2.set_input_files("#restoreInput",str(path)); pg2.wait_for_timeout(1400)
    print("\n[nav 2] toast:", pg2.inner_text("#toast"))
    print("[nav 2] atribuicao:", pg2.inner_text("#editedBy"))
    b.close()
print("\nERRORS:", errs if errs else "none")
