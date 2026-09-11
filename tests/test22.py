# Ordenacao da lista: reflete na tela E no PDF. E o arrastar volta ao manual.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width":1500,"height":950})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(800)
    pg.fill("#marcoInput","RANAE J06"); pg.wait_for_timeout(300)

    # entrada fora de ordem de proposito
    dados = [("NCR-10","RM","FV20 - ELECTRIC SUPPLY","Waiver accepted"),
             ("NCR-2", "HP","FV09 - COORDINATE DAMAGE CONTROL","Em preenchimento"),
             ("NCR-1", "EX","FV36 - PRESSURE HULL INTEGRITY","Waiver requested"),
             ("NCR-9", "BF","FV01 - SEA WATER CIRCUIT INTEGRITY","Improve justification")]
    for num, sis, fun, st in dados:
        pg.click("#addNcrBtn"); pg.wait_for_timeout(300)
        pg.fill("#f-ncrId",num); pg.fill("#f-systems",sis); pg.fill("#f-func",fun)
        pg.fill("#f-description","texto "+num)
        pg.locator(".status-op", has_text=st).click(); pg.wait_for_timeout(600)

    def lista(): return pg.locator(".ncr-item-id").all_inner_texts()
    print("opcoes de ordem:", [o.inner_text() for o in pg.locator("#ordemSelect option").all()])
    print("\nmanual (ordem de criacao):", lista())
    assert lista() == ["NCR-10","NCR-2","NCR-1","NCR-9"], lista()

    def ordenar(valor):
        pg.select_option("#ordemSelect", valor); pg.wait_for_timeout(900)
        return lista()

    print("por numero  :", ordenar("numero"))
    assert lista() == ["NCR-1","NCR-2","NCR-9","NCR-10"], "alfanumerico: 10 depois do 9"
    print("por sistema :", ordenar("sistema"))
    assert lista() == ["NCR-9","NCR-1","NCR-2","NCR-10"], lista()      # BF EX HP RM
    print("por funcao  :", ordenar("funcao"))
    assert lista() == ["NCR-9","NCR-2","NCR-10","NCR-1"], lista()      # FV01 FV09 FV20 FV36
    print("por situacao:", ordenar("situacao"))
    assert lista() == ["NCR-2","NCR-1","NCR-9","NCR-10"], lista()      # preench, request, justif, aceito

    # --- a ordem tem de sair no PDF ---
    pg.select_option("#ordemSelect","numero"); pg.wait_for_timeout(800)
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(1500)
    indice = pg.locator("#printRoot .rep-index-item").all_inner_texts()
    print("\nindice da capa no PDF:", [x.split("|")[0] for x in indice])
    assert [x.split("|")[0] for x in indice] == ["NCR-1","NCR-2","NCR-9","NCR-10"]
    titulos = [t.inner_text().replace("\n"," ") for t in pg.locator("#printRoot .rep-title").all()]
    print("paginas do PDF:", [t.split("|")[0].replace("Waiver Request for ","") for t in titulos])
    assert [t.split("|")[0].replace("Waiver Request for ","").strip() for t in titulos] == ["NCR-1","NCR-2","NCR-9","NCR-10"]

    # --- persiste ao recarregar ---
    pg.reload(); pg.wait_for_timeout(1200)
    print("\napos recarregar, ordem:", pg.input_value("#ordemSelect"), "|", lista())
    assert pg.input_value("#ordemSelect") == "numero"

    # --- fixar transforma em manual, mantendo o que se ve ---
    print("botao fixar visivel:", pg.locator("#ordemFixarBtn").is_visible())
    pg.click("#ordemFixarBtn"); pg.wait_for_timeout(900)
    print("apos fixar:", pg.input_value("#ordemSelect"), "|", lista())
    assert pg.input_value("#ordemSelect") == "manual"
    assert lista() == ["NCR-1","NCR-2","NCR-9","NCR-10"]
    print("botao fixar sumiu:", pg.locator("#ordemFixarBtn").is_hidden())
    b.close()
print("\nERRORS:", errs if errs else "none")
