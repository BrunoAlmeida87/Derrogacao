# Falha ao GRAVAR na pasta depois de ler: a mesclagem ja aconteceu na memoria.
# O resultado precisa ser salvo aqui e posto na tela, senao a tecla seguinte
# grava o texto velho por cima do que o colega escreveu.
import json, os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8225
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

srv = subprocess.Popen(["python3", "-m", "http.server", str(PORTA), "--bind", "127.0.0.1",
                        "--directory", "/home/user/Derrogacao"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width": 1400, "height": 900})
        ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(f"http://127.0.0.1:{PORTA}/index.html"); pg.wait_for_timeout(700)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(800)

        pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(300)
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId", "NCR-001"); pg.fill("#f-description", "meu texto")
        pg.wait_for_timeout(700)

        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(300)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(3000)
        print("pasta ligada.")

        # o colega grava uma versao MAIS NOVA do mesmo item
        fora = json.loads(pg.evaluate(LER))
        it = fora["projects"][0]["ncrs"][0]
        it["description"] = "TEXTO DO COLEGA"
        it["editedAt"] = "2030-01-01T00:00:00.000Z"
        it["editedBy"] = "Maria"
        fora["updatedAt"] = "2030-01-01T00:00:00.000Z"
        pg.evaluate(ESCREVER, json.dumps(fora)); pg.wait_for_timeout(400)

        # a partir daqui a GRAVACAO falha (pasta de rede caiu / disco cheio)
        pg.evaluate("""()=>{ Pasta.gravar = function () {
            var e = new Error('disco cheio'); e.name = 'QuotaExceededError';
            return Promise.reject(e); }; }""")

        # dispara a sincronizacao mexendo num campo
        pg.click(".ncr-item"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId", "NCR-001 "); pg.wait_for_timeout(5000)

        na_tela = pg.input_value("#f-description")
        no_banco = pg.evaluate("()=>Store.list().then(l=>l[0].ncrs[0].description)")
        print("texto na tela .......:", repr(na_tela))
        print("texto no navegador ..:", repr(no_banco))
        assert "TEXTO DO COLEGA" in na_tela, \
            "a tela ficou mostrando o texto velho: a proxima tecla o grava por cima"
        assert "TEXTO DO COLEGA" in no_banco, \
            "a mesclagem foi aplicada na memoria e nao foi salva neste navegador"

        # e continuar digitando nao pode fazer o texto do colega sumir sem aviso
        pg.fill("#f-description", na_tela + " — completei")
        pg.wait_for_timeout(1500)
        final = pg.evaluate("()=>Store.list().then(l=>l[0].ncrs[0].description)")
        print("depois de continuar .:", repr(final))
        assert "TEXTO DO COLEGA" in final, "o texto do colega foi sobrescrito em silencio"

        # a pasta segue marcada como com problema, para tentar de novo
        estado = pg.evaluate("()=>document.getElementById('pastaChip').dataset.estado")
        print("estado da pasta .....:", estado)
        assert estado in ("erro", "permissao", "sincronizando"), estado
        b.close()
finally:
    srv.terminate()

print("ERRORS:", errs if errs else "none")
print("OK — falha de gravacao nao perde o texto do colega.")
