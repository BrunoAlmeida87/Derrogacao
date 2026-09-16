# Duas regras de convergencia e de busca, em unidade, na propria pagina:
#  - carimbos de edicao iguais nao podem deixar as duas bases divergindo;
#  - a busca do Resumo cobre os cinco blocos de texto, como diz o README.
import json, os, pathlib
from playwright.sync_api import sync_playwright

SP = pathlib.Path(os.environ.get("DERROG_TMP", "/tmp/derrogacao-testes"))
SP.mkdir(parents=True, exist_ok=True)
CHROME = os.environ.get("DERROG_CHROME", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome")
errs = []

CASOS = """() => {
  const R = [];
  const item = (id, ncrId, at, extra) => Object.assign({
    id, ncrId, systems:'RM', func:'FV', description:'',
    currentSituation:'', whyNotPossible:'', arguments:'', archAnswer:'',
    requestExpiry:'', archStatus:'', approvedExpiry:'', historic:'',
    certificates:[], evidence:[], status:'preenchendo', done:false,
    editedBy:'x', editedAt:at, syncBase:''
  }, extra||{});
  const proj = (id, marco, ncrs) => Store.normalizeProject({
    id, marco, name:marco, ncrs, devs:[], deleted:[], sessions:[],
    updatedAt:'2026-01-01T00:00:00.000Z' });
  const clone = o => JSON.parse(JSON.stringify(o));

  // 1) MESMO carimbo dos dois lados: os dois precisam chegar ao mesmo texto
  const T = '2026-01-01T11:00:00.000Z';
  let A = proj('p','J06',[item('a','NCR-1',T,{description:'texto de A'})]);
  let B = proj('p','J06',[item('a','NCR-1',T,{description:'texto de B'})]);
  const A0 = clone(A), B0 = clone(B);
  Store.mergeLWW(A, clone(B0));
  Store.mergeLWW(B, clone(A0));
  R.push(['empate converge', A.ncrs[0].description === B.ncrs[0].description,
          A.ncrs[0].description + ' / ' + B.ncrs[0].description]);

  // e a segunda rodada nao pode oscilar
  const A1 = clone(A), B1 = clone(B);
  Store.mergeLWW(A, clone(B1));
  Store.mergeLWW(B, clone(A1));
  R.push(['empate estavel', A.ncrs[0].description === B.ncrs[0].description,
          A.ncrs[0].description]);

  // 2) carimbo diferente continua valendo quem editou por ultimo
  let C = proj('p','J06',[item('a','NCR-1','2026-01-01T10:00:00.000Z',{description:'antigo'})]);
  Store.mergeLWW(C, proj('p','J06',[item('a','NCR-1','2026-01-01T12:00:00.000Z',{description:'novo'})]));
  R.push(['mais recente vence', C.ncrs[0].description === 'novo', C.ncrs[0].description]);

  // 3) busca do Resumo nos cinco blocos de texto
  const campos = ['description','currentSituation','whyNotPossible','arguments','archAnswer'];
  campos.forEach((k, i) => {
    const extra = {}; extra[k] = 'palavra-rara-' + k;
    const n = Store.normalizeNcr(item('b'+i, 'NCR-'+i, '', extra));
    const achou = Summary.passa({kind:'ncr', item:n}, {busca:'palavra-rara-' + k});
    R.push(['busca em ' + k, achou, k]);
  });
  // o certificado tambem, como o README diz
  const nc = Store.normalizeNcr(item('c','NCR-9','',{certificates:['Cert-XYZ']}));
  R.push(['busca no certificado', Summary.passa({kind:'ncr', item:nc}, {busca:'cert-xyz'}), 'certificates']);
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
    for nome, ok, detalhe in pg.evaluate(CASOS):
        print(("  OK  " if ok else "  FALHA ") + nome + " -> " + str(detalhe))
        if not ok:
            falhou.append(nome)
    b.close()

assert not falhou, "casos que falharam: " + ", ".join(falhou)
print("ERRORS:", errs if errs else "none")
print("OK — convergencia no empate e busca nos cinco blocos.")
