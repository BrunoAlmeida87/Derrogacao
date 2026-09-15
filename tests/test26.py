# Editor no dia a dia: duplicar um item, desfazer a exclusao, buscar em todo
# o texto e a trava do item ja aceito.
import json, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")

proj = {
  "id": "ed1", "schema": 1, "name": "RANAE J06", "marco": "RANAE J06",
  "ncrs": [
    {"id": "n1", "ncrId": "NCR-001", "systems": "RM", "func": "FV 01 - Sea water",
     "description": "parafusos curtos no mastro ESM",
     "currentSituation": "montado com parafusos provisorios",
     "certificates": ["S02 RMZ2010"], "status": "solicitado",
     "evidence": [{"id": "e1", "ref": "Attachment 1", "note": "",
                   "images": [{"id": "i1", "src": "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
                               "caption": "trava quebrada"}]}]},
    {"id": "n2", "ncrId": "NCR-002", "systems": "ME", "func": "FV 05 - Propel",
     "description": "conector do sensor", "status": "aceito", "done": True, "evidence": []}
  ],
  "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z"
}

errs = []
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    ctx = b.new_context(viewport={"width": 1500, "height": 1000})
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(700)
    pg.evaluate("()=>localStorage.setItem('derrogacao:user','Bruno')")
    pg.evaluate("async p => { await Store.save(p) }", proj)
    pg.reload(); pg.wait_for_timeout(900)

    numeros = lambda: pg.locator(".ncr-item-id").all_inner_texts()

    # --- busca em todo o texto ---------------------------------------------
    pg.fill("#ncrFilter", "mastro"); pg.wait_for_timeout(300)
    print("busca 'mastro' (so na descricao):", numeros())
    assert numeros() == ["NCR-001"], "a busca deveria alcancar a descricao"

    pg.fill("#ncrFilter", "trava quebrada"); pg.wait_for_timeout(300)
    print("busca pela legenda da foto:", numeros())
    assert numeros() == ["NCR-001"], "a busca deveria alcancar a legenda da evidencia"

    pg.fill("#ncrFilter", "RMZ2010"); pg.wait_for_timeout(300)
    print("busca pelo certificado:", numeros())
    assert numeros() == ["NCR-001"], "a busca deveria alcancar os certificados"
    pg.fill("#ncrFilter", ""); pg.wait_for_timeout(300)

    # --- duplicar ----------------------------------------------------------
    pg.locator(".ncr-item").first.click(); pg.wait_for_timeout(300)
    pg.click("#dupNcrBtn"); pg.wait_for_timeout(600)
    print("apos duplicar:", numeros())
    assert numeros() == ["NCR-001", "NCR-001 (cópia)", "NCR-002"], "a copia entra ao lado do original"

    # a copia e independente: mexer nela nao mexe no original
    pg.fill("#f-ncrId", "NCR-003"); pg.wait_for_timeout(200)
    pg.fill("#f-description", "outro assunto"); pg.wait_for_timeout(700)
    dados = pg.evaluate("""async () => {
      const ps = await Store.list();
      const p = ps.filter(x => x.id === 'ed1')[0];
      return p.ncrs.map(n => [n.ncrId, n.description, (n.evidence[0]||{}).id,
                              ((n.evidence[0]||{images:[]}).images[0]||{}).id, n.status]);
    }""")
    print("itens gravados:", json.dumps(dados, ensure_ascii=False))
    orig = [d for d in dados if d[0] == "NCR-001"][0]
    copia = [d for d in dados if d[0] == "NCR-003"][0]
    assert orig[1] == "parafusos curtos no mastro ESM", "o original nao pode mudar"
    assert copia[1] == "outro assunto"
    assert copia[2] != orig[2] and copia[3] != orig[3], "anexos e imagens da copia tem id proprio"
    assert copia[4] == "preenchendo", "a copia comeca em preenchimento"

    # --- desfazer a exclusao ----------------------------------------------
    pg.click("#delNcrBtn"); pg.wait_for_timeout(500)
    print("apos excluir:", numeros())
    assert "NCR-003" not in numeros()
    lapides = pg.evaluate("async()=>{const ps=await Store.list();return ps.filter(x=>x.id==='ed1')[0].deleted.length}")
    print("lapides:", lapides)
    assert lapides == 1, "a exclusao deixa lapide, para nao voltar pela sincronizacao"

    pg.click(".toast-acao"); pg.wait_for_timeout(700)
    print("apos desfazer:", numeros())
    assert "NCR-003" in numeros(), "o desfazer devolve o item"
    depois = pg.evaluate("""async () => {
      const ps = await Store.list();
      const p = ps.filter(x => x.id === 'ed1')[0];
      const n = p.ncrs.filter(x => x.ncrId === 'NCR-003')[0];
      return { lapides: p.deleted.length, editedAt: n.editedAt, texto: n.description };
    }""")
    print("depois de desfazer:", json.dumps(depois, ensure_ascii=False))
    assert depois["lapides"] == 0, "a lapide tem de sair, senao a pasta apaga de novo"
    assert depois["editedAt"], "o item volta com edicao nova, para vencer a lapide dos outros"
    assert depois["texto"] == "outro assunto", "volta com o conteudo que tinha"

    # o historico da sessao nao pode continuar dizendo que o item foi excluido
    acoes = pg.evaluate("""async () => {
      const ps = await Store.list();
      const p = ps.filter(x => x.id === 'ed1')[0];
      const s = p.sessions[p.sessions.length - 1];
      return s.changes.map(c => [c.label, c.action]);
    }""")
    print("historico da sessao:", acoes)
    assert ["NCR-003", "excluiu"] not in [list(a) for a in acoes], \
        "excluir e desfazer nao e uma exclusao no historico"

    # --- trava do item aceito ---------------------------------------------
    pg.locator(".ncr-item", has_text="NCR-002").click(); pg.wait_for_timeout(400)
    travado = pg.locator(".trava").count() == 1
    somenteLeitura = pg.evaluate("()=>document.getElementById('f-description').readOnly")
    print("item aceito — aviso de trava:", travado, "| campo travado:", somenteLeitura)
    assert travado and somenteLeitura, "item aceito abre travado"

    pg.locator(".trava button").click(); pg.wait_for_timeout(400)
    liberado = pg.evaluate("()=>document.getElementById('f-description').readOnly")
    print("apos 'Editar mesmo assim' — campo travado:", liberado)
    assert not liberado, "o clique consciente libera a edicao"
    pg.fill("#f-description", "corrigido depois de aceito"); pg.wait_for_timeout(700)
    v = pg.evaluate("""async()=>{const ps=await Store.list();
      return ps.filter(x=>x.id==='ed1')[0].ncrs.filter(n=>n.ncrId==='NCR-002')[0].description}""")
    print("texto gravado:", v)
    assert v == "corrigido depois de aceito"

    # um item ainda nao aceito nunca fica travado
    pg.locator(".ncr-item", has_text="NCR-001").first.click(); pg.wait_for_timeout(400)
    print("item pendente tem trava:", pg.locator(".trava").count())
    assert pg.locator(".trava").count() == 0
    b.close()

print("ERRORS:", json.dumps(errs, indent=1) if errs else "none")
