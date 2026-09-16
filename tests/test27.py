# Excluir um relatorio inteiro precisa sobreviver a sincronizacao — e alcancar
# os outros. Sem lapide de relatorio, ele volta da pasta minutos depois.
import json, os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8227
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
MARCOS = "()=>Store.list().then(l=>l.map(p=>p.marco))"

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
        for n in ["NCR-001", "NCR-002"]:
            pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
            pg.fill("#f-ncrId", n); pg.fill("#f-description", "texto " + n)
            pg.wait_for_timeout(700)
        # um segundo marco, que precisa continuar existindo
        pg.evaluate("""async () => {
            const p = Store.newProject('RANAE J07');
            const n = Store.newNcr(); n.ncrId = 'NCR-900'; n.editedAt = new Date().toISOString();
            p.ncrs.push(n); await Store.save(p); }""")
        pg.reload(); pg.wait_for_timeout(900)

        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(300)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(3000)
        na_pasta = json.loads(pg.evaluate(LER))
        print("na pasta:", sorted(p["marco"] for p in na_pasta["projects"]))
        assert len(na_pasta["projects"]) == 2

        # exclui o RANAE J06
        pg.select_option("#projectSelect", label=[o for o in pg.eval_on_selector_all(
            "#projectSelect option", "os=>os.map(o=>o.textContent)") if "J06" in o][0])
        pg.wait_for_timeout(500)
        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#deleteProjectBtn"); pg.wait_for_timeout(2000)
        print("logo apos excluir:", pg.evaluate(MARCOS))

        # o colega, que ainda tem o J06, grava na pasta
        fora = json.loads(pg.evaluate(LER))
        fora["projects"] = na_pasta["projects"]
        fora["updatedAt"] = "2030-01-01T00:00:00.000Z"
        pg.evaluate(ESCREVER, json.dumps(fora)); pg.wait_for_timeout(500)
        pg.fill("#marcoInput", "RANAE J07 "); pg.wait_for_timeout(5000)

        marcos = pg.evaluate(MARCOS)
        print("apos sincronizar:", marcos)
        assert "RANAE J06" not in marcos, "o relatorio excluido voltou pela pasta"
        assert any("J07" in m for m in marcos), "o outro relatorio sumiu junto"

        # e a exclusao precisa alcancar os outros: sai do arquivo da pasta
        final = json.loads(pg.evaluate(LER))
        restantes = [p["marco"] for p in final["projects"]]
        print("na pasta, no fim:", restantes)
        assert "RANAE J06" not in restantes, "a exclusao nao chegou a pasta"
        assert isinstance(final.get("relatoriosExcluidos"), list) and final["relatoriosExcluidos"], \
            "a pasta precisa levar a lapide do relatorio, para alcancar os outros"
        # a lapide nao pode alcancar um relatorio homonimo: dois repetidos do
        # mesmo marco existem (o menu ate oferece junta-los)
        risco = pg.evaluate(r"""() => {
          const item = (id, at) => ({id, ncrId:'NCR-'+id, systems:'', func:'', description:'x',
            currentSituation:'', whyNotPossible:'', arguments:'', archAnswer:'', requestExpiry:'',
            archStatus:'', approvedExpiry:'', historic:'', certificates:[], evidence:[],
            status:'preenchendo', done:false, editedBy:'b', editedAt:at, syncBase:''});
          const proj = (id, marco, ncrs) => Store.normalizeProject({id, marco, name:marco, ncrs,
            devs:[], deleted:[], sessions:[], updatedAt:'2026-01-01T00:00:00.000Z'});
          const guardado = localStorage.getItem('derrogacao:relatoriosExcluidos');
          localStorage.removeItem('derrogacao:relatoriosExcluidos');
          const A = proj('idA','J99 REPETIDO',[item('1','2026-01-01T10:00:00.000Z')]);
          const B = proj('idB','J99 REPETIDO',[item('2','2026-01-01T10:00:00.000Z')]);
          const locais = [A, B];
          Store.tombstoneProjeto(A);
          locais.splice(0, 1);
          const res = Store.mergeListas(locais, [], null);
          if (guardado === null) localStorage.removeItem('derrogacao:relatoriosExcluidos');
          else localStorage.setItem('derrogacao:relatoriosExcluidos', guardado);
          return {restantes: locais.map(p=>p.id), removidos: res.relatoriosRemovidos};
        }""")
        print("marco repetido:", risco)
        assert risco["restantes"] == ["idB"], \
            "a lapide de um relatorio apagou o homonimo: %s" % risco

        b.close()
finally:
    srv.terminate()

print("ERRORS:", errs if errs else "none")
print("OK — exclusao de relatorio sobrevive e se propaga.")
