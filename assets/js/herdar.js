/* ==========================================================================
   herdar.js — levar o item aceito para o marco em que o waiver foi aprovado
   --------------------------------------------------------------------------
   Quando um waiver é aceito, ele não acaba: ele vale até um marco à frente.
   Um item do J08 com "Waiver Approved Expiry: J09" vai ter de ser reescrito
   no relatório do J09, e o trabalho de hoje é justamente esse — copiar à mão,
   item por item, lembrando de trocar o que muda.

   Aqui isso vira um botão. O item é copiado para o relatório do marco de
   destino (que já tem de existir neste navegador — nenhum relatório nasce
   sozinho, e criar um marco por engano seria pior do que avisar), e chega lá:

   - **em "Em preenchimento"**, nunca aceito. O waiver do marco anterior foi
     aceito; o deste ainda nem foi pedido. É o pedido do Bruno em uma frase:
     "elas devem ficar em preenchimento quando forem transportadas".
   - **com o Waiver Historic já escrito** no formato do relatório
     (`J08 To: J09`), pela mesma função que o fluxo sabe ler de volta
     (`Fluxo.comLinha`) — não há um segundo formato aqui.
   - **marcado como herdado** (`herdadoDe`), que é o que põe a tarja na lista
     e a coluna na Tabela: "isto veio do J08, confira antes de mandar".
   - **sem o ciclo que terminou**: Arch Answer, Arch Status e as duas datas de
     validade eram a resposta do marco anterior. O texto do pedido —
     description, current situation, why not possible, arguments — é o que dá
     trabalho de escrever, e esse vai inteiro.

   O item de origem não é tocado. Ele é o registro do que aconteceu no marco
   dele, e continua sendo — inclusive para o ponto no card do fluxo, que lê o
   Arch Answer do marco anterior direto de lá.
   ========================================================================== */

(function (global) {
  'use strict';

  function texto(v) { return (v == null ? '' : String(v)).trim(); }

  /* O que era a resposta do marco que terminou. Some na cópia, para ninguém
     mandar para o J09 a data de validade que venceu no J08. */
  var DO_CICLO_ANTERIOR = ['archAnswer', 'archStatus', 'requestExpiry', 'approvedExpiry'];

  /** O marco de um relatório, já entendido como card de fluxo. */
  function marcoDe(project, kind) {
    return Fluxo.marco(Report.marcoOf(project, kind));
  }

  /**
   * Para onde este item vai quando o waiver for aceito: o marco escrito em
   * "Waiver Approved Expiry". É o campo que o relatório já usa para dizer
   * até quando o waiver vale — não inventamos campo novo para isso (§10).
   */
  function destinoDe(item) {
    return Fluxo.marco(item && item.approvedExpiry);
  }

  /**
   * O item está pronto para ser levado adiante?
   * Devolve sempre um diagnóstico, porque a tela precisa dizer o que falta.
   */
  function avaliar(project, item, kind, projects) {
    var out = {
      pode: false, motivo: '', destino: null, origem: null,
      projetoDestino: null, jaLa: null
    };
    if (!item) { out.motivo = 'Nenhum item aberto.'; return out; }

    out.origem = marcoDe(project, kind);
    out.destino = destinoDe(item);

    if (Store.statusInfo(item.status).id !== Store.STATUS_CONCLUIDO) {
      out.motivo = 'Só depois de “Waiver accepted”: enquanto o waiver não foi ' +
        'aceito, não há o que levar para o marco seguinte.';
      return out;
    }
    if (!out.destino) {
      out.motivo = 'Escreva o marco em “Waiver Approved Expiry (before)” — ' +
        'é ele que diz para onde este waiver vai.';
      return out;
    }
    if (out.origem && Fluxo.mesmoMarco(out.origem, out.destino)) {
      out.motivo = 'O “Waiver Approved Expiry” aponta para o próprio marco ' +
        'deste relatório (' + out.destino.rotulo + ').';
      return out;
    }

    /* O relatório do destino tem de existir: criar um marco sozinho, a
       partir de um campo de texto, encheria a lista de marcos escritos com
       typo — e cada um deles viajaria para a pasta da equipe. */
    (projects || []).forEach(function (p) {
      if (p.id === project.id) return;
      if (out.projetoDestino) return;
      var m = marcoDe(p, kind);
      if (m && Fluxo.mesmoMarco(m, out.destino)) out.projetoDestino = p;
    });
    if (!out.projetoDestino) {
      out.motivo = 'Não há neste navegador um relatório do marco ' +
        out.destino.rotulo + '. Crie-o primeiro (ou traga-o pela pasta).';
      return out;
    }

    /* Já foi levado antes? O pareamento é o mesmo de sempre: o número,
       dentro do marco. Levar duas vezes criaria duas NCR-001 no J09, e a
       mesclagem juntaria as duas num item só no computador do colega. */
    var chave = Store.numeroChave(item);
    (out.projetoDestino[Store.itemsKey(kind)] || []).forEach(function (n) {
      if (!out.jaLa && chave && Store.numeroChave(n) === chave) out.jaLa = n;
    });
    if (out.jaLa) {
      out.motivo = 'O ' + (texto(item.ncrId) || 'item') + ' já existe no ' +
        out.destino.rotulo + '.';
      return out;
    }

    out.pode = true;
    return out;
  }

  /**
   * A cópia que vai para o marco de destino. Não grava nada — quem grava é
   * quem chamou, que também é quem sabe avisar a tela e a pasta.
   */
  function copiaPara(item, origem, destino) {
    var copia = Store.duplicar(item);
    /* `duplicar` marca o número com "(cópia)" porque lá o destino é o MESMO
       relatório, onde dois números iguais viram um item só na mesclagem do
       colega. Aqui o destino é outro marco, e o pareamento é sempre dentro
       do marco: a NCR-001 do J08 e a NCR-001 do J09 são itens distintos, e
       têm de ter o mesmo número — é ele que liga um ao outro no fluxo. */
    copia.ncrId = texto(item.ncrId);
    DO_CICLO_ANTERIOR.forEach(function (c) { copia[c] = ''; });
    copia.historic = Fluxo.comLinha(item.historic,
      origem ? origem.rotulo : '', destino ? destino.rotulo : '');
    copia.herdadoDe = origem ? origem.rotulo : '';
    copia.herdadoEm = new Date().toISOString();
    /* `duplicar` já põe em "Em preenchimento"; explícito porque é o pedido */
    Store.setStatus(copia, Store.STATUS_PADRAO);
    return copia;
  }

  /** O texto que a tela mostra antes de confirmar. */
  function resumo(av) {
    if (!av.pode) return av.motivo;
    return 'Uma cópia de ' + (texto(av.origem && av.origem.rotulo) || 'aqui') +
      ' para ' + av.destino.rotulo + ', em “Em preenchimento”, com ' +
      '“' + Fluxo.linhaHistorico(av.origem && av.origem.rotulo, av.destino.rotulo) +
      '” já escrito no Waiver Historic.';
  }

  global.Herdar = {
    DO_CICLO_ANTERIOR: DO_CICLO_ANTERIOR,
    destinoDe: destinoDe,
    marcoDe: marcoDe,
    avaliar: avaliar,
    copiaPara: copiaPara,
    resumo: resumo
  };
})(window);
