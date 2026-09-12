/* ------------------------------------------------------------------------
   Mirror of the deployed Apps Script. The web app now serves this code
   (Apps Script deployment "Version 16"; its own `?action=ping` reports v:19 -
   the two counters are unrelated, do not try to make them match).
   The editor is the source of truth: re-read it before changing anything.
   ------------------------------------------------------------------------ */
var FILE_PREFIX='nivesh-acc-';
var BK_FOLDER='Folio Backups';

function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function sha_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){b=(b+256)%256;return (b<16?'0':'')+b.toString(16);}).join('');}
function props_(){return PropertiesService.getScriptProperties();}
function cache_(){return CacheService.getScriptCache();}
/* Brute-force guard, per account and per credential.
   A device still holding a PIN that no longer works retries forever (the app
   re-prices every 15s). The old single global counter let one such device lock
   every login out, owner included. Now: each distinct wrong credential counts
   ONCE towards the account's strike count, so a looping stale device costs one
   strike, while someone guessing many different PINs still trips the lock. */
function locked_(u){return Number(cache_().get('fu:'+u)||0)>20;}
function fail_(u,h){
  var c=cache_(), k='fh:'+String(h).slice(0,16);
  var n=Number(c.get(k)||0)+1;
  c.put(k,String(n),1800);
  if(n===1) c.put('fu:'+u,String(Number(c.get('fu:'+u)||0)+1),600);
}
function clearLock(){                      /* run from the editor to unlock at once */
  var c=cache_(); c.remove('fails');
  var ps=props_().getKeys?props_().getKeys():[];
  for(var i=0;i<ps.length;i++) if(ps[i].indexOf('u:')===0) c.remove('fu:'+ps[i].slice(2));
  return 'lock cleared';
}
function normU_(u){u=String(u||'').trim().toLowerCase();return /^[a-z0-9_-]{3,20}$/.test(u)?u:null;}
function auth_(p){
  var u=normU_(p.u), pin=String(p.p||'');
  if(!u||pin.length<4) return {err:'unauthorized'};
  if(locked_(u)) return {err:'locked'};
  var h=sha_(u+':'+pin);
  var rec=props_().getProperty('u:'+u);
  if(!rec){fail_(u,h);return {err:'unauthorized'};}
  if(h===rec) return {u:u,h:rec};
  var g=props_().getProperty('g:'+u);          // advisor key: opens the owner's file, read-only, no esops
  if(g&&h===g) return {u:u,h:rec,guest:true};
  fail_(u,h);return {err:'unauthorized'};
}
function fileFor_(h){
  var name=FILE_PREFIX+h.slice(0,16)+'.json';
  var it=DriveApp.getFilesByName(name);
  return {name:name,f:it.hasNext()?it.next():null};
}
function bkFolder_(){var it=DriveApp.getFoldersByName(BK_FOLDER);return it.hasNext()?it.next():DriveApp.createFolder(BK_FOLDER);}
function snapshot_(h,f){
  try{
    var now=new Date();
    var day=Utilities.formatDate(now,'UTC','yyyy-MM-dd');
    var mon=Utilities.formatDate(now,'UTC','yyyy-MM');
    var fo=bkFolder_();
    var body=null;
    var dname='snap-'+h.slice(0,8)+'-'+day+'.json';
    if(!fo.getFilesByName(dname).hasNext()){
      body=f.getBlob().getDataAsString();
      fo.createFile(dname,body,'application/json');
    }
    var mname='keep-'+h.slice(0,8)+'-'+mon+'.json';
    if(!fo.getFilesByName(mname).hasNext()){
      if(body===null) body=f.getBlob().getDataAsString();
      fo.createFile(mname,body,'application/json');
    }
    var cutoff=new Date(Date.now()-60*86400000);
    var it=fo.getFiles();
    while(it.hasNext()){var g=it.next();var n=g.getName();
      if(n.indexOf('snap-'+h.slice(0,8)+'-')===0){var d=new Date(n.slice(-15,-5));if(!isNaN(d)&&d<cutoff)g.setTrashed(true);}}
  }catch(e){}
}
function quotes_(csv){
  var syms=String(csv||'').split(',').filter(function(s){return s;}).slice(0,60);
  if(!syms.length) return null;
  var out={},missing=[],c=cache_();
  syms.forEach(function(s){var v=c.get('q:'+s);if(v){out[s]=JSON.parse(v);}else{missing.push(s);}});
  if(missing.length){
    var reqs=missing.map(function(s){return {url:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s)+(s.charAt(0)==='^'||s.indexOf('.')>0?'':'.NS')+'?interval=1d&range=5d',muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}};});
    try{
      var rs=UrlFetchApp.fetchAll(reqs);
      rs.forEach(function(r,i){
        try{
          var j=JSON.parse(r.getContentText());
          var cl=(j.chart.result[0].indicators.quote[0].close||[]).filter(function(x){return x!=null;});
          if(cl.length>=2){var q={p:Math.round(cl[cl.length-1]*100)/100,pc:Math.round(cl[cl.length-2]*100)/100,t:Date.now()};out[missing[i]]=q;c.put('q:'+missing[i],JSON.stringify(q),30);}
        }catch(err){}
      });
    }catch(err){}
  }
  return out;
}

