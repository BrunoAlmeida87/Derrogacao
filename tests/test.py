import json, base64, pathlib, sys
from playwright.sync_api import sync_playwright


# Uma imagem de teste (retangulo colorido) para a pagina de evidencia
from PIL import Image
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
img = Image.new("RGB", (900, 700), (60, 140, 70))
img.save(SP/"ev1.jpg", quality=85)
img2 = Image.new("RGB", (900, 700), (40, 90, 160))
img2.save(SP/"ev2.jpg", quality=85)

def durl(p):
    return "data:image/jpeg;base64," + base64.b64encode((SP/p).read_bytes()).decode()

project = {
  "id":"p1","schema":1,"name":"RANAE J06","marco":"RANAE J06",
  "coverTitle":"Waiver Request For","coverSubtitle":"List of Waiver Requested :",
  "footer":"Gerência técnica operacional",
  "ncrs":[
    {"id":"n1","ncrId":"NCR-ICN-ESC-13-1098-2023","systems":"RM","func":"FV 01 - Sea water circuit integrity",
     "description":"During the installation of the ESM mast Jack ((RM00822 - 09PE000D00030 - S/N 1754188 - F3018/DCNS), it was found that the fixing screws did not fit the assembly as their length was insufficient.",
     "currentSituation":"The ESM is mounted with provisionally manufactured screws according NG detailed specifications (Custom screws made from X2CRNIMO17-12-2 stainless steel).\n\nICN is using temporary screws while awaiting the delivery of the new fixing elements. Inspection D95-3 and F07 has been validated and there is no functional impact. After the installation of the new screws, only D95-3 and F07 will need to be redone, with no functional impact.",
     "whyNotPossible":"No material available (CMD/NGD not yet defined by BO. As soon as it is defined, the information will be inserted in the RAL. keep the NCR in 6.1 PEnd. Material).\nNaval Group will update the drawing G100528842 (BDM-00031570) to reflect the correct dimensions.\nA new bolting kit with the correct dimensions will be provided for each boat:\nSX-1629: Mark M1 Screw H M16x150 (14 units).\nSX-1631: Mark 3 Adjusted screw (4 units).\nAccording NG Deliberation, modifications will be managed by Change Request CR-83614.",
     "arguments":"The ESM is provisionally mounted and validated with manufactured screws according to NG detailed specifications.\nInspections D95-03 and F07 are performed and validated.\nThere is no functional impact and there will be no functional regression.",
     "archAnswer":"Issue will be covered by DEV-83614, after TRAP. Waiver accepted.",
     "requestExpiry":"PÓS TRAP","archStatus":"WAIVER ACCEPTED","approvedExpiry":"PÓS TRAP",
     "historic":"J06 To: RANAE J06\nJ06Cer To: RANAE",
     "certificates":["S02 RMZ2010"],"evidence":[]},
    {"id":"n2","ncrId":"NCR-ICN-ESC-13-1612-2024","systems":"ME","func":"FV 05 - Propel the ship in emergency",
     "description":"The proximity sensor connector latches on the EPM ME00001 are broken.",
     "currentSituation":"The lock needs to be reinstalled, but no retesting is necessary as the tests have not yet been performed.\nThe process is currently pending due to the unavailability of the Proximity Sensor Lock Kit.\nSince one sensor utilizes 2 latches, it was decided to use one latch in each sensor, as per picture.\nSensor is installed and operational.",
     "whyNotPossible":"There is currently no material available in stock, and there is no expectation of receiving it within the foreseeable timeline.",
     "arguments":"The deviation has been addressed. However, there is no material available in stock, and no immediate replenishment is expected in the foreseeable future.",
     "archAnswer":"System operational with provisionally solution. Waiver accepted",
     "requestExpiry":"PÓS TRAP","archStatus":"WAIVER ACCEPTED","approvedExpiry":"PÓS TRAP",
     "historic":"J07 To: RANAE J06",
     "certificates":["Shipyard Certificate","Temporary instructions - RANAE J11"],
     "evidence":[{"id":"e1","ref":"Attachment 1","note":"",
        "images":[{"id":"i1","src":durl("ev1.jpg"),"caption":"Missing Latches"},
                  {"id":"i2","src":durl("ev2.jpg"),"caption":"Latches"}]},
       {"id":"e2","ref":"Attachment 2","orientation":"portrait","note":"Anexo em retrato com quatro imagens.",
        "images":[{"id":"j%d"%k,"src":durl("ev1.jpg" if k%2 else "ev2.jpg"),"caption":"Foto %d"%k} for k in range(1,5)]}]}
  ],
  "createdAt":"2026-09-10T00:00:00Z","updatedAt":"2026-09-10T00:00:00Z"
}

errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width":1500,"height":1000})
    pg.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    pg.goto("file:///home/user/Derrogacao/index.html")
    pg.wait_for_timeout(800)

    # injeta o projeto de teste direto no IndexedDB via a API do Store
    pg.evaluate("""async (proj) => {
        await Store.save(proj);
    }""", project)
    pg.reload()
    pg.wait_for_timeout(900)

    pg.screenshot(path=str(SP/"ui-editor.png"), full_page=False)

    # abre a pre-visualizacao
    pg.click("#previewBtn")
    pg.wait_for_timeout(600)
    pg.screenshot(path=str(SP/"ui-preview.png"))
    pg.click("#closePreviewBtn")

    # monta o print root e gera o PDF
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Teste')")
    pg.click("#pdfBtn"); pg.wait_for_timeout(500)
    for cb in pg.locator(".pick-cb").all():
        if not cb.is_disabled() and not cb.is_checked(): cb.check()
    pg.wait_for_timeout(250)
    pg.click("#pdfGoBtn"); pg.wait_for_timeout(800)
    pg.pdf(path=str(SP/"out.pdf"), print_background=True, prefer_css_page_size=True)
    b.close()

print("ERRORS:", json.dumps(errors, indent=1) if errors else "none")
