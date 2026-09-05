// Folio multi-user backend (v4) — deploy on YOUR OWN Google account to host
// your own instance (script.google.com → paste → Deploy → Web app →
// Execute as: Me → Who has access: Anyone → Authorize).
//
// Durability: every save of an existing account first snapshots the previous
// state into a "Folio Backups" Drive folder (daily, kept 60 days) plus one permanent monthly archive that is never deleted, and a
// save that would wipe most of an account's data is rejected unless the client
// passes force:true (used only by the in-app Restore flow).

var FILE_PREFIX='nivesh-acc-';
var BK_FOLDER='Folio Backups';

function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function sha_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s,Utilities.Charset.UTF_8).map(function(b){b=(b+256)%256;return (b<16?'0':'')+b.toString(16);}).join('');}
function props_(){return PropertiesService.getScriptProperties();}
function cache_(){return CacheService.getScriptCache();}
function locked_(){return Number(cache_().get('fails')||0)>30;}
function fail_(){var c=cache_();c.put('fails',String(Number(c.get('fails')||0)+1),600);}
function normU_(u){u=String(u||'').trim().toLowerCase();return /^[a-z0-9_-]{3,20}$/.test(u)?u:null;}
function auth_(p){
  if(locked_()) return {err:'locked'};
  var u=normU_(p.u), pin=String(p.p||'');
  if(!u||pin.length<4) return {err:'unauthorized'};
  var rec=props_().getProperty('u:'+u);
  var h=sha_(u+':'+pin);
  if(!rec||rec!==h){fail_();return {err:'unauthorized'};}
  return {u:u,h:h};
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
    var mname='keep-'+h.slice(0,8)+'-'+mon+'.json';   // permanent monthly archive
    if(!fo.getFilesByName(mname).hasNext()){
      if(body===null) body=f.getBlob().getDataAsString();
      fo.createFile(mname,body,'application/json');
    }
    var cutoff=new Date(Date.now()-60*86400000);       // prune dailies only
    var it=fo.getFiles();
    while(it.hasNext()){var g=it.next();var n=g.getName();
      if(n.indexOf('snap-'+h.slice(0,8)+'-')===0){var d=new Date(n.slice(-15,-5));if(!isNaN(d)&&d<cutoff)g.setTrashed(true);}}
  }catch(e){}
}

function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.action==='ping') return json_({ok:true,v:4});
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
  if(p.action==='login') return json_({ok:true,u:a.u});
  if(p.action==='load'){
    var ff=fileFor_(a.h);
    return json_({data:ff.f?JSON.parse(ff.f.getBlob().getDataAsString()):null,t:new Date().toISOString()});
  }
  if(p.action==='snapshots'){
    var fo=bkFolder_(),it=fo.getFiles(),out=[];
    while(it.hasNext()){var g=it.next();var n=g.getName();if(n.indexOf('snap-'+a.h.slice(0,8)+'-')===0||n.indexOf('keep-'+a.h.slice(0,8)+'-')===0)out.push(n);}
    return json_({snapshots:out.sort()});
  }
  if(p.action==='snapshot'){
    var key=String(p.day||''); var pre=(key.length===7?'keep-':'snap-');
    var nm=pre+a.h.slice(0,8)+'-'+key+'.json';
    var it2=bkFolder_().getFilesByName(nm);
    return it2.hasNext()?json_({data:JSON.parse(it2.next().getBlob().getDataAsString())}):json_({error:'no_snapshot'});
  }
  if(p.action==='quotes'){
    var syms=String(p.symbols||'').split(',').filter(function(s){return s;}).slice(0,60);
    var out2={},missing=[],c=cache_();
    syms.forEach(function(s){var v=c.get('q:'+s);if(v){out2[s]=JSON.parse(v);}else{missing.push(s);}});
    if(missing.length){
      var reqs=missing.map(function(s){return {url:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s)+'.NS?interval=1d&range=5d',muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}};});
      try{
        var rs=UrlFetchApp.fetchAll(reqs);
        rs.forEach(function(r,i){
          try{
            var j=JSON.parse(r.getContentText());
            var cl=(j.chart.result[0].indicators.quote[0].close||[]).filter(function(x){return x!=null;});
            if(cl.length>=2){var q={p:Math.round(cl[cl.length-1]*100)/100,pc:Math.round(cl[cl.length-2]*100)/100};out2[missing[i]]=q;c.put('q:'+missing[i],JSON.stringify(q),45);}
          }catch(err){}
        });
      }catch(err){}
    }
    return json_({quotes:out2,t:new Date().toISOString()});
  }
  return json_({ok:true});
}
function doPost(e){
  var p=(e&&e.parameter)||{};
  var body={};
  try{body=JSON.parse(e.postData.contents);}catch(err){return json_({error:'bad_json'});}
  if(body.action==='register'){
    if(locked_()) return json_({error:'locked'});
    var u=normU_(p.u), pin=String(p.p||'');
    if(!u) return json_({error:'bad_username'});
    if(pin.length<4) return json_({error:'pin_too_short'});
    if(props_().getProperty('u:'+u)) return json_({error:'username_taken'});
    props_().setProperty('u:'+u,sha_(u+':'+pin));
    return json_({ok:true,u:u});
  }
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
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
