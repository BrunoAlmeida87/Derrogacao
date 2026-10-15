/* A pasta que recusa gravar um arquivo: o caso do Bruno em 15/10, quando o
   derrogacao-ncr-banco.json tinha sido recriado pelo colega e a pasta de rede
   não deixava substituí-lo (InvalidStateError a cada rodada, o .crswap
   aparecendo e sumindo). Antes, isso só aparecia no diário do console.
   Aqui a pasta (OPFS) recusa a troca de um arquivo só; o aviso tem de
   aparecer com o nome dele, os outros arquivos continuam gravando, e o
   aviso some quando a gravação volta a passar. */
'use strict';
const L = require('./lib');

const BANCO = 'derrogacao-ncr-banco.json';

function lerDaPasta(pg, nome) {
  return pg.evaluate(async (n) => {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('Derrogacao');
    try { return await (await (await dir.getFileHandle(n)).getFile()).text(); } catch (e) { return null; }
  }, nome);
}

/* tira uma NCR do arquivo da pasta: este navegador passa a ter algo que a
   pasta não tem, e toda rodada tenta gravar o arquivo do banco */
function tirarNcrDaPasta(pg, numero) {
  return pg.evaluate(async ({ nome, numero }) => {
    const raiz = await navigator.storage.getDirectory();
    const dir = await raiz.getDirectoryHandle('Derrogacao');
    const fh = await dir.getFileHandle(nome);
    const d = JSON.parse(await (await fh.getFile()).text());
    d.ncrs = d.ncrs.filter(x => x.numero !== numero);
    const w = await fh.createWritable();
    await w.write(JSON.stringify(d));
    await w.close();
  }, { nome: BANCO, numero: numero });
}

async function rodada(pg) {
  await pg.click('#atualizarBtn');
  await pg.waitForTimeout(2500);
}

