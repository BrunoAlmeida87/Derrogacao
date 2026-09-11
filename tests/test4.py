import json, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl"; DL.mkdir(exist_ok=True)
errs=[]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errs.append(f"console.error: {m.text}") if m.type=="error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Teste')")
    pg.reload(); pg.wait_for_timeout(700)

    # --- aba NCR ---
    print("aba inicial:", pg.get_attribute(".tab[data-kind=ncr]","aria-selected"),
          "| botao pdf:", pg.inner_text("#pdfBtn"))
    pg.fill("#marcoInput","RANAE J06")
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    pg.fill("#f-ncrId","NCR-ICN-ESC-13-1098-2023"); pg.fill("#f-systems","RM")
    pg.fill("#f-func","FV 01 - Sea water circuit integrity")
    pg.fill("#f-description","Descricao NCR"); pg.fill("#f-historic","J06 To: RANAE J06")
    pg.click("text=+ Certificado"); pg.wait_for_timeout(150)
    pg.fill("#editorScroll .row-line input","S02 RMZ2010")
    print("titulo NCR:", pg.inner_text("#editorScroll .card .hint"))

    # --- aba DEV ---
    pg.click(".tab[data-kind=dev]"); pg.wait_for_timeout(400)
    print("\napos trocar p/ DEV — add:", pg.inner_text("#addNcrBtn"),
          "| itens:", pg.locator(".ncr-item").count())
    (pg.click("#menuBtn"), pg.wait_for_timeout(200), pg.click("#settingsBtn")); pg.wait_for_timeout(300)
    pg.fill("#settingsBody input >> nth=2","J05 DQR"); pg.wait_for_timeout(400)
    pg.click("#settingsCloseBtn"); pg.wait_for_timeout(300)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    print("campos DEV:", pg.locator("#editorScroll .card").first.locator("label").all_inner_texts())
    pg.fill("#f-ncrId","DEV-78154")
    pg.fill("#f-func","BQ - Modification des compensateurs")
    pg.fill("#f-description","The expansion joints for the exhaust system were replaced as part of the modification of compensators.")
    pg.fill("#f-currentSituation","The replacement of the expansion joints has been completed, with only the insulation work in the area where the joint replacement was performed still pending.")
    pg.fill("#f-whyNotPossible","Due to the lack of sufficient time to complete the insulation work.")
    pg.fill("#f-arguments","The insulation pending item has no functional or operational impact on the embarkation.")
    pg.fill("#f-requestExpiry"," J09 DQR"); pg.fill("#f-archStatus","WAIVER REQUESTED")
    print("titulo DEV:", pg.inner_text("#editorScroll .card .hint"))
    pg.wait_for_timeout(900)

    print("\ncontagem nas abas:", [pg.inner_text(f".tab[data-kind={k}] .tab-count") for k in ("ncr","dev")])

    # --- previews separados ---
    pg.click("#previewBtn"); pg.wait_for_timeout(500)
    print("\npreview DEV —", pg.inner_text("#previewKind"),
          "| capa:", pg.inner_text("#previewStage .rep-cover-title"),
          "| indice:", pg.inner_text("#previewStage .rep-index-item"))
    print("  titulo pagina:", pg.inner_text("#previewStage .rep-title"))
    print("  linhas status:", pg.locator("#previewStage .rep-status-row").all_inner_texts())
    pg.screenshot(path=str(SP/"ui-dev.png")); pg.click("#closePreviewBtn"); pg.wait_for_timeout(200)

    pg.click(".tab[data-kind=ncr]"); pg.wait_for_timeout(300)
    pg.click("#previewBtn"); pg.wait_for_timeout(500)
    print("\npreview NCR —", pg.inner_text("#previewKind"),
          "| capa:", pg.inner_text("#previewStage .rep-cover-title"),
          "| indice:", pg.inner_text("#previewStage .rep-index-item"))
    print("  linhas status:", pg.locator("#previewStage .rep-status-row").all_inner_texts())
    print("  certificado:", pg.locator("#previewStage .rep-cert-row").all_inner_texts())
    pg.click("#closePreviewBtn"); pg.wait_for_timeout(200)

    # --- PDFs separados, um por linha do dialogo ---
    for kind, label in [("ncr", "NCR"), ("dev", "DEV")]:
        pg.click("#pdfBtn"); pg.wait_for_timeout(500)
        for cb in pg.locator(".pick-cb").all():
            if cb.is_checked() and not cb.is_disabled():
                cb.uncheck()
        pg.locator(".pick-cb[data-kind=" + kind + "]").first.check()
        pg.wait_for_timeout(300)
        print("selecao " + label + ": " + pg.inner_text("#pdfSummary"))
        pg.click("#pdfGoBtn"); pg.wait_for_timeout(800)
        pg.pdf(path=str(SP / ("out_" + kind + ".pdf")), print_background=True, prefer_css_page_size=True)

    # --- backup leva as duas abas ---
    with pg.expect_download() as dl: (pg.click("#menuBtn"), pg.wait_for_timeout(200), pg.click("#backupBtn"))
    d=dl.value; path=DL/d.suggested_filename; d.save_as(str(path))
    data=json.loads(path.read_text())["projects"][0]
    print("\nbackup:", d.suggested_filename, "| ncrs:", len(data["ncrs"]), "| devs:", len(data["devs"]),
          "| marco:", data["marco"], "| marcoDev:", data["marcoDev"])
    b.close()
print("\nERRORS:", errs if errs else "none")
