/* ==========================================================================
   revisoes.js — o histórico do que cada pessoa escreveu, campo a campo
   --------------------------------------------------------------------------
   A pasta já guardava versões inteiras do banco (historico/), que servem
   para o estrago grande: voltar tudo a como estava às 14h. Faltava o
   contrário — a pergunta miúda, que é a que aparece no dia a dia:

       "quem apagou o meu texto do Arch Answer, e o que estava escrito lá?"

   Para isso, versão inteira é um instrumento ruim: são 40 arquivos que
   ninguém abre, e achar o texto certo dentro deles é trabalho manual. Aqui
   cada alteração de campo vira uma linha: quem, quando, qual campo, o que
   estava e o que passou a estar. Com isso o texto de ontem volta num clique.

   De onde saem as linhas: da mesma base que a mesclagem usa
   (`Store.baseDe`). O que este computador tem hoje, comparado com o que ele
   viu na pasta da última vez, é exatamente o que esta pessoa escreveu — sem
   precisar gravar nada a cada tecla.

   Decisões que valem a pena ficarem ditas:

   - **Arquivo próprio na pasta** (revisoes.json), ao lado dos dados e da
     conversa. O derrogacao-dados.json é reescrito inteiro a cada gravação e
     copiado em cada versão do histórico; um diário que só cresce não tem por
     que viajar junto (é o mesmo motivo da conversa).
   - **União pelo id, nunca "vale o mais recente"**: uma alteração que
     aconteceu não deixa de ter acontecido. O que pode mudar é o texto final
     de uma linha ainda aberta (ver `acrescentar`), e aí vale o carimbo maior.
   - **Cada um anota o que escreveu**, e só isso. Anotar também o que chegou
     dos outros duplicaria a mesma linha em cada computador, com ids
     diferentes, e o diário viraria uma sala de eco.
   - **Não vai para o PDF nem para o backup.** É registro de trabalho, não
     documento.
   ========================================================================== */