/* Nothing may quietly vanish. Every section of the document is guarded, not just
   stocks/txns: a save that empties a section, or halves a big one, is refused unless
   the client explicitly forces it (only the in-app restore flows do). Learned the hard
   way - a login path that forgot to load `mf` could have written the funds away with
   the old stocks-only guard waving it through. */
function count_(o,a,b){ var c=o&&o[a]; if(b) c=c&&c[b]; return c?Object.keys(c).length:0; }
function shrunk_(old,inc){
  var S=[['stocks',['stocks']],['txns',['txns']],['mf.funds',['mf','funds']],
         ['mf.txs',['mf','txs']],['mf.sips',['mf','sips']],['mf.swps',['mf','swps']],
         ['esops.grants',['esops','grants']],['esops.lots',['esops','lots']]];
  for(var i=0;i<S.length;i++){
    var p=S[i][1], o=count_(old,p[0],p[1]), n=count_(inc,p[0],p[1]);
    if(o>0&&n===0) return {k:S[i][0],o:o,n:n};
    if(o>=20&&n<o*0.5) return {k:S[i][0],o:o,n:n};
  }
  if(old.history&&!inc.history) return {k:'history',o:1,n:0};
  return null;
}

/* ---- monthly off-Drive backup -------------------------------------------
   Everything else lives in one Google account: the live file, the daily
   snapshots and the monthly archive all sit in this Drive. One email a month
   with the JSON attached puts a copy outside that single point of failure.
   Run setupMonthlyBackup() once from the editor to install the trigger. */
/* Whose files the monthly backup includes. Kept OUT of the code: the repo copy of this
   file is public, and a username is half of a login. The real list lives in the script
   property `backup_users` (set once by setupMonthlyBackup, editable under Project
   Settings -> Script Properties). Leave this empty. */
var BACKUP_USERS = '';

function whoIsBackedUp(){            /* read-only check: who the monthly email covers */
  var who = props_().getProperty('backup_users') || '(nothing configured)';
  Logger.log('backup_users = ' + who);
  return who;
}
function monthlyBackup(){
  var names = String(props_().getProperty('backup_users')||BACKUP_USERS)
                .split(',').map(function(s){return s.trim();}).filter(String);
  var to = Session.getEffectiveUser().getEmail();
  var stamp = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd');
  var atts = [], lines = [];
  for (var i=0;i<names.length;i++){
    var h = props_().getProperty('u:'+names[i]);
    if (!h) { lines.push(names[i]+': no such account'); continue; }
    var ff = fileFor_(h);
    if (!ff.f) { lines.push(names[i]+': no data file yet'); continue; }
    var txt = ff.f.getBlob().getDataAsString(), d = {};
    try { d = JSON.parse(txt); } catch(e){}
    atts.push(Utilities.newBlob(txt, 'application/json', 'Folio-backup-'+names[i]+'-'+stamp+'.json'));
    lines.push(names[i]+': '+count_(d,'stocks')+' stocks, '+count_(d,'txns')+' transactions, '+
               count_(d,'mf','funds')+' funds, '+count_(d,'mf','txs')+' fund transactions, '+
               count_(d,'esops','grants')+' ESOP grants. Last saved '+(d.savedAt||'unknown')+'.');
  }
  if (!atts.length) {                 /* fail loudly: silence must never look like success */
    MailApp.sendEmail({to: to,
      subject: 'Folio backup DID NOT RUN - needs one setting',
      body: 'The monthly Folio backup ran but had nothing to send, so no copy of your\n'+
            'portfolio was made this month.\n\nFix: open the Apps Script project, Project\n'+
            'Settings -> Script Properties, and set `backup_users` to your Folio username\n'+
            '(then run setupMonthlyBackup once). Until then this warning repeats monthly.'});
    return 'nothing to back up - owner warned';
  }
  MailApp.sendEmail({
    to: to,
    subject: 'Folio backup - '+Utilities.formatDate(new Date(),'Asia/Kolkata','MMMM yyyy'),
    body: 'Your monthly Folio backup is attached as JSON.\n\n'+lines.join('\n')+
          '\n\nWhy this email exists: the live file, the daily snapshots and the monthly archive all\n'+
          'sit in this one Google account. This attachment is the copy that survives losing it.\n'+
          'Keep it (or forward it somewhere else) - deleting the email deletes that protection.\n\n'+
          'To restore: open Folio, tap the gear, choose "Use a saved copy", and paste the\n'+
          'contents of the attached file.',
    attachments: atts
  });
  return 'sent to '+to;
}

function setupMonthlyBackup(){
  var t = ScriptApp.getProjectTriggers();
  for (var i=0;i<t.length;i++)
    if (t[i].getHandlerFunction()==='monthlyBackup') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('monthlyBackup').timeBased()
    .onMonthDay(1).atHour(7).inTimezone('Asia/Kolkata').create();
  if (!props_().getProperty('backup_users')) props_().setProperty('backup_users', BACKUP_USERS);
  return 'trigger installed: 1st of every month, about 7am IST';
}

