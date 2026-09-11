import json
from playwright.sync_api import sync_playwright
import pathlib
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

errs=[]

# Backup no formato anterior à aba DEV: só "ncrs", sem "devs", sem "status",
# sem "deleted". O teste monta o arquivo aqui para não depender de nada de fora.
LEGADO = SP/"legacy.json"
LEGADO.write_text(json.dumps({
    "format": "derrogacao-waiver-backup", "schema": 1,
    "exportedAt": "2026-09-01T00:00:00Z",
    "projects": [{
        "id": "old1", "name": "RANAE J05", "marco": "RANAE J05",
        "coverTitle": "Waiver Request For",
        "coverSubtitle": "List of Waiver Requested :",
        "footer": "Gerência técnica operacional",
        "ncrs": [{
            "id": "o1", "ncrId": "NCR-ANTIGA-001", "systems": "RM",
            "func": "FV 01 - Teste", "description": "vindo de backup antigo",
            "currentSituation": "", "whyNotPossible": "", "arguments": "",
            "archAnswer": "", "requestExpiry": "", "archStatus": "",
            "approvedExpiry": "", "historic": "", "certificates": [], "evidence": []
        }]
    }]
}, ensure_ascii=False), encoding="utf-8")

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    pg=b.new_context(viewport={"width":1400,"height":900}).new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.set_input_files("#restoreInput",str(LEGADO)); pg.wait_for_timeout(1200)
    print("backup antigo -> marco:",pg.input_value("#marcoInput"),
          "| abas:",[pg.inner_text(f".tab[data-kind={k}] .tab-count") for k in ("ncr","dev")])
    pg.click(".tab[data-kind=dev]"); pg.wait_for_timeout(400)
    print("aba DEV vazia ok | add:",pg.inner_text("#addNcrBtn"))
    pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
    pg.fill("#f-ncrId","DEV-001"); pg.fill("#f-func","BQ - teste"); pg.wait_for_timeout(900)
    pg.reload(); pg.wait_for_timeout(900)
    print("apos recarregar -> abas:",[pg.inner_text(f".tab[data-kind={k}] .tab-count") for k in ("ncr","dev")])
    pg.screenshot(path=str(SP/"ui-tabs.png"))
    b.close()
print("ERRORS:",errs if errs else "none")
