/* ------------------------------------------------------------------------
   Synced with the deployed script (Version 13, ping v:13) on 2026-09-10.
   The Apps Script editor remains the source of truth - re-read it before
   changing anything; see CLAUDE.md > Relay for the project id and deploy steps.
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

function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.action==='ping') return json_({ok:true,v:13});
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
  if(p.action==='login') return json_({ok:true,u:a.u,guest:!!a.guest});
  if(p.action==='load'){
    var ff=fileFor_(a.h);
    var d=ff.f?JSON.parse(ff.f.getBlob().getDataAsString()):null;
    if(a.guest&&d) delete d.esops;             // the advisor view never carries esops
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
    var inTx=Object.keys(inc.txns||{}).length, inSt=Object.keys(inc.stocks||{}).length;
    if(ff.f&&body.force!==true){
      try{
        var old=JSON.parse(ff.f.getBlob().getDataAsString());
        var oldTx=Object.keys(old.txns||{}).length, oldSt=Object.keys(old.stocks||{}).length;
        if((oldSt>0&&inSt===0)||(oldTx>=20&&inTx<oldTx*0.5))
          return json_({error:'suspicious_save',oldTx:oldTx,inTx:inTx,oldSt:oldSt,inSt:inSt});
      }catch(e2){}
    }
    var s=JSON.stringify(inc);
    if(ff.f){snapshot_(a.h,ff.f);ff.f.setContent(s);}
    else{DriveApp.createFile(ff.name,s,'application/json');}
    return json_({saved:true,t:new Date().toISOString()});
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