/* ---------- Sheet mirror (relay v19) -------------------------------------
   A Google Sheet that mirrors the document, and can be read back.

   Rules this code exists to keep:
   - It writes STORED fields only. qty/invested/avg/P&L are FIFO results and
     holding() in the client is their single source of truth; a second, subtly
     different copy of that maths in a spreadsheet is worse than no column.
   - Reading back MERGES onto the stored record, so a field this map does not
     know about survives the round trip instead of being quietly dropped.
   - It never writes the document itself. readSheet_ returns a candidate; the
     client previews it and saves it through the ordinary guarded save.
   ------------------------------------------------------------------------ */
var SH_PROP   = 'sheet:';            /* script property -> spreadsheet id, per user */
var SH_NAME   = 'Folio portfolio';   /* created once, then tracked by ID so a rename is safe */

/* Column spec: [field, header, type]
     s  text            n  number          d  date held as text
     bt flag stored as `true`             b1 flag stored as `1`
     x  export only - shown in the Sheet, never read back
   '#id' is the map key, not a field. */
var SH_TABS = [
  {t:'Stocks', kind:'map', at:['stocks'], c:[
    ['#id','id','s'],['name','Name','s'],['symbol','Symbol','s'],['pool','Pool (core/ipo)','s'],
    ['target','Target %','n'],['rating','Rating','s'],['closed','Closed','bt'],
    ['createdAt','Created','s'],
    ['price','Price (live)','x'],['prevClose','Prev close (live)','x']]},

  {t:'Transactions', kind:'map', at:['txns'], c:[
    ['#id','id','s'],['stockId','Stock id','s'],['side','Side (buy/sell)','s'],
    ['qty','Qty','n'],['price','Price','n'],['date','Date','d'],['seq','Seq','n'],
    ['noLot','No lot','bt'],['keep','Keep','b1']]},

  {t:'Funds', kind:'map', at:['mf','funds'], c:[
    ['#id','id','s'],['name','Name','s'],['code','Code','s'],['units','Units','n'],
    ['inv','Invested (cost of units held)','n'],['nav','NAV','n'],['navDate','NAV date','d'],
    ['prevNav','Prev NAV','n'],['who','Who (HUF blank=self)','s'],['priv','Private','b1']]},

  {t:'Fund Txns', kind:'map', at:['mf','txs'], c:[
    ['#id','id','s'],['fid','Fund id','s'],['kind','Kind (sip/swp/in/out)','s'],
    ['amt','Amount','n'],['date','Date','d']]},

  {t:'SIPs', kind:'map', at:['mf','sips'], c:[
    ['#id','id','s'],['fid','Fund id','s'],['amt','Amount','n'],['day','Day','n']]},

  {t:'SWPs', kind:'map', at:['mf','swps'], c:[
    ['#id','id','s'],['fid','Fund id','s'],['amt','Amount','n'],['day','Day','n'],
    ['to','Buys into (fund id)','s']]},

  {t:'ESOP Grants', kind:'map', at:['esops','grants'], c:[
    ['#id','id','s'],['year','Year','n'],['qty','Qty','n'],
    ['strike','Grant price','n'],['sold','Sold before app','n']]},

  {t:'ESOP Lots', kind:'map', at:['esops','lots'], c:[
    ['#id','id','s'],['gid','Grant id','s'],['qty','Qty','n'],['fmv','Exercise price','n'],
    ['date','Date','d'],['perq','Perquisite tax paid','n'],['cgr','CG rate %','n']]},

  {t:'Ledger', kind:'arr', at:['history','ledger'], c:[
    ['d','Date','d'],['s','Symbol','s'],['n','Name','s'],['b','Buy=1 Sell=0','n'],
    ['q','Qty','n'],['v','Value','n'],['a','Approx date','b1']]}
];

/* Scalars that live outside any row, and would be lost without a home. */
var SH_KV = [
  ['history','end','History ends','d'],
  ['history','sources','History sources','s'],
  ['esops','cmp','ESOP CMP override','n'],
  ['esops','taxPerq','Perquisite tax %','n'],
  ['esops','taxCg','Capital gains tax %','n'],
  ['esops.pool','qty','Pool qty override','n'],
  ['esops.pool','fmv','Pool exercise price override','n'],
  ['esops.pool','gpx','Pool grant price override','n'],
  ['esops.pool','perq','Pool perquisite paid override','n']
];

function shGet_(o,at){ var c=o; for(var i=0;i<at.length;i++){ c=c&&c[at[i]]; } return c; }
function shNum_(v){ if(v===''||v===null||v===undefined) return null;
  var n=Number(String(v).replace(/[, ₹]/g,'')); return isNaN(n)?null:n; }
/* Sheets turns an ISO date into a Date object and can render it back in the
   local order, so a round trip of '2026-08-17' must not depend on the cell. */
