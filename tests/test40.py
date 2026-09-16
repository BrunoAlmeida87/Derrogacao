# Acessibilidade — WCAG 2.2 AA, medida na aplicacao carregada:
# 4.1.3 (avisos), 4.1.2/3.3.2 (nome dos controles), 2.5.7 (arrastar tem
# alternativa), 1.4.3 (contraste), 3.1.2 (idioma do relatorio), 2.5.8 (alvo).
import json, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
errs = []

AUDITA = r"""() => {
  const out = {};
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const nome = e => (e.getAttribute('aria-label') ||
      (e.getAttribute('aria-labelledby') ? 'via-labelledby' : '') ||
      (e.labels && e.labels.length ? e.labels[0].textContent.trim() : '') ||
      e.getAttribute('title') || (e.textContent || '').trim()).trim();

  out.semNome = [];
  document.querySelectorAll('button,input,select,textarea,a[href]').forEach(e => {
    if (!vis(e) || e.type === 'hidden') return;
    if (!nome(e)) out.semNome.push(e.tagName.toLowerCase() + '#' + (e.id || '') + '.' + (e.className || ''));
  });

  out.alvosPequenos = [];
  document.querySelectorAll('button,a[href],select,summary').forEach(e => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (r.width < 24 || r.height < 24)
      out.alvosPequenos.push({el: e.tagName.toLowerCase() + '#' + (e.id || '') + '.' + e.className,
                              w: +r.width.toFixed(1), h: +r.height.toFixed(1)});
  });

  const vivo = e => e && (e.getAttribute('role') === 'status' || e.getAttribute('role') === 'alert'
                          || !!e.getAttribute('aria-live'));
  out.toastVivo = vivo(document.getElementById('toast'));
  out.saveVivo = vivo(document.getElementById('saveState'));
  out.avisoVivo = vivo(document.getElementById('backupNotice'));

  out.tabs = Array.from(document.querySelectorAll('[role=tab]')).map(t => ({
    controls: t.getAttribute('aria-controls'), tabindex: t.getAttribute('tabindex'),
    selected: t.getAttribute('aria-selected')}));
  out.painéis = Array.from(document.querySelectorAll('[role=tabpanel]')).map(p => p.id);

  out.botoesMover = document.querySelectorAll('.ncr-item .ncr-move').length;
  out.itensArrastaveis = document.querySelectorAll('.ncr-item[draggable=true]').length;

  const lum = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const rgb = s => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s); return m ? [+m[1], +m[2], +m[3]] : null; };
  const L = c => 0.2126 * lum(c[0]) + 0.7152 * lum(c[1]) + 0.0722 * lum(c[2]);
  const fundo = e => { let n = e; while (n && n !== document.documentElement) {
      const a = getComputedStyle(n).backgroundColor; const b = rgb(a);
      if (b && !/rgba\(0, 0, 0, 0\)/.test(a)) return b; n = n.parentElement; } return [255, 255, 255]; };
  out.contrasteRuim = [];
  document.querySelectorAll('.hint,.note,.sm-kpi-sub,.sm-kpi-label,.ncr-item-sub,'
      + '.menu-item small,.edited-by,.mg-who,.pick-row-sub,.sec-peek,.menu-version,.sm-hint').forEach(e => {
    if (!vis(e) || !(e.textContent || '').trim()) return;
    const cs = getComputedStyle(e); const f = rgb(cs.color); if (!f) return;
    const r = (Math.max(L(f), L(fundo(e))) + 0.05) / (Math.min(L(f), L(fundo(e))) + 0.05);
    const px = parseFloat(cs.fontSize);
    const minimo = (px >= 24 || (+cs.fontWeight >= 700 && px >= 18.66)) ? 3 : 4.5;
    if (r < minimo) out.contrasteRuim.push({cls: e.className, px, cor: cs.color, ratio: +r.toFixed(2), minimo});
  });
  return out;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_page(viewport={"width": 1500, "height": 950})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(800)
    pg.fill("#marcoInput", "RANAE J06"); pg.wait_for_timeout(250)
    for n in ["NCR-001", "NCR-002", "NCR-003"]:
        pg.click("#addNcrBtn"); pg.wait_for_timeout(250)
        pg.fill("#f-ncrId", n); pg.fill("#f-func", "FV 01 - teste"); pg.wait_for_timeout(350)
    pg.wait_for_timeout(600)

    r = pg.evaluate(AUDITA)
    print(json.dumps(r, indent=1, ensure_ascii=False))
    assert not r["semNome"], "4.1.2/3.3.2 — controles sem nome acessível: %s" % r["semNome"]
    assert not r["alvosPequenos"], "2.5.8 — alvos menores que 24x24: %s" % r["alvosPequenos"]
    assert r["toastVivo"], "4.1.3 — os avisos do #toast não são anunciados"
    assert r["saveVivo"], "4.1.3 — o indicador de gravação não é anunciado"
    assert r["avisoVivo"], "4.1.3 — o aviso de backup não é anunciado"
    assert r["tabs"] and all(t["controls"] for t in r["tabs"]), "4.1.2 — abas sem aria-controls"
    assert r["painéis"], "4.1.2 — nenhum role=tabpanel"
    assert sum(1 for t in r["tabs"] if t["tabindex"] == "0") == 1, \
        "4.1.2 — a faixa de abas precisa de um único ponto de tabulação"
    assert r["botoesMover"] >= 2 * r["itensArrastaveis"], \
        "2.5.7 — reordenar só por arrastar, sem alternativa de um clique"
    assert not r["contrasteRuim"], "1.4.3 — contraste abaixo do mínimo: %s" % r["contrasteRuim"]

    # 3.1.2 — o relatório é em inglês dentro de uma página em português
    pg.click("#previewBtn"); pg.wait_for_timeout(900)
    langs = pg.evaluate("()=>({paginas: document.querySelectorAll('#previewStage .rep-page[lang]').length,"
                        " total: document.querySelectorAll('#previewStage .rep-page').length,"
                        " pt: document.querySelectorAll('#previewStage [lang=\"pt-BR\"]').length})")
    print("3.1.2:", langs)
    assert langs["total"] and langs["paginas"] == langs["total"], \
        "3.1.2 — as páginas do relatório (inglês) não declaram o idioma"

    # reordenar pelo botão, sem arrastar
    pg.click("#closePreviewBtn"); pg.wait_for_timeout(300)
    antes = pg.locator(".ncr-item-id").all_inner_texts()
    pg.click('.ncr-item:nth-child(3) .ncr-move[data-passo="-1"]'); pg.wait_for_timeout(700)
    depois = pg.locator(".ncr-item-id").all_inner_texts()
    print("ordem antes :", antes)
    print("ordem depois:", depois)
    assert depois == [antes[0], antes[2], antes[1]], (antes, depois)
    b.close()

print("ERRORS:", errs if errs else "none")
print("OK — WCAG 2.2 AA nos pontos auditados.")
