import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL=SP/"dl3"; DL.mkdir(exist_ok=True)
errs=[]
def mk(b,name):
    ctx=b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(f"{name}: {e}"))
    pg.on("console",lambda m:errs.append(f"{name}: {m.text}") if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(400)
    pg.evaluate(f"()=>localStorage.setItem('derrogacao:user','{name}')")
    pg.reload(); pg.wait_for_timeout(700)
    return pg
def menu(pg,sel):
    pg.click("#menuBtn"); pg.wait_for_timeout(200); pg.click(sel); pg.wait_for_timeout(400)

with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)

    # ===== sessão de Bruno =====
    pg=mk(b,"Bruno")
    pg.fill("#marcoInput","RANAE J06")
    for num in ("NCR-001","NCR-002","NCR-003"):
        pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems","RM")
        pg.fill("#f-func","FV 01 - Teste"); pg.fill("#f-description","por Bruno")
    pg.wait_for_timeout(800)
    print("contador da sessao:", pg.inner_text("#sessionCount"))
    print("itens marcados:", pg.locator(".ncr-item.is-touched").count(),
          "| pontos:", pg.locator(".touch-dot").count())
    print("autoria no item:", pg.inner_text(".done-bar-who"))

    menu(pg,"#sessionsBtn")
    print("\nsessoes listadas:", pg.locator(".sess").count())
    print("cabecalho:", pg.locator(".sess-head").first.inner_text().replace(chr(10)," | "))
    print("mudancas:", [li.inner_text().replace(chr(10)," ") for li in pg.locator(".sess-list li").all()])
    pg.click("#sessionsCloseBtn"); pg.wait_for_timeout(300)

    # excluir um item entra como "excluiu"
    pg.locator(".ncr-item").nth(2).click(); pg.wait_for_timeout(300)
    pg.click("#delNcrBtn"); pg.wait_for_timeout(600)
    menu(pg,"#sessionsBtn")
    print("\napos excluir:", [li.inner_text().replace(chr(10)," ") for li in pg.locator(".sess-list li").all()])
    pg.click("#sessionsCloseBtn"); pg.wait_for_timeout(300)

    # backup leva o historico
    pg.click("#menuBtn"); pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click("#backupAllBtn")
    d=dl.value; path=DL/d.suggested_filename; d.save_as(str(path)); pg.wait_for_timeout(800)
    data=json.loads(path.read_text())["projects"][0]
    print("\nno backup — sessoes:", len(data["sessions"]),
          "| usuario:", data["sessions"][0]["user"],
          "| mudancas:", [(c["label"],c["action"]) for c in data["sessions"][0]["changes"]])
    print("autoria por item:", [(n["ncrId"], n["editedBy"]) for n in data["ncrs"]])

    # ===== Maria restaura e edita =====
    pg2=mk(b,"Maria")
    pg2.set_input_files("#restoreInput",str(path)); pg2.wait_for_timeout(1400)
    print("\n[Maria] contador (deve estar oculto):", pg2.locator("#sessionInfo").is_hidden())
    pg2.locator(".ncr-item").first.click(); pg2.wait_for_timeout(400)
    print("[Maria] ve autoria do Bruno:", pg2.inner_text(".done-bar-who"))
    pg2.fill("#f-currentSituation","alterado pela Maria"); pg2.wait_for_timeout(900)
    print("[Maria] contador:", pg2.inner_text("#sessionCount"))
    print("[Maria] autoria agora:", pg2.inner_text(".done-bar-who"))

    menu(pg2,"#sessionsBtn")
    print("\n[Maria] sessoes no historico:", pg2.locator(".sess").count())
    for sh in pg2.locator(".sess-head").all():
        print("   ", sh.inner_text().replace(chr(10)," | "))
    print("[Maria] atual e a primeira:", "sess--current" in (pg2.get_attribute(".sess","class") or ""))
    pg2.screenshot(path=str(SP/"ui-sessions.png"))
    pg2.click("#sessionsCloseBtn")
    b.close()
print("\nERRORS:", errs if errs else "none")