function shDate_(v){
  if(v instanceof Date) return Utilities.formatDate(v,'Asia/Kolkata','yyyy-MM-dd');
  var s=String(v||'').trim();
  var m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);   /* dd/mm/yyyy */
  if(m) return m[3]+'-'+('0'+m[2]).slice(-2)+'-'+('0'+m[1]).slice(-2);
  return s;
}
function shOut_(rec,col){
  var f=col[0], t=col[2], v=rec[f];
  if(t==='bt'||t==='b1') return v?1:'';
  if(v===null||v===undefined) return '';
  return v;
}

/* doc -> {tab: [[header...],[row...]]}. Pure: no SpreadsheetApp here. */
function docToTabs_(doc){
  var out={};
  for(var i=0;i<SH_TABS.length;i++){
    var T=SH_TABS[i], rows=[], head=[], j;
    for(j=0;j<T.c.length;j++) head.push(T.c[j][1]);
    rows.push(head);
    var src=shGet_(doc,T.at);
    if(T.kind==='map'&&src){
      var ids=Object.keys(src);
      for(j=0;j<ids.length;j++){
        var rec=src[ids[j]], r=[];
        for(var k=0;k<T.c.length;k++)
          r.push(T.c[k][0]==='#id'?ids[j]:shOut_(rec,T.c[k]));
        rows.push(r);
      }
    } else if(T.kind==='arr'&&src&&src.length){
      for(j=0;j<src.length;j++){
        var e=src[j], r2=[];
        for(var k2=0;k2<T.c.length;k2++) r2.push(shOut_(e,T.c[k2]));
        rows.push(r2);
      }
    }
    out[T.t]=rows;
  }
  var kv=[['Setting','Value']];
  for(var m=0;m<SH_KV.length;m++){
    var S=SH_KV[m], base=S[0].split('.'), v=shGet_(doc,base.concat([S[1]]));
    kv.push([S[2],(v===null||v===undefined)?'':v]);
  }
  out['Settings']=kv;
  return out;
}

/* {tab: rows} -> document, merged onto `base` so unmapped fields survive.
   Returns {doc, warn:[...]}. Pure. */
function tabsToDoc_(base,tabs,newId){
  newId=newId||function(){return Utilities.getUuid().replace(/-/g,'').slice(0,20);};
  var doc=JSON.parse(JSON.stringify(base||{})), warn=[];
  for(var i=0;i<SH_TABS.length;i++){
    var T=SH_TABS[i], rows=tabs[T.t];
    if(!rows){ warn.push('tab "'+T.t+'" missing - left unchanged'); continue; }
    var body=rows.slice(1);
    var oldMap=shGet_(doc,T.at)||{};
    if(T.kind==='map'){
      var next={}, seen={};
      for(var r=0;r<body.length;r++){
        var row=body[r];
        if(!row||row.join('').toString().trim()==='') continue;
        var id=String(row[0]||'').trim(), fresh=false;
        if(!id){ id=newId(); fresh=true; }
        if(seen[id]){ warn.push(T.t+' row '+(r+2)+': duplicate id '+id+' - ignored'); continue; }
        seen[id]=1;
        if(!oldMap[id]) fresh=true;
        var rec=oldMap[id]?JSON.parse(JSON.stringify(oldMap[id])):{};
        for(var c=1;c<T.c.length;c++){
          var col=T.c[c], f=col[0], t=col[2], cell=row[c];
          if(t==='x') continue;                        /* live/derived: never read back */
          if(t==='n'){ var n=shNum_(cell); if(n===null) delete rec[f]; else rec[f]=n; }
          else if(t==='d'){ var d=shDate_(cell); if(d) rec[f]=d; else delete rec[f]; }
          else if(t==='bt'){ if(shTruthy_(cell)) rec[f]=true; else delete rec[f]; }
          else if(t==='b1'){ if(shTruthy_(cell)) rec[f]=1; else delete rec[f]; }
          else { var s=String(cell===null||cell===undefined?'':cell).trim();
                 if(s) rec[f]=s; else delete rec[f]; }
        }
        /* A transaction typed into the Sheet is a hand-entered trade: without
           keep:1 a backdated one vanishes from Flows and CAGR while still
           driving P&L. Never stamp it on a row that was already imported. */
        if(T.t==='Transactions'&&fresh) rec.keep=1;
        next[id]=rec;
      }
      /* Do not conjure an empty section into a document that never had one:
         esops:{grants:{},lots:{}} is not the same shape as no esops at all. */
      if(Object.keys(next).length||shGet_(base,T.at)) shSet_(doc,T.at,next);
    } else {
      var arr=[];
      for(var r2=0;r2<body.length;r2++){
        var row2=body[r2];
        if(!row2||row2.join('').toString().trim()==='') continue;
        var e={};
        for(var c2=0;c2<T.c.length;c2++){
          var col2=T.c[c2], f2=col2[0], t2=col2[2], cell2=row2[c2];
          if(t2==='x') continue;
          if(t2==='n'){ var n2=shNum_(cell2); if(n2!==null) e[f2]=n2; }
          else if(t2==='d'){ var d2=shDate_(cell2); if(d2) e[f2]=d2; }
          else if(t2==='b1'){ if(shTruthy_(cell2)) e[f2]=1; }
          else { var s2=String(cell2===null||cell2===undefined?'':cell2).trim(); if(s2) e[f2]=s2; }
        }
        arr.push(e);
      }
      if(arr.length) shSet_(doc,T.at,arr);
    }
  }
  var kv=tabs['Settings'];
  if(kv){
    for(var m=0;m<SH_KV.length;m++){
      var S=SH_KV[m], want=S[2], val=null, found=false;
      for(var q=1;q<kv.length;q++) if(String(kv[q][0]).trim()===want){ val=kv[q][1]; found=true; break; }
      if(!found) continue;
      var path=S[0].split('.').concat([S[1]]);
      if(S[3]==='n'){ var nv=shNum_(val); if(nv===null) shDel_(doc,path); else shSet_(doc,path,nv); }
      else if(S[3]==='d'){ var dv=shDate_(val); if(dv) shSet_(doc,path,dv); else shDel_(doc,path); }
      else { var sv=String(val===null||val===undefined?'':val).trim();
             if(sv) shSet_(doc,path,sv); else shDel_(doc,path); }
    }
  }
  return {doc:doc,warn:warn};
}
function shTruthy_(v){
  if(v===true) return true;
  var s=String(v===null||v===undefined?'':v).trim().toLowerCase();
  return s==='1'||s==='true'||s==='yes'||s==='y';
}
function shSet_(o,at,v){
  var c=o;
  for(var i=0;i<at.length-1;i++){ if(!c[at[i]]||typeof c[at[i]]!=='object') c[at[i]]={}; c=c[at[i]]; }
  c[at[at.length-1]]=v;
}
function shDel_(o,at){
  var c=o;
  for(var i=0;i<at.length-1;i++){ c=c&&c[at[i]]; if(!c) return; }
  delete c[at[at.length-1]];
}

