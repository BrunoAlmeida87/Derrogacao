# O indice da capa fecha com o Arch Status, como no relatorio de origem.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(800)
    pg.fill("#marcoInput","J06"); pg.wait_for_timeout(300)

    def ncr(num, sis, fun, arch):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems",sis); pg.fill("#f-func",fun)
        if arch: pg.fill("#f-archStatus",arch)
        pg.wait_for_timeout(400)

    ncr("NCR-ICN-ESC-14-0084-2023","HP","FV09 - COORDINATE DAMAGE CONTROL","WAIVER ACCEPTED")
    ncr("NCR-ICN-ESC-14-0688-2025","HG","FV09 - COORDINATE DAMAGE CONTROL","WAIVER REQUESTED")
    ncr("NCR-SEM-STATUS","EX","FV36 - PRESSURE HULL INTEGRITY","")     # sem arch status
    pg.wait_for_timeout(700)

    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(1500)
    linhas = pg.locator("#printRoot .rep-index-item").all_inner_texts()
    for l in linhas: print("  ", l)
    assert linhas[0] == "NCR-ICN-ESC-14-0084-2023|HP|FV09 - COORDINATE DAMAGE CONTROL|WAIVER ACCEPTED", linhas[0]
    assert linhas[1].endswith("|WAIVER REQUESTED"), linhas[1]
    assert linhas[2] == "NCR-SEM-STATUS|EX|FV36 - PRESSURE HULL INTEGRITY", "sem status nao deixa separador solto"

    # na aba DEV o separador da capa e espaco
    pg.click(".tab[data-kind='dev']"); pg.wait_for_timeout(400)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId","DEV-78154"); pg.fill("#f-func","BQ - Modification des compensateurs")
    pg.fill("#f-archStatus","WAIVER REQUESTED"); pg.wait_for_timeout(700)
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    pg.locator(".pick-row", has_text="DEV").locator("input").check()
    pg.locator(".pick-row", has_text="NCR").locator("input").uncheck()
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(1500)
    print("\nDEV:", pg.locator("#printRoot .rep-index-item").all_inner_texts())
    b.close()
print("\nERRORS:", errs if errs else "none")
