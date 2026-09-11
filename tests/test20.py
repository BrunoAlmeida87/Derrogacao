# Duas pessoas com o programa aberto ao mesmo tempo: a mudanca de uma chega
# na outra sozinha. E restaurar uma versao do historico.
import json, subprocess, time
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

PORTA = 8132
errs = []
FAKE = """
window.showDirectoryPicker = async () => {
  const raiz = await navigator.storage.getDirectory();
  return await raiz.getDirectoryHandle('Derrogacao', {create:true});
};
"""
LER = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  const fh = await dir.getFileHandle('derrogacao-dados.json');
  return await (await fh.getFile()).text();
}"""
ESCREVER = """async (txt) => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao', {create:true});
  const fh = await dir.getFileHandle('derrogacao-dados.json', {create:true});
  const w = await fh.createWritable(); await w.write(txt); await w.close();
  return true;
}"""

srv = subprocess.Popen(["python3","-m","http.server",str(PORTA),"--bind","127.0.0.1",
                        "--directory","/home/user/Derrogacao"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width":1400,"height":900})
        ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("dialog", lambda d: d.accept())
        url = f"http://127.0.0.1:{PORTA}/index.html"
        pg.goto(url); pg.wait_for_timeout(700)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(800)

        pg.fill("#marcoInput","RANAE J06"); pg.wait_for_timeout(300)
        for num, desc in [("NCR-001","primeira"), ("NCR-002","segunda")]:
            pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
            pg.fill("#f-ncrId",num); pg.fill("#f-systems","RM")
            pg.fill("#f-func","FV 01"); pg.fill("#f-description",desc)
            pg.wait_for_timeout(500)
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#pastaBtn"); pg.wait_for_timeout(400)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(2500)
        print("ligado:", pg.inner_text("#pastaChipLabel"))

        # --- colega grava enquanto esta aberto: o poll tem de puxar ---
        d = json.loads(pg.evaluate(LER))
        p0 = d["projects"][0]
        novo = json.loads(json.dumps(p0["ncrs"][0]))
        novo.update({"id":"maria-9","ncrId":"NCR-555","description":"chegou sozinha",
                     "editedAt":"2030-01-01T10:00:00.000Z","editedBy":"Maria"})
        p0["ncrs"].append(novo)
        pg.evaluate(ESCREVER, json.dumps(d))
        print("colega gravou; esperando o programa perceber...")
        apareceu = False
        for _ in range(14):                      # o poll roda a cada 20s
            pg.wait_for_timeout(3000)
            if "NCR-555" in pg.locator(".ncr-item-id").all_inner_texts():
                apareceu = True; break
        print("chegou sozinho, sem recarregar:", apareceu,
              "|", pg.locator(".ncr-item-id").all_inner_texts())
        assert apareceu

        # --- restaurar uma versao do historico ---
        pg.locator(".ncr-item", has_text="NCR-002").first.click(); pg.wait_for_timeout(400)
        pg.click("#delNcrBtn"); pg.wait_for_timeout(3500)
        print("\napos excluir NCR-002:", pg.locator(".ncr-item-id").all_inner_texts())
        assert "NCR-002" not in pg.locator(".ncr-item-id").all_inner_texts()

        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#pastaBtn"); pg.wait_for_timeout(700)
        linhas = pg.locator(".hist-linha").count()
        print("versoes no historico:", linhas)
        if linhas:
            pg.locator(".hist-linha .btn").first.click(); pg.wait_for_timeout(2500)
            print("apos restaurar:", pg.locator(".ncr-item-id").all_inner_texts())
        b.close()
finally:
    srv.terminate()
print("\nERRORS:", errs if errs else "none")
