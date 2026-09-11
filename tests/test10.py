import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL=SP/"dl5"; DL.mkdir(exist_ok=True)
errs=[]; prompts=iter(["RANAE J07","RANAE J08"])
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    ctx=b.new_context(viewport={"width":1500,"height":980}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d: d.accept(next(prompts,"X")) if d.type=="prompt" else d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.reload(); pg.wait_for_timeout(700)

    def item(num, sysn, func, status, done=False, dev=False):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(220)
        pg.fill("#f-ncrId",num)
        if not dev: pg.fill("#f-systems",sysn)
        pg.fill("#f-func",func)
        pg.fill("#f-description","d"); pg.fill("#f-currentSituation","s")
        pg.fill("#f-whyNotPossible","w"); pg.fill("#f-arguments","a")
        if status: pg.fill("#f-archStatus",status)
        pg.fill("#f-requestExpiry","PÓS TRAP")
        if done:
            pg.locator(".status-op", has_text="Waiver accepted").click(); pg.wait_for_timeout(450)

    # marco 1
    pg.fill("#marcoInput","RANAE J06")
    item("NCR-001","RM","FV 01 - Sea water","WAIVER ACCEPTED",done=True)
    item("NCR-002","ME","FV 05 - Propel","WAIVER ACCEPTED")
    item("NCR-003","BX,BQ,BD","FV 23 - Emergency stop","WAIVER REQUESTED")
    item("NCR-004","RM","FV 01 - Sea water","")
    pg.click("text=+ Novo anexo"); pg.wait_for_timeout(300)
    pg.click(".tab[data-kind=dev]"); pg.wait_for_timeout(400)
    item("DEV-78154","","BQ - Modification des compensateurs","WAIVER REQUESTED",dev=True)
    pg.wait_for_timeout(900)

    # marco 2
    pg.click("#newProjectTopBtn"); pg.wait_for_timeout(900)
    pg.fill("#marcoInput","RANAE J07"); pg.wait_for_timeout(300)
    item("NCR-101","DJ","FV 10 - Control ship weight","WAIVER ACCEPTED",done=True)
    item("NCR-102","KE","FV 42 - Handle weapon","WAIVER ACCEPTED",done=True)
    pg.wait_for_timeout(900)

    # ===== aba resumo =====
    pg.click(".tab[data-kind=resumo]"); pg.wait_for_timeout(700)
    print("lateral escondida:", pg.locator("#sidebarBody").is_hidden(),
          "| editor escondido:", pg.locator("#editorScroll").is_hidden(),
          "| resumo visivel:", pg.locator("#summaryScroll").is_visible())
    print("\nKPIs:", [(k.locator(".sm-kpi-label").inner_text(), k.locator(".sm-kpi-value").inner_text())
                      for k in pg.locator(".sm-kpi").all()])
    print("blocos:", [h.inner_text() for h in pg.locator(".sm-card-head h3").all()])
    print("graficos SVG:", pg.locator(".sm-svg").count(),
          "| barras:", pg.locator(".sm-svg rect").count(),
          "| legendas:", pg.locator(".sm-legend").count())
    print("tabela de marcos:", pg.locator(".sm-table tbody tr").count(), "linhas")
    hdr=[t.inner_text() for t in pg.locator(".sm-table thead th").all()]
    print("colunas:", hdr)
    linhas=[[td.inner_text() for td in r.locator("td").all()] for r in pg.locator(".sm-table tbody tr").all()]
    for l in linhas: print("   ", l)
    pg.screenshot(path=str(SP/"ui-resumo.png"), full_page=False)

    # ===== detalhe de um marco =====
    pg.click(".sm-link"); pg.wait_for_timeout(600)
    print("\napos escolher marco — seletor:", pg.input_value(".sm-bar-field select") != "")
    print("blocos:", [h.inner_text() for h in pg.locator(".sm-card-head h3").all()])
    print("botoes de exportacao:", [b.inner_text() for b in pg.locator(".sm-bar-actions .btn").all()])
    print("itens na tabela:", pg.locator(".sm-table tbody tr").count())
    pg.screenshot(path=str(SP/"ui-resumo-marco.png"))

    # ===== CSV =====
    with pg.expect_download() as dl: pg.click("text=Planilha (CSV)")
    d=dl.value; p=DL/d.suggested_filename; d.save_as(str(p))
    txt=p.read_text(encoding="utf-8-sig")
    print("\nCSV:", d.suggested_filename, "|", len(txt.strip().split("\n")), "linhas")
    print("  cabecalho:", txt.split("\n")[0][:100])
    print("  1a linha:", txt.split("\n")[1][:110])

    # ===== resumo em PDF =====
    pg.click("text=Resumo em PDF"); pg.wait_for_timeout(700)
    print("\npaginas montadas p/ impressao:", pg.locator("#printRoot .rep-page").count())
    pg.pdf(path=str(SP/"out_resumo.pdf"), print_background=True, prefer_css_page_size=True)
    b.close()
print("\nERRORS:", errs if errs else "none")
