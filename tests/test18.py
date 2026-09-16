# Regras da mesclagem do banco compartilhado: vence quem editou por ultimo,
# lapide propaga exclusao, e o pareamento continua sendo por marco.
import pathlib
from playwright.sync_api import sync_playwright
import os, pathlib
# Diretório de trabalho dos testes (downloads, capturas, PDFs gerados).
SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
# Chromium do Playwright. Ajuste se estiver noutro lugar.
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
errs = []

CASOS = """() => {
  const R = [];
  const item = (id, ncrId, at, desc) => ({
    id, ncrId, systems:'RM', func:'FV', description:desc,
    currentSituation:'', whyNotPossible:'', arguments:'', archAnswer:'',
    requestExpiry:'', archStatus:'', approvedExpiry:'', historic:'',
    certificates:[], evidence:[], status:'preenchendo', done:false,
    editedBy:'x', editedAt:at, syncBase:''
  });
  const proj = (id, marco, ncrs, deleted, updatedAt) => Store.normalizeProject({
    id, marco, name:marco, ncrs, devs:[], deleted:deleted||[], sessions:[],
    updatedAt: updatedAt || '2026-01-01T00:00:00.000Z'
  });

  // 1) item novo do outro lado entra
  let meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z','meu')]);
  let r = Store.mergeLWW(meu, proj('p','RANAE J06',[
    item('a','NCR-1','2026-01-01T10:00:00.000Z','meu'),
    item('b','NCR-2','2026-01-01T11:00:00.000Z','dele')]));
  R.push(['entra item novo', meu.ncrs.map(n=>n.ncrId).join(',') + '/' + r.entraram, 'NCR-1,NCR-2/1']);

  // 2) edicao mais recente do outro vence
  meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z','versao antiga')]);
  r = Store.mergeLWW(meu, proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T12:00:00.000Z','versao nova')]));
  R.push(['edicao mais nova vence', meu.ncrs[0].description + '/' + r.atualizados, 'versao nova/1']);

  // 3) a MINHA edicao mais recente permanece
  meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T15:00:00.000Z','minha, recente')]);
  r = Store.mergeLWW(meu, proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T12:00:00.000Z','dele, antiga')]));
  R.push(['minha edicao recente fica', meu.ncrs[0].description + '/' + r.atualizados, 'minha, recente/0']);

  // 4) lapide do outro lado exclui aqui
  meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z','meu')]);
  r = Store.mergeLWW(meu, proj('p','RANAE J06',[],
      [{id:'a',kind:'ncr',ncrId:'NCR-1',at:'2026-01-01T11:00:00.000Z',by:'Maria'}]));
  R.push(['lapide exclui', meu.ncrs.length + '/' + r.removidos, '0/1']);

  // 5) mas se eu editei DEPOIS da exclusao, o item fica
  meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T12:00:00.000Z','editei depois')]);
  r = Store.mergeLWW(meu, proj('p','RANAE J06',[],
      [{id:'a',kind:'ncr',ncrId:'NCR-1',at:'2026-01-01T11:00:00.000Z',by:'Maria'}]));
  R.push(['edicao apos exclusao ressuscita', meu.ncrs.length + '/' + (meu.ncrs[0] && meu.ncrs[0].description), '1/editei depois']);

  // 6) lista: casa por marco mesmo com id diferente, e nao mistura marcos
  let locais = [
    proj('p1','RANAE J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z','J06 meu')]),
    proj('p2','RANAE J07',[item('c','NCR-1','2026-01-01T10:00:00.000Z','J07 meu')])
  ];
  let res = Store.mergeListas(locais, [
    proj('OUTRO','ranae j06',[item('b','NCR-9','2026-01-01T11:00:00.000Z','J06 dele')]),
    proj('OUTRO2','RANAE J08',[item('d','NCR-8','2026-01-01T11:00:00.000Z','J08 dele')])
  ]);
  R.push(['nao duplica marco', locais.length + ': ' + locais.map(p=>p.marco).join(' | '),
          '3: RANAE J06 | RANAE J07 | RANAE J08']);
  R.push(['J06 juntou', locais[0].ncrs.map(n=>n.ncrId).join(','), 'NCR-1,NCR-9']);
  R.push(['J07 intacto', locais[1].ncrs.map(n=>n.ncrId+':'+n.description).join(','), 'NCR-1:J07 meu']);
  R.push(['relatorio novo', res.novosRelatorios + '/' + (locais[2] && locais[2].marco), '1/RANAE J08']);

  // 7) a mesclagem converge: aplicar duas vezes nao muda nada
  meu = proj('p','RANAE J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z','x')]);
  const dele = proj('p','RANAE J06',[item('b','NCR-2','2026-01-01T11:00:00.000Z','y')]);
  Store.mergeLWW(meu, dele);
  const antes = JSON.stringify(meu.ncrs.map(n=>n.id));
  Store.mergeLWW(meu, dele);
  R.push(['idempotente', (antes === JSON.stringify(meu.ncrs.map(n=>n.id))) + '/' + meu.ncrs.length, 'true/2']);
  return R;
}"""

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=CHROME)
    pg = b.new_context().new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("dialog", lambda d: d.accept())
    pg.goto("file:///home/user/Derrogacao/index.html"); pg.wait_for_timeout(800)
    falhou = []
    for nome, obtido, esperado in pg.evaluate(CASOS):
        ok = str(obtido) == str(esperado)
        print(("   OK   " if ok else "   FALHA ") + nome + " -> " + str(obtido))
        if not ok:
            falhou.append("%s: obtido %r, esperado %r" % (nome, obtido, esperado))
    b.close()

assert not falhou, "regras da mesclagem quebradas:\n  " + "\n  ".join(falhou)
print("\nERRORS:", errs if errs else "none")
