# Sugestoes separadas por categoria: a NCR nao pode oferecer valores da DEV.
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
    ctx = b.new_context(viewport={"width": 1500, "height": 950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(300)

    # --- uma NCR com vocabulario proprio ---
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId", "NCR-001"); pg.fill("#f-systems", "RM")
    pg.fill("#f-func", "FV 01 - Sea water circuit integrity")
    pg.fill("#f-archStatus", "WAIVER ACCEPTED")
    pg.locator("text=+ Certificado").click(); pg.wait_for_timeout(250)
    pg.locator(".row-line input").first.fill("S02 RMZ2010")
    pg.wait_for_timeout(900)

    # --- uma DEV com outro vocabulario ---
    pg.click(".tab[data-kind='dev']"); pg.wait_for_timeout(400)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId", "DEV-78154")
    pg.fill("#f-func", "BQ - Modification des compensateurs")
    pg.fill("#f-archStatus", "WAIVER REQUESTED")
    pg.locator("text=+ Certificado").click(); pg.wait_for_timeout(250)
    pg.locator(".row-line input").first.fill("Shipyard Certificate")
    pg.wait_for_timeout(900)

    # recarrega para as listas serem montadas a partir dos dados gravados
    pg.reload(); pg.wait_for_timeout(900)

    def opts(sel):
        return pg.eval_on_selector(sel, "d=>[...d.options].map(o=>o.value)")

    print("NCR func:        ", opts("#dl-ncr-func"))
    print("DEV func:        ", opts("#dl-dev-func"))
    print("NCR archStatus:  ", opts("#dl-ncr-archStatus"))
    print("DEV archStatus:  ", opts("#dl-dev-archStatus"))
    print("NCR certificados:", opts("#dl-ncr-certificates"))
    print("DEV certificados:", opts("#dl-dev-certificates"))

    ncr_func, dev_func = opts("#dl-ncr-func"), opts("#dl-dev-func")
    assert "FV 01 - Sea water circuit integrity" in ncr_func, ncr_func
    assert "BQ - Modification des compensateurs" not in ncr_func, "DEV vazou para a NCR"
    assert "BQ - Modification des compensateurs" in dev_func, dev_func
    assert "FV 01 - Sea water circuit integrity" not in dev_func, "NCR vazou para a DEV"
    assert opts("#dl-ncr-certificates") == ["S02 RMZ2010"], opts("#dl-ncr-certificates")
    assert opts("#dl-dev-certificates") == ["Shipyard Certificate"], opts("#dl-dev-certificates")

    # o campo aberto aponta para a lista da sua aba
    pg.locator(".ncr-item").first.click(); pg.wait_for_timeout(400)
    print("\naba NCR -> f-func list:", pg.get_attribute("#f-func", "list"),
          "| certificado list:", pg.get_attribute(".row-line input", "list"))
    assert pg.get_attribute("#f-func", "list") == "dl-ncr-func"
    pg.click(".tab[data-kind='dev']"); pg.wait_for_timeout(400)
    pg.locator(".ncr-item").first.click(); pg.wait_for_timeout(400)
    print("aba DEV -> f-func list:", pg.get_attribute("#f-func", "list"),
          "| certificado list:", pg.get_attribute(".row-line input", "list"))
    assert pg.get_attribute("#f-func", "list") == "dl-dev-func"
    assert pg.get_attribute(".row-line input", "list") == "dl-dev-certificates"

    b.close()
print("\nERRORS:", errs if errs else "none")
