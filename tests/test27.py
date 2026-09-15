# A pasta compartilhada com as imagens em arquivos proprios: o JSON fica
# pequeno, a foto viaja uma vez so, o que o colega substituiu da para ver
# campo a campo, e uma pagina desatualizada nunca regrava a pasta.
import json, subprocess, time, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8140
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
IMAGENS = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  const im = await dir.getDirectoryHandle('imagens');
  const out = [];
  for await (const [nome, h] of im.entries()) out.push([nome, (await h.getFile()).size]);
  return out;
}"""

# 1x1 jpeg de verdade, para haver bytes para gravar
JPEG = ("data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL"
        "DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QA"
        "FAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==")

proj = {
  "id": "pa1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [{"id": "n1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
            "description": "escrito pelo Bruno", "currentSituation": "montagem provisoria",
            "editedBy": "Bruno", "editedAt": "2026-09-01T10:00:00.000Z",
            "evidence": [{"id": "e1", "ref": "Attachment 1", "note": "",
                          "images": [{"id": "img1", "src": JPEG, "caption": "trava"}]}]}],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-09-01T10:00:00.000Z"
}

srv = subprocess.Popen(["python3", "-m", "http.server", str(PORTA), "--bind", "127.0.0.1",
                        "--directory", "/home/user/Derrogacao"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(2)
try:
    with sync_playwright() as pw:
        b = pw.chromium.launch(executable_path=CHROME)
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        ctx.add_init_script(FAKE)
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        pg.on("dialog", lambda d: d.accept())
        pg.goto(f"http://127.0.0.1:{PORTA}/index.html"); pg.wait_for_timeout(800)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.evaluate("async p => { await Store.save(p) }", proj)
        pg.reload(); pg.wait_for_timeout(1000)

        # --- liga a pasta ---
        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(300)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(1500)

        # --- a foto virou arquivo; o JSON ficou so com o nome ---
        dados = json.loads(pg.evaluate(LER))
        img = dados["projects"][0]["ncrs"][0]["evidence"][0]["images"][0]
        print("imagem no JSON:", json.dumps(img, ensure_ascii=False)[:120])
        assert img.get("arquivo") == "imagens/img1.jpg", "a imagem devia apontar para o arquivo"
        assert "src" not in img, "o base64 nao pode mais viajar dentro do JSON"
        arquivos = pg.evaluate(IMAGENS)
        print("arquivos em imagens/:", arquivos)
        assert arquivos and arquivos[0][0] == "img1.jpg" and arquivos[0][1] > 0

        # ao escolher a pasta a janela se fecha sozinha: reabre para ver o tamanho
        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(1200)
        tam = pg.locator("#pastaTamanhos").inner_text()
        print("linha de tamanho:", tam)
        assert "imagem(ns)" in tam and "de dados" in tam
        pg.click("#pastaFecharBtn"); pg.wait_for_timeout(300)

        # --- a colega reescreve o item e acrescenta outro, so com o nome da foto ---
        dados["projects"][0]["ncrs"][0]["currentSituation"] = "REESCRITO pela Maria"
        dados["projects"][0]["ncrs"][0]["editedBy"] = "Maria"
        dados["projects"][0]["ncrs"][0]["editedAt"] = "2026-09-20T10:00:00.000Z"
        dados["projects"][0]["ncrs"].append({
            "id": "n2", "ncrId": "NCR-777", "systems": "HP", "func": "FV 09",
            "description": "item da Maria", "editedBy": "Maria",
            "editedAt": "2026-09-20T10:00:00.000Z",
            "evidence": [{"id": "e2", "ref": "Attachment 1", "note": "",
                          "images": [{"id": "img1", "caption": "mesma foto", "arquivo": "imagens/img1.jpg"}]}]})
        dados["updatedBy"] = "Maria"
        dados["updatedAt"] = "2026-09-20T10:00:00.000Z"
        pg.evaluate(ESCREVER, json.dumps(dados))
        print("a colega gravou; esperando a rodada de 20s...")
        pg.wait_for_timeout(24000)

        numeros = pg.locator(".ncr-item-id").all_inner_texts()
        print("itens na tela:", numeros)
        assert "NCR-777" in numeros, "o item da colega devia ter chegado"

        # a foto do item dela veio do arquivo, nao do JSON
        hidratada = pg.evaluate("""async () => {
          const ps = await Store.list();
          const n = ps.filter(p => p.id === 'pa1')[0].ncrs.filter(x => x.ncrId === 'NCR-777')[0];
          const im = n.evidence[0].images[0];
          return [im.arquivo, (im.src || '').slice(0, 22), (im.src || '').length];
        }""")
        print("imagem do item da colega:", hidratada)
        assert hidratada[1].startswith("data:image/jpeg"), "a foto devia ter sido lida do arquivo"

        # --- o que a colega substituiu aqui ---
        pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(500)
        barra = pg.locator(".mudou").inner_text()
        print("aviso no item:", barra.replace("\n", " ")[:120])
        assert "Maria" in barra, "o aviso diz quem mexeu"
        pg.locator(".mudou .btn--accent").click(); pg.wait_for_timeout(400)
        rotulos = pg.locator(".dif-rotulo").all_inner_texts()
        antes = pg.locator(".dif-lado--antes .dif-txt").first.inner_text()
        depois = pg.locator(".dif-lado--depois .dif-txt").first.inner_text()
        print("campos mudados:", rotulos, "|", antes, "->", depois)
        # o CSS mostra o rotulo em maiusculas; a comparacao ignora isso
        assert "current situation" in [x.lower() for x in rotulos]
        assert antes == "montagem provisoria" and depois == "REESCRITO pela Maria"
        pg.click("#difCloseBtn"); pg.wait_for_timeout(300)

        # --- a poda nunca apaga foto em uso, nem foto recem-gravada ---
        sobrou = pg.evaluate("""async () => {
          await Pasta.podarImagens([]);          // nada em uso: ainda assim nao apaga
          const raiz = await navigator.storage.getDirectory();
          const dir = await raiz.getDirectoryHandle('Derrogacao');
          const im = await dir.getDirectoryHandle('imagens');
          const out = []; for await (const n of im.keys()) out.push(n); return out;
        }""")
        print("imagens apos podar com a lista vazia:", sobrou)
        assert sobrou == ["img1.jpg"], "foto de menos de 7 dias nunca e apagada"

        # --- guarda de versao: dados de uma pagina mais nova nao sao regravados ---
        dados["projects"][0]["schema"] = 99
        dados["projects"][0]["ncrs"][0]["campoDoFuturo"] = "nao pode sumir"
        dados["updatedBy"] = "Maria (versao nova)"
        dados["updatedAt"] = "2026-09-21T10:00:00.000Z"
        pg.evaluate(ESCREVER, json.dumps(dados))
        pg.wait_for_timeout(24000)
        pg.fill("#f-description", "tentando gravar depois disso"); pg.wait_for_timeout(3000)

        agora = json.loads(pg.evaluate(LER))
        print("quem gravou por ultimo:", agora["updatedBy"])
        assert agora["updatedBy"] == "Maria (versao nova)", "a pagina velha nao pode regravar a pasta"
        assert agora["projects"][0]["ncrs"][0].get("campoDoFuturo") == "nao pode sumir"

        guardado = pg.evaluate("""async () => {
          const ps = await Store.list();
          const n = ps.filter(p => p.id === 'pa1')[0].ncrs.filter(x => x.ncrId === 'NCR-001')[0];
          return [n.campoDoFuturo, ps.filter(p => p.id === 'pa1')[0].schema];
        }""")
        print("campo desconhecido guardado aqui:", guardado)
        assert guardado[0] == "nao pode sumir", "campo de versao mais nova tem de sobreviver aqui tambem"
        assert guardado[1] == 99

        pg.click("#menuBtn"); pg.wait_for_timeout(200)
        pg.click("#pastaBtn"); pg.wait_for_timeout(900)
        aviso = pg.locator("#pastaTamanhos").inner_text()
        print("aviso na janela da pasta:", aviso[-90:])
        assert "leitura" in aviso.lower(), "a janela precisa dizer que esta so lendo"
        b.close()
finally:
    srv.terminate()

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
