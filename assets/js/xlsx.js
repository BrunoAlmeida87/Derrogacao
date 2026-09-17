/* ==========================================================================
   xlsx.js — escreve uma planilha do Excel sem biblioteca nenhuma
   --------------------------------------------------------------------------
   Um .xlsx é um ZIP com alguns XML dentro. Como o programa não pode ter
   dependência (§2 do CLAUDE.md), o ZIP é montado aqui, à mão: cada arquivo
   entra "armazenado" (método 0, sem compressão), que o Excel aceita e
   dispensa escrever um compressor em JavaScript.

   Por que não bastava o CSV que já existe:
   - o CSV perde o tipo (número vira texto conforme a configuração regional),
     perde o congelamento do cabeçalho e não traz os filtros prontos;
   - e um campo começando por "=" no CSV é fórmula para o Excel. Aqui cada
     célula de texto é gravada como `inlineStr`, que o Excel nunca interpreta
     como fórmula — a proteção deixa de depender do apóstrofo.

   Uso:
     Xlsx.blob([{ nome: 'Itens', colunas: [{titulo, larg}], linhas: [[...]] }])

   Um valor numérico vira número na célula; qualquer outra coisa vira texto.
   ========================================================================== */

(function (global) {
  'use strict';

  /* --- utilidades de bytes ------------------------------------------------ */

  /* O XML é UTF-8; JavaScript guarda UTF-16. Este é o caminho que funciona
     em navegador antigo, sem TextEncoder. */
  function bytesDeTexto(txt) {
    var bin = unescape(encodeURIComponent(String(txt)));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
    return out;
  }

  var TABELA_CRC = null;
  function tabelaCrc() {
    if (TABELA_CRC) return TABELA_CRC;
    TABELA_CRC = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABELA_CRC[n] = c;
    }
    return TABELA_CRC;
  }

  function crc32(bytes) {
    var t = tabelaCrc();
    var c = 0 ^ (-1);
    for (var i = 0; i < bytes.length; i++) {
      c = (c >>> 8) ^ t[(c ^ bytes[i]) & 0xFF];
    }
    return (c ^ (-1)) >>> 0;
  }

  /** Data e hora no formato do ZIP (MS-DOS), com resolução de 2 segundos. */
  function dataDos(d) {
    var ano = Math.max(1980, d.getFullYear());
    return {
      data: ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
      hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
    };
  }

  /* Escritor sequencial: o ZIP é uma fita de bytes, e é assim que ele se
     escreve — sem concatenar vetores a cada campo. */
  function Fita() {
    this.partes = [];
    this.tamanho = 0;
  }
  Fita.prototype.bytes = function (b) {
    this.partes.push(b);
    this.tamanho += b.length;
  };
  Fita.prototype.u16 = function (v) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  };
  Fita.prototype.u32 = function (v) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  };
  Fita.prototype.juntar = function () {
    var out = new Uint8Array(this.tamanho);
    var p = 0;
    this.partes.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  };

  /**
   * Monta o ZIP. `arquivos` é [{ nome, texto }] — tudo aqui é texto (XML).
   * Método 0 (armazenado): o Excel abre normalmente e não é preciso um
   * compressor. O preço é o tamanho, e uma planilha de texto é pequena.
   */
  function zipar(arquivos) {
    var agora = dataDos(new Date());
    var corpo = new Fita();
    var central = [];

    arquivos.forEach(function (arq) {
      var nome = bytesDeTexto(arq.nome);
      var dados = bytesDeTexto(arq.texto);
      var crc = crc32(dados);
      var deslocamento = corpo.tamanho;

      corpo.u32(0x04034b50);          /* assinatura do cabeçalho local */
      corpo.u16(20);                  /* versão necessária */
      corpo.u16(0x0800);              /* nomes em UTF-8 */
      corpo.u16(0);                   /* método: armazenado */
      corpo.u16(agora.hora);
      corpo.u16(agora.data);
      corpo.u32(crc);
      corpo.u32(dados.length);
      corpo.u32(dados.length);
      corpo.u16(nome.length);
      corpo.u16(0);
      corpo.bytes(nome);
      corpo.bytes(dados);

      central.push({ nome: nome, crc: crc, tam: dados.length, off: deslocamento });
    });

    var dir = new Fita();
    central.forEach(function (c) {
      dir.u32(0x02014b50);
      dir.u16(20);                    /* versão de quem escreveu */
      dir.u16(20);
      dir.u16(0x0800);
      dir.u16(0);
      dir.u16(agora.hora);
      dir.u16(agora.data);
      dir.u32(c.crc);
      dir.u32(c.tam);
      dir.u32(c.tam);
      dir.u16(c.nome.length);
      dir.u16(0); dir.u16(0); dir.u16(0); dir.u16(0);
      dir.u32(0);
      dir.u32(c.off);
      dir.bytes(c.nome);
    });

    var fim = new Fita();
    fim.u32(0x06054b50);
    fim.u16(0); fim.u16(0);
    fim.u16(central.length);
    fim.u16(central.length);
    fim.u32(dir.tamanho);
    fim.u32(corpo.tamanho);
    fim.u16(0);

    var todo = new Fita();
    todo.bytes(corpo.juntar());
    todo.bytes(dir.juntar());
    todo.bytes(fim.juntar());
    return todo.juntar();
  }

  /* --- XML ---------------------------------------------------------------- */

  /* Caractere de controle não é XML válido e derruba o Excel com "conteúdo
     ilegível" — some antes de entrar. Tabulação, \n e \r ficam. */
  function xml(v) {
    return String(v == null ? '' : v)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 1 -> A, 27 -> AA. */
  function coluna(n) {
    var s = '';
    while (n > 0) {
      var r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - r) / 26);
    }
    return s;
  }

  function ehNumero(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function nomeDeAba(nome, usados) {
    /* o Excel não aceita : \ / ? * [ ] no nome da aba, nem mais de 31 letras */
    var n = String(nome || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Planilha';
    var base = n, i = 2;
    while (usados.indexOf(n.toLowerCase()) >= 0) {
      n = (base.slice(0, 28) + ' ' + i).slice(0, 31);
      i++;
    }
    usados.push(n.toLowerCase());
    return n;
  }

  function folhaXml(planilha) {
    var colunas = planilha.colunas || [];
    var linhas = planilha.linhas || [];
    var partes = [];

    partes.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
    partes.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    /* congela o cabeçalho: numa lista de 200 itens, rolar sem isso é perder
       de vista que coluna é qual */
    partes.push('<sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
      '</sheetView></sheetViews>');

    if (colunas.length) {
      var cols = colunas.map(function (c, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' +
          (c.larg || 16) + '" customWidth="1"/>';
      }).join('');
      partes.push('<cols>' + cols + '</cols>');
    }

    partes.push('<sheetData>');
    var celulas = colunas.map(function (c, i) {
      return '<c r="' + coluna(i + 1) + '1" t="inlineStr" s="1"><is><t xml:space="preserve">' +
        xml(c.titulo) + '</t></is></c>';
    }).join('');
    partes.push('<row r="1" s="1" customFormat="1">' + celulas + '</row>');

    linhas.forEach(function (linha, li) {
      var r = li + 2;
      var cs = '';
      for (var i = 0; i < colunas.length; i++) {
        var v = linha[i];
        if (v == null || v === '') continue;      /* célula vazia não precisa existir */
        var ref = coluna(i + 1) + r;
        if (ehNumero(v)) {
          cs += '<c r="' + ref + '"><v>' + v + '</v></c>';
        } else {
          /* inlineStr: o Excel trata como texto sempre, então um valor que
             comece por "=" não vira fórmula */
          cs += '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' +
            xml(v) + '</t></is></c>';
        }
      }
      partes.push('<row r="' + r + '">' + cs + '</row>');
    });
    partes.push('</sheetData>');

    /* filtros prontos no cabeçalho — é o que a pessoa vai usar assim que
       abrir, e configurar isso à mão em cada exportação seria trabalho toda vez */
    if (colunas.length && planilha.filtros !== false) {
      partes.push('<autoFilter ref="A1:' + coluna(colunas.length) +
        Math.max(1, linhas.length + 1) + '"/>');
    }
    partes.push('</worksheet>');
    return partes.join('');
  }

  var ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="3">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF4B0082"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="2">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /**
   * Monta o arquivo. `planilhas` é [{nome, colunas, linhas, filtros}].
   * Devolve um Blob pronto para download.
   */
  function blob(planilhas) {
    var abas = (planilhas || []).filter(Boolean);
    if (!abas.length) abas = [{ nome: 'Planilha', colunas: [], linhas: [] }];

    var usados = [];
    abas.forEach(function (p) { p.nomeFinal = nomeDeAba(p.nome, usados); });

    var arquivos = [];
    arquivos.push({
      nome: '[Content_Types].xml',
      texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        abas.map(function (p, i) {
          return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
            '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
        }).join('') +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>'
    });

    arquivos.push({
      nome: '_rels/.rels',
      texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });

    arquivos.push({
      nome: 'xl/workbook.xml',
      texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        abas.map(function (p, i) {
          return '<sheet name="' + xml(p.nomeFinal) + '" sheetId="' + (i + 1) +
            '" r:id="rId' + (i + 1) + '"/>';
        }).join('') +
        '</sheets></workbook>'
    });

    arquivos.push({
      nome: 'xl/_rels/workbook.xml.rels',
      texto: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        abas.map(function (p, i) {
          return '<Relationship Id="rId' + (i + 1) +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
            (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (abas.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });

    abas.forEach(function (p, i) {
      arquivos.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml', texto: folhaXml(p) });
    });
    arquivos.push({ nome: 'xl/styles.xml', texto: ESTILOS });

    return new Blob([zipar(arquivos)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  global.Xlsx = { blob: blob, coluna: coluna };
})(window);
