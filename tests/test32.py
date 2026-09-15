# Conversa da equipe: ligar pela tela de ajustes, falar no geral e em separado,
# receber o que o colega gravou na pasta sem perder o que foi escrito aqui,
# apagar o proprio recado e desligar a aba. A "pasta" e um diretorio OPFS
# injetado no lugar do seletor do Windows, como nos testes 19 a 21; a colega
# (Maria) e simulada escrevendo direto no arquivo conversas.json.
import json, os, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
PORTA = 8137
errs = []

FAKE = """
window.__pastaFalsa = async () => {
  const raiz = await navigator.storage.getDirectory();
  return await raiz.getDirectoryHandle('Derrogacao', {create:true});
};
window.showDirectoryPicker = () => window.__pastaFalsa();
"""

LER = """async () => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao');
  try {
    const fh = await dir.getFileHandle('conversas.json');
    return await (await fh.getFile()).text();
  } catch (e) { return ''; }
}"""

ESCREVER = """async (txt) => {
  const raiz = await navigator.storage.getDirectory();
  const dir = await raiz.getDirectoryHandle('Derrogacao', {create:true});
  const fh = await dir.getFileHandle('conversas.json', {create:true});
  const w = await fh.createWritable(); await w.write(txt); await w.close();
  return true;
}"""


def arquivo(pg):
    txt = pg.evaluate(LER)
    return json.loads(txt) if txt else {"mensagens": []}