(function (global) {
  'use strict';

  var CHAVE = 'derrogacao:revisoes';
  /* Os tetos existem por causa do armazenamento do navegador, que é de uns
     5 MB para TODAS as chaves do programa — a conversa já ocupa parte dele.
     1500 linhas de até 4 000 caracteres dão algo em torno de meio mega. */
  var MAX_REGS = 1500;
  var DIAS_GUARDA = 365;      // um ano cobre a vida de um marco
  var MAX_TEXTO = 4000;       // por campo guardado
  var JANELA = 10 * 60 * 1000; // tecla a tecla vira uma linha só (ver acrescentar)

  function str(v) { return (v == null ? '' : String(v)); }
  function agora() { return new Date().toISOString(); }

  function uid() {
    if (global.Store && Store.uid) return Store.uid();
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function corta(t) {
    t = str(t);
    return t.length > MAX_TEXTO ? t.slice(0, MAX_TEXTO) + '…' : t;
  }

  /* --- um registro -------------------------------------------------------- */

  function normalizar(r) {
    if (!r || typeof r !== 'object' || !r.id || !r.campo) return null;
    return {
      id: str(r.id),
      em: str(r.em) || agora(),
      por: str(r.por),
      projeto: str(r.projeto),
      marco: str(r.marco),
      kind: str(r.kind) === 'dev' ? 'dev' : 'ncr',
      item: str(r.item),
      ncrId: str(r.ncrId),
      campo: str(r.campo),
      rotulo: str(r.rotulo) || str(r.campo),
      de: corta(r.de),
      para: corta(r.para),
      /* edicao · criou · substituido · restaurou · excluiu */
      origem: str(r.origem) || 'edicao',
      semTexto: !!r.semTexto
    };
  }

  function porTempo(a, b) {
    return String(a.em).localeCompare(String(b.em)) || String(a.id).localeCompare(String(b.id));
  }

  /**
   * União pelo id. Quando o mesmo id aparece dos dois lados vale o carimbo
   * maior: é a linha que continuou sendo escrita (ver `acrescentar`), e a
   * cópia mais nova dela contém a mais velha.
   */
  function juntar(a, b) {
    var porId = {};
    [a || [], b || []].forEach(function (lista) {
      (lista || []).forEach(function (bruto) {
        var r = normalizar(bruto);
        if (!r) return;
        var tem = porId[r.id];
        if (!tem || String(r.em) > String(tem.em)) porId[r.id] = r;
      });
    });
    var out = [];
    for (var k in porId) if (Object.prototype.hasOwnProperty.call(porId, k)) out.push(porId[k]);
    return podar(out.sort(porTempo));
  }

  function podar(lista) {
    var corteData = new Date(Date.now() - DIAS_GUARDA * 86400000).toISOString();
    var viva = lista.filter(function (r) { return String(r.em) >= corteData; });
    if (!viva.length) viva = lista.slice(-200);
    return viva.length > MAX_REGS ? viva.slice(-MAX_REGS) : viva;
  }

  /**
   * Acrescenta registros novos, juntando o que é continuação.
   *
   * Quem escreve um parágrafo passa por várias sincronizações, e cada uma
   * veria um pedaço do texto: vinte linhas para uma edição só. Se a última
   * linha for da mesma pessoa, no mesmo campo, dentro de dez minutos, ela é
   * esticada em vez de nascer outra — o "de" continua sendo o texto do
   * começo, que é o que interessa para voltar atrás.
   */
  function acrescentar(lista, novos) {
    var out = (lista || []).slice();
    var limite = Date.now() - JANELA;
    (novos || []).forEach(function (bruto) {
      var r = normalizar(bruto);
      if (!r) return;
      if (r.origem === 'edicao') {
        for (var i = out.length - 1; i >= 0; i--) {
          var v = out[i];
          if (v.item !== r.item || v.campo !== r.campo) continue;
          if (v.origem !== 'edicao' || v.por !== r.por) break;
          if (Date.parse(v.em) < limite) break;
          /* mesma escrita, ainda em curso */
          v.para = r.para;
          v.em = r.em;
          return;
        }
      }
      out.push(r);
    });
    return podar(out.sort(porTempo));
  }

  /* --- o que esta pessoa escreveu desde a última troca --------------------- */

  /**
   * Compara o que está aqui com a base (o retrato da última conversa com a
   * pasta) e devolve uma linha por campo alterado.
   *
   * Sem base — primeira sincronização deste navegador — devolve nada: seriam
   * centenas de linhas dizendo que tudo "mudou de vazio para o que já
   * estava", e nenhuma delas seria verdade.
   */
  function calcular(base, projects, quem) {
    var out = [];
    if (!base || !projects) return out;
    projects.forEach(function (p) {
      var doProjeto = base[p.id];
      if (!doProjeto) return;         /* relatório novo: nada com que comparar */
      ['ncrs', 'devs'].forEach(function (key) {
        (p[key] || []).forEach(function (n) {
          var antes = doProjeto[n.id];
          var novo = !antes;
          if (novo) antes = {};
          Store.CAMPOS_MESCLA.forEach(function (campo) {
            var de = str(antes[campo]);
            var para = Store.valorCampo(n, campo);
            if (de === para) return;
            out.push({
              id: uid(), em: agora(), por: str(quem),
              projeto: p.id, marco: str(p.marco) || str(p.name),
              kind: key === 'devs' ? 'dev' : 'ncr',
              item: n.id, ncrId: str(n.ncrId),
              campo: campo, rotulo: Store.rotuloCampo(campo),
              de: de, para: para,
              origem: novo ? 'criou' : 'edicao'
            });
          });
        });
      });
    });
    return out;
  }

  /**
   * As linhas de um atropelamento: os dois escreveram no mesmo campo e um
   * dos textos saiu. É a linha mais importante do diário — é ela que devolve
   * o que se perdeu.
   */
  function deConflito(subs, projects, quem) {
    var out = [];
    var marcos = {};
    (projects || []).forEach(function (p) { marcos[p.id] = str(p.marco) || str(p.name); });
    (subs || []).forEach(function (s) {
      (s.perdidos || []).forEach(function (x) {
        out.push({
          id: uid(), em: agora(), por: str(x.de) || str(quem),
          projeto: str(s.projeto), marco: marcos[s.projeto] || '',
          kind: s.kind, item: str(s.id), ncrId: str(s.ncrId),
          campo: x.campo, rotulo: x.rotulo,
          de: x.perdeu, para: x.ficou,
          origem: 'substituido', semTexto: !!x.semTexto
        });
      });
    });
    return out;
  }

  /** Uma linha avulsa, para o que não sai de uma comparação (restaurar, excluir). */
  function registro(dados) {
    var r = normalizar({
      id: uid(), em: agora(), por: str(dados.por),
      projeto: str(dados.projeto), marco: str(dados.marco),
      kind: dados.kind, item: str(dados.item), ncrId: str(dados.ncrId),
      campo: str(dados.campo) || '-', rotulo: str(dados.rotulo),
      de: dados.de, para: dados.para, origem: str(dados.origem) || 'edicao'
    });
    return r;
  }

  /* --- consultas ---------------------------------------------------------- */

  /** As linhas de um item, da mais nova para a mais velha. */
  function doItem(lista, itemId) {
    return (lista || []).filter(function (r) { return r.item === itemId; })
      .sort(porTempo).reverse();
  }

  function doProjeto(lista, projetoId) {
    return (lista || []).filter(function (r) { return r.projeto === projetoId; })
      .sort(porTempo).reverse();
  }

  function todas(lista) {
    return (lista || []).slice().sort(porTempo).reverse();
  }

  /** Quantas linhas de conflito ainda não foram vistas por esta pessoa. */
  function conflitos(lista) {
    return (lista || []).filter(function (r) { return r.origem === 'substituido'; });
  }

  /** Tem aqui alguma coisa que o arquivo da pasta ainda não tem? */
  function faltamLa(minhas, remotas) {
    var la = {};
    (remotas || []).forEach(function (r) { if (r && r.id) la[r.id] = r; });
    return (minhas || []).some(function (r) {
      var outra = la[r.id];
      return !outra || String(outra.em) < String(r.em);
    });
  }

  /* --- cópia local --------------------------------------------------------
     Para o histórico existir mesmo para quem nunca ligou a pasta, e para o
     que foi escrito hoje não se perder se a pasta estiver fora do ar. */

  function locais() {
    try {
      var cru = global.localStorage.getItem(CHAVE);
      var lista = cru ? JSON.parse(cru) : [];
      return Array.isArray(lista) ? juntar(lista, []) : [];
    } catch (e) { return []; }
  }

  function gravarLocais(lista) {
    try { global.localStorage.setItem(CHAVE, JSON.stringify(lista || [])); }
    catch (e) { /* cheio: a pasta continua sendo a cópia que vale */ }
  }

  function envelope(lista) {
    return {
      format: 'derrogacao-revisoes',
      schema: 1,
      atualizadoEm: agora(),
      revisoes: lista || []
    };
  }

  global.Revisoes = {
    MAX_REGS: MAX_REGS,
    DIAS_GUARDA: DIAS_GUARDA,
    normalizar: normalizar,
    juntar: juntar,
    acrescentar: acrescentar,
    calcular: calcular,
    deConflito: deConflito,
    registro: registro,
    doItem: doItem,
    doProjeto: doProjeto,
    todas: todas,
    conflitos: conflitos,
    faltamLa: faltamLa,
    locais: locais,
    gravarLocais: gravarLocais,
    envelope: envelope
  };
})(window);
