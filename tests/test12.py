import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

errs=[]
def gerar(pg, nome):
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    for cb in pg.locator(".pick-cb").all():
        if not cb.is_disabled() and not cb.is_checked(): cb.check()
    pg.wait_for_timeout(250)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(700)
    pg.pdf(path=str(SP/nome), print_background=True, prefer_css_page_size=True)

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    pg=b.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.reload(); pg.wait_for_timeout(700)
    pg.fill("#marcoInput","RANAE J06")
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    pg.fill("#f-ncrId","NCR-001"); pg.fill("#f-systems","RM"); pg.fill("#f-func","FV 01 - Teste")
    pg.wait_for_timeout(800)

    # padrao: com data
    gerar(pg,"pdf_com_data.pdf")

    # desliga em Ajustes
    pg.click("#menuBtn"); pg.wait_for_timeout(200); pg.click("#settingsBtn"); pg.wait_for_timeout(400)
    cb=pg.locator("#settingsBody input[type=checkbox]")
    print("checkbox existe:", cb.count()==1, "| marcado por padrao:", cb.is_checked())
    print("rotulo:", pg.inner_text("#settingsBody .field-check"))
    cb.uncheck(); pg.wait_for_timeout(700)
    pg.click("#settingsCloseBtn"); pg.wait_for_timeout(300)
    gerar(pg,"pdf_sem_data.pdf")

    # persiste a escolha
    pg.reload(); pg.wait_for_timeout(900)
    pg.click("#menuBtn"); pg.wait_for_timeout(200); pg.click("#settingsBtn"); pg.wait_for_timeout(400)
    print("apos recarregar, ainda desmarcado:", not pg.locator("#settingsBody input[type=checkbox]").is_checked())
    pg.screenshot(path=str(SP/"ui-ajustes.png"))
    b.close()
print("ERRORS:", errs if errs else "none")
