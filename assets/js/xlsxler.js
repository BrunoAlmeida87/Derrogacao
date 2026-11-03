/* ==========================================================================
   xlsxler.js — LÊ planilhas .xlsx, sem biblioteca
   --------------------------------------------------------------------------
   O mesmo motor do NCR Control (ZIP + INFLATE + XML), copiado sem alterar a
   lógica: os dois sistemas leem o export de NCR exatamente do mesmo jeito.
   (O xlsx.js ao lado faz o contrário — escreve a planilha exportada. São
   arquivos separados porque o leitor é cópia literal do NCR Control, e assim
   continua comparável com ele linha a linha.)
   Roda na própria página — o export do banco NCR tem alguns milhares de
   linhas, o que não justifica um Worker, e assim funciona igual de file://.

   Expõe window.XlsxLer.ler(file) -> Promise({ sheets: [{name, rows, maxCol}] }),
   em que rows é uma matriz de valores (texto, número, Date ou booleano).
   ========================================================================== */

(function(){
"use strict";

/* ---------------- utf8 ---------------- */
var TD = (typeof TextDecoder !== 'undefined') ? new TextDecoder('utf-8') : null;
function utf8(bytes){
  if(!bytes) return '';
  if(TD) return TD.decode(bytes);
  var s=''; for(var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]);
  try{ return decodeURIComponent(escape(s)); }catch(e){ return s; }
}

/* ---------------- INFLATE (raw deflate, fallback puro JS) ---------------- */
var LBASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
var LEXT =[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
var DBASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
var DEXT =[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
var CLORD=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
var fixedL=null, fixedD=null;

function buildHuff(lengths, n){
  var MAX=15, count=new Int32Array(MAX+1), i;
  for(i=0;i<n;i++) count[lengths[i]]++;
  count[0]=0;
  var offs=new Int32Array(MAX+2), s=0;
  for(i=1;i<=MAX;i++){ offs[i]=s; s+=count[i]; }
  var symbols=new Int32Array(n);
  for(i=0;i<n;i++) if(lengths[i]) symbols[offs[lengths[i]]++]=i;
  return {count:count, symbols:symbols};
}

function inflateRaw(src){
  var bitPos=0;
  function bits(n){ var v=0,i; for(i=0;i<n;i++){ v |= ((src[bitPos>>3]>>(bitPos&7))&1)<<i; bitPos++; } return v; }
  function decode(h){
    var code=0, first=0, index=0, len, count;
    for(len=1; len<=15; len++){
      code |= bits(1);
      count = h.count[len];
      if(code - first < count) return h.symbols[index + (code - first)];
      index += count; first += count; first <<= 1; code <<= 1;
    }
    throw new Error('Fluxo compactado invalido (Huffman)');
  }
  var cap = Math.max(1<<16, src.length*5);
  var out = new Uint8Array(cap), outLen=0;
  function ensure(n){
    if(outLen+n <= out.length) return;
    var c=out.length; while(c < outLen+n) c*=2;
    var nb=new Uint8Array(c); nb.set(out.subarray(0,outLen)); out=nb;
  }
  var last=0;
  do{
    last=bits(1);
    var type=bits(2);
    if(type===0){
      bitPos=(bitPos+7)&~7;
      var p=bitPos>>3;
      var slen=src[p]|(src[p+1]<<8);
      ensure(slen);
      out.set(src.subarray(p+4,p+4+slen), outLen); outLen+=slen;
      bitPos=(p+4+slen)<<3;
    } else if(type===1 || type===2){
      var lh,dh;
      if(type===1){
        if(!fixedL){
          var fl=new Uint8Array(288),k;
          for(k=0;k<144;k++) fl[k]=8; for(k=144;k<256;k++) fl[k]=9;
          for(k=256;k<280;k++) fl[k]=7; for(k=280;k<288;k++) fl[k]=8;
          fixedL=buildHuff(fl,288);
          var fd=new Uint8Array(30); for(k=0;k<30;k++) fd[k]=5;
          fixedD=buildHuff(fd,30);
        }
        lh=fixedL; dh=fixedD;
      } else {
        var hlit=bits(5)+257, hdist=bits(5)+1, hclen=bits(4)+4, i;
        var cl=new Uint8Array(19);
        for(i=0;i<hclen;i++) cl[CLORD[i]]=bits(3);
        var clh=buildHuff(cl,19);
        var lens=new Uint8Array(hlit+hdist); i=0;
        while(i<lens.length){
          var sym=decode(clh), r;
          if(sym<16) lens[i++]=sym;
          else if(sym===16){ var prev=lens[i-1]; r=3+bits(2); while(r--) lens[i++]=prev; }
          else if(sym===17){ r=3+bits(3); while(r--) lens[i++]=0; }
          else { r=11+bits(7); while(r--) lens[i++]=0; }
        }
        lh=buildHuff(lens.subarray(0,hlit), hlit);
        dh=buildHuff(lens.subarray(hlit), hdist);
      }
      for(;;){
        var s2=decode(lh);
        if(s2<256){ ensure(1); out[outLen++]=s2; }
        else if(s2===256) break;
        else {
          var si=s2-257;
          if(si>=LBASE.length) throw new Error('Simbolo de comprimento invalido');
          var ln=LBASE[si]+bits(LEXT[si]);
          var ds=decode(dh);
          var dist=DBASE[ds]+bits(DEXT[ds]);
          ensure(ln);
          var from=outLen-dist;
          if(from<0) throw new Error('Distancia invalida no fluxo compactado');
          for(var q=0;q<ln;q++) out[outLen++]=out[from++];
        }
      }
    } else throw new Error('Bloco deflate invalido');
  } while(!last);
  return out.subarray(0,outLen);
}

/* ---------------- ZIP ---------------- */
function readZip(buf){
  var u8=new Uint8Array(buf), dv=new DataView(buf);
  if(u8.length<22) throw new Error('Arquivo vazio ou truncado');
  if(u8[0]===0xD0 && u8[1]===0xCF && u8[2]===0x11 && u8[3]===0xE0)
    throw new Error('Formato .xls antigo (BIFF/OLE2) nao suportado. Salve o arquivo como .xlsx.');
  if(!(u8[0]===0x50 && u8[1]===0x4B)) throw new Error('Arquivo nao e um .xlsx valido (assinatura ZIP ausente)');
  var eocd=-1, lim=Math.max(0,u8.length-66000), i;
  for(i=u8.length-22; i>=lim; i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error('Estrutura ZIP invalida (fim do diretorio central nao encontrado)');
  var cdOff=dv.getUint32(eocd+16,true), cdCount=dv.getUint16(eocd+10,true);
  if(cdOff===0xffffffff || cdCount===0xffff){
    var loc=eocd-20;
    if(loc>=0 && dv.getUint32(loc,true)===0x07064b50){
      var z64=Number(dv.getBigUint64(loc+8,true));
      if(z64>=0 && z64<u8.length && dv.getUint32(z64,true)===0x06064b50){
        cdCount=Number(dv.getBigUint64(z64+32,true));
        cdOff=Number(dv.getBigUint64(z64+48,true));
      }
    }
  }
  var entries={}, p=cdOff, n;
  for(n=0;n<cdCount;n++){
    if(p+46>u8.length || dv.getUint32(p,true)!==0x02014b50) break;
    var method=dv.getUint16(p+10,true);
    var csize=dv.getUint32(p+20,true), usize=dv.getUint32(p+24,true);
    var nlen=dv.getUint16(p+28,true), elen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true);
    var lho=dv.getUint32(p+42,true);
    var name=utf8(u8.subarray(p+46,p+46+nlen));
    if(csize===0xffffffff || usize===0xffffffff || lho===0xffffffff){
      var ep=p+46+nlen, eend=ep+elen;
      while(ep+4<=eend){
        var hid=dv.getUint16(ep,true), hsz=dv.getUint16(ep+2,true), q=ep+4;
        if(hid===0x0001){
          if(usize===0xffffffff){ usize=Number(dv.getBigUint64(q,true)); q+=8; }
          if(csize===0xffffffff){ csize=Number(dv.getBigUint64(q,true)); q+=8; }
          if(lho===0xffffffff){ lho=Number(dv.getBigUint64(q,true)); q+=8; }
        }
        ep+=4+hsz;
      }
    }
    entries[name]={method:method,csize:csize,usize:usize,lho:lho};
    p += 46+nlen+elen+clen;
  }
  return {entries:entries,u8:u8,dv:dv};
}

function zipHas(zip,name){ return !!zip.entries[name]; }

function zipRead(zip,name){
  var e=zip.entries[name];
  if(!e) return Promise.resolve(null);
  var nlen=zip.dv.getUint16(e.lho+26,true), elen=zip.dv.getUint16(e.lho+28,true);
  var start=e.lho+30+nlen+elen;
  var comp=zip.u8.subarray(start,start+e.csize);
  if(e.method===0) return Promise.resolve(comp.slice(0,e.usize||comp.length));
  if(e.method!==8) return Promise.reject(new Error('Metodo de compactacao nao suportado ('+e.method+') em '+name));
  if(typeof DecompressionStream!=='undefined'){
    try{
      var ds=new DecompressionStream('deflate-raw');
      var stream=new Blob([comp]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function(ab){ return new Uint8Array(ab); })
        .catch(function(){ return inflateRaw(comp); });
    }catch(err){ /* cai no fallback */ }
  }
  try{ return Promise.resolve(inflateRaw(comp)); }
  catch(err2){ return Promise.reject(new Error('Falha ao descompactar '+name+': '+err2.message)); }
}

/* ---------------- SHA-256 ---------------- */
var K256=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256Js(bytes){
  var h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  var l=bytes.length, bitLenHi=Math.floor(l/536870912), bitLenLo=(l<<3)>>>0;
  var withPad=((l+9+63)>>6)<<6;
  var buf=new Uint8Array(withPad); buf.set(bytes); buf[l]=0x80;
  var dv=new DataView(buf.buffer);
  dv.setUint32(withPad-8,bitLenHi,false); dv.setUint32(withPad-4,bitLenLo,false);
  var w=new Int32Array(64), i,j;
  for(i=0;i<withPad;i+=64){
    for(j=0;j<16;j++) w[j]=dv.getInt32(i+j*4,false);
    for(j=16;j<64;j++){
      var g0=w[j-15], g1=w[j-2];
      var s0=((g0>>>7)|(g0<<25))^((g0>>>18)|(g0<<14))^(g0>>>3);
      var s1=((g1>>>17)|(g1<<15))^((g1>>>19)|(g1<<13))^(g1>>>10);
      w[j]=(w[j-16]+s0+w[j-7]+s1)|0;
    }
    var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
    for(j=0;j<64;j++){
      var S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      var ch=(e&f)^(~e&g);
      var t1=(hh+S1+ch+K256[j]+w[j])|0;
      var S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      var mj=(a&b)^(a&c)^(b&c);
      var t2=(S0+mj)|0;
      hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h[0]=(h[0]+a)|0; h[1]=(h[1]+b)|0; h[2]=(h[2]+c)|0; h[3]=(h[3]+d)|0;
    h[4]=(h[4]+e)|0; h[5]=(h[5]+f)|0; h[6]=(h[6]+g)|0; h[7]=(h[7]+hh)|0;
  }
  var out='';
  for(i=0;i<8;i++) out += ('00000000'+(h[i]>>>0).toString(16)).slice(-8);
  return out;
}
function sha256Hex(bytes){
  var g=(typeof self!=='undefined'?self:this);
  if(g.crypto && g.crypto.subtle && g.crypto.subtle.digest){
    try{
      return g.crypto.subtle.digest('SHA-256', bytes.buffer ? bytes.slice(0).buffer : bytes).then(function(d){
        var v=new Uint8Array(d), s='';
        for(var i=0;i<v.length;i++) s += ('0'+v[i].toString(16)).slice(-2);
        return s;
      }).catch(function(){ return sha256Js(bytes); });
    }catch(e){}
  }
  return Promise.resolve(sha256Js(bytes));
}

/* ---------------- XML helpers ---------------- */
var ENT={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
function dec(s){
  if(!s || s.indexOf('&')<0) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, function(m,g){
    if(g.charAt(0)==='#'){
      var code = g.charAt(1)==='x'||g.charAt(1)==='X' ? parseInt(g.slice(2),16) : parseInt(g.slice(1),10);
      if(isNaN(code)) return m;
      try{ return String.fromCodePoint(code); }catch(e){ return m; }
    }
    return ENT[g]!==undefined ? ENT[g] : m;
  });
}
function attrOf(tag,name){
  var re=new RegExp('\\s'+name+'\\s*=\\s*"([^"]*)"');
  var m=re.exec(tag);
  return m ? dec(m[1]) : null;
}
function colToIdx(letters){
  var n=0;
  for(var i=0;i<letters.length;i++) n = n*26 + (letters.charCodeAt(i)-64);
  return n-1;
}

/* ---------------- sharedStrings / styles ---------------- */
function parseShared(xml){
  var out=[];
  if(!xml) return out;
  var pos=0;
  for(;;){
    var s=xml.indexOf('<si',pos); if(s<0) break;
    var gt=xml.indexOf('>',s); if(gt<0) break;
    if(xml.charCodeAt(gt-1)===47){ out.push(''); pos=gt+1; continue; }
    var e=xml.indexOf('</si>',gt); if(e<0){ break; }
    var block=xml.slice(gt+1,e);
    var txt='', tp=0;
    for(;;){
      var ts=block.indexOf('<t',tp); if(ts<0) break;
      var tg=block.indexOf('>',ts); if(tg<0) break;
      if(block.charCodeAt(tg-1)===47){ tp=tg+1; continue; }
      var te=block.indexOf('</t>',tg); if(te<0) break;
      txt += block.slice(tg+1,te);
      tp=te+4;
    }
    out.push(dec(txt));
    pos=e+5;
  }
  return out;
}
var BUILTIN_DATE={};
(function(){ var ids=[14,15,16,17,18,19,20,21,22,27,28,29,30,31,32,33,34,35,36,45,46,47,50,51,52,53,54,55,56,57,58];
  for(var i=0;i<ids.length;i++) BUILTIN_DATE[ids[i]]=true; })();
function looksLikeDateFormat(code){
  if(!code) return false;
  var c=code.replace(/\[[^\]]*\]/g,'').replace(/"[^"]*"/g,'').replace(/\\./g,'');
  if(/^(general)?$/i.test(c.trim())) return false;
  return /[ymdhs]/i.test(c) && !/^[#0?.,%eE+\-\s]+$/.test(c);
}
function parseStyles(xml){
  var dateXf=[];
  if(!xml) return dateXf;
  var custom={};
  var re=/<numFmt[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"[^>]*\/?>/g, m;
  while((m=re.exec(xml))) custom[parseInt(m[1],10)] = dec(m[2]);
  var cs=xml.indexOf('<cellXfs');
  if(cs<0) return dateXf;
  var ce=xml.indexOf('</cellXfs>',cs);
  var block=xml.slice(cs, ce<0?xml.length:ce);
  var rx=/<xf\b[^>]*>/g, x;
  while((x=rx.exec(block))){
    var id=attrOf(x[0],'numFmtId');
    var nid=id===null?0:parseInt(id,10);
    dateXf.push(!!BUILTIN_DATE[nid] || looksLikeDateFormat(custom[nid]));
  }
  return dateXf;
}

/* ---------------- datas ---------------- */
function serialToDate(v, date1904){
  if(!isFinite(v)) return null;
  var base = date1904 ? Date.UTC(1904,0,1) : Date.UTC(1899,11,30);
  var d = v;
  if(!date1904 && d >= 60) { /* bug do ano 1900 ja compensado pela base */ }
  var ms = base + Math.round(d*86400000);
  var u = new Date(ms);
  if(isNaN(u.getTime())) return null;
  if(u.getUTCFullYear()<1900 || u.getUTCFullYear()>2200) return null;
  /* mantem a hora "de parede" da planilha no fuso local, evitando deslocamento de dia */
  var dt = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
  return isNaN(dt.getTime()) ? null : dt;
}

/* ---------------- planilha ---------------- */
function parseSheet(xml, shared, dateXf, date1904, maxRows){
  var rows=[], maxCol=0;
  if(!xml) return {rows:rows,maxCol:0};
  var sd=xml.indexOf('<sheetData');
  var body, sdEnd;
  if(sd>=0){
    var gt=xml.indexOf('>',sd);
    if(xml.charCodeAt(gt-1)===47) return {rows:rows,maxCol:0};
    sdEnd=xml.indexOf('</sheetData>',gt);
    body=xml.slice(gt+1, sdEnd<0?xml.length:sdEnd);
  } else body=xml;

  var pos=0, autoRow=0;
  for(;;){
    var rs=body.indexOf('<row',pos); if(rs<0) break;
    var rgt=body.indexOf('>',rs); if(rgt<0) break;
    var rtag=body.slice(rs,rgt+1);
    var selfR = body.charCodeAt(rgt-1)===47;
    var rattr=attrOf(rtag,'r');
    var rIdx = rattr ? (parseInt(rattr,10)-1) : autoRow;
    autoRow = rIdx+1;
    var rowXml='';
    if(selfR){ pos=rgt+1; }
    else{
      var re2=body.indexOf('</row>',rgt);
      if(re2<0){ rowXml=body.slice(rgt+1); pos=body.length; }
      else { rowXml=body.slice(rgt+1,re2); pos=re2+6; }
    }
    if(maxRows && rIdx>=maxRows) break;
    if(!rowXml){ continue; }
    var row=[], cpos=0, autoCol=0;
    for(;;){
      var cs2=rowXml.indexOf('<c',cpos); if(cs2<0) break;
      var ch=rowXml.charCodeAt(cs2+2);
      if(!(ch===32||ch===62||ch===47)){ cpos=cs2+2; continue; }
      var cgt=rowXml.indexOf('>',cs2); if(cgt<0) break;
      var ctag=rowXml.slice(cs2,cgt+1);
      var selfC = rowXml.charCodeAt(cgt-1)===47;
      var inner='';
      if(selfC){ cpos=cgt+1; }
      else{
        var ce2=rowXml.indexOf('</c>',cgt);
        if(ce2<0){ inner=rowXml.slice(cgt+1); cpos=rowXml.length; }
        else{ inner=rowXml.slice(cgt+1,ce2); cpos=ce2+4; }
      }
      var cref=attrOf(ctag,'r'), cIdx;
      if(cref){ var mm=/^([A-Z]+)/.exec(cref); cIdx = mm ? colToIdx(mm[1]) : autoCol; }
      else cIdx=autoCol;
      autoCol=cIdx+1;
      if(!inner){ continue; }
      var t=attrOf(ctag,'t') || 'n';
      var sAttr=attrOf(ctag,'s');
      var val=null;
      if(t==='inlineStr'){
        var txt='', ip=0;
        for(;;){
          var ts=inner.indexOf('<t',ip); if(ts<0) break;
          var tg=inner.indexOf('>',ts); if(tg<0) break;
          if(inner.charCodeAt(tg-1)===47){ ip=tg+1; continue; }
          var te=inner.indexOf('</t>',tg); if(te<0) break;
          txt+=inner.slice(tg+1,te); ip=te+4;
        }
        val=dec(txt);
      } else {
        var vs=inner.indexOf('<v');
        if(vs<0){ continue; }
        var vg=inner.indexOf('>',vs);
        if(inner.charCodeAt(vg-1)===47){ continue; }
        var ve=inner.indexOf('</v>',vg);
        var raw=inner.slice(vg+1, ve<0?inner.length:ve);
        if(t==='s'){ var si=parseInt(raw,10); val = shared[si]!==undefined ? shared[si] : ''; }
        else if(t==='b'){ val = raw==='1'; }
        else if(t==='e'){ val = null; }
        else if(t==='str'){ val = dec(raw); }
        else if(t==='d'){ var dd=new Date(dec(raw)); val = isNaN(dd.getTime())?dec(raw):dd; }
        else {
          var num=parseFloat(raw);
          if(isNaN(num)) val=dec(raw);
          else{
            var xi = sAttr===null?-1:parseInt(sAttr,10);
            if(xi>=0 && dateXf[xi]){ var dt=serialToDate(num,date1904); val = dt || num; }
            else val=num;
          }
        }
      }
      if(val!==null && val!==undefined && val!==''){
        row[cIdx]=val;
        if(cIdx+1>maxCol) maxCol=cIdx+1;
      }
    }
    if(row.length) rows[rIdx]=row;
  }
  var dense=[];
  for(var i=0;i<rows.length;i++) dense.push(rows[i]||[]);
  return {rows:dense, maxCol:maxCol};
}

/* ---------------- workbook ---------------- */
function parseWorkbookBuffer(buf, onProgress, maxRows){
  onProgress = onProgress || function(){};
  var zip;
  try{ zip=readZip(buf); }catch(e){ return Promise.reject(e); }
  var out={sheets:[], warnings:[]};
  return zipRead(zip,'xl/workbook.xml').then(function(wbBytes){
    if(!wbBytes) throw new Error('Estrutura invalida: xl/workbook.xml ausente (arquivo Excel corrompido?)');
    var wbXml=utf8(wbBytes);
    out.date1904 = /date1904\s*=\s*"(1|true)"/i.test(wbXml);
    return zipRead(zip,'xl/_rels/workbook.xml.rels').then(function(rb){
      var rels={};
      if(rb){
        var rx=/<Relationship\b[^>]*>/g, m;
        var rXml=utf8(rb);
        while((m=rx.exec(rXml))){
          var id=attrOf(m[0],'Id'), tgt=attrOf(m[0],'Target');
          if(id && tgt) rels[id]=tgt;
        }
      }
      var sheets=[];
      var sx=/<sheet\b[^>]*>/g, sm;
      while((sm=sx.exec(wbXml))){
        var nm=attrOf(sm[0],'name');
        var rid=attrOf(sm[0],'r:id') || attrOf(sm[0],'id');
        var state=attrOf(sm[0],'state');
        var tgt2 = rid && rels[rid] ? rels[rid] : null;
        var path;
        if(tgt2){
          path = tgt2.charAt(0)==='/' ? tgt2.slice(1) : (tgt2.indexOf('xl/')===0 ? tgt2 : 'xl/'+tgt2.replace(/^\.\//,''));
        }
        sheets.push({name:nm||('Planilha'+(sheets.length+1)), path:path, hidden: state==='hidden'||state==='veryHidden'});
      }
      if(!sheets.length){
        var k, idx=1;
        for(k in zip.entries) if(/^xl\/worksheets\/sheet\d+\.xml$/.test(k)) sheets.push({name:'Planilha'+(idx++),path:k,hidden:false});
      }
      return Promise.all([
        zipHas(zip,'xl/sharedStrings.xml') ? zipRead(zip,'xl/sharedStrings.xml') : Promise.resolve(null),
        zipHas(zip,'xl/styles.xml') ? zipRead(zip,'xl/styles.xml') : Promise.resolve(null)
      ]).then(function(res){
        onProgress({phase:'strings',pct:12});
        var shared=parseShared(res[0]?utf8(res[0]):null);
        var dateXf=parseStyles(res[1]?utf8(res[1]):null);
        var chain=Promise.resolve();
        sheets.forEach(function(sh,i){
          chain=chain.then(function(){
            if(!sh.path || !zipHas(zip,sh.path)){
              out.warnings.push('Planilha "'+sh.name+'" nao pode ser lida (conteudo ausente).');
              out.sheets.push({name:sh.name,rows:[],maxCol:0,hidden:sh.hidden});
              return;
            }
            onProgress({phase:'sheet',pct:15+Math.round((i/sheets.length)*80),sheet:sh.name});
            return zipRead(zip,sh.path).then(function(bytes){
              var r=parseSheet(utf8(bytes), shared, dateXf, out.date1904, maxRows);
              out.sheets.push({name:sh.name,rows:r.rows,maxCol:r.maxCol,hidden:sh.hidden});
            }).catch(function(err){
              out.warnings.push('Falha ao ler a planilha "'+sh.name+'": '+err.message);
              out.sheets.push({name:sh.name,rows:[],maxCol:0,hidden:sh.hidden});
            });
          });
        });
        return chain.then(function(){ onProgress({phase:'done',pct:100}); return out; });
      });
    });
  });
}

var API={ parseWorkbookBuffer:parseWorkbookBuffer, sha256Hex:sha256Hex, inflateRaw:inflateRaw, readZip:readZip, zipRead:zipRead };

var isWorker = (typeof WorkerGlobalScope!=='undefined' && typeof self!=='undefined' && self instanceof WorkerGlobalScope)
            || (typeof importScripts==='function' && typeof window==='undefined');
if(isWorker){
  self.onmessage=function(ev){
    var msg=ev.data||{};
    if(msg.cmd==='ping'){ self.postMessage({type:'pong'}); return; }
    if(msg.cmd==='parse'){
      var id=msg.id;
      var filePromise = msg.file ? msg.file.arrayBuffer() : Promise.resolve(msg.buffer);
      filePromise.then(function(buf){
        var bytes=new Uint8Array(buf);
        return sha256Hex(bytes).then(function(hash){
          self.postMessage({type:'progress',id:id,phase:'hash',pct:8});
          if(msg.skipHashes && msg.skipHashes.indexOf(hash)>=0){
            self.postMessage({type:'skipped',id:id,hash:hash,bytes:bytes.length});
            return null;
          }
          return parseWorkbookBuffer(buf,function(p){
            self.postMessage({type:'progress',id:id,phase:p.phase,pct:p.pct,sheet:p.sheet});
          }, msg.maxRows).then(function(res){
            res.hash=hash; res.bytes=bytes.length;
            self.postMessage({type:'done',id:id,result:res});
          });
        });
      }).catch(function(err){
        self.postMessage({type:'error',id:id,message:(err&&err.message)||String(err)});
      });
      return;
    }
  };
} else if(typeof window!=='undefined'){
  window.__XLSX_ENGINE__=API;
}
})();

(function (global) {
  'use strict';

  function lerBuffer(buf) {
    var eng = global.__XLSX_ENGINE__;
    if (!eng) return Promise.reject(new Error('Leitor de Excel indisponível neste navegador.'));
    return eng.parseWorkbookBuffer(buf);
  }

  /** Lê um File/Blob .xlsx. */
  function ler(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(fr.error || new Error('Não foi possível ler o arquivo.')); };
      fr.onload = function () { resolve(fr.result); };
      fr.readAsArrayBuffer(file);
    }).then(lerBuffer);
  }

  global.XlsxLer = { ler: ler, lerBuffer: lerBuffer };
})(window);