/* ---------- Sheet I/O -----------------------------------------------------
   A push REWRITES the Sheet, so one firing while the owner is typing in it
   would eat those edits. Pushes therefore skip unless the document itself
   changed since the last one: the Sheet is only ever overwritten because the
   app moved, never on a timer alone. -------------------------------------- */
function shFile_(u){
  var pk=SH_PROP+u, id=props_().getProperty(pk), ss=null;
  if(id){
    try{ if(!DriveApp.getFileById(id).isTrashed()) ss=SpreadsheetApp.openById(id); }
    catch(err){ ss=null; }                     /* deleted or unshared - make a new one */
  }
  if(!ss){
    ss=SpreadsheetApp.create(SH_NAME+' - '+u);
    props_().setProperty(pk,ss.getId());
    props_().deleteProperty('sheetHash:'+u);   /* a new Sheet must be filled, changed or not */
  }
  return ss;
}
function shWrite_(ss,name,rows,cols,formulas){
  var sh=ss.getSheetByName(name)||ss.insertSheet(name);
  sh.clear();
  var nc=rows[0].length+(formulas?formulas.length:0);
  if(sh.getMaxColumns()<nc) sh.insertColumnsAfter(sh.getMaxColumns(),nc-sh.getMaxColumns());
  if(sh.getMaxRows()<rows.length) sh.insertRowsAfter(sh.getMaxRows(),rows.length-sh.getMaxRows());
  /* ids, symbols and dates must be plain text or Sheets reformats them and the
     round trip stops being lossless - set this BEFORE any value is written */
  if(cols) for(var c=0;c<cols.length;c++)
    if(cols[c][2]!=='n') sh.getRange(1,c+1,sh.getMaxRows(),1).setNumberFormat('@');
  sh.getRange(1,1,rows.length,rows[0].length).setValues(rows);
  if(formulas&&rows.length>1){
    for(var f=0;f<formulas.length;f++){
      sh.getRange(1,rows[0].length+1+f).setValue(formulas[f][0]);
      var fx=[];
      for(var r=2;r<=rows.length;r++) fx.push([formulas[f][1].replace(/\{R\}/g,String(r))]);
      sh.getRange(2,rows[0].length+1+f,fx.length,1).setFormulas(fx);
    }
  }
  sh.getRange(1,1,1,nc).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1,Math.min(nc,12));
  return sh;
}
/* Qty is plain arithmetic over the transaction rows, so a formula is safe and
   self-evidently right. Invested / average / P&L are FIFO results and belong to
   holding() in the app - a second implementation here would be a second answer. */
var SH_QTY=['Qty (live formula)',
  '=IFERROR(SUMIFS(Transactions!$D:$D,Transactions!$B:$B,$A{R},Transactions!$C:$C,"buy",Transactions!$H:$H,"")'+
  '-SUMIFS(Transactions!$D:$D,Transactions!$B:$B,$A{R},Transactions!$C:$C,"sell",Transactions!$H:$H,""),"")'];

