# Edicao simultanea: itens diferentes nao se perdem; no MESMO item vence a
# edicao mais recente, e a versao perdida fica no historico. A tela do item
# aberto e redesenhada quando ele muda por fora.
import json, subprocess, time
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

PORTA = 8134
errs = []
FAKE = """
window.showDirectoryPicker = async () => {
  const raiz = await navigator.storage.getDirectory();
  return await raiz.getDirectoryHandle('Derrogacao', {create:true});
};"""
LER = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  return await (await (await dir.getFileHandle('derrogacao-dados.json')).getFile()).text();
}"""
ESCREVER = """async (txt) => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao', {create:true});
  const fh = await dir.getFileHandle('derrogacao-dados.json', {create:true});
  const w = await fh.createWritable(); await w.write(txt); await w.close(); return true;
}"""
HIST = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  const h = await dir.getDirectoryHandle('historico');
  const out = [];
  for await (const n of h.keys()) {
    const t = await (await (await h.getFileHandle(n)).getFile()).text();
    out.push([n, t]);
  }
  return out;
}"""

srv = subprocess.Popen(["python3","-m","http.server",str(PORTA),"--bind","127.0.0.1",
                        "--directory","/home/user/Derrogacao"],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width":1400,"height":900}); ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("dialog", lambda d: d.accept())
        pg.goto(f"http://127.0.0.1:{PORTA}/index.html"); pg.wait_for_timeout(700)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(800)
        pg.fill("#marcoInput","RANAE J06"); pg.wait_for_timeout(300)
        for n in ["NCR-001","NCR-002"]:
            pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
            pg.fill("#f-ncrId",n); pg.fill("#f-systems","RM"); pg.fill("#f-func","FV 01")
            pg.fill("#f-description","original"); pg.wait_for_timeout(500)
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#pastaBtn"); pg.wait_for_timeout(400)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(2500)
        print("pasta ligada.")

        # ---- 1) ITENS DIFERENTES ao mesmo tempo: nada se perde ----
        base = json.loads(pg.evaluate(LER))
        p0 = base["projects"][0]
        # Maria mexe na NCR-002 (no arquivo) enquanto o Bruno mexe na NCR-001 (na tela)
        for n in p0["ncrs"]:
            if n["ncrId"] == "NCR-002":
                n["description"] = "texto da MARIA"
                n["editedAt"] = "2030-01-01T10:00:00.000Z"; n["editedBy"] = "Maria"
        pg.evaluate(ESCREVER, json.dumps(base))
        pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(400)
        pg.fill("#f-description","texto do BRUNO"); pg.wait_for_timeout(4000)

        d = json.loads(pg.evaluate(LER))
        textos = {n["ncrId"]: n["description"] for n in d["projects"][0]["ncrs"]}
        print("\nitens diferentes ->", textos)
        assert textos["NCR-001"] == "texto do BRUNO", textos
        assert textos["NCR-002"] == "texto da MARIA", textos

        # ---- 2) MESMO item ao mesmo tempo: vence a edicao mais recente ----
        d2 = json.loads(pg.evaluate(LER))
        for n in d2["projects"][0]["ncrs"]:
            if n["ncrId"] == "NCR-001":
                n["description"] = "MARIA escreveu depois"
                n["editedAt"] = "2031-01-01T10:00:00.000Z"; n["editedBy"] = "Maria"
        pg.evaluate(ESCREVER, json.dumps(d2))
        print("Maria gravou por cima da NCR-001; esperando o programa perceber...")
        visto = False
        for _ in range(14):
            pg.wait_for_timeout(3000)
            if pg.input_value("#f-description") == "MARIA escreveu depois":
                visto = True; break
        print("a tela do item aberto foi atualizada sozinha:", visto)
        print("   campo mostra:", repr(pg.input_value("#f-description")))
        print("   aviso:", pg.inner_text("#toast") if pg.locator("#toast").is_visible() else "(sem aviso visivel)")
        assert visto, "o texto na tela ficaria desatualizado e a proxima tecla apagaria o da Maria"

        # ---- 3) a versao perdida continua no historico ----
        versoes = pg.evaluate(HIST)
        achou = any("texto do BRUNO" in t for _, t in versoes)
        print("\nversoes no historico:", [n for n, _ in versoes])
        print("a versao substituida esta guardada:", achou)
        assert achou, "sem isso nao haveria como recuperar o texto perdido"
        b.close()
finally:
    srv.terminate()
print("\nERRORS:", errs if errs else "none")
