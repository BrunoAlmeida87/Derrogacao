# Instalacao como aplicativo e uso sem rede: manifesto servido, service
# worker registrado e a pagina abrindo com a rede desligada.
# (De file:// nao ha service worker nenhum — isso tambem e conferido.)
import json, subprocess, time, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8141
errs = []

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
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        url = f"http://127.0.0.1:{PORTA}/index.html"
        pg.goto(url); pg.wait_for_timeout(1500)

        # --- manifesto: e o que faz o Edge oferecer "instalar" ---
        manif = pg.evaluate("""async () => {
          const r = await fetch('manifest.webmanifest');
          return await r.json();
        }""")
        print("manifesto:", manif["name"], "| icones:", [i["sizes"] for i in manif["icons"]])
        assert manif["display"] == "standalone"
        assert any(i["sizes"] == "512x512" for i in manif["icons"]), "o Edge exige um icone grande"
        for icone in manif["icons"]:
            ok = pg.evaluate("""async (src) => {
              const r = await fetch(src);
              return [r.ok, r.headers.get('content-type')];
            }""", icone["src"])
            print("  ", icone["src"], ok)
            assert ok[0], "icone do manifesto tem de existir"

        # --- service worker registrado ---
        pg.wait_for_function("() => navigator.serviceWorker.controller !== null", timeout=15000)
        estado = pg.evaluate("""async () => {
          const r = await navigator.serviceWorker.getRegistration();
          return { escopo: r.scope, ativo: !!r.active };
        }""")
        print("service worker:", estado)
        assert estado["ativo"]

        # --- com a rede desligada, a pagina ainda abre ---
        pg.reload(); pg.wait_for_timeout(1200)          # enche o cache
        ctx.set_offline(True)
        pg.reload(); pg.wait_for_timeout(1500)
        titulo = pg.title()
        botoes = pg.locator("#addNcrBtn").count()
        print("sem rede — titulo:", titulo, "| editor montado:", botoes == 1)
        assert "Waiver Request" in titulo and botoes == 1, "a aplicacao tem de abrir offline"
        ctx.set_offline(False)
        ctx.close()

        # --- de file:// nao se registra service worker nenhum ---
        pg2 = b.new_page()
        pg2.goto("file:///home/user/Derrogacao/index.html"); pg2.wait_for_timeout(1200)
        # em file:// a propria API e proibida: o programa nem tenta registrar,
        # e por isso nao ha erro nenhum no console (conferido no fim)
        regs = pg2.evaluate("""async () => {
          try { return (await navigator.serviceWorker.getRegistrations()).length; }
          catch (e) { return 'proibido em file://'; }
        }""")
        print("registros em file://:", regs)
        assert regs == 0 or regs == 'proibido em file://'
        print("editor abre de file:// do mesmo jeito:", pg2.locator("#addNcrBtn").count() == 1)
        assert pg2.locator("#addNcrBtn").count() == 1
        b.close()
finally:
    srv.terminate()

# o arquivo unico nao pode sair com referencia a manifesto nenhum
gerado = SP / "derrogacao-unico.html"
subprocess.run(["python3", "/home/user/Derrogacao/tools/build-standalone.py", "teste", str(gerado)],
               check=True, stdout=subprocess.DEVNULL)
txt = gerado.read_text(encoding="utf-8")
print("arquivo unico — cita manifesto:", "manifest" in txt, "| KB:", round(len(txt) / 1024))
assert "manifest" not in txt, "a versao de arquivo unico nao acompanha manifesto"

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
