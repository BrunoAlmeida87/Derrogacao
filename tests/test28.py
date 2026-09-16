# Resumo como acompanhamento: o que esta parado ha muito tempo aparece nos
# numeros, na tabela, no CSV e no resumo impresso.
import json, os, pathlib, datetime
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

def dias_atras(n):
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=n)).isoformat().replace("+00:00", "Z")

proj = {
  "id": "rs1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [
    # pendente e esquecido ha muito tempo: e o que o resumo tem de apontar
    {"id": "n1", "ncrId": "NCR-PARADA", "systems": "RM", "func": "FV 01 - Sea water",
     "status": "solicitado", "editedBy": "Maria", "editedAt": dias_atras(95), "evidence": []},
    {"id": "n2", "ncrId": "NCR-ANTIGA", "systems": "HP", "func": "FV 09 - Damage control",
     "status": "justificar", "editedBy": "Bruno", "editedAt": dias_atras(40), "evidence": []},
    # mexido esta semana: nao esta parado
    {"id": "n3", "ncrId": "NCR-NOVA", "systems": "ME", "func": "FV 05 - Propel",
     "status": "solicitado", "editedBy": "Bruno", "editedAt": dias_atras(3), "evidence": []},
    # aceito ha meses: concluido nao conta como parado
    {"id": "n4", "ncrId": "NCR-ACEITA", "systems": "BX", "func": "FV 12 - Ballast",
     "status": "aceito", "done": True, "editedBy": "Bruno", "editedAt": dias_atras(200), "evidence": []}
  ],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 1000}, accept_downloads=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("async p => { await Store.save(p) }", proj)
    pg.reload(); pg.wait_for_timeout(900)

    pg.click('.tab[data-kind="resumo"]'); pg.wait_for_timeout(700)

    rotulos = [x.upper() for x in pg.locator(".sm-kpi-label").all_inner_texts()]
    valores = pg.locator(".sm-kpi-value").all_inner_texts()
    print("KPIs:", list(zip(rotulos, valores)))
    i = rotulos.index("PARADOS HÁ 30+ DIAS")
    assert valores[i] == "2", "duas pendentes passaram de 30 dias"

    # a tabela dos parados: mais esquecido primeiro, e sem os concluidos
    pg.select_option(".sm-bar-field select", label="RANAE J06 — 4 itens")
    pg.wait_for_timeout(600)
    bloco = pg.locator(".sm-card", has_text="Parados há 30+ dias").last
    linhas = bloco.locator("tbody tr")
    numeros = [linhas.nth(k).locator("td").nth(2).inner_text() for k in range(linhas.count())]
    dias = [int(linhas.nth(k).locator("td").nth(0).inner_text()) for k in range(linhas.count())]
    print("tabela de parados:", list(zip(numeros, dias)))
    assert numeros == ["NCR-PARADA", "NCR-ANTIGA"], "do mais esquecido para o menos"
    assert dias[0] >= 94 and dias[1] >= 39
    assert "NCR-ACEITA" not in numeros, "waiver aceito nao esta parado, esta pronto"
    assert "NCR-NOVA" not in numeros, "mexido ha 3 dias nao esta parado"

    # CSV traz os dias sem edicao
    with pg.expect_download() as d:
        pg.locator(".sm-bar-actions .btn", has_text="Planilha (CSV)").click()
    caminho = SP / "resumo-parados.csv"
    d.value.save_as(str(caminho))
    linhas_csv = caminho.read_text(encoding="utf-8-sig").splitlines()
    cab = linhas_csv[0].split(";")
    print("ultima coluna do CSV:", cab[-1])
    assert cab[-1] == '"Dias sem edicao"'
    col = {l.split(";")[2]: l.split(";")[-1] for l in linhas_csv[1:]}
    print("dias por item:", col)
    assert int(col['"NCR-PARADA"'].strip('"')) >= 94

    # o resumo impresso tambem leva a tabela
    pg.evaluate("""() => {
      const b = Array.from(document.querySelectorAll('.sm-bar-actions .btn'))
        .filter(x => x.textContent.indexOf('Resumo em PDF') >= 0)[0];
      window.print = () => { window.__imprimiu = true; };
      b.click();
    }""")
    pg.wait_for_timeout(700)
    impresso = pg.evaluate("""() => {
      const t = document.getElementById('printRoot').textContent;
      return [window.__imprimiu === true, t.indexOf('Parados há 30+ dias') >= 0, t.indexOf('NCR-PARADA') >= 0];
    }""")
    print("resumo impresso [imprimiu, tem bloco, tem item]:", impresso)
    assert impresso == [True, True, True]
    b.close()

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
