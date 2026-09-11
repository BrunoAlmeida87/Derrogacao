import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

errs=[]; prompts=iter(["RANAE J06","RANAE J07"])
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    pg=b.new_context(viewport={"width":1500,"height":950}).new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d: d.accept(next(prompts,"X")) if d.type=="prompt" else d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Teste')")
    pg.reload(); pg.wait_for_timeout(700)

    def fill_item(num, extra):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
        pg.fill("#f-ncrId",num)
        if not extra: pg.fill("#f-systems","RM")
        pg.fill("#f-func","FV 01 - Teste" if not extra else "BQ - teste")
        for f in ("description","currentSituation","whyNotPossible","arguments"):
            pg.fill(f"#f-{f}","x")

    # ---- 1) situacao do item ----
    pg.fill("#marcoInput","RANAE J06")
    fill_item("NCR-001", False); pg.wait_for_timeout(600)
    print("barra:", pg.inner_text(".status-bar strong"),
          "| situacao inicial:", pg.locator(".status-op.is-on").inner_text())
    pg.locator(".status-op", has_text="Waiver accepted").click(); pg.wait_for_timeout(700)
    print("apos aceitar:", pg.locator(".status-op.is-on").inner_text(),
          "| tick na lista:", pg.locator(".ncr-item .done-tick").count(),
          "| classe:", "is-done" in (pg.get_attribute(".ncr-item","class") or ""))
    # persistencia da situacao
    pg.reload(); pg.wait_for_timeout(900)
    print("apos recarregar, tick:", pg.locator(".ncr-item .done-tick").count())

    # "criar outra" grava o aberto e comeca um item novo
    pg.locator(".ncr-item").first.click(); pg.wait_for_timeout(300)
    pg.locator(".status-row > .btn").click(); pg.wait_for_timeout(700)
    print("criar outra -> itens:", pg.locator(".ncr-item").count(),
          "| ticks:", pg.locator(".ncr-item .done-tick").count())
    pg.fill("#f-ncrId","NCR-002"); pg.fill("#f-systems","ME"); pg.fill("#f-func","FV 05 - Teste")
    for f in ("description","currentSituation","whyNotPossible","arguments"): pg.fill(f"#f-{f}","x")

    # ---- 2) barra superior sem Marco (DEV) / ajustes ----
    print("\nlabels da barra:", pg.locator(".topbar-field label").all_inner_texts())
    pg.click(".tab[data-kind=dev]"); pg.wait_for_timeout(400)
    print("marco na aba DEV (deve ser o mesmo):", pg.input_value("#marcoInput"))
    fill_item("DEV-78154", True); pg.wait_for_timeout(700)
    (pg.click("#menuBtn"), pg.wait_for_timeout(200), pg.click("#settingsBtn")); pg.wait_for_timeout(300)
    print("ajustes:", pg.locator("#settingsBody label").all_inner_texts())
    pg.fill("#settingsBody input >> nth=2","J05 DQR"); pg.wait_for_timeout(700)
    pg.click("#settingsCloseBtn"); pg.wait_for_timeout(300)
    pg.click("#previewBtn"); pg.wait_for_timeout(500)
    print("capa DEV com marco alternativo:", pg.inner_text("#previewStage .rep-cover-title"))
    pg.click("#closePreviewBtn"); pg.wait_for_timeout(300)

    # segundo relatorio
    pg.click("#newProjectTopBtn"); pg.wait_for_timeout(900)
    fill_item("NCR-J07-001", False); pg.wait_for_timeout(900)

    # ---- 3) dialogo de exportacao ----
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    print("\ngrupos:", pg.locator(".pick-group-title").all_inner_texts())
    print("linhas:", pg.locator(".pick-row-name").all_inner_texts())
    print("subs:", pg.locator(".pick-row-sub").all_inner_texts())
    print("pre-marcado:", [c.get_attribute("data-kind")+"/"+c.get_attribute("data-pid")[:6]
                            for c in pg.locator(".pick-cb").all() if c.is_checked()])
    print("desabilitados:", sum(1 for c in pg.locator(".pick-cb").all() if c.is_disabled()))
    print("resumo (1):", pg.inner_text("#pdfSummary"))
    pg.screenshot(path=str(SP/"ui-export.png"))

    # marca todos os disponiveis
    for c in pg.locator(".pick-cb").all():
        if not c.is_disabled() and not c.is_checked(): c.check()
    pg.wait_for_timeout(300)
    print("resumo (varios):", pg.inner_text("#pdfSummary"))
    n_sel = sum(1 for c in pg.locator(".pick-cb").all() if c.is_checked())
    pg.evaluate("()=>{document.querySelectorAll('.pick-cb').forEach(c=>{});}")
    # gera o PDF combinado
    pg.evaluate("""()=>{
        const picked=[...document.querySelectorAll('.pick-cb')].filter(c=>c.checked&&!c.disabled);
        return picked.length;
    }""")
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(900)
    pg.pdf(path=str(SP/"out_multi.pdf"), print_background=True, prefer_css_page_size=True)
    print("selecionados:", n_sel)

    # backup total em destaque
    print("\nbotoes de backup:", [b.inner_text().strip() for b in pg.locator(".topbar-actions .btn").all()])
    b.close()
print("\nERRORS:",errs if errs else "none")
