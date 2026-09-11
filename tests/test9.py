import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL=SP/"dl4"; DL.mkdir(exist_ok=True)
errs=[]
def mk(b,name):
    ctx=b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(f"{name}: {e}"))
    pg.on("console",lambda m:errs.append(f"{name}: {m.text}") if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate(f"()=>localStorage.setItem('derrogacao:user','{name}')")
    pg.reload(); pg.wait_for_timeout(700)
    return pg
def menu(pg,sel):
    pg.click("#menuBtn"); pg.wait_for_timeout(200); pg.click(sel); pg.wait_for_timeout(400)
def baixar(pg):
    pg.click("#menuBtn"); pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click("#backupAllBtn")
    d=dl.value; p=DL/d.suggested_filename; d.save_as(str(p)); pg.wait_for_timeout(800)
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)
    return p

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)

    # ===== Bruno cria a base e grava na pasta compartilhada =====
    bruno=mk(b,"Bruno")
    bruno.fill("#marcoInput","RANAE J06")
    for num in ("NCR-001","NCR-002","NCR-003"):
        bruno.click("#addNcrBtn"); bruno.wait_for_timeout(250)
        bruno.fill("#f-ncrId",num); bruno.fill("#f-systems","RM")
        bruno.fill("#f-func","FV 01 - Teste"); bruno.fill("#f-description","base do Bruno")
    bruno.wait_for_timeout(800)
    base=baixar(bruno)
    print("base gravada:", base.name)

    # ===== Maria pega a base =====
    maria=mk(b,"Maria")
    maria.set_input_files("#restoreInput",str(base)); maria.wait_for_timeout(1500)
    print("[Maria] importou sem perguntar (relatorio novo aqui):",
          maria.locator("#mergeDialog").is_hidden(), "| ncrs:", maria.locator(".ncr-item").count())

    # ===== os dois editam ao mesmo tempo =====
    # Maria: edita a 002 e cria a 004
    maria.locator(".ncr-item").nth(1).click(); maria.wait_for_timeout(400)
    maria.fill("#f-currentSituation","situacao escrita pela Maria")
    maria.click("#addNcrBtn"); maria.wait_for_timeout(250)
    maria.fill("#f-ncrId","NCR-004"); maria.fill("#f-systems","DJ")
    maria.fill("#f-func","FV 10 - Nova da Maria")
    # Maria tambem mexe na 001 -> vai conflitar
    maria.locator(".ncr-item").nth(0).click(); maria.wait_for_timeout(400)
    maria.fill("#f-archAnswer","parecer da Maria")
    maria.wait_for_timeout(900)
    arquivoMaria=baixar(maria)

    # Bruno: mexe na 001 (conflito) e na 003 (so ele)
    bruno.locator(".ncr-item").nth(0).click(); bruno.wait_for_timeout(400)
    bruno.fill("#f-archAnswer","parecer do Bruno")
    bruno.locator(".ncr-item").nth(2).click(); bruno.wait_for_timeout(400)
    bruno.fill("#f-whyNotPossible","motivo do Bruno")
    bruno.wait_for_timeout(900)

    # ===== Bruno recebe o arquivo da Maria =====
    bruno.set_input_files("#restoreInput",str(arquivoMaria)); bruno.wait_for_timeout(1600)
    print("\n[Bruno] tela de mesclagem abriu:", bruno.locator("#mergeDialog").is_visible())
    print("[Bruno] origem:", bruno.inner_text("#mergeOrigin"))
    for g in bruno.locator(".mg-group").all():
        head=g.locator(".mg-group-head strong").inner_text()
        itens=[r.locator(".mg-label").inner_text() for r in g.locator(".mg-row").all()]
        print("   ", head, "->", itens)
    bruno.screenshot(path=str(SP/"ui-merge.png"))

    # conflito: Bruno escolhe manter a dele (padrao) -> confere o padrao
    print("[Bruno] conflitos com padrao 'manter a minha':",
          bruno.eval_on_selector_all(".mg-conf", "rs=>rs.filter(r=>r.checked).map(r=>r.value)"))
    bruno.click("#mergeApplyBtn"); bruno.wait_for_timeout(1500)
    print("[Bruno] toast:", bruno.inner_text("#toast"))

    # ===== o que sobrou =====
    print("\n[Bruno] ncrs apos mesclar:", bruno.locator(".ncr-item-id").all_inner_texts())
    bruno.locator(".ncr-item").nth(0).click(); bruno.wait_for_timeout(400)
    print("[Bruno] NCR-001 arch answer (deve ser DELE):", bruno.input_value("#f-archAnswer"))
    bruno.locator(".ncr-item").nth(1).click(); bruno.wait_for_timeout(400)
    print("[Bruno] NCR-002 situacao (deve ser da MARIA):", bruno.input_value("#f-currentSituation"))
    bruno.locator(".ncr-item").nth(2).click(); bruno.wait_for_timeout(400)
    print("[Bruno] NCR-003 motivo (deve ser DELE, preservado):", bruno.input_value("#f-whyNotPossible"))

    menu(bruno,"#sessionsBtn")
    print("\n[Bruno] sessoes no historico:", [h.inner_text().split(chr(10))[0] for h in bruno.locator(".sess-head strong").all()])
    bruno.click("#sessionsCloseBtn"); bruno.wait_for_timeout(300)

    # ===== desfazer =====
    bruno.click("#menuBtn"); bruno.wait_for_timeout(300)
    print("[Bruno] botao desfazer visivel:", bruno.locator("#undoMergeBtn").is_visible(),
          "|", bruno.inner_text("#undoMergeWhen"))
    bruno.click("#undoMergeBtn"); bruno.wait_for_timeout(1600)
    print("[Bruno] apos desfazer:", bruno.locator(".ncr-item-id").all_inner_texts())
    b.close()
print("\nERRORS:", errs if errs else "none")
