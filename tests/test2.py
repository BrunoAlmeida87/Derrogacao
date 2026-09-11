import json, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl"; DL.mkdir(exist_ok=True)


# Imagens de apoio para as evidências, criadas aqui para o teste rodar sozinho.
from PIL import Image
for _nome, _cor in (("ev1.jpg", (60, 140, 70)), ("ev2.jpg", (40, 90, 160))):
    if not (SP/_nome).exists():
        Image.new("RGB", (900, 700), _cor).save(SP/_nome, quality=85)

errs=[]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    pg.on("console", lambda m: errs.append(f"console.{m.type}: {m.text}") if m.type=="error" else None)
    pg.on("dialog", lambda d: d.accept("RANAE J09"))
    pg.goto("file:///home/user/Derrogacao/index.html")
    pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Teste')")
    pg.reload(); pg.wait_for_timeout(700)

    # 1) preencher o marco e criar uma NCR
    pg.fill("#marcoInput", "RANAE J07")
    pg.click("#addNcrBtn"); pg.wait_for_timeout(200)
    pg.fill("#f-ncrId", "NCR-ICN-ESC-13-9999-2026")
    pg.fill("#f-systems", "DJ")
    pg.fill("#f-func", "FV 10 - Control ship weight")
    pg.fill("#f-description", "Teste de descrição com acentuação — çãõ.")
    print("sidebar item:", pg.inner_text(".ncr-item-id"))

    # 2) certificado
    pg.click("text=+ Certificado"); pg.wait_for_timeout(150)
    pg.fill("#editorScroll .row-line input", "Shipyard Certificate")

    # 3) anexo + imagem
    pg.click("text=+ Novo anexo"); pg.wait_for_timeout(200)
    pg.set_input_files(".evid-page input[type=file]", str(SP/"ev1.jpg"))
    pg.wait_for_timeout(900)
    print("thumbs:", pg.locator(".evid-thumb").count())
    pg.fill(".evid-thumb input", "Detalhe do sensor")

    pg.wait_for_timeout(900)  # deixa o autosave gravar

    # 4) preview mostra 3 paginas (capa + ncr + evidencia)
    pg.click("#previewBtn"); pg.wait_for_timeout(500)
    print("preview pages:", pg.locator("#previewStage .rep-page").count(),
          "landscape:", pg.locator("#previewStage .rep-page--landscape").count())
    print("go to evidence link:", pg.locator("#previewStage a", has_text="Go to Evidence").count())
    pg.click("#closePreviewBtn")

    # 5) backup
    with pg.expect_download() as dl:
        (pg.click("#menuBtn"), pg.wait_for_timeout(200), pg.click("#backupBtn"))
    d = dl.value
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)   # lembrete da pasta
    path = DL/d.suggested_filename
    d.save_as(str(path))
    data = json.loads(path.read_text())
    print("backup file:", d.suggested_filename, "| projects:", len(data["projects"]),
          "| ncrs:", len(data["projects"][0]["ncrs"]),
          "| imagem embutida:", data["projects"][0]["ncrs"][0]["evidence"][0]["images"][0]["src"][:22])

    # 6) novo relatorio (dialog responde 'RANAE J09')
    pg.click("#newProjectTopBtn"); pg.wait_for_timeout(700)
    print("projetos no seletor:", pg.locator("#projectSelect option").count(),
          "| marco atual:", pg.input_value("#marcoInput"))

    # 7) restaurar o backup num navegador limpo
    ctx2 = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg2 = ctx2.new_page()
    pg2.on("pageerror", lambda e: errs.append(f"pageerror(p2): {e}"))
    pg2.on("dialog", lambda d: d.accept())
    pg2.goto("file:///home/user/Derrogacao/index.html")
    pg2.wait_for_timeout(700)
    pg2.set_input_files("#restoreInput", str(path))
    pg2.wait_for_timeout(1200)
    print("[navegador 2] marco:", pg2.input_value("#marcoInput"),
          "| ncrs:", pg2.locator(".ncr-item").count())
    pg2.click(".ncr-item"); pg2.wait_for_timeout(400)
    print("[navegador 2] descrição:", pg2.input_value("#f-description")[:40])
    print("[navegador 2] miniaturas:", pg2.locator(".evid-thumb").count())

    # 8) persistencia apos recarregar
    pg2.reload(); pg2.wait_for_timeout(900)
    print("[navegador 2] após recarregar — ncrs:", pg2.locator(".ncr-item").count(),
          "| marco:", pg2.input_value("#marcoInput"))
    b.close()

print("ERRORS:", errs if errs else "none")