def textos(dados, canal=None):
    return [m["texto"] for m in dados["mensagens"]
            if (canal is None or m["canal"] == canal) and not m.get("apagada")]


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
        url = "http://127.0.0.1:%d/index.html" % PORTA
        pg.goto(url); pg.wait_for_timeout(800)
        pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
        pg.reload(); pg.wait_for_timeout(900)

        # --- a aba so existe depois de ligada ---
        print("aba Conversa escondida de saida:", pg.locator('.tab[data-kind=conversa]').is_hidden())
        assert pg.locator('.tab[data-kind=conversa]').is_hidden(), \
            "a conversa e opcional: sem ligar, a aba nao aparece"

        # --- um relatorio e a pasta ---
        pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(300)
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId", "NCR-001"); pg.fill("#f-func", "FV 01 - Sea water")
        pg.wait_for_timeout(700)
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#pastaBtn"); pg.wait_for_timeout(400)
        pg.click("#pastaEscolherBtn"); pg.wait_for_timeout(2500)
        print("pasta ligada:", pg.inner_text("#pastaChipLabel"))

        # --- ligar pela tela de ajustes ---
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#settingsBtn"); pg.wait_for_timeout(400)
        print("ajuste presente:", pg.locator("#conversaLigada").count() == 1)
        assert pg.locator("#conversaLigada").count() == 1, "faltou o botao de ligar nos ajustes"
        pg.check("#conversaLigada"); pg.wait_for_timeout(600)
        pg.click("#settingsCloseBtn"); pg.wait_for_timeout(400)
        print("aba Conversa aparece:", pg.locator('.tab[data-kind=conversa]').is_visible())
        assert pg.locator('.tab[data-kind=conversa]').is_visible()

        # --- falar no geral ---
        pg.click('.tab[data-kind=conversa]'); pg.wait_for_timeout(600)
        print("canais na lateral:", [c.inner_text().split("\n")[0]
                                     for c in pg.locator(".conv-canal").all()])
        print("aviso a vista:", pg.locator(".conv-aviso").is_visible(),
              "|", pg.inner_text(".conv-aviso")[:60].replace("\n", " "))
        assert pg.locator(".conv-aviso").is_visible(), \
            "o aviso de que a conversa nao e secreta fica sempre a vista"

        pg.fill("#convTexto", "Pessoal, o J06 fecha sexta.")
        pg.click("#convEnviarBtn"); pg.wait_for_timeout(1500)
        na_tela = pg.locator(".conv-msg-txt").all_text_contents()
        print("na tela:", na_tela)
        assert "Pessoal, o J06 fecha sexta." in na_tela

        dados = arquivo(pg)
        print("arquivo na pasta:", dados.get("format"), "| mensagens:", len(dados["mensagens"]))
        assert dados.get("format") == "derrogacao-conversas"
        assert "Pessoal, o J06 fecha sexta." in textos(dados, "geral")

        # --- a colega escreve direto no arquivo, no geral e em separado ---
        dados["mensagens"].append({
            "id": "maria-1", "canal": "geral", "de": "Maria",
            "texto": "Fecha sim, falta a NCR-002.", "em": "2099-01-01T10:00:00.000Z"})
        dados["mensagens"].append({
            "id": "maria-2", "canal": "d:bruno|maria", "de": "Maria",
            "texto": "Bruno, o certificado venceu.", "em": "2099-01-01T10:05:00.000Z"})
        pg.evaluate(ESCREVER, json.dumps(dados))
        print("\nMaria gravou na pasta (geral + direto).")

        # escrever daqui obriga a ler-juntar-gravar: o recado dela nao pode sumir
        pg.fill("#convTexto", "Combinado.")
        pg.click("#convEnviarBtn"); pg.wait_for_timeout(1800)

        depois = arquivo(pg)
        print("mensagens no arquivo:", [(m["de"], m["texto"][:28]) for m in depois["mensagens"]])
        assert "Fecha sim, falta a NCR-002." in textos(depois, "geral"), \
            "gravar daqui apagou o recado da colega"
        assert "Bruno, o certificado venceu." in textos(depois, "d:bruno|maria")
        assert "Combinado." in textos(depois, "geral")

        na_tela = pg.locator(".conv-msg-txt").all_text_contents()
        print("geral na tela:", na_tela)
        assert "Fecha sim, falta a NCR-002." in na_tela, "o recado da colega deveria aparecer"

        # --- conversa direta: canal na lateral, com nao lidas ---
        canais = [c.inner_text().replace("\n", " ") for c in pg.locator(".conv-canal").all()]
        print("canais agora:", canais)
        assert any("Maria" in c for c in canais), "a colega deveria virar um canal direto"
        # o geral estava aberto quando o recado dela chegou: ja esta lido
        geral = [c for c in canais if c.startswith("Geral")][0]
        assert geral.count("1") == 0, "o canal aberto nao acumula nao lidas: " + geral
        assert pg.locator(".conv-canal-n").count() >= 1, "o recado dela conta como nao lido"

        pg.locator(".conv-canal", has_text="Maria").first.click(); pg.wait_for_timeout(600)
        direto = pg.locator(".conv-msg-txt").all_text_contents()
        print("conversa direta:", direto)
        assert direto == ["Bruno, o certificado venceu."], direto

        pg.fill("#convTexto", "Vou pedir a renovacao.")
        pg.click("#convEnviarBtn"); pg.wait_for_timeout(1500)
        d2 = arquivo(pg)
        assert "Vou pedir a renovacao." in textos(d2, "d:bruno|maria"), \
            "a resposta tem de ir para o mesmo canal dos dois"
        print("apos responder, canal direto no arquivo:", textos(d2, "d:bruno|maria"))

        # o geral nao se mistura com o direto
        assert "Vou pedir a renovacao." not in textos(d2, "geral")

        # --- apagar o proprio recado vale para todo mundo ---
        pg.locator(".conv-msg.is-minha").last.locator(".conv-msg-apagar").click()
        pg.wait_for_timeout(1500)
        d3 = arquivo(pg)
        apagadas = [m for m in d3["mensagens"] if m.get("apagada")]
        print("\napagadas no arquivo:", len(apagadas), "| texto guardado:",
              [m["texto"] for m in apagadas])
        assert len(apagadas) == 1 and apagadas[0]["texto"] == "", \
            "apagar deixa a lapide, sem o texto — senao o recado volta na proxima leitura"
        assert "Vou pedir a renovacao." not in pg.locator(".conv-msg-txt").all_text_contents()

        # --- reabrir: a conversa vem da pasta ---
        pg.reload(); pg.wait_for_timeout(3000)
        pg.click('.tab[data-kind=conversa]'); pg.wait_for_timeout(700)
        vistos = pg.locator(".conv-msg-txt").all_text_contents()
        print("apos reabrir, geral:", vistos)
        assert "Fecha sim, falta a NCR-002." in vistos and "Combinado." in vistos

        # --- a conversa nao entra no PDF ---
        pg.click('.tab[data-kind=ncr]'); pg.wait_for_timeout(500)
        pg.click("#pdfBtn"); pg.wait_for_timeout(1500)
        pg.click("#pdfGoBtn"); pg.wait_for_timeout(1200)
        impresso = pg.inner_text("#printRoot")
        print("conversa no PDF:", "Combinado." in impresso, "| folhas:",
              pg.locator("#printRoot .rep-page").count())
        assert "Combinado." not in impresso and "Maria" not in impresso, \
            "o relatorio e o relatorio: recado nenhum sai nele"

        # --- desligar esconde a aba e nao apaga nada ---
        pg.click("#menuBtn"); pg.wait_for_timeout(250)
        pg.click("#settingsBtn"); pg.wait_for_timeout(400)
        pg.uncheck("#conversaLigada"); pg.wait_for_timeout(500)
        pg.click("#settingsCloseBtn"); pg.wait_for_timeout(400)
        print("\naba escondida de novo:", pg.locator('.tab[data-kind=conversa]').is_hidden(),
              "| editor de volta:", pg.locator("#editorScroll").is_visible())
        assert pg.locator('.tab[data-kind=conversa]').is_hidden()
        assert pg.locator("#editorScroll").is_visible(), "ao desligar, a tela volta para a NCR"
        d4 = arquivo(pg)
        assert "Fecha sim, falta a NCR-002." in textos(d4, "geral"), \
            "desligar a aba nao apaga a conversa da pasta"
        print("conversa segue na pasta:", len(d4["mensagens"]), "mensagem(ns)")

        b.close()
finally:
    srv.terminate()

print("\nERRORS:", json.dumps(errs, indent=1) if errs else "none")
