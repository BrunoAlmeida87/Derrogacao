# A exclusao aceita na tela de mesclagem precisa deixar lapide — sem ela o item
# volta na sincronizacao seguinte, vindo do computador de quem ainda nao soube.
import json, os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8226
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
ESTADO = ("()=>Store.list().then(l=>l.map(p=>({marco:p.marco,"
          "ncrs:p.ncrs.map(n=>n.ncrId),lapides:(p.deleted||[]).length})))")

srv = subprocess.Popen(["python3", "-m", "http.server", str(PORTA), "--bind", "127.0.0.1",
                        "--directory", "/home/user/Derrogacao"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
        ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.goto(f"http://127.0.0.1:{PORTA}/index.html"); pg.wait_for_timeout(700)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(800)

        pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(300)
        for n in ["NCR-001", "NCR-002"]:
            pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
            pg.fill("#f-ncrId", n); pg.fill("#f-description", "texto " + n)
            pg.wait_for_timeout(700)

        # o backup do proprio programa e o que fixa a base comum (syncBase)
        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        with pg.expect_download() as dl:
            pg.click("#backupAllBtn")
        backup = SP / "t26-backup.json"
        dl.value.save_as(str(backup))
        pg.wait_for_timeout(800); pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)

        dados = json.loads(backup.read_text())
        assert all(n["syncBase"] for n in dados["projects"][0]["ncrs"]), "backup sem base comum"

        # o colega devolve o arquivo SEM a NCR-002 — ele a excluiu
        dados["exportedBy"] = "Maria"
        dados["projects"][0]["ncrs"] = [n for n in dados["projects"][0]["ncrs"]
                                        if n["ncrId"] != "NCR-002"]
        colega = SP / "t26-colega.json"
        colega.write_text(json.dumps(dados))
        pg.set_input_files("#restoreInput", str(colega)); pg.wait_for_timeout(1500)

        grupos = pg.evaluate("()=>Array.from(document.querySelectorAll('.mg-group-head strong'))"
                             ".map(e=>e.textContent)")
        print("grupos:", grupos)
        assert any("Excluídos" in g for g in grupos), grupos
        pg.evaluate("()=>{document.querySelectorAll('.mg-del').forEach(c=>{c.checked=true})}")
        pg.click("#mergeApplyBtn"); pg.wait_for_timeout(1800)

        depois = pg.evaluate(ESTADO)
        print("apos aceitar a exclusao:", json.dumps(depois, ensure_ascii=False))
        assert depois[0]["ncrs"] == ["NCR-001"], depois
        assert depois[0]["lapides"] == 1, "a exclusao nao deixou lapide"

        # liga a pasta; la fora ainda existe a versao com as duas NCRs
        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(300)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(3000)
        fora = json.loads(pg.evaluate(LER))
        fora["projects"] = [json.loads(backup.read_text())["projects"][0]]
        fora["updatedAt"] = "2030-01-01T00:00:00.000Z"
        pg.evaluate(ESCREVER, json.dumps(fora)); pg.wait_for_timeout(500)
        pg.click(".ncr-item"); pg.wait_for_timeout(300)
        pg.fill("#f-description", "mexe para sincronizar"); pg.wait_for_timeout(5000)

        final = pg.evaluate(ESTADO)
        print("apos sincronizar com a pasta:", json.dumps(final, ensure_ascii=False))
        assert final[0]["ncrs"] == ["NCR-001"], "a NCR excluida voltou pela pasta"
        b.close()
finally:
    srv.terminate()

print("ERRORS:", errs if errs else "none")
print("OK — exclusao pela mesclagem deixa lapide e nao volta.")
