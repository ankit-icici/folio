// Nivesh multi-user backend — deploy on YOUR OWN Google account to host your
// own instance of the app.
// 1. Go to script.google.com/create and paste this whole file.
// 2. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
//    → Deploy → Authorize when Google asks.
// 3. Put the /exec URL into the BACKEND constant in index.html and host the app.
//
// Every user of your instance creates a username + PIN in the app; each account's
// portfolio is stored as its own JSON file in YOUR Google Drive. Wrong-PIN
// attempts are rate-limited; quotes are cached 45 s so users share fetch quota.

var FILE_PREFIX='nivesh-acc-';

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
function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.action==='ping') return json_({ok:true,v:2});
  var a=auth_(p);
  if(a.err) return json_({error:a.err});
  if(p.action==='login') return json_({ok:true,u:a.u});
  if(p.action==='load'){
    var ff=fileFor_(a.h);
    return json_({data:ff.f?JSON.parse(ff.f.getBlob().getDataAsString()):null,t:new Date().toISOString()});
  }
  if(p.action==='quotes'){
    var syms=String(p.symbols||'').split(',').filter(function(s){return s;}).slice(0,60);
    var out={},missing=[],c=cache_();
    syms.forEach(function(s){var v=c.get('q:'+s);if(v){out[s]=JSON.parse(v);}else{missing.push(s);}});
    if(missing.length){
      var reqs=missing.map(function(s){return {url:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s)+'.NS?interval=1d&range=5d',muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}};});
      try{
        var rs=UrlFetchApp.fetchAll(reqs);
        rs.forEach(function(r,i){
          try{
            var j=JSON.parse(r.getContentText());
            var cl=(j.chart.result[0].indicators.quote[0].close||[]).filter(function(x){return x!=null;});
            if(cl.length>=2){var q={p:Math.round(cl[cl.length-1]*100)/100,pc:Math.round(cl[cl.length-2]*100)/100};out[missing[i]]=q;c.put('q:'+missing[i],JSON.stringify(q),45);}
          }catch(err){}
        });
      }catch(err){}
    }
    return json_({quotes:out,t:new Date().toISOString()});
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
    var s=JSON.stringify(body.data);
    if(ff.f){ff.f.setContent(s);}else{DriveApp.createFile(ff.name,s,'application/json');}
    return json_({saved:true,t:new Date().toISOString()});
  }
  if(body.action==='unregister'){
    var ff2=fileFor_(a.h);
    if(ff2.f) ff2.f.setTrashed(true);
    props_().deleteProperty('u:'+a.u);
    return json_({deleted:true});
  }
  return json_({error:'unknown'});
}
