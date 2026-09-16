# Seguranca e privacidade do que vem de fora:
#  - nenhum campo do CSV pode comecar com caractere de formula (Excel/DDE);
#  - uma imagem com src remoto num .json nao pode fazer o navegador ir a rede.
import json, os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8228
errs, pedidos = [], []

MALICIOSO = {
    "id": "mal", "schema": 1, "name": "carga", "marco": "<svg onload=alert(1)>",
    "coverTitle": "Waiver Request For", "footer": "rodape",
    "ncrs": [{
        "id": "m1", "ncrId": "=cmd|'/c calc'!A1", "systems": "+1+1", "func": "-2+3",
        "description": "<img src=y onerror=window.__xss=1>", "currentSituation": "@SUM(1+1)",
        "whyNotPossible": "", "arguments": "", "archAnswer": "",
        "requestExpiry": "", "archStatus": "=1+1", "approvedExpiry": "", "historic": "",
        "certificates": ["=HYPERLINK(\"http://x\")"],
        "evidence": [{"id": "e1", "ref": "A", "note": "", "orientation": "landscape",
                      "images": [{"id": "i1", "src": "http://127.0.0.1:9/vazou.png", "caption": "c"},
                                 {"id": "i2", "src": "data:image/gif;base64,"
                                  "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
                                  "caption": "boa"}]}],
        "status": "preenchendo", "done": False,
        "editedBy": "z", "editedAt": "2026-01-01T00:00:00.000Z", "syncBase": ""}],
    "devs": [], "deleted": [], "sessions": [],
    "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z"}

srv = subprocess.Popen(["python3", "-m", "http.server", str(PORTA), "--bind", "127.0.0.1",
                        "--directory", "/home/user/Derrogacao"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width": 1400, "height": 900})
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("request", lambda r: pedidos.append(r.url))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(f"http://127.0.0.1:{PORTA}/index.html"); pg.wait_for_timeout(800)
        pg.evaluate("async (p) => { await Store.save(p); }", MALICIOSO)
        pg.reload(); pg.wait_for_timeout(1000)
        pedidos.clear()

        pg.select_option("#projectSelect", "mal"); pg.wait_for_timeout(700)
        pg.click("#previewBtn"); pg.wait_for_timeout(1200)

        # 1) nada de XSS: os campos saem como texto
        xss = pg.evaluate("()=>!!window.__xss")
        nos = pg.evaluate("()=>document.querySelectorAll('#previewStage script,#previewStage svg').length")
        print("xss executado:", xss, "| nos script/svg no relatorio:", nos)
        assert not xss and nos == 0

        # 2) nada sai do computador
        fora = [u for u in pedidos if not u.startswith(f"http://127.0.0.1:{PORTA}")
                and not u.startswith("data:") and not u.startswith("blob:")]
        print("requisicoes para fora:", fora or "nenhuma")
        assert not fora, "uma imagem com src remoto levou o navegador a rede"

        # a imagem boa (data:) continua aparecendo
        pg.click("#closePreviewBtn"); pg.wait_for_timeout(300)
        imgs = pg.evaluate("()=>Store.list().then(l=>{const p=l.filter(x=>x.id==='mal')[0];"
                           "return p.ncrs[0].evidence[0].images.map(i=>i.src.slice(0,5));})")
        print("srcs guardados:", imgs)
        assert imgs == ["data:"], "a imagem remota devia ser descartada e a data: mantida"

        # 3) CSV sem formulas
        csv = pg.evaluate("""()=>Store.list().then(l=>{
            const p = l.filter(x=>x.id==='mal')[0];
            return SummaryView.toCsv(p, {}); })""")
        linha = csv.split("\n")[1]
        print("linha do CSV:", linha[:150])
        maus = [c for c in linha.split(";") if c[:2] in ('"=', '"+', '"-', '"@')]
        print("campos com cara de formula:", maus or "nenhum")
        assert not maus, "o Excel executaria estes campos"
        # e o conteudo original continua legivel
        assert "cmd|'/c calc'!A1" in linha and "HYPERLINK" in linha, "o texto foi perdido"
        b.close()
finally:
    srv.terminate()

print("ERRORS:", errs if errs else "none")
print("OK — nada sai do computador e o CSV nao carrega formula.")
