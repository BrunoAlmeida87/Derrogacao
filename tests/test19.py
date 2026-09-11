# Ponta a ponta com a pasta: escolher, gravar, reabrir sozinho, receber o que
# o colega gravou, propagar exclusao e versionar no historico.
# A "pasta" e um diretorio OPFS injetado no lugar do seletor do Windows —
# mesma interface FileSystemDirectoryHandle que a pasta de rede entrega.
import json, subprocess, time, pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

PORTA = 8131
errs = []

FAKE = """
window.__pastaFalsa = async () => {
  const raiz = await navigator.storage.getDirectory();
  return await raiz.getDirectoryHandle('Derrogacao', {create:true});
};
window.showDirectoryPicker = () => window.__pastaFalsa();
"""

LER_ARQUIVO = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  const fh = await dir.getFileHandle('derrogacao-dados.json');
  return await (await fh.getFile()).text();
}"""

def ESCREVER(txt):
    return """async (txt) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao', {create:true});
      const fh = await dir.getFileHandle('derrogacao-dados.json', {create:true});
      const w = await fh.createWritable();
      await w.write(txt); await w.close();
      return true;
    }""", txt

LISTAR_HIST = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  const h = await dir.getDirectoryHandle('historico');
  const nomes = [];
  for await (const n of h.keys()) nomes.push(n);
  return nomes;
}"""

srv = subprocess.Popen(["python3","-m","http.server",str(PORTA),"--bind","127.0.0.1",
                        "--directory","/home/user/Derrogacao"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
        ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("dialog", lambda d: d.accept())
        url = f"http://127.0.0.1:{PORTA}/index.html"
        pg.goto(url); pg.wait_for_timeout(800)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(900)

        # --- trabalho local antes de ligar a pasta ---
        pg.fill("#marcoInput","RANAE J06"); pg.wait_for_timeout(300)
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId","NCR-001"); pg.fill("#f-systems","RM")
        pg.fill("#f-func","FV 01 - Sea water"); pg.fill("#f-description","escrito pelo Bruno")
        pg.wait_for_timeout(900)

        # --- liga a pasta pelo menu ---
        print("menu mostra a opcao:", pg.locator("#pastaBtn").count() == 1)
        pg.click("#menuBtn"); pg.wait_for_timeout(300)
        print("item visivel:", pg.locator("#pastaBtn").is_visible())
        pg.click("#pastaBtn"); pg.wait_for_timeout(400)
        print("dialogo:", pg.locator("#pastaDialog").is_visible(),
              "|", pg.inner_text("#pastaEstadoLinha"))
        pg.fill("#pastaCaminhoInput", r"Z:\Projetos\SBR3\Derrogacao")
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(2500)

        print("\nchip na barra:", pg.locator("#pastaChip").is_visible(),
              "|", pg.inner_text("#pastaChipLabel"))
        dados = json.loads(pg.evaluate(LER_ARQUIVO))
        print("arquivo na pasta:", dados["format"], "| por:", dados["updatedBy"],
              "| caminho:", dados["caminho"])
        print("   relatorios:", [(p["marco"], [n["ncrId"] for n in p["ncrs"]]) for p in dados["projects"]])
        assert dados["projects"][0]["ncrs"][0]["ncrId"] == "NCR-001"

        # --- colega grava na pasta: um item novo e uma edicao mais recente ---
        alvo = dados["projects"][0]
        alvo["ncrs"][0]["description"] = "REESCRITO pela Maria"
        alvo["ncrs"][0]["editedAt"] = "2099-01-01T10:00:00.000Z"
        alvo["ncrs"][0]["editedBy"] = "Maria"
        novo = json.loads(json.dumps(alvo["ncrs"][0]))
        novo.update({"id":"maria-1","ncrId":"NCR-777","description":"so da Maria",
                     "editedAt":"2099-01-01T11:00:00.000Z"})
        alvo["ncrs"].append(novo)
        dados["updatedBy"] = "Maria"
        fn, arg = ESCREVER(json.dumps(dados))
        pg.evaluate(fn, arg)
        print("\ncolega gravou na pasta.")

        # --- reabre: tem de puxar sozinho, sem importar nada ---
        pg.reload(); pg.wait_for_timeout(3000)
        ids = pg.locator(".ncr-item-id").all_inner_texts()
        print("apos reabrir, NCRs na tela:", ids)
        assert "NCR-777" in ids, ids
        pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(500)
        print("NCR-001 pegou a versao da Maria:", repr(pg.input_value("#f-description")))
        assert pg.input_value("#f-description") == "REESCRITO pela Maria"
        print("chip:", pg.inner_text("#pastaChipLabel"))

        # --- exclusao daqui tem de virar lapide na pasta ---
        pg.locator(".ncr-item", has_text="NCR-777").first.click(); pg.wait_for_timeout(400)
        pg.click("#delNcrBtn"); pg.wait_for_timeout(3500)
        dados2 = json.loads(pg.evaluate(LER_ARQUIVO))
        lapides = dados2["projects"][0].get("deleted", [])
        print("\nlapides na pasta:", [(t["ncrId"], t["by"]) for t in lapides])
        assert any(t["ncrId"] == "NCR-777" for t in lapides)
        assert all(n["ncrId"] != "NCR-777" for n in dados2["projects"][0]["ncrs"])

        # --- historico automatico ---
        hist = pg.evaluate(LISTAR_HIST)
        print("historico:", hist)
        assert hist, "deveria ter ao menos uma versao"

        # --- desligar mantem os dados aqui ---
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#pastaBtn"); pg.wait_for_timeout(500)
        print("\nhistorico no dialogo:", pg.locator(".hist-linha").count(), "linha(s)")
        pg.click("#pastaDesligarBtn"); pg.wait_for_timeout(900)
        print("chip sumiu:", pg.locator("#pastaChip").is_hidden(),
              "| NCRs seguem:", pg.locator(".ncr-item-id").all_inner_texts())
        b.close()
finally:
    srv.terminate()
print("\nERRORS:", errs if errs else "none")