function shReadme_(ss){
  var t=[
   ['Folio portfolio — mirror of your app'],[''],
   ['This Sheet is written by the Folio app. You can edit it, then pull the changes'],
   ['back in the app: gear → Account → "Sync from Sheet". You will see exactly what'],
   ['would change before anything is saved.'],[''],
   ['DO NOT SHARE THIS SHEET.'],
   ['Your advisor PIN hides ESOPs and private funds inside the app. This Sheet has'],
   ['no such protection — everything is here. Sharing it hands over the lot.'],[''],
   ['Column A is the record id. Never edit or reorder it: it is what ties a'],
   ['transaction to its stock and an ESOP lot to its grant. Leave it blank on a new'],
   ['row and the app will fill one in.'],[''],
   ['Columns marked (live) or (formula) are ignored when you sync back — prices are'],
   ['refreshed from the market every 15 seconds and would only go stale here.'],[''],
   ['Deleting a row here deletes the record when you sync. If you remove a lot at'],
   ['once the app will refuse the sync to protect you; restore from gear → Account'],
   ['→ "Go back to an earlier version" instead.'],[''],
   ['The app overwrites this Sheet whenever your portfolio changes, so do not leave'],
   ['edits sitting here unsynced.']
  ];
  var sh=ss.getSheetByName('README')||ss.insertSheet('README',0);
  sh.clear();
  sh.getRange(1,1,t.length,1).setValues(t);
  sh.getRange(1,1).setFontWeight('bold');
  sh.getRange(7,1).setFontWeight('bold');
  sh.setColumnWidth(1,620);
  return sh;
}
function pushSheet_(u,doc,force){
  var hash=sha_(JSON.stringify(doc));
  if(!force&&hash===props_().getProperty('sheetHash:'+u))
    return {skipped:true,url:shUrl_(u)};
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(20000)) return {skipped:true,busy:true,url:shUrl_(u)};
  try{
    var ss=shFile_(u), tabs=docToTabs_(doc);
    shReadme_(ss);
    for(var i=0;i<SH_TABS.length;i++){
      var T=SH_TABS[i];
      shWrite_(ss,T.t,tabs[T.t],T.c,T.t==='Stocks'?[SH_QTY]:null);
    }
    shWrite_(ss,'Settings',tabs['Settings'],[['k','Setting','s'],['v','Value','s']],null);
    var d=ss.getSheetByName('Sheet1');
    if(d&&ss.getSheets().length>1) ss.deleteSheet(d);
    props_().setProperty('sheetHash:'+u,hash);
    props_().setProperty('sheetAt:'+u,new Date().toISOString());
    return {ok:true,url:ss.getUrl()};
  } finally { lock.releaseLock(); }
}
function shUrl_(u){
  var id=props_().getProperty(SH_PROP+u);
  return id?('https://docs.google.com/spreadsheets/d/'+id+'/edit'):'';
}
function readTabs_(ss){
  var out={}, names=[];
  for(var i=0;i<SH_TABS.length;i++) names.push(SH_TABS[i].t);
  names.push('Settings');
  for(var n=0;n<names.length;n++){
    var sh=ss.getSheetByName(names[n]);
    if(!sh) continue;
    var lr=sh.getLastRow(), lc=sh.getLastColumn();
    out[names[n]]=(lr<1||lc<1)?[[]]:sh.getRange(1,1,lr,lc).getValues();
  }
  return out;
}
function docOf_(h){
  var ff=fileFor_(h);
  var d=ff.f?JSON.parse(ff.f.getBlob().getDataAsString()):{};
  delete d.savedAt;                 /* the save stamps this; it is not part of the document */
  return d;
}
/* Trigger entry. Same `backup_users` property the monthly email uses, so there
   is one place to name the account and no username in this public file. */
function syncSheets(){
  var names=String(props_().getProperty('backup_users')||'')
              .split(',').map(function(s){return s.trim();}).filter(String);
  var log=[];
  for(var i=0;i<names.length;i++){
    var h=props_().getProperty('u:'+names[i]);
    if(!h){ log.push(names[i]+': no such account'); continue; }
    try{ var r=pushSheet_(names[i],docOf_(h));
         log.push(names[i]+': '+(r.skipped?'unchanged':'pushed')); }
    catch(err){ props_().setProperty('sheetErr:'+names[i],String(err));
                log.push(names[i]+': FAILED '+err); }
  }
  Logger.log(log.join('\n'));
  return log.join('\n');
}
function setupSheetSync(){
  var t=ScriptApp.getProjectTriggers();
  for(var i=0;i<t.length;i++)
    if(t[i].getHandlerFunction()==='syncSheets') ScriptApp.deleteTrigger(t[i]);
  ScriptApp.newTrigger('syncSheets').timeBased().everyMinutes(15).create();
  return 'sheet sync trigger installed: every 15 minutes';
}

