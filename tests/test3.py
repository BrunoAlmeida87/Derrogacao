import json, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")


# Imagens de apoio para as evidências, criadas aqui para o teste rodar sozinho.
from PIL import Image
for _nome, _cor in (("ev1.jpg", (60, 140, 70)), ("ev2.jpg", (40, 90, 160))):
    if not (SP/_nome).exists():
        Image.new("RGB", (900, 700), _cor).save(SP/_nome, quality=85)

errs=[]; answers=iter(["RANAE J07","RANAE J08"])
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errs.append(f"console.error: {m.text}") if m.type=="error" else None)
    def on_dialog(d):
        if d.type=="prompt": d.accept(next(answers, "X"))
        else: d.accept()
    pg.on("dialog", on_dialog)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Teste')")
    pg.reload(); pg.wait_for_timeout(700)

    # relatorio A com 2 NCRs, uma com anexos
    pg.fill("#marcoInput","RANAE J06")
    for num,sysn in [("NCR-A-001","RM"),("NCR-A-002","ME")]:
        pg.click("#addNcrBtn"); pg.wait_for_timeout(150)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems",sysn)
        pg.fill("#f-func","FV 01 - Teste"); pg.fill("#f-description","desc")
        pg.fill("#f-currentSituation","sit"); pg.fill("#f-whyNotPossible","why")
        pg.fill("#f-arguments","args")
    # 2 anexos na NCR ativa, para testar reordenacao
    for _ in range(2):
        pg.click("text=+ Novo anexo"); pg.wait_for_timeout(200)
    refs = pg.locator(".evid-page input[type=text]")
    print("anexos:", refs.count(), "| refs:", [refs.nth(i).input_value() for i in range(refs.count())])
    pg.set_input_files(".evid-page:first-of-type input[type=file]", str(SP/"ev1.jpg")); pg.wait_for_timeout(800)

    # mover o 2o anexo para cima
    pg.locator(".evid-page").nth(1).locator("button", has_text="↑").click(); pg.wait_for_timeout(300)
    refs = pg.locator(".evid-page input[type=text]")
    print("apos mover ↑ refs:", [refs.nth(i).input_value() for i in range(refs.count())])

    pg.wait_for_timeout(800)

    # novo relatorio B e copiar NCRs de A
    pg.click("#newProjectTopBtn"); pg.wait_for_timeout(800)
    print("relatorio B, marco:", pg.input_value("#marcoInput"), "| ncrs:", pg.locator(".ncr-item").count())
    pg.click("#copyNcrBtn"); pg.wait_for_timeout(400)
    print("dialogo copia visivel:", pg.locator("#copyDialog").is_visible(),
          "| opcoes NCR:", pg.locator(".copy-ncr").count())
    pg.click("#copyGoBtn"); pg.wait_for_timeout(600)
    print("apos copiar — ncrs em B:", pg.locator(".ncr-item").count(),
          "| primeira:", pg.locator(".ncr-item-id").first.inner_text())
    for i in range(2):
        pg.locator(".ncr-item").nth(i).click(); pg.wait_for_timeout(350)
        print("  NCR", pg.locator(".ncr-item-id").nth(i).inner_text(),
              "-> anexos:", pg.locator(".evid-page").count(),
              "imagens:", pg.locator(".evid-thumb").count())

    # verificacao de campos vazios: adiciona NCR incompleta
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    pg.click("#pdfBtn"); pg.wait_for_timeout(400)
    print("aviso de lacunas:", pg.inner_text("#pdfGaps")[:120].replace("\n"," / "))
    pg.click("#pdfCancelBtn"); pg.wait_for_timeout(200)

    # zoom da pre-visualizacao
    pg.click("#previewBtn"); pg.wait_for_timeout(500)
    t0 = pg.eval_on_selector("#previewStage .rep-page","e=>e.style.transform")
    pg.eval_on_selector("#zoomRange","e=>{e.value=50;e.dispatchEvent(new Event('input'))}"); pg.wait_for_timeout(300)
    t1 = pg.eval_on_selector("#previewStage .rep-page","e=>e.style.transform")
    print("zoom inicial:",t0,"-> apos:",t1,"| label:",pg.inner_text("#zoomLabel"))
    pg.screenshot(path=str(SP/"ui-preview2.png"))
    pg.click("#closePreviewBtn")
    b.close()
print("ERRORS:", errs if errs else "none")
