import pathlib, json
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

DL=SP/"dl6"; DL.mkdir(exist_ok=True)

# A versão de arquivo único é gerada na publicação; aqui geramos sob demanda.
import subprocess
_RAIZ = pathlib.Path(__file__).resolve().parent.parent
if not (SP/"solo.html").exists():
    subprocess.run(["python3", str(_RAIZ/"tools"/"build-standalone.py"), "teste"],
                   cwd=str(_RAIZ), check=True, stdout=subprocess.DEVNULL)
    (SP/"solo.html").write_bytes((_RAIZ/"derrogacao.html").read_bytes())

URL="file://"+str(SP/"solo.html")

# Imagens de apoio para as evidências, criadas aqui para o teste rodar sozinho.
from PIL import Image
for _nome, _cor in (("ev1.jpg", (60, 140, 70)), ("ev2.jpg", (40, 90, 160))):
    if not (SP/_nome).exists():
        Image.new("RGB", (900, 700), _cor).save(SP/_nome, quality=85)

errs=[]
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path=CHROME)
    ctx=b.new_context(viewport={"width":1500,"height":950}, accept_downloads=True)
    pg=ctx.new_page()
    pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog",lambda d:d.accept())
    pg.goto(URL); pg.wait_for_timeout(400)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.reload(); pg.wait_for_timeout(800)

    # nenhuma requisicao externa deve existir
    print("recursos externos no HTML:", pg.evaluate("""()=>{
        const a=[...document.querySelectorAll('link[href],script[src],img[src]')]
          .map(e=>e.getAttribute('href')||e.getAttribute('src'))
          .filter(u=>u && !u.startsWith('data:'));
        return a;
    }"""))
    pg.click("#menuBtn"); pg.wait_for_timeout(300)
    print("versao:", pg.inner_text("#menuVersion"),
          "| link de download escondido:", pg.locator("#standaloneLink").is_hidden())
    pg.click("#menuBtn"); pg.wait_for_timeout(200)

    # fluxo completo
    pg.fill("#marcoInput","RANAE J06")
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    pg.fill("#f-ncrId","NCR-ICN-ESC-13-1098-2023"); pg.fill("#f-systems","RM")
    pg.fill("#f-func","FV 01 - Sea water circuit integrity")
    pg.fill("#f-description","teste no arquivo único, com acentuação çãõ")
    pg.fill("#f-currentSituation","s"); pg.fill("#f-whyNotPossible","w"); pg.fill("#f-arguments","a")
    pg.fill("#f-archStatus","WAIVER ACCEPTED")
    # imagem
    pg.click("text=+ Novo anexo"); pg.wait_for_timeout(300)
    pg.set_input_files(".evid-page input[type=file]", str(SP/"ev1.jpg")); pg.wait_for_timeout(900)
    print("\nimagem embutida:", pg.locator(".evid-thumb").count())
    pg.locator(".done-bar .btn").first.click(); pg.wait_for_timeout(700)

    # persistencia apos recarregar (IndexedDB em file://)
    pg.reload(); pg.wait_for_timeout(1000)
    print("apos recarregar — ncrs:", pg.locator(".ncr-item").count(),
          "| marco:", pg.input_value("#marcoInput"),
          "| concluida:", pg.locator(".ncr-item .done-tick").count())

    # aba DEV e Resumo
    pg.click(".tab[data-kind=dev]"); pg.wait_for_timeout(400)
    pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
    pg.fill("#f-ncrId","DEV-78154"); pg.fill("#f-func","BQ - Modification des compensateurs")
    pg.wait_for_timeout(800)
    pg.click(".tab[data-kind=resumo]"); pg.wait_for_timeout(700)
    print("resumo — KPIs:", [k.locator(".sm-kpi-value").inner_text() for k in pg.locator(".sm-kpi").all()],
          "| graficos:", pg.locator(".sm-svg").count())

    # PDF
    pg.click(".tab[data-kind=ncr]"); pg.wait_for_timeout(400)
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    for cb in pg.locator(".pick-cb").all():
        if not cb.is_disabled() and not cb.is_checked(): cb.check()
    pg.wait_for_timeout(250)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(900)
    pg.pdf(path=str(SP/"out_solo.pdf"), print_background=True, prefer_css_page_size=True)

    # backup
    pg.click("#menuBtn"); pg.wait_for_timeout(200)
    with pg.expect_download() as dl: pg.click("#backupAllBtn")
    d=dl.value; p=DL/d.suggested_filename; d.save_as(str(p)); pg.wait_for_timeout(600)
    pg.click("#backupDoneBtn"); pg.wait_for_timeout(300)
    data=json.loads(p.read_text())["projects"][0]
    print("\nbackup:", d.suggested_filename, "| ncrs:", len(data["ncrs"]), "| devs:", len(data["devs"]),
          "| imagem:", data["ncrs"][0]["evidence"][0]["images"][0]["src"][:22])
    b.close()
print("\nERRORS:", errs if errs else "none")