function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.action==='ping') return json_({ok:true,v:19});
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
  if(p.action==='login') return json_({ok:true,u:a.u,guest:!!a.guest});
  if(p.action==='load'){
    var ff=fileFor_(a.h);
    var d=ff.f?JSON.parse(ff.f.getBlob().getDataAsString()):null;
    if(a.guest&&d){                            /* the advisor view carries neither esops nor private funds */
      delete d.esops;
      if(d.mf&&d.mf.funds){
        var pv={};
        for(var k in d.mf.funds) if(d.mf.funds[k].priv){ pv[k]=1; delete d.mf.funds[k]; }
        if(d.mf.sips) for(var k2 in d.mf.sips) if(pv[d.mf.sips[k2].fid]) delete d.mf.sips[k2];
        if(d.mf.swps) for(var k3 in d.mf.swps){ var w=d.mf.swps[k3];
          if(pv[w.fid]) delete d.mf.swps[k3]; else if(w.to&&pv[w.to]) delete w.to; }
        if(d.mf.txs) for(var k4 in d.mf.txs) if(pv[d.mf.txs[k4].fid]) delete d.mf.txs[k4];
      }
    }
    var res={data:d,t:new Date().toISOString()};
    if(a.guest) res.guest=true;
    if(p.symbols){ var q=quotes_(p.symbols); if(q) res.quotes=q; }
    return json_(res);
  }
  /* market look-ups are public data - the advisor keeps those; only the
     portfolio's own history and every write stay with the owner */
  if(p.action==='snapshots'){
    if(a.guest) return json_({error:'forbidden'});
    var fo=bkFolder_(),it=fo.getFiles(),out=[];
    while(it.hasNext()){var g=it.next();var n=g.getName();if(n.indexOf('snap-'+a.h.slice(0,8)+'-')===0||n.indexOf('keep-'+a.h.slice(0,8)+'-')===0)out.push(n);}
    return json_({snapshots:out.sort()});
  }
  if(p.action==='snapshot'){
    if(a.guest) return json_({error:'forbidden'});
    var key=String(p.day||''); var pre=(key.length===7?'keep-':'snap-');
    var nm=pre+a.h.slice(0,8)+'-'+key+'.json';
    var it2=bkFolder_().getFilesByName(nm);
    return it2.hasNext()?json_({data:JSON.parse(it2.next().getBlob().getDataAsString())}):json_({error:'no_snapshot'});
  }
  /* The Sheet mirror. Owner-only like snapshots: it carries ESOPs and private
     funds in full, which is exactly what a guest session is not allowed to see. */
  if(p.action==='sheetinfo'){
    if(a.guest) return json_({error:'forbidden'});
    return json_({url:shUrl_(a.u),t:props_().getProperty('sheetAt:'+a.u)||''});
  }
  if(p.action==='sheetdoc'){
    if(a.guest) return json_({error:'forbidden'});
    /* Never create a Sheet on a read. A blank one would read back as "every tab
       missing", and the only safe answer to that is to refuse, not to guess. */
    if(!props_().getProperty(SH_PROP+a.u)) return json_({error:'no_sheet'});
    var ssd=shFile_(a.u);
    var rd=tabsToDoc_(docOf_(a.h),readTabs_(ssd));
    return json_({doc:rd.doc,warn:rd.warn,url:ssd.getUrl()});
  }
  if(p.action==='search'){
    var q=String(p.q||'').trim();
    if(q.length<2) return json_({results:[]});
    var Q=q.toUpperCase().replace(/[^A-Z0-9]/g,'');
    var seen={},byRoot={},out=[];
    /* NSE stays bare; a BSE-only listing keeps its .BO so quotes can resolve it */
    function add(sym,nm){
      if(!sym) return;
      var suf=sym.slice(-3);
      if(suf!=='.NS'&&suf!=='.BO') return;
      var root=sym.slice(0,-3), nse=(suf==='.NS'), prev=byRoot[root];
      if(prev&&(prev.nse||!nse)) return;
      var N=String(nm||root).toUpperCase().replace(/[^A-Z0-9]/g,'');
      var sc=0;
      if(root.toUpperCase()===Q) sc+=100;
      if(root.toUpperCase().indexOf(Q)===0) sc+=50;
      if(N.indexOf(Q)===0) sc+=40; else if(N.indexOf(Q)>0) sc+=12;
      if(/ETF|BEES|IETF|AMC-|INDEXFUND/.test(N)) sc-=30;
      if(!nse) sc-=5;
      var rec={s:(nse?root:sym),n:String(nm||root),x:(nse?'':'BSE'),sc:sc,nse:nse};
      if(prev){ for(var i=0;i<out.length;i++) if(out[i]===prev){ out[i]=rec; break; } }
      else out.push(rec);
      byRoot[root]=rec;
    }
    try{
      var u='https://query2.finance.yahoo.com/v1/finance/lookup?query='+encodeURIComponent(q)+'&type=equity&count=30&formatted=false&lang=en-IN&region=IN';
      var j=JSON.parse(UrlFetchApp.fetch(u,{muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}}).getContentText());
      var docs=(((j.finance||{}).result||[{}])[0]||{}).documents||[];
      docs.forEach(function(x){ add(String(x.symbol||''), x.shortName||x.longName); });
    }catch(err){}
    if(out.length<3){
      try{
        var u2='https://query1.finance.yahoo.com/v1/finance/search?newsCount=0&quotesCount=25&enableFuzzyQuery=false&region=IN&lang=en-IN&q='+encodeURIComponent(q);
        var j2=JSON.parse(UrlFetchApp.fetch(u2,{muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}}).getContentText());
        (j2.quotes||[]).forEach(function(x){ if(x.quoteType==='EQUITY') add(String(x.symbol||''), x.shortname||x.longname); });
      }catch(err){}
    }
    out.sort(function(a,b){return b.sc-a.sc;});
    return json_({results:out.slice(0,12).map(function(x){return {s:x.s,n:x.n,x:x.x};})});
  }
  if(p.action==='quotes'){
    return json_({quotes:quotes_(p.symbols)||{},t:new Date().toISOString()});
  }
  return json_({ok:true});
}
function doPost(e){
  var p=(e&&e.parameter)||{};
  var body={};
  try{body=JSON.parse(e.postData.contents);}catch(err){return json_({error:'bad_json'});}
  if(body.action==='register'){
    var u=normU_(p.u), pin=String(p.p||'');
    if(!u) return json_({error:'bad_username'});
    if(locked_(u)) return json_({error:'locked'});
    if(pin.length<4) return json_({error:'pin_too_short'});
    if(props_().getProperty('u:'+u)) return json_({error:'username_taken'});
    props_().setProperty('u:'+u,sha_(u+':'+pin));
    return json_({ok:true,u:u});
  }
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
  if(a.guest) return json_({error:'forbidden'});  // every write is owner-only
  if(body.action==='setpin'){          /* owner changes their own PIN */
    var np=String(body.np||'');
    if(np.length<4) return json_({error:'pin_too_short'});
    var nh=sha_(a.u+':'+np);
    if(nh===props_().getProperty('u:'+a.u)) return json_({error:'same_pin'});
    if(nh===props_().getProperty('g:'+a.u)) return json_({error:'same_as_advisor'});
    /* the data file and every snapshot are NAMED from the hash of user+pin, so they
       must be renamed in step or the account wakes up empty with its history orphaned */
    var ffp=fileFor_(a.h);
    if(ffp.f) ffp.f.setName(FILE_PREFIX+nh.slice(0,16)+'.json');
    var moved=0;
    try{
      var fo=bkFolder_(), it=fo.getFiles(), op=a.h.slice(0,8), npfx=nh.slice(0,8);
      while(it.hasNext()){
        var g=it.next(), n=g.getName();
        if(n.indexOf('snap-'+op+'-')===0){ g.setName('snap-'+npfx+'-'+n.slice(6+op.length)); moved++; }
        else if(n.indexOf('keep-'+op+'-')===0){ g.setName('keep-'+npfx+'-'+n.slice(6+op.length)); moved++; }
      }
    }catch(e4){}
    props_().setProperty('u:'+a.u, nh);
    return json_({ok:true, snapshotsMoved:moved});
  }
  if(body.action==='setguest'){
    var gp=String(body.gp||'');
    if(!gp){ props_().deleteProperty('g:'+a.u); return json_({ok:true,guest:false}); }
    if(gp.length<4) return json_({error:'pin_too_short'});
    var gh=sha_(a.u+':'+gp);
    if(gh===props_().getProperty('u:'+a.u)) return json_({error:'same_as_owner'});
    props_().setProperty('g:'+a.u,gh);
    return json_({ok:true,guest:true});
  }
  if(body.action==='save'){
    var ff=fileFor_(a.h);
    var inc=body.data||{};
    if(ff.f&&body.force!==true){
      try{
        var old=JSON.parse(ff.f.getBlob().getDataAsString());
        var bad=shrunk_(old,inc);
        if(bad) return json_({error:'suspicious_save',section:bad.k,was:bad.o,now:bad.n});
      }catch(e2){}
    }
    var s=JSON.stringify(inc);
    if(ff.f){snapshot_(a.h,ff.f);ff.f.setContent(s);}
    else{DriveApp.createFile(ff.name,s,'application/json');}
    return json_({saved:true,t:new Date().toISOString()});
  }
  if(body.action==='sheetpush'){
    var rp=pushSheet_(a.u,docOf_(a.h),body.force===true);
    return json_({ok:true,url:rp.url,skipped:!!rp.skipped,busy:!!rp.busy,t:new Date().toISOString()});
  }
  if(body.action==='unregister'){
    var ff2=fileFor_(a.h);
    if(ff2.f) ff2.f.setTrashed(true);
    try{var fo=bkFolder_(),it=fo.getFiles();
      while(it.hasNext()){var g=it.next();var n2=g.getName();if(n2.indexOf('snap-'+a.h.slice(0,8)+'-')===0||n2.indexOf('keep-'+a.h.slice(0,8)+'-')===0)g.setTrashed(true);}}catch(e3){}
    props_().deleteProperty('u:'+a.u);
    return json_({deleted:true});
  }
  return json_({error:'unknown'});
}
