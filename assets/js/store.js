/* ==========================================================================
   store.js — modelo de dados e persistência local
   Guarda os relatórios no IndexedDB do navegador (cai para localStorage se
   o IndexedDB não estiver disponível). Nada sai do computador do usuário.
   ========================================================================== */

(function (global) {
  'use strict';

  var MAX_SESSIONS = 30;      // histórico guardado por relatório
  var USER_KEY = 'derrogacao:user';
  var BACKUP_KEY = 'derrogacao:lastBackupAt';
  var FOLDER_KEY = 'derrogacao:pastaBackup';
  var DB_FOLDER_KEY = 'derrogacao:pastaBanco';

  /* Onde a equipe combinou que fica o banco de dados. Fica aqui, e não na
     interface, porque é o valor de saída: quem abre o programa pela primeira
     vez já vê o caminho certo no diálogo, em vez de ter de perguntar a
     alguém. Trocar é um botão — a pasta pode mudar de lugar.

     Isto é texto, e só. O navegador não abre pasta por caminho: quem escolhe
     é sempre a pessoa, na janela do Windows (ver o cabeçalho do pasta.js).
     O que o programa guarda depois disso é o crachá da pasta escolhida, e é
     esse crachá que evita ter de escolher de novo a cada vez. */
  var CAMINHO_PADRAO =
    'G:\\DOP\\GTO\\3_INTERNO\\01_SAFE TO DIVE\\10_SISTEMA DE DERROGAÇÃO\\00_BD';
  var DB_NAME = 'derrogacao';
  var DB_VERSION = 3;
  var STORE = 'projects';
  var LS_KEY = 'derrogacao:projects';
  var SCHEMA = 1;

  /* --- utilidades ------------------------------------------------------- */

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function nowIso() { return new Date().toISOString(); }

  /* --- fábrica de registros --------------------------------------------- */

  function newEvidence(index) {
    return {
      id: uid(),
      ref: 'Attachment ' + (index || 1),
      note: '',
      orientation: 'landscape',   // padrão do relatório original
      images: []
    };
  }

  /* Situação de acompanhamento do item. Nasceu como controle interno, e
     continua sendo o que o editor mostra e o que os filtros contam. Desde
     que o Bruno pediu, é também **o que fecha a linha do item no índice da
     capa** do relatório — o Arch Status Waiver, que é texto livre, continua
     impresso no bloco de status da página do item, mas quem diz em que pé o
     waiver está, na capa, é esta situação (§10). O item só conta como
     concluído quando chega em "Waiver accepted".

     `en` é o rótulo que vai para o papel: o relatório é um documento em
     inglês, e "Em preenchimento" no meio da capa seria a única palavra em
     português da folha. */
  var STATUS = [
    { id: 'preenchendo', nome: 'Em preenchimento',     en: 'Under preparation', cor: '#9aa1ae',
      ajuda: 'Ainda sendo escrito.' },
    { id: 'solicitado',  nome: 'Waiver requested',     en: 'Waiver requested', cor: '#2a78d6',
      ajuda: 'Enviado, aguardando resposta.' },
    { id: 'justificar',  nome: 'Improve justification', en: 'Improve justification', cor: '#eb6834',
      ajuda: 'Voltou pedindo justificativa melhor.' },
    { id: 'aceito',      nome: 'Waiver accepted',      en: 'Waiver accepted', cor: '#1baf7a',
      ajuda: 'Aceito — o item conta como concluído.' }
  ];
  var STATUS_PADRAO = 'preenchendo';
  var STATUS_CONCLUIDO = 'aceito';

  function statusInfo(id) {
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i];
    return STATUS[0];
  }

  /** Único ponto que mexe na situação: "done" nunca se descola dela. */
  function setStatus(item, id) {
    item.status = statusInfo(id).id;
    item.done = item.status === STATUS_CONCLUIDO;
    return item.status;
  }

  function newNcr() {
    return {
      id: uid(),
      ncrId: '',
      systems: '',
      func: '',
      description: '',
      currentSituation: '',
      whyNotPossible: '',
      arguments: '',
      archAnswer: '',
      requestExpiry: '',
      archStatus: '',
      approvedExpiry: '',
      historic: '',
      certificates: [],
      evidence: [],
      nota: '',              // anotação interna livre; NÃO sai no PDF (§4)
      herdadoDe: '',         // marco de onde este item foi trazido (§5, herdar.js)
      herdadoEm: '',         // quando foi trazido — ISO
      status: STATUS_PADRAO, // acompanhamento do item; fecha a linha da capa
      done: false,           // espelho de status === 'aceito', para filtros e contagens
      editedBy: '',          // quem mexeu nele por último
      editedAt: '',
      syncBase: ''           // editedAt na última troca de arquivo — base da mesclagem
    };
  }

  /* Um projeto guarda dois relatórios irmãos, de mesmo layout: as NCRs e as
     DEVs. Cada um tem o seu marco e o seu título de capa, e é exportado
     separadamente. */
  function newProject(marco) {
    return {
      id: uid(),
      schema: SCHEMA,
      name: marco || 'Novo relatório',
      marco: marco || '',
      marcoDev: '',
      lastEditedBy: '',
      lastEditedAt: '',
      lastBackupBy: '',
      lastBackupAt: '',
      coverTitle: 'Waiver Request For',
      coverTitleDev: 'DEV: Waiver Request For',
      coverSubtitle: 'List of Waiver Requested :',
      footer: 'Gerência técnica operacional',
      showCoverDate: true,   // data de emissão no pé da capa
      ordem: 'manual',       // ordem das páginas: vale para a tela e para o PDF
      ncrs: [],
      devs: [],
      deleted: [],           // lápides: sem elas, o item excluído por um volta pelo outro
      sessions: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  /* --- normalização (tolera arquivos de backup antigos/parciais) -------- */

  function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }

  /**
   * Campos que este programa ainda não conhece.
   *
   * A normalização remonta cada registro só com os campos da lista — e era
   * por isso que uma versão mais antiga da página, lendo um arquivo gravado
   * por uma versão mais nova, apagava em silêncio o que não entendia e
   * regravava a perda na pasta compartilhada. Guardar os desconhecidos e
   * devolvê-los intactos custa quase nada e evita esse estrago.
   */
  function extrasDe(raw, conhecidos) {
    var out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (var k in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, k)) continue;
      if (k.slice(0, 2) === '__') continue;           /* nada de __proto__ */
      if (conhecidos.indexOf(k) >= 0) continue;
      out[k] = raw[k];
    }
    return out;
  }

  var CAMPOS_IMAGEM = ['id', 'src', 'caption', 'arquivo'];
  var CAMPOS_EVIDENCIA = ['id', 'ref', 'note', 'orientation', 'images'];
  var CAMPOS_ITEM = ['id', 'ncrId', 'systems', 'func', 'description', 'currentSituation',
    'whyNotPossible', 'arguments', 'archAnswer', 'requestExpiry', 'archStatus',
    'approvedExpiry', 'historic', 'certificates', 'evidence', 'nota',
    'herdadoDe', 'herdadoEm', 'status', 'done',
    'editedBy', 'editedAt', 'syncBase'];
  var CAMPOS_PROJETO = ['id', 'schema', 'name', 'marco', 'marcoDev', 'lastEditedBy',
    'lastEditedAt', 'lastBackupBy', 'lastBackupAt', 'coverTitle', 'coverTitleDev',
    'coverSubtitle', 'footer', 'showCoverDate', 'ordem', 'ncrs', 'devs', 'deleted',
    'sessions', 'createdAt', 'updatedAt'];

  /* As imagens do programa nascem de canvas.toDataURL: são sempre "data:".
     Um .json recebido pode trazer um endereço de rede no lugar, e aí bastaria
     abrir o item para o navegador ir buscá-lo — o servidor do outro lado
     ficaria sabendo o IP, a hora e, pela URL, qual item foi aberto. Nada sai
     do computador: o que não for data: ou blob: é descartado. O nome em
     `arquivo` é outra coisa — é um arquivo dentro da pasta escolhida, lido
     pelo crachá do File System Access, sem rede nenhuma. */
  function srcLocal(v) {
    v = str(v);
    return /^(data:image\/|blob:)/i.test(v) ? v : '';
  }

  function normalizeImage(img) {
    if (typeof img === 'string') return { id: uid(), src: srcLocal(img), caption: '' };
    var out = extrasDe(img, CAMPOS_IMAGEM);
    out.id = str(img && img.id) || uid();
    out.src = srcLocal(img && img.src);
    out.caption = str(img && img.caption);
    /* Na pasta compartilhada a imagem mora num arquivo ao lado; aqui fica o
       nome dele, para buscar o conteúdo quando faltar. */
    if (str(img && img.arquivo)) out.arquivo = str(img.arquivo);
    return out;
  }

  function normalizeEvidence(ev, i) {
    var images = Array.isArray(ev && ev.images)
      ? ev.images.map(normalizeImage).filter(function (im) { return im.src || im.arquivo; })
      : [];
    var out = extrasDe(ev, CAMPOS_EVIDENCIA);
    out.id = str(ev && ev.id) || uid();
    out.ref = str(ev && ev.ref) || 'Attachment ' + (i + 1);
    out.note = str(ev && ev.note);
    out.orientation = str(ev && ev.orientation) === 'portrait' ? 'portrait' : 'landscape';
    out.images = images;
    return out;
  }

  function normalizeNcr(raw) {
    var base = newNcr();
    if (!raw || typeof raw !== 'object') return base;
    var certs = Array.isArray(raw.certificates) ? raw.certificates.map(str)
              : (str(raw.certificates) ? [str(raw.certificates)] : []);
    /* Arquivos gravados antes de existir a situação só tinham "done": o que
       estava concluído vira "Waiver accepted", o resto começa em branco. */
    var status = str(raw.status);
    var conhecido = STATUS.some(function (o) { return o.id === status; });
    if (!conhecido) status = raw.done === true ? STATUS_CONCLUIDO : STATUS_PADRAO;
    var extras = extrasDe(raw, CAMPOS_ITEM);
    var out = {
      id: str(raw.id) || base.id,
      ncrId: str(raw.ncrId),
      systems: str(raw.systems),
      func: str(raw.func),
      description: str(raw.description),
      currentSituation: str(raw.currentSituation),
      whyNotPossible: str(raw.whyNotPossible),
      arguments: str(raw['arguments']),
      archAnswer: str(raw.archAnswer),
      requestExpiry: str(raw.requestExpiry),
      archStatus: str(raw.archStatus),
      approvedExpiry: str(raw.approvedExpiry),
      historic: str(raw.historic),
      certificates: certs,
      evidence: Array.isArray(raw.evidence) ? raw.evidence.map(normalizeEvidence) : [],
      nota: str(raw.nota),
      herdadoDe: str(raw.herdadoDe),
      herdadoEm: str(raw.herdadoEm),
      status: status,
      done: status === STATUS_CONCLUIDO,
      editedBy: str(raw.editedBy),
      editedAt: str(raw.editedAt),
      syncBase: str(raw.syncBase)
    };
    for (var k in extras) if (Object.prototype.hasOwnProperty.call(extras, k)) out[k] = extras[k];
    return out;
  }

  /* Aceita backups gravados antes da aba DEV existir: nesses arquivos há
     apenas "ncrs", e a lista de DEVs simplesmente nasce vazia. */
  function normalizeLapide(t) {
    return {
      id: str(t && t.id),
      kind: str(t && t.kind) === 'dev' ? 'dev' : 'ncr',
      ncrId: str(t && t.ncrId),
      at: str(t && t.at),
      by: str(t && t.by)
    };
  }

  function normalizeProject(raw) {
    var base = newProject('');
    if (!raw || typeof raw !== 'object') return base;
    var extras = extrasDe(raw, CAMPOS_PROJETO);
    var out = {
      id: str(raw.id) || base.id,
      /* Um arquivo gravado por uma versão mais nova continua marcado como
         tal: é assim que esta página sabe que não deve regravar a pasta. */
      schema: Math.max(SCHEMA, Number(raw.schema) || 0),
      name: str(raw.name) || str(raw.marco) || 'Relatório sem nome',
      marco: str(raw.marco),
      marcoDev: str(raw.marcoDev),
      lastEditedBy: str(raw.lastEditedBy),
      lastEditedAt: str(raw.lastEditedAt),
      lastBackupBy: str(raw.lastBackupBy),
      lastBackupAt: str(raw.lastBackupAt),
      coverTitle: str(raw.coverTitle) || base.coverTitle,
      coverTitleDev: str(raw.coverTitleDev) || base.coverTitleDev,
      coverSubtitle: str(raw.coverSubtitle) || base.coverSubtitle,
      footer: raw.footer === '' ? '' : (str(raw.footer) || base.footer),
      showCoverDate: raw.showCoverDate !== false,
      ordem: ordemInfo(raw.ordem).id,
      ncrs: Array.isArray(raw.ncrs) ? raw.ncrs.map(normalizeNcr) : [],
      devs: Array.isArray(raw.devs) ? raw.devs.map(normalizeNcr) : [],
      deleted: Array.isArray(raw.deleted) ? raw.deleted.map(normalizeLapide).filter(function (t) { return t.id; }) : [],
      sessions: Array.isArray(raw.sessions) ? raw.sessions.map(normalizeSession).slice(-MAX_SESSIONS) : [],
      createdAt: str(raw.createdAt) || base.createdAt,
      updatedAt: str(raw.updatedAt) || base.updatedAt
    };
    for (var k in extras) if (Object.prototype.hasOwnProperty.call(extras, k)) out[k] = extras[k];
    return out;
  }

  /** O arquivo veio de uma versão mais nova do que esta página entende? */
  function maisNovoQueEu(lista) {
    var maior = 0;
    (lista || []).forEach(function (p) {
      var n = Number(p && p.schema) || 0;
      if (n > maior) maior = n;
    });
    return maior > SCHEMA;
  }

  /* Uma sessão é um período de trabalho num navegador: começa quando a
     página é aberta e guarda quais itens foram mexidos nela. */
  function normalizeSession(sess) {
    var changes = Array.isArray(sess && sess.changes) ? sess.changes : [];
    return {
      id: str(sess && sess.id) || uid(),
      user: str(sess && sess.user),
      startedAt: str(sess && sess.startedAt),
      endedAt: str(sess && sess.endedAt),
      changes: changes.map(function (c) {
        return {
          itemId: str(c && c.itemId),
          kind: str(c && c.kind) === 'dev' ? 'dev' : 'ncr',
          label: str(c && c.label),
          action: ['criou', 'excluiu'].indexOf(str(c && c.action)) >= 0 ? str(c.action) : 'editou'
        };
      }).filter(function (c) { return c.itemId; })
    };
  }

  /* Nome da lista de itens de cada aba, dentro do projeto. */
  function itemsKey(kind) { return kind === 'dev' ? 'devs' : 'ncrs'; }

  /* --- comparação de itens ---------------------------------------------- */

  /**
   * Resumo do conteúdo do item, ignorando os campos de controle. Serve para
   * saber se dois lados realmente divergem, e não apenas se têm carimbos de
   * hora diferentes. As imagens entram pelo id e pela legenda: trocar uma
   * imagem gera um id novo, então a diferença é detectada sem comparar os
   * megabytes do base64.
   */
  /* Note que a `nota` fica de fora: a assinatura é o critério de desempate
     quando duas edições têm o carimbo de tempo idêntico, e ele tem de dar o
     mesmo resultado nesta versão e nas anteriores — senão as duas bases
     desempatam diferente e divergem para sempre (§10). */
  function signature(item) {
    return JSON.stringify([
      item.ncrId, item.systems, item.func,
      item.description, item.currentSituation, item.whyNotPossible,
      item['arguments'], item.archAnswer,
      item.requestExpiry, item.archStatus, item.approvedExpiry, item.historic,
      item.certificates,
      statusInfo(item.status).id,
      (item.evidence || []).map(function (ev) {
        return [ev.id, ev.ref, ev.note, ev.orientation,
          (ev.images || []).map(function (im) { return [im.id, im.caption]; })];
      })
    ]);
  }

  /* Campos de texto do item, com o nome que a pessoa vê. Serve para dizer
     "o que mudou" numa linguagem que não seja a do código. */
  var CAMPOS_VISIVEIS = [
    ['ncrId', 'Número'],
    ['systems', 'Sistema(s)'],
    ['func', 'Função'],
    ['description', 'Description'],
    ['currentSituation', 'Current Situation'],
    ['whyNotPossible', 'Why is not possible to treat the deviation'],
    ['arguments', 'What are the arguments for the derrogation'],
    ['archAnswer', 'Arch Answer'],
    ['requestExpiry', 'Waiver Request Expiry'],
    ['archStatus', 'Arch Status Waiver'],
    ['approvedExpiry', 'Waiver Approved Expiry'],
    ['historic', 'Waiver Historic'],
    /* A anotação não é do documento — é recado interno. Entra aqui porque
       esta lista serve a duas coisas que ela precisa: a busca (procurar pelo
       motivo da pendência tem de achar o item) e o "o que mudou" da faixa de
       mesclagem. Quem manda no PDF é o SECTIONS do report.js, não esta lista. */
    ['nota', 'Observação interna']
  ];

  function resumoEvidencia(item) {
    var evs = item.evidence || [];
    var imgs = 0;
    evs.forEach(function (ev) { imgs += (ev.images || []).length; });
    if (!evs.length) return '';
    return evs.length + ' anexo(s), ' + imgs + ' imagem(ns)';
  }

  /**
   * O que mudou de um retrato do item para outro, campo a campo.
   * Devolve só o que realmente diferiu — e nunca carrega o base64 das
   * imagens: das evidências vai apenas a contagem.
   */
  function difCampos(antes, depois) {
    var out = [];
    if (!antes || !depois) return out;
    CAMPOS_VISIVEIS.forEach(function (c) {
      var a = str(antes[c[0]]), b = str(depois[c[0]]);
      if (a !== b) out.push({ campo: c[0], rotulo: c[1], antes: a, depois: b });
    });
    var ca = (antes.certificates || []).join('\n');
    var cb = (depois.certificates || []).join('\n');
    if (ca !== cb) out.push({ campo: 'certificates', rotulo: 'Certificate Impacted', antes: ca, depois: cb });
    var sa = statusInfo(antes.status).nome, sb = statusInfo(depois.status).nome;
    if (sa !== sb) out.push({ campo: 'status', rotulo: 'Situação do item', antes: sa, depois: sb });
    var ea = resumoEvidencia(antes), eb = resumoEvidencia(depois);
    if (ea !== eb) out.push({ campo: 'evidence', rotulo: 'Evidências', antes: ea, depois: eb });
    return out;
  }

  /* --- a base da mesclagem: o texto que os dois lados tinham em comum -----
     "Vale quem editou por último" decide o item inteiro, e o item inteiro é
     grande demais para ser a unidade: duas pessoas mexendo em campos
     diferentes da mesma NCR não estão em conflito nenhum, mas uma delas
     perdia tudo. O que faltava era a terceira ponta — o que os dois tinham
     antes de se separarem. Guardando esse retrato dá para dizer, campo a
     campo, quem mudou o quê; e só quando os dois mudaram o MESMO campo é que
     alguém precisa ganhar. */

  /* Os campos que se mesclam um a um. As evidências ficam de fora de
     propósito: são listas com imagens, e juntar meia lista de anexos daria
     um item que ninguém montou. Elas seguem o item inteiro, como antes. */
  var CAMPOS_MESCLA = ['ncrId', 'systems', 'func', 'description', 'currentSituation',
    'whyNotPossible', 'arguments', 'archAnswer', 'requestExpiry', 'archStatus',
    'approvedExpiry', 'historic', 'nota', 'herdadoDe', 'certificates', 'status'];

  function rotuloCampo(campo) {
    var achado = '';
    CAMPOS_VISIVEIS.forEach(function (c) { if (c[0] === campo) achado = c[1]; });
    if (achado) return achado;
    if (campo === 'certificates') return 'Certificate Impacted';
    if (campo === 'status') return 'Situação do item';
    if (campo === 'herdadoDe') return 'Herdada do marco';
    return campo;
  }

  /** O valor de um campo como texto — é assim que ele é comparado e guardado. */
  function valorCampo(item, campo) {
    if (!item) return '';
    if (campo === 'certificates') return (item.certificates || []).join('\n');
    if (campo === 'status') return statusInfo(item.status).id;
    return str(item[campo]);
  }

  /** O caminho de volta: escreve no item o valor que veio como texto. */
  function porCampo(item, campo, valor) {
    valor = str(valor);
    if (campo === 'certificates') {
      item.certificates = valor ? valor.split('\n') : [];
      return;
    }
    if (campo === 'status') {
      item.status = statusInfo(valor).id;
      item.done = item.status === STATUS_CONCLUIDO;
      return;
    }
    item[campo] = valor;
  }

  /* As evidências não se mesclam campo a campo, mas precisam saber se
     mudaram: sem isso, quem ganhasse o desempate levaria consigo a lista de
     anexos do outro. A chave é a mesma que a assinatura usa — id e legenda,
     nunca os megabytes da foto. */
  function evidChave(item) {
    return JSON.stringify(((item && item.evidence) || []).map(function (ev) {
      return [ev.id, ev.ref, ev.note, ev.orientation,
        (ev.images || []).map(function (im) { return [im.id, im.caption]; })];
    }));
  }

  function retratoItem(item) {
    var out = {};
    CAMPOS_MESCLA.forEach(function (c) { out[c] = valorCampo(item, c); });
    out.evid = evidChave(item);
    return out;
  }

  /**
   * O retrato compacto de tudo o que está aqui, para servir de base na
   * próxima junção. Só texto: nem imagem, nem evidência, nem carimbo — cabe
   * no armazenamento do navegador mesmo com centenas de itens.
   */
  function baseDe(projects) {
    var mapa = {};
    (projects || []).forEach(function (p) {
      if (!p || !p.id) return;
      var itens = {};
      ['ncrs', 'devs'].forEach(function (k) {
        (p[k] || []).forEach(function (n) { if (n && n.id) itens[n.id] = retratoItem(n); });
      });
      mapa[p.id] = itens;
    });
    return mapa;
  }

  /**
   * Junta dois retratos do mesmo item campo a campo, tendo `base` como o que
   * os dois tinham em comum.
   *
   * Devolve { item, perdidos, recebi, mantive }. `perdidos` só tem coisa
   * quando os dois escreveram no MESMO campo — o único caso em que ainda é
   * preciso escolher, e o único em que o relógio ainda decide. O texto que
   * perdeu sai daqui inteiro para o histórico poder oferecê-lo de volta.
   */
  function mesclarCampos(meu, dele, base, venceDele) {
    var out = normalizeNcr(venceDele ? dele : meu);
    var res = { item: out, perdidos: [], recebi: 0, mantive: 0 };
    CAMPOS_MESCLA.forEach(function (campo) {
      var vm = valorCampo(meu, campo);
      var vd = valorCampo(dele, campo);
      var vb = str(base[campo]);
      if (vm === vd) { porCampo(out, campo, vm); return; }
      if (vd === vb) { porCampo(out, campo, vm); res.mantive++; return; }   /* só eu mexi */
      if (vm === vb) { porCampo(out, campo, vd); res.recebi++; return; }    /* só ele mexeu */
      porCampo(out, campo, venceDele ? vd : vm);
      res.perdidos.push({
        campo: campo,
        rotulo: rotuloCampo(campo),
        perdeu: venceDele ? vm : vd,
        ficou: venceDele ? vd : vm,
        de: str((venceDele ? meu : dele).editedBy)
      });
    });
    /* Os anexos vão inteiros, mas para o lado certo: quem mexeu neles desde
       a base leva. Só quando os dois mexeram é que um deles sai — e fica
       anotado, porque uma foto não se recupera de um histórico de texto. */
    var em = evidChave(meu), ed = evidChave(dele), eb = str(base.evid);
    if (em !== ed && typeof base.evid === 'string') {
      var deEv = ed === eb ? meu : (em === eb ? dele : null);
      if (deEv) {
        out.evidence = normalizeNcr(deEv).evidence;
        if (deEv === meu) res.mantive++; else res.recebi++;
      } else {
        var perdedor = venceDele ? meu : dele;
        res.perdidos.push({
          campo: 'evidence',
          rotulo: 'Evidências',
          perdeu: resumoEvidencia(perdedor),
          ficou: resumoEvidencia(venceDele ? dele : meu),
          de: str(perdedor.editedBy),
          semTexto: true          /* não dá para restaurar com um clique */
        });
      }
    }

    /* O resultado é mais novo do que os dois lados: ele carrega o trabalho
       dos dois. A assinatura de quem ganhou o desempate fica como autoria. */
    out.editedAt = maisRecente(str(meu.editedAt), str(dele.editedAt));
    out.editedBy = str((venceDele ? dele : meu).editedBy);
    return res;
  }

  /**
   * Todo o texto do item, para a busca. Inclui o que está dentro das
   * evidências: procurar "latch" tem de achar a legenda da foto também.
   */
  function textoBusca(item) {
    var partes = [];
    CAMPOS_VISIVEIS.forEach(function (c) { partes.push(str(item[c[0]])); });
    partes.push((item.certificates || []).join(' '));
    (item.evidence || []).forEach(function (ev) {
      partes.push(str(ev.ref), str(ev.note));
      (ev.images || []).forEach(function (im) { partes.push(str(im.caption)); });
    });
    return partes.join(' ').toLowerCase();
  }

  /** Cópia independente de um item, pronta para virar outro número. */
  function duplicar(item) {
    var copia = normalizeNcr(JSON.parse(JSON.stringify(item)));
    copia.id = uid();
    /* O número não pode repetir: a mesclagem pareia itens pelo número quando
       os ids são diferentes, e dois itens com o mesmo número acabariam
       virando um só no computador do colega. */
    copia.ncrId = (str(item.ncrId) ? str(item.ncrId) + ' (cópia)' : '');
    copia.evidence.forEach(function (ev) {
      ev.id = uid();
      ev.images.forEach(function (im) { im.id = uid(); });
    });
    setStatus(copia, STATUS_PADRAO);
    copia.editedBy = '';
    copia.editedAt = '';
    copia.syncBase = '';
    return copia;
  }

  /** Dias inteiros desde uma data ISO — vazio devolve null. */
  function diasDesde(iso) {
    if (!iso) return null;
    var t = Date.parse(iso);
    if (isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  }

  /**
   * Compara o relatório local com o que veio do arquivo, item a item.
   *
   * A decisão usa o syncBase — o editedAt que o item tinha na última troca de
   * arquivo. Com ele dá para separar os três casos:
   *   - só o outro lado mexeu  -> atualização limpa;
   *   - só este lado mexeu     -> nada a fazer;
   *   - os dois mexeram        -> conflito de verdade, que vai para o usuário.
   */
  /** Número da NCR/DEV normalizado, para parear itens de origens diferentes. */
  function numeroChave(n) {
    return str(n && n.ncrId).trim().toUpperCase().replace(/\s+/g, ' ');
  }

  /**
   * @param opts.semRemocoes  não propor exclusões. Vale quando os dois lados
   *   nunca foram o mesmo relatório (pareados pelo marco): a ausência de um
   *   item no arquivo do colega não quer dizer que ele o excluiu.
   */
  function diffProject(local, incoming, kind, opts) {
    opts = opts || {};
    var key = itemsKey(kind);
    var mine = local ? local[key] : [];
    var theirs = incoming[key] || [];

    var byId = {};
    mine.forEach(function (n) { byId[n.id] = n; });

    /* Pareamento em duas passadas. Pelo id resolve o caso normal — o mesmo
       item que já circulou entre os dois. Pelo número resolve o caso de duas
       pessoas terem criado a mesma NCR cada uma no seu navegador: os ids são
       diferentes, mas é o mesmo item, e sem isso ele entraria duplicado. */
    var usados = {};
    var pares = [];
    var sobraram = [];

    theirs.forEach(function (t) {
      var m = byId[t.id];
      if (m && !usados[m.id]) {
        usados[m.id] = true;
        pares.push({ m: m, t: t, porNumero: false });
      } else {
        sobraram.push(t);
      }
    });

    var porNumero = {};
    mine.forEach(function (n) {
      var k = numeroChave(n);
      if (!k || usados[n.id]) return;
      (porNumero[k] = porNumero[k] || []).push(n);
    });

    var novos = [];
    sobraram.forEach(function (t) {
      var k = numeroChave(t);
      var fila = k ? porNumero[k] : null;
      var m = fila && fila.length ? fila.shift() : null;
      if (m) {
        usados[m.id] = true;
        pares.push({ m: m, t: t, porNumero: true });
      } else {
        novos.push(t);
      }
    });

    var out = { novos: [], atualizados: [], conflitos: [], removidos: [], iguais: 0 };
    novos.forEach(function (t) { out.novos.push({ kind: kind, incoming: t }); });

    pares.forEach(function (par) {
      var m = par.m, t = par.t;
      if (signature(m) === signature(t)) { out.iguais++; return; }
      var entry = { kind: kind, mine: m, incoming: t, porNumero: par.porNumero };

      /* Pareado pelo número não há base comum: os dois lados escreveram por
         conta própria, então a escolha é sempre de quem está mesclando. */
      if (par.porNumero) { out.conflitos.push(entry); return; }

      var euMudei = m.editedAt !== m.syncBase;
      var eleMudou = t.editedAt !== m.syncBase;

      if (!euMudei && eleMudou) out.atualizados.push(entry);
      else if (euMudei && !eleMudou) { /* só eu mexi: o meu permanece */ }
      else out.conflitos.push(entry);
    });

    /* Presente aqui e ausente no arquivo: se já foi sincronizado antes, o
       outro lado provavelmente o excluiu. Nunca apagamos sozinhos. */
    if (!opts.semRemocoes) {
      mine.forEach(function (m) {
        if (!usados[m.id] && m.syncBase) out.removidos.push({ kind: kind, mine: m });
      });
    }

    return out;
  }

  /* --- ordem das páginas do relatório ------------------------------------- */

  /* A ordem escolhida vale para a lista lateral E para o PDF — é a mesma
     coisa. Guardar o modo (e não reescrever o vetor) deixa voltar atrás: a
     ordem manual continua intacta por baixo. */
  var ORDENS = [
    { id: 'manual',   nome: 'Manual (arrastando)',   ajuda: 'A ordem que você montou arrastando os itens.' },
    { id: 'numero',   nome: 'Número',                ajuda: 'Pelo número da NCR/DEV, em ordem alfanumérica.' },
    { id: 'sistema',  nome: 'Sistema',               ajuda: 'Pelas letras do sistema (HP, EX, BF…); depois pelo número.' },
    { id: 'funcao',   nome: 'Função',                ajuda: 'Pelo texto da função (FV01, FV09…); depois pelo número.' },
    { id: 'situacao', nome: 'Situação',              ajuda: 'Do que está em preenchimento até o waiver aceito.' }
  ];

  function ordemInfo(id) {
    for (var i = 0; i < ORDENS.length; i++) if (ORDENS[i].id === id) return ORDENS[i];
    return ORDENS[0];
  }

  /* localeCompare com numeric trata "NCR-10" depois de "NCR-9", que é o que
     se espera de "ordem alfanumérica" — e não a ordem crua de caracteres. */
  function cmpTexto(a, b) {
    a = str(a).trim(); b = str(b).trim();
    if (!a && !b) return 0;
    if (!a) return 1;            /* sem valor vai para o fim */
    if (!b) return -1;
    return a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  function indiceStatus(n) {
    var id = statusInfo(n.status).id;
    for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return i;
    return 0;
  }

  /** Itens da aba na ordem escolhida. Devolve um vetor novo; não mexe no projeto. */
  function ordenar(project, kind) {
    var lista = (project && project[itemsKey(kind)]) || [];
    var modo = ordemInfo(project && project.ordem).id;
    if (modo === 'manual') return lista.slice();

    var pos = {};
    lista.forEach(function (n, i) { pos[n.id] = i; });   /* desempate estável */
    return lista.slice().sort(function (a, b) {
      var r = 0;
      if (modo === 'numero')       r = cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'sistema') r = cmpTexto(a.systems, b.systems) || cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'funcao')  r = cmpTexto(a.func, b.func) || cmpTexto(a.ncrId, b.ncrId);
      else if (modo === 'situacao') r = (indiceStatus(a) - indiceStatus(b)) || cmpTexto(a.ncrId, b.ncrId);
      return r || (pos[a.id] - pos[b.id]);
    });
  }

  /* --- banco compartilhado numa pasta ------------------------------------ */

  /**
   * Marco normalizado. Só o campo marco vale: "name" nasce "Novo relatório"
   * para todos, e dois relatórios ainda sem marco não são o mesmo trabalho.
   */
  function marcoChave(p) {
    return str(p && p.marco).trim().toUpperCase().replace(/\s+/g, ' ');
  }

  var MAX_LAPIDES = 500;

  /**
   * Registra que um item foi excluído, para a exclusão alcançar os outros.
   *
   * A lápide precisa ser mais recente do que a versão que se está excluindo —
   * senão o item ressuscita na próxima sincronização. Como o relógio de cada
   * máquina pode estar adiantado, não basta usar a hora daqui: tomamos o
   * maior entre agora e a hora da versão excluída, mais um instante.
   */
  /** Um instante garantidamente posterior a `quando`, mesmo com relógio adiantado. */
  function depoisDe(quando) {
    var agora = nowIso();
    var outro = str(quando);
    if (outro && outro >= agora) {
      var t = new Date(outro).getTime();
      if (!isNaN(t)) return new Date(t + 1000).toISOString();
    }
    return agora;
  }

  function tombstone(project, kind, item) {
    var agora = depoisDe(item.editedAt);
    project.deleted = (project.deleted || []).filter(function (t) { return t.id !== item.id; });
    project.deleted.push({
      id: item.id,
      kind: kind === 'dev' ? 'dev' : 'ncr',
      ncrId: str(item.ncrId),
      at: agora,
      by: getUser()
    });
    if (project.deleted.length > MAX_LAPIDES) {
      project.deleted = project.deleted
        .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); })
        .slice(-MAX_LAPIDES);
    }
  }

  function maisRecente(a, b) { return String(a || '') >= String(b || '') ? String(a || '') : String(b || ''); }

  /* --- lápides de relatório inteiro --------------------------------------- */

  /* Excluir um relatório precisa deixar marca pela mesma razão que excluir um
     item: sem ela o relatório voltaria na sincronização seguinte, vindo do
     computador de quem ainda não soube — e a exclusão nunca alcançaria os
     outros. Ficam no navegador (o relatório em si já não existe para
     guardá-las) e viajam no arquivo da pasta. */
  var DEL_PROJ_KEY = 'derrogacao:relatoriosExcluidos';
  var MAX_PROJ_LAPIDES = 200;

  function lapidesProjeto() {
    try {
      var lista = JSON.parse(global.localStorage.getItem(DEL_PROJ_KEY) || '[]');
      if (!Array.isArray(lista)) return [];
      return lista.filter(function (t) { return t && t.id; }).map(function (t) {
        return { id: str(t.id), marco: str(t.marco), at: str(t.at), by: str(t.by) };
      });
    } catch (e) { return []; }
  }

  function gravarLapidesProjeto(lista) {
    try {
      global.localStorage.setItem(DEL_PROJ_KEY, JSON.stringify(
        lista.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); })
          .slice(-MAX_PROJ_LAPIDES)));
    } catch (e) { /* sem espaço: a exclusão vale ao menos neste navegador */ }
  }

  /** Hora da edição mais recente dentro do relatório. */
  function editadoEm(p) {
    var m = '';
    ['ncrs', 'devs'].forEach(function (k) {
      ((p && p[k]) || []).forEach(function (n) { m = maisRecente(m, n && n.editedAt); });
    });
    return m;
  }

  function tombstoneProjeto(project) {
    var lista = lapidesProjeto().filter(function (t) { return t.id !== project.id; });
    lista.push({
      id: str(project.id),
      marco: marcoChave(project),
      at: depoisDe(editadoEm(project)),
      by: getUser()
    });
    gravarLapidesProjeto(lista);
    return lista;
  }

  /** Restaurar um relatório inteiro desfaz a lápide dele. */
  function esquecerLapideProjeto(p) {
    gravarLapidesProjeto(lapidesProjeto().filter(function (t) {
      return t.id !== str(p && p.id);
    }));
  }

  /**
   * Junta dois retratos do MESMO relatório pela regra "vale quem editou por
   * último", item a item, respeitando as lápides.
   *
   * Por que aqui não há tela de conflito, ao contrário da importação manual
   * de arquivo: num banco compartilhado a gravação acontece sozinha, e
   * ninguém pode ficar parado esperando outra pessoa decidir. A rede de
   * proteção é o histórico automático da pasta, que guarda cada versão.
   *
   * A regra converge: mesmo que duas gravações simultâneas se atropelem, a
   * próxima sincronização de cada lado traz de volta o que faltava, porque
   * cada um ainda tem os seus itens com a sua hora de edição.
   *
   * `base` é o retrato do que este computador viu na pasta da última vez
   * (`Store.baseDe`), por id de item. Com ela a junção é campo a campo, e
   * "vale quem editou por último" fica restrito ao caso em que os dois
   * escreveram no mesmo campo. Sem ela — item novo, primeira sincronização,
   * navegador recém-instalado — vale o item inteiro, como antes.
   *
   * Altera `local` no lugar e devolve o que mudou aqui.
   */
  function mergeLWW(local, remoto, base) {
    /* `substituidos` guarda o que o texto de outra pessoa apagou aqui: é a
       única pista de que a regra "vale a edição mais recente" passou por
       cima de alguma coisa, e o editor usa isso para mostrar o antes. */
    var res = { entraram: 0, atualizados: 0, removidos: 0, substituidos: [], conflitos: 0 };
    base = base || null;

    /* a lápide mais recente de cada item, vinda de qualquer um dos lados */
    var lapides = {};
    [local, remoto].forEach(function (p) {
      (p.deleted || []).forEach(function (t) {
        var atual = lapides[t.id];
        if (!atual || String(t.at) > String(atual.at)) lapides[t.id] = t;
      });
    });

    ['ncrs', 'devs'].forEach(function (key) {
      var meus = {}, deles = {}, ordem = [], vistos = {};
      (local[key] || []).forEach(function (n) { meus[n.id] = n; });
      (remoto[key] || []).forEach(function (n) { deles[n.id] = n; });
      /* a ordem das páginas do PDF é a daqui; o que só existe lá entra no fim */
      (local[key] || []).forEach(function (n) { if (!vistos[n.id]) { vistos[n.id] = 1; ordem.push(n.id); } });
      (remoto[key] || []).forEach(function (n) { if (!vistos[n.id]) { vistos[n.id] = 1; ordem.push(n.id); } });

      var saida = [];
      ordem.forEach(function (id) {
        var meu = meus[id], dele = deles[id];
        var lapide = lapides[id];
        var editado = maisRecente(meu && meu.editedAt, dele && dele.editedAt);

        /* excluído, e ninguém o editou depois disso */
        if (lapide && String(lapide.at) >= editado) {
          if (meu) res.removidos++;
          return;
        }
        if (meu && dele) {
          var meuAt = String(meu.editedAt || '');
          var deleAt = String(dele.editedAt || '');
          var assMeu = signature(meu), assDele = signature(dele);
          var novo;
          if (deleAt !== meuAt) {
            novo = deleAt > meuAt;
          } else {
            /* Mesmo carimbo e conteúdos diferentes: sem um critério fixo cada
               lado ficaria com o seu e as duas bases nunca mais se
               encontrariam. A assinatura decide — e decide igual aqui e lá. */
            novo = assDele > assMeu;
          }
          var oBase = base ? base[id] : null;
          var trocado, perdidos = [];
          if (oBase && assMeu !== assDele) {
            /* há terceira ponta: junta campo a campo */
            var junto = mesclarCampos(meu, dele, oBase, novo);
            trocado = junto.item;
            perdidos = junto.perdidos;
          } else {
            trocado = novo ? normalizeNcr(dele) : meu;
          }
          var assFim = signature(trocado);
          if (assFim !== assMeu) {
            res.atualizados++;
            var campos = difCampos(meu, trocado);
            if (campos.length || perdidos.length) {
              res.substituidos.push({
                kind: key === 'devs' ? 'dev' : 'ncr',
                id: id,
                ncrId: str(trocado.ncrId) || str(meu.ncrId),
                quem: str(dele.editedBy),
                quando: str(dele.editedAt),
                campos: campos,
                /* só o que foi realmente escrito por cima: os dois mexeram
                   no mesmo campo e um dos textos teve de sair */
                perdidos: perdidos
              });
            }
          }
          if (perdidos.length) res.conflitos += perdidos.length;
          saida.push(trocado);
        } else if (dele) {
          res.entraram++;
          saida.push(normalizeNcr(dele));
        } else {
          saida.push(meu);
        }
      });
      local[key] = saida;
    });

    /* Depois de absorver dados de uma versão mais nova, esta cópia também
       os carrega: a marca segue com ela, para avisar a próxima página. */
    local.schema = Math.max(Number(local.schema) || 0, Number(remoto.schema) || 0);

    /* Textos de capa e rodapé não têm hora própria: segue o retrato do
       relatório que foi gravado por último. */
    if (String(remoto.updatedAt || '') > String(local.updatedAt || '')) {
      ['marco', 'marcoDev', 'coverTitle', 'coverTitleDev', 'coverSubtitle'].forEach(function (k) {
        if (str(remoto[k])) local[k] = str(remoto[k]);
      });
      if (typeof remoto.footer === 'string') local.footer = remoto.footer;
      if (typeof remoto.showCoverDate === 'boolean') local.showCoverDate = remoto.showCoverDate;
      if (str(remoto.ordem)) local.ordem = ordemInfo(remoto.ordem).id;
      if (str(remoto.lastBackupBy)) {
        local.lastBackupBy = str(remoto.lastBackupBy);
        local.lastBackupAt = str(remoto.lastBackupAt);
      }
    }
    if (!str(local.marco) && str(remoto.marco)) local.marco = str(remoto.marco);
    if (!str(local.name) || local.name === 'Novo relatório') local.name = str(local.marco) || local.name;

    local.deleted = Object.keys(lapides).map(function (k) { return lapides[k]; });

    /* o histórico de sessões é união: cada um viu uma parte do trabalho */
    var minhas = {};
    (local.sessions || []).forEach(function (x) { minhas[x.id] = x; });
    (remoto.sessions || []).forEach(function (x) {
      if (!minhas[x.id]) local.sessions.push(normalizeSession(x));
      else if (String(x.endedAt) > String(minhas[x.id].endedAt)) {
        minhas[x.id].endedAt = str(x.endedAt);
        minhas[x.id].changes = normalizeSession(x).changes;
      }
    });
    local.sessions.sort(function (a, b) { return String(a.startedAt).localeCompare(String(b.startedAt)); });
    if (local.sessions.length > MAX_SESSIONS) local.sessions = local.sessions.slice(-MAX_SESSIONS);

    return res;
  }

  /**
   * Traz de volta os itens de um retrato antigo que não existem mais aqui.
   *
   * Não é o mesmo que mesclar: uma versão do histórico é sempre mais velha do
   * que a lápide que apagou o item, então pela regra normal ela seria
   * descartada — e "restaurar" nunca restauraria nada. Aqui a volta é
   * registrada como uma edição de quem restaurou, o que é verdade e é o que
   * faz o item sobreviver também no computador dos outros.
   *
   * Só ressuscita o que sumiu. O que existe hoje não é tocado: restaurar
   * nunca desfaz o trabalho de ninguém.
   */
  function reviver(locais, retrato) {
    var res = { voltaram: 0, relatorios: 0 };
    var quem = getUser();
    var porId = {}, porMarco = {};
    locais.forEach(function (p) {
      porId[p.id] = p;
      var k = marcoChave(p);
      if (k && !porMarco[k]) porMarco[k] = p;
    });

    (retrato || []).forEach(function (r) {
      var k = marcoChave(r);
      var alvo = porId[r.id] || (k ? porMarco[k] : null);
      if (!alvo) {
        var novo = normalizeProject(r);
        esquecerLapideProjeto(novo);   /* restaurar desfaz a exclusão */
        locais.push(novo);
        res.relatorios++;
        res.voltaram += novo.ncrs.length + novo.devs.length;
        return;
      }
      ['ncrs', 'devs'].forEach(function (key) {
        var tem = {};
        (alvo[key] || []).forEach(function (n) { tem[n.id] = true; });
        (r[key] || []).forEach(function (n) {
          if (!n || !n.id || tem[n.id]) return;
          var copia = normalizeNcr(n);
          var lapide = (alvo.deleted || []).filter(function (t) { return t.id === copia.id; })[0];
          copia.editedAt = depoisDe(lapide && lapide.at);
          copia.editedBy = quem || copia.editedBy;
          copia.syncBase = '';
          alvo[key].push(copia);
          alvo.deleted = (alvo.deleted || []).filter(function (t) { return t.id !== copia.id; });
          res.voltaram++;
        });
      });
    });
    return res;
  }

  /**
   * Junta a lista inteira: cada relatório recebido é casado com o daqui pelo
   * identificador e, na falta, pelo marco. Devolve a lista resultante e um
   * resumo do que mudou deste lado.
   */
  function mergeListas(locais, recebidos, lapidesRecebidas, base) {
    var res = { entraram: 0, atualizados: 0, removidos: 0, novosRelatorios: 0,
                relatoriosRemovidos: 0, substituidos: [], conflitos: 0 };

    /* a lápide de relatório mais recente de cada lado */
    var tumbas = {};
    [lapidesProjeto(), lapidesRecebidas].forEach(function (lista) {
      (Array.isArray(lista) ? lista : []).forEach(function (t) {
        if (!t || !t.id) return;
        var atual = tumbas[t.id];
        if (!atual || String(t.at) > String(atual.at)) {
          tumbas[t.id] = { id: str(t.id), marco: str(t.marco), at: str(t.at), by: str(t.by) };
        }
      });
    });
    /**
     * Só pelo id — nunca pelo marco. Dá para ter dois relatórios repetidos do
     * mesmo marco (o menu ⋯ até oferece juntá-los), e casar por marco faria a
     * exclusão de um apagar o outro. No banco compartilhado o id é o mesmo
     * para todo mundo, que é o caso que a lápide precisa cobrir.
     *
     * Como na lápide de item: só vale enquanto ninguém editou depois dela.
     */
    function excluido(p) {
      var t = tumbas[str(p && p.id)];
      return !!(t && String(t.at) >= editadoEm(p));
    }

    /* o que outra pessoa excluiu sai daqui também */
    for (var i = locais.length - 1; i >= 0; i--) {
      if (excluido(locais[i])) { locais.splice(i, 1); res.relatoriosRemovidos++; }
    }

    var porId = {}, porMarco = {};
    locais.forEach(function (p) {
      porId[p.id] = p;
      var k = marcoChave(p);
      if (k && !porMarco[k]) porMarco[k] = p;
    });

    (recebidos || []).forEach(function (r) {
      var k = marcoChave(r);
      var alvo = porId[r.id] || (k ? porMarco[k] : null);
      if (!alvo) {
        if (excluido(r)) return;   /* excluído por alguém, e ninguém mexeu depois */
        var novo = normalizeProject(r);
        locais.push(novo);
        porId[novo.id] = novo;
        if (marcoChave(novo)) porMarco[marcoChave(novo)] = novo;
        res.novosRelatorios++;
        res.entraram += novo.ncrs.length + novo.devs.length;
        return;
      }
      /* a base é a do relatório de cá: é com o que ESTE computador viu que
         se compara o que voltou da pasta */
      var um = mergeLWW(alvo, normalizeProject(r), base ? base[alvo.id] : null);
      res.entraram += um.entraram;
      res.atualizados += um.atualizados;
      res.removidos += um.removidos;
      res.conflitos += um.conflitos || 0;
      um.substituidos.forEach(function (sub) {
        sub.projeto = alvo.id;
        res.substituidos.push(sub);
      });
    });

    gravarLapidesProjeto(Object.keys(tumbas).map(function (k) { return tumbas[k]; }));
    return res;
  }

  /* --- IndexedDB -------------------------------------------------------- */

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) { reject(new Error('IndexedDB indisponível')); return; }
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
        /* guarda o "crachá" da pasta compartilhada, que não é um caminho de
           texto e sim um objeto que só o navegador sabe interpretar */
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('Falha ao abrir o banco local')); };
    });
    return dbPromise;
  }

  function idbAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(project) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(project);
        tx.oncomplete = function () { resolve(project); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('Gravação abortada')); };
      });
    });
  }

  function idbDelete(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  /* --- crachá da pasta compartilhada -------------------------------------- */

  /* O handle não é um caminho: é um objeto que o navegador serializa e só ele
     sabe reabrir. Por isso vive no IndexedDB e não no localStorage. */
  var HANDLE_STORE = 'handles';

  function putHandle(handle) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).put(handle, 'pasta');
        tx.oncomplete = function () { resolve(handle); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function getHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(HANDLE_STORE).objectStore(HANDLE_STORE).get('pasta');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function clearHandle() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(HANDLE_STORE, 'readwrite');
        tx.objectStore(HANDLE_STORE).delete('pasta');
        tx.oncomplete = resolve;
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function () { /* sem pasta guardada */ });
  }

  /* --- retrato antes da mesclagem ---------------------------------------- */

  var SNAP_STORE = 'snapshots';

  /* Guarda o estado anterior à mesclagem, para que uma escolha errada possa
     ser desfeita. Só o último é mantido. */
  function saveSnapshot(projects, info) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(SNAP_STORE, 'readwrite');
        tx.objectStore(SNAP_STORE).put({
          id: 'last',
          at: nowIso(),
          info: info || '',
          projects: JSON.parse(JSON.stringify(projects))
        });
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function (e) {
      Log.aviso('armazenamento', 'não consegui guardar o retrato de desfazer',
        'a última mesclagem não vai poder ser desfeita; o resto funciona normalmente.',
        { erro: e && e.name });
    });
  }

  function getSnapshot() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(SNAP_STORE, 'readonly').objectStore(SNAP_STORE).get('last');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  /* --- a base da última troca com a pasta ---------------------------------
     Mora no mesmo armazém do retrato ("snapshots"), com outra chave, de
     propósito: criar uma prateleira nova obrigaria a subir a versão do
     IndexedDB, e uma página da versão anterior abrindo o mesmo navegador
     depois disso não conseguiria mais abrir o banco. */

  var BASE_ID = 'mesclaBase';

  /**
   * Dois retratos, e não um, porque eles andam em ritmos diferentes:
   *
   * - `base` é o que já foi para a pasta. Só avança quando a gravação dá
   *   certo — avançá-la antes disso faria a junção seguinte tomar o meu
   *   trabalho ainda não gravado por "coisa que o outro escreveu", e aí a
   *   regra que deveria salvar o texto seria a que o apagaria.
   * - `diario` é o que o histórico de alterações já contou. Avança a cada
   *   captura, com ou sem pasta, para a mesma escrita não virar vinte linhas.
   */
  function saveBase(mapa, diario, lida, carimbo) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(SNAP_STORE, 'readwrite');
        tx.objectStore(SNAP_STORE).put({
          id: BASE_ID, at: nowIso(), base: mapa || {}, diario: diario || {},
          /* o que a pasta TINHA quando eu li, na mesma rodada — a base que
             vale quando a minha gravação foi atropelada (ver `sincronizar`) */
          lida: lida || {},
          /* lastModified da minha última gravação: é por ele que a rodada
             seguinte sabe se o arquivo da pasta ainda é o meu */
          carimbo: Number(carimbo) || 0
        });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    }).catch(function (e) {
      Log.aviso('armazenamento', 'não consegui guardar a base da mesclagem',
        'a próxima junção com a pasta vai comparar item inteiro em vez de campo a ' +
        'campo. Funciona, mas protege menos — recarregue a página quando puder.',
        { erro: e && e.name });
      return false;
    });
  }

  function getBase() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(SNAP_STORE, 'readonly').objectStore(SNAP_STORE).get(BASE_ID);
        req.onsuccess = function () {
          var r = req.result;
          resolve(r ? { base: r.base || null, diario: r.diario || null,
                        lida: r.lida || null, carimbo: Number(r.carimbo) || 0 } : null);
        };
        req.onerror = function () { reject(req.error); };
      });
    }).catch(function () { return null; });
  }

  function clearSnapshot() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction(SNAP_STORE, 'readwrite');
        tx.objectStore(SNAP_STORE).delete('last');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      });
    }).catch(function () { /* sem retrato: nada a limpar */ });
  }

  /* --- localStorage (reserva) ------------------------------------------- */

  function lsAll() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function lsWriteAll(list) {
    global.localStorage.setItem(LS_KEY, JSON.stringify(list));
  }

  function lsPut(project) {
    var list = lsAll().filter(function (p) { return p.id !== project.id; });
    list.push(project);
    lsWriteAll(list);
    return Promise.resolve(project);
  }

  function lsDelete(id) {
    lsWriteAll(lsAll().filter(function (p) { return p.id !== id; }));
    return Promise.resolve();
  }

  /* --- quem está usando este navegador ---------------------------------- */

  /* Não há login: o nome é digitado uma vez e fica guardado no navegador,
     só para registrar quem editou e quem gerou cada backup. */
  function getUser() {
    try { return global.localStorage.getItem(USER_KEY) || ''; } catch (e) { return ''; }
  }

  function setUser(name) {
    try { global.localStorage.setItem(USER_KEY, str(name).trim()); } catch (e) { /* ignora */ }
  }

  /* Caminho da pasta onde os backups devem ser guardados. Fica no navegador,
     como o nome: serve só para o lembrete depois de cada backup. */
  function getFolder() {
    try { return global.localStorage.getItem(FOLDER_KEY) || ''; } catch (e) { return ''; }
  }

  function setFolder(caminho) {
    try { global.localStorage.setItem(FOLDER_KEY, str(caminho).trim()); } catch (e) { /* ignora */ }
  }

  /* O caminho do banco é outro campo que o da pasta de backup: são pastas
     diferentes, e uma sobrescrevia a outra quando os dois usavam a mesma
     chave. Em branco vale o combinado. */
  function getDbFolder() {
    try {
      var v = global.localStorage.getItem(DB_FOLDER_KEY);
      return v === null ? CAMINHO_PADRAO : v;
    } catch (e) { return CAMINHO_PADRAO; }
  }

  function setDbFolder(caminho) {
    try { global.localStorage.setItem(DB_FOLDER_KEY, str(caminho).trim()); } catch (e) { /* ignora */ }
  }

  function getLastBackupAt() {
    try { return global.localStorage.getItem(BACKUP_KEY) || ''; } catch (e) { return ''; }
  }

  function setLastBackupAt(iso) {
    try { global.localStorage.setItem(BACKUP_KEY, iso); } catch (e) { /* ignora */ }
  }

  /* --- API pública ------------------------------------------------------ */

  var useIdb = true;

  function fallback(err) {
    useIdb = false;
    Log.aviso('armazenamento', 'o banco do navegador (IndexedDB) não abriu — ' +
      'usando o armazenamento simples',
      'funciona, mas cabe bem menos (uns 5 MB no total). Com muitas imagens isto ' +
      'vai encher: faça backups com mais frequência.', { erro: err && err.name });
  }

  var Store = {
    SCHEMA: SCHEMA,
    uid: uid,
    nowIso: nowIso,
    depoisDe: depoisDe,
    newProject: newProject,
    newNcr: newNcr,
    STATUS: STATUS,
    STATUS_CONCLUIDO: STATUS_CONCLUIDO,
    statusInfo: statusInfo,
    ORDENS: ORDENS,
    ordemInfo: ordemInfo,
    ordenar: ordenar,
    cmpTexto: cmpTexto,
    setStatus: setStatus,
    itemsKey: itemsKey,
    newEvidence: newEvidence,
    normalizeProject: normalizeProject,
    normalizeNcr: normalizeNcr,

    list: function () {
      var read = useIdb ? idbAll().catch(function (e) { fallback(e); return lsAll(); }) : Promise.resolve(lsAll());
      return read.then(function (rows) {
        return rows.map(normalizeProject).sort(function (a, b) {
          return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
      });
    },

    getUser: getUser,
    getFolder: getFolder,
    setFolder: setFolder,
    CAMINHO_PADRAO: CAMINHO_PADRAO,
    getDbFolder: getDbFolder,
    setDbFolder: setDbFolder,
    setUser: setUser,
    MAX_SESSIONS: MAX_SESSIONS,
    signature: signature,
    diffProject: diffProject,
    numeroChave: numeroChave,
    reviver: reviver,
    marcoChave: marcoChave,
    tombstone: tombstone,
    tombstoneProjeto: tombstoneProjeto,
    lapidesProjeto: lapidesProjeto,
    esquecerLapideProjeto: esquecerLapideProjeto,
    mergeLWW: mergeLWW,
    mergeListas: mergeListas,
    duplicar: duplicar,
    textoBusca: textoBusca,
    difCampos: difCampos,
    diasDesde: diasDesde,
    maisNovoQueEu: maisNovoQueEu,
    CAMPOS_VISIVEIS: CAMPOS_VISIVEIS,
    putHandle: putHandle,
    getHandle: getHandle,
    clearHandle: clearHandle,
    saveSnapshot: saveSnapshot,
    getSnapshot: getSnapshot,
    clearSnapshot: clearSnapshot,
    saveBase: saveBase,
    getBase: getBase,
    baseDe: baseDe,
    retratoItem: retratoItem,
    CAMPOS_MESCLA: CAMPOS_MESCLA,
    rotuloCampo: rotuloCampo,
    valorCampo: valorCampo,
    porCampo: porCampo,

    /**
     * Anota, na sessão corrente do projeto, que um item foi criado, editado
     * ou excluído. Uma anotação por item: repetir só atualiza o rótulo.
     */
    logChange: function (project, sessionId, kind, item, action) {
      if (!project.sessions) project.sessions = [];
      var sess = project.sessions.filter(function (x) { return x.id === sessionId; })[0];
      if (!sess) {
        sess = { id: sessionId, user: getUser(), startedAt: nowIso(), endedAt: '', changes: [] };
        project.sessions.push(sess);
        if (project.sessions.length > MAX_SESSIONS) {
          project.sessions = project.sessions.slice(-MAX_SESSIONS);
        }
      }
      sess.user = getUser() || sess.user;
      sess.endedAt = nowIso();

      var label = (item.ncrId || '').trim() || '(sem número)';
      var found = sess.changes.filter(function (c) { return c.itemId === item.id; })[0];
      if (found) {
        found.label = label;
        /* criar e depois editar continua sendo "criou"; excluir vence tudo */
        if (action === 'excluiu') found.action = 'excluiu';
      } else {
        sess.changes.push({ itemId: item.id, kind: kind, label: label, action: action });
      }

      if (action !== 'excluiu') {
        item.editedBy = getUser();
        item.editedAt = sess.endedAt;
      }
      return sess;
    },

    getLastBackupAt: getLastBackupAt,
    setLastBackupAt: setLastBackupAt,

    save: function (project) {
      project.updatedAt = nowIso();
      var who = getUser();
      if (who) { project.lastEditedBy = who; }
      project.lastEditedAt = project.updatedAt;
      var copy = JSON.parse(JSON.stringify(project));
      if (!useIdb) return lsPut(copy);
      return idbPut(copy).catch(function (e) { fallback(e); return lsPut(copy); });
    },

    remove: function (id) {
      if (!useIdb) return lsDelete(id);
      return idbDelete(id).catch(function (e) { fallback(e); return lsDelete(id); });
    },

    /* Backup: um arquivo .json com um ou vários relatórios. */
    toBackup: function (projects) {
      var who = getUser();
      var when = nowIso();
      return {
        format: 'derrogacao-waiver-backup',
        schema: SCHEMA,
        exportedAt: when,
        exportedBy: who,
        projects: projects.map(function (p) {
          p.lastBackupBy = who;
          p.lastBackupAt = when;
          /* o que sai no arquivo passa a ser a base comum da próxima mesclagem */
          ['ncrs', 'devs'].forEach(function (k) {
            (p[k] || []).forEach(function (n) { n.syncBase = n.editedAt; });
          });
          return JSON.parse(JSON.stringify(p));
        })
      };
    },

    fromBackup: function (data) {
      if (!data || typeof data !== 'object') throw new Error('Arquivo inválido.');
      var list;
      if (Array.isArray(data.projects)) list = data.projects;
      else if (Array.isArray(data)) list = data;
      else if (data.ncrs) list = [data];
      else throw new Error('O arquivo não contém relatórios reconhecíveis.');
      if (!list.length) throw new Error('O arquivo não contém relatórios.');
      return list.map(normalizeProject);
    }
  };

  global.Store = Store;
})(window);
