# Situacao de acompanhamento: escolha, reflexo em "concluido", resumo e PDF.
import json, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL = SP/"dl7"; DL.mkdir(exist_ok=True)
errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 950}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.reload(); pg.wait_for_timeout(700)
    pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(250)

    def novo(num, arch=""):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId", num); pg.fill("#f-systems", "RM")
        pg.fill("#f-func", "FV 01 - Sea water circuit integrity")
        pg.fill("#f-description", "desc " + num)
        if arch:
            pg.fill("#f-archStatus", arch)
        pg.wait_for_timeout(400)

    novo("NCR-001", "WAIVER ACCEPTED")
    print("opcoes:", [x.inner_text() for x in pg.locator(".status-op").all()])
    print("padrao marcado:", pg.locator(".status-op.is-on").inner_text())
    print("Arch Status preenchido, mas concluido?",
          pg.locator(".ncr-item .done-tick").count(), "(deve ser 0)")
    print("progresso:", pg.inner_text("#progressText"))

    # so "Waiver accepted" conclui
    def escolher(nome):
        pg.locator(".status-op", has_text=nome).click(); pg.wait_for_timeout(700)

    for nome in ["Waiver requested", "Improve justification"]:
        escolher(nome)
        print(nome, "-> concluidos:", pg.locator(".ncr-item .done-tick").count(),
              "| progresso:", pg.inner_text("#progressText"))
        assert pg.locator(".ncr-item .done-tick").count() == 0

    escolher("Waiver accepted")
    print("Waiver accepted -> concluidos:", pg.locator(".ncr-item .done-tick").count(),
          "| progresso:", pg.inner_text("#progressText"))
    assert pg.locator(".ncr-item .done-tick").count() == 1

    # persiste ao recarregar
    pg.reload(); pg.wait_for_timeout(900)
    print("apos recarregar, marcado:", pg.locator(".status-op.is-on").inner_text(),
          "| tick:", pg.locator(".ncr-item .done-tick").count())
    assert pg.locator(".status-op.is-on").inner_text().strip() == "Waiver accepted"

    novo("NCR-002")
    escolher("Waiver requested")
    novo("NCR-003")
    pg.wait_for_timeout(600)

    # --- nao pode sair no PDF ---
    pg.click("#pdfBtn"); pg.wait_for_timeout(400)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(900)
    txt = pg.inner_text("#printRoot")
    for termo in ["Em preenchimento", "Waiver requested", "Improve justification",
                  "Situação deste item"]:
        assert termo not in txt, "vazou para o PDF: " + termo
    print("\nnada de situacao no PDF do relatorio:", True,
          "| Arch Status continua:", "WAIVER ACCEPTED" in txt)

    # --- resumo ---
    pg.click(".tab[data-kind='resumo']"); pg.wait_for_timeout(900)
    print("\nKPIs:", pg.locator(".sm-kpi-value").all_inner_texts(),
          [x.inner_text() for x in pg.locator(".sm-kpi-label").all()])
    print("legenda situacao:", pg.locator(".sm-card").nth(1).locator(".sm-legend-item").all_inner_texts())
    pg.select_option(".sm-bar select", index=1); pg.wait_for_timeout(700)
    print("pilulas na tabela:", pg.locator(".sm-pill").all_inner_texts())

    with pg.expect_download() as dl:
        pg.locator("button", has_text="Planilha (CSV)").click()
    path = DL/dl.value.suggested_filename; dl.value.save_as(str(path))
    linhas = path.read_text(encoding="utf-8-sig").splitlines()
    print("\nCSV cabecalho:", linhas[0].split(";")[5])
    print("CSV situacoes:", [l.split(";")[5] for l in linhas[1:]])

    # --- backup antigo (so com done) migra para 'aceito' ---
    legado = {"schema": 1, "exportedAt": "2026-01-01T00:00:00.000Z", "projects": [{
        "id": "velho", "name": "RANAE J04", "marco": "RANAE J04",
        "ncrs": [{"id": "a", "ncrId": "NCR-VELHA-1", "done": True},
                 {"id": "b", "ncrId": "NCR-VELHA-2", "done": False}],
        "devs": []}]}
    f = SP/"legado-status.json"; f.write_text(json.dumps(legado))
    pg.click(".tab[data-kind='ncr']"); pg.wait_for_timeout(300)
    pg.set_input_files("#restoreInput", str(f)); pg.wait_for_timeout(1500)
    print("\napos importar legado — marco:", pg.input_value("#marcoInput"))
    pg.locator(".ncr-item").first.click(); pg.wait_for_timeout(500)
    print("NCR-VELHA-1 (done:true) ->", pg.locator(".status-op.is-on").inner_text())
    assert pg.locator(".status-op.is-on").inner_text().strip() == "Waiver accepted"
    pg.locator(".ncr-item").nth(1).click(); pg.wait_for_timeout(500)
    print("NCR-VELHA-2 (done:false) ->", pg.locator(".status-op.is-on").inner_text())
    assert pg.locator(".status-op.is-on").inner_text().strip() == "Em preenchimento"

    pg.screenshot(path=str(SP/"status-bar.png"))
    b.close()
print("\nERRORS:", errs if errs else "none")
