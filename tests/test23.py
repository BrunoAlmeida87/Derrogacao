# Filtros do resumo: numeros, graficos, tabela, CSV e PDF do resumo.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl11"; DL.mkdir(exist_ok=True)
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(800)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.reload(); pg.wait_for_timeout(800)
    pg.fill("#marcoInput","RANAE J06"); pg.wait_for_timeout(300)

    def novo(num, sis, fun, st, arch, texto):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(280)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems",sis); pg.fill("#f-func",fun)
        pg.fill("#f-description",texto); pg.fill("#f-archStatus",arch)
        pg.locator(".status-op", has_text=st).click(); pg.wait_for_timeout(550)

    novo("NCR-001","HP","FV09 - COORDINATE","Waiver accepted","WAIVER ACCEPTED","bomba de porao")
    novo("NCR-002","EX","FV36 - PRESSURE","Waiver requested","WAIVER REQUESTED","valvula travada")
    novo("NCR-003","HP","FV09 - COORDINATE","Em preenchimento","","fiacao solta")
    pg.click(".tab[data-kind='dev']"); pg.wait_for_timeout(400)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId","DEV-77"); pg.fill("#f-func","BQ - compensadores")
    pg.fill("#f-description","bomba do compensador"); pg.fill("#f-archStatus","WAIVER ACCEPTED")
    pg.locator(".status-op", has_text="Waiver accepted").click(); pg.wait_for_timeout(700)

    pg.click(".tab[data-kind='resumo']"); pg.wait_for_timeout(1000)
    def kpis(): return pg.locator(".sm-kpi-value").all_inner_texts()
    def conta(): return pg.inner_text(".sm-filtros-conta")
    print("filtros na tela:", [l.inner_text() for l in pg.locator(".sm-filtros label").all()])
    print("sem filtro -> KPIs:", kpis(), "|", conta())
    assert kpis()[0] == "4"

    def filtrar(rotulo, valor):
        campo = pg.locator(".sm-filtros .sm-bar-field", has=pg.locator("label", has_text=rotulo)).first
        campo.locator("select").select_option(label=valor); pg.wait_for_timeout(800)

    filtrar("Tipo","Só NCR")
    print("\nso NCR         ->", kpis(), "|", conta())
    assert kpis()[0] == "3"
    filtrar("Tipo","NCR e DEV")

    filtrar("Situação","Waiver accepted")
    print("waiver accepted->", kpis(), "|", conta())
    assert kpis()[0] == "2"
    filtrar("Situação","Todas")

    filtrar("Sistema","HP (2)")
    print("sistema HP     ->", kpis(), "|", conta())
    assert kpis()[0] == "2"
    filtrar("Sistema","Todos")

    filtrar("Arch Status","(em branco) (1)")
    print("arch em branco ->", kpis(), "|", conta())
    assert kpis()[0] == "1"
    filtrar("Arch Status","Todos")

    busca = pg.locator('.sm-filtros input[type="search"]')
    busca.fill("bomba"); pg.wait_for_timeout(900)
    print("busca 'bomba'  ->", kpis(), "|", conta())
    assert kpis()[0] == "2"
    print("aviso do recorte:", pg.inner_text(".sm-aviso-filtro")[:60])
    print("tabela:", pg.locator(".sm-card").last.locator("tbody tr").count(), "linha(s)")

    # --- CSV sai filtrado ---
    pg.select_option(".sm-bar select", index=1); pg.wait_for_timeout(900)
    busca = pg.locator('.sm-filtros input[type="search"]')
    if busca.input_value() != "bomba":
        busca.fill("bomba"); pg.wait_for_timeout(900)
    with pg.expect_download() as dl:
        pg.locator("button", has_text="Planilha (CSV)").click()
    p = DL/dl.value.suggested_filename; dl.value.save_as(str(p))
    linhas = p.read_text(encoding="utf-8-sig").strip().splitlines()
    print("\nCSV:", len(linhas)-1, "linha(s) de dados:",
          [l.split(";")[2] for l in linhas[1:]])
    assert len(linhas)-1 == 2, linhas

    # --- resumo em PDF diz que esta filtrado ---
    pg.locator("button", has_text="Resumo em PDF").click(); pg.wait_for_timeout(1500)
    print("aviso no PDF:", pg.inner_text("#printRoot .sm-print-filtro"))
    assert "Recorte" in pg.inner_text("#printRoot .sm-print-filtro")

    # --- limpar volta tudo ---
    pg.locator("button", has_text="Limpar filtros").click(); pg.wait_for_timeout(900)
    print("\napos limpar:", kpis(), "|", conta(), "| aviso some:", pg.locator(".sm-aviso-filtro").count()==0)
    b.close()
print("\nERRORS:", errs if errs else "none")