(async () => {
  const srv = await L.servidor();
  const s = await L.abrir({ pasta: true });
  const pg = s.pagina;
  try {
    await L.semear(pg, srv.url);
    await pg.click('#pastaNoticeBtn');
    await pg.waitForFunction(() => /Derrogacao/.test(document.getElementById('pastaChipLabel').textContent));
    await pg.waitForTimeout(1500);
    L.ok(!!(await lerDaPasta(pg, BANCO)), 'a pasta tem o arquivo do banco NCR');
    L.ok(await pg.isHidden('#gravaNotice'), 'sem recusa, sem aviso');

    console.log('a pasta recusa substituir o arquivo do banco');
    const N = L.numero(3);
    await tirarNcrDaPasta(pg, N);
    /* o que a pasta de rede fazia: a troca do .crswap pelo arquivo antigo
       recusada, só para este arquivo */
    await pg.evaluate((nome) => {
      const orig = FileSystemFileHandle.prototype.createWritable;
      window.__cwOriginal = orig;
      FileSystemFileHandle.prototype.createWritable = function () {
        if (this.name === nome) {
          return Promise.resolve({
            write: () => Promise.resolve(),
            close: () => Promise.reject(new DOMException('The state cached in an interface object has changed', 'InvalidStateError'))
          });
        }
        return orig.apply(this, arguments);
      };
    }, BANCO);
    await rodada(pg);
    L.ok(await pg.isHidden('#gravaNotice'), 'uma recusa só ainda não é aviso (pode ser o colega no mesmo segundo)');
    await rodada(pg);
    L.ok(await pg.isVisible('#gravaNotice'), 'na segunda recusa seguida, o aviso aparece');
    const txt = await pg.textContent('#gravaNoticeText');
    L.ok(txt.indexOf(BANCO) >= 0 && /banco NCR importado/.test(txt), 'o aviso diz qual arquivo, com o nome que se entende');
    L.ok(/SUBSTITUIR/.test(txt) && /Modificar/.test(txt), 'e diz o que é (permissão de substituir) e o que pedir à TI');
    L.ok(!/derrogacao-dados\.json/.test(txt), 'os relatórios, que gravam normalmente, não entram no aviso');
    L.ok((await lerDaPasta(pg, BANCO)).indexOf(N) < 0, 'o arquivo da pasta continua sem a NCR (a gravação não passou)');
    const diario = await pg.evaluate(() => Log.historico());
    L.igual((diario.match(/não está deixando gravar derrogacao-ncr-banco/g) || []).length, 1,
      'o diário registra a recusa uma vez, não a cada rodada');
    L.ok(await pg.isVisible('#gravaNoticeBtn'), 'o aviso tem o botão para tentar de novo');
    if (process.env.DERROG_FOTO) await pg.screenshot({ path: L.arquivo('aviso-gravacao.png'), clip: { x: 0, y: 0, width: 1600, height: 420 } });

    console.log('a gravação volta a passar');
    await pg.evaluate(() => { FileSystemFileHandle.prototype.createWritable = window.__cwOriginal; });
    await pg.click('#gravaNoticeBtn');
    await pg.waitForTimeout(2500);
    L.ok(await pg.isHidden('#gravaNotice'), 'gravou: o aviso some sozinho');
    L.ok((await lerDaPasta(pg, BANCO)).indexOf(N) >= 0, 'e a NCR que faltava chegou ao arquivo da pasta');

    console.log('a marca "não consta mais" viaja, e ninguém fica regravando o banco');
    const banco = L.dadosDeExemplo().banco;
    const SAIU = L.numero(5);
    banco.registros = banco.registros.filter(r => r.id !== SAIU);
    const local = await pg.evaluate(async (b) => {
      const r = Ncrs.importarBase(b, 'export-sem-uma.json', 'Teste');
      await Ncrs.salvar(r.alterados);
      await Ncrs.salvarMeta();
      return Ncrs.get(b.saiu).fonte;
    }, Object.assign({}, banco, { saiu: SAIU }));
    L.ok(local.presente === false, 'a NCR que saiu do export fica marcada como "não consta mais"');
    await rodada(pg);
    const naPasta = JSON.parse(await lerDaPasta(pg, BANCO)).ncrs.filter(x => x.numero === SAIU)[0];
    L.ok(naPasta && naPasta.fonte.presente === false && naPasta.fonte.importadoEm === local.importadoEm,
      'a marca chega à pasta com o carimbo da importação (é o que a faz chegar ao colega)');
    /* o que versões anteriores deixaram: a mesma importação, com a marca
       diferente nos dois lados */
    const OUTRA = L.numero(7);
    await pg.evaluate(async ({ nome, numero }) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      const fh = await dir.getFileHandle(nome);
      const d = JSON.parse(await (await fh.getFile()).text());
      d.ncrs.forEach(x => { if (x.numero === numero) x.fonte.presente = !x.fonte.presente; });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(d));
      await w.close();
    }, { nome: BANCO, numero: OUTRA });
    const dataDoArquivo = () => pg.evaluate(async (nome) => {
      const raiz = await navigator.storage.getDirectory();
      const dir = await raiz.getDirectoryHandle('Derrogacao');
      return (await (await dir.getFileHandle(nome)).getFile()).lastModified;
    }, BANCO);
    const antesDaRodada = await dataDoArquivo();
    await rodada(pg);
    await rodada(pg);
    const lado = await pg.evaluate((n) => Ncrs.get(n).fonte.presente, OUTRA);
    const naPasta2 = JSON.parse(await lerDaPasta(pg, BANCO)).ncrs.filter(x => x.numero === OUTRA)[0].fonte.presente;
    L.ok(lado === naPasta2, 'empate com marcas diferentes: este lado adota a da pasta');
    L.igual(await dataDoArquivo(), antesDaRodada, 'e não regrava o arquivo do banco (era o pingue-pongue de 20 em 20 s)');

    console.log('visualizador');
    const vis = await s.contexto.newPage();
    await vis.goto(srv.url + 'index.html?modo=leitura');
    await vis.waitForTimeout(1500);
    L.ok(await vis.evaluate(() => getComputedStyle(document.getElementById('gravaNotice')).display === 'none'),
      'no visualizador o aviso não existe');
    await vis.close();
  } catch (e) {
    L.ok(false, 'exceção: ' + (e && e.stack || e));
  } finally {
    await s.navegador.close();
    srv.fechar();
  }
  /* a recusa provocada aqui vira linha vermelha no console de propósito */
  const erros = s.erros.filter(e => !/não está deixando gravar|InvalidStateError|cached in an interface|permissão de Modificar/.test(e));
  process.exitCode = L.resultado('gravacao', erros) ? 1 : 0;
})();
