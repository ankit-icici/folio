// Nivesh personal relay — deploy on YOUR OWN Google account.
// 1. Go to script.google.com/create and paste this whole file.
// 2. Replace REPLACE_WITH_A_LONG_RANDOM_KEY below with your own secret
//    (e.g. run `openssl rand -hex 16`, or mash the keyboard — 20+ chars).
// 3. Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
//    → Deploy → Authorize when Google asks.
// 4. Copy the /exec URL. In the Nivesh app, enter that URL and your key.
//
// Your portfolio is stored as nivesh-data.json in your own Google Drive.
// The key is the only thing protecting it — treat it like a password.

const KEY = 'REPLACE_WITH_A_LONG_RANDOM_KEY';
const FILE_NAME = 'nivesh-data.json';

function json_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}

function dataFile_(){var it=DriveApp.getFilesByName(FILE_NAME);return it.hasNext()?it.next():null;}

function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.k!==KEY) return json_({error:'unauthorized'});
  if(p.action==='quotes'){
    var syms=String(p.symbols||'').split(',').filter(function(s){return s;}).slice(0,60);
    var reqs=syms.map(function(s){return {url:'https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s)+'.NS?interval=1d&range=5d',muteHttpExceptions:true,headers:{'User-Agent':'Mozilla/5.0'}};});
    var out={};
    try{
      var rs=UrlFetchApp.fetchAll(reqs);
      rs.forEach(function(r,i){
        try{
          var j=JSON.parse(r.getContentText());
          var cl=(j.chart.result[0].indicators.quote[0].close||[]).filter(function(c){return c!=null;});
          if(cl.length>=2) out[syms[i]]={p:Math.round(cl[cl.length-1]*100)/100,pc:Math.round(cl[cl.length-2]*100)/100};
        }catch(err){}
      });
    }catch(err){return json_({error:String(err)});}
    return json_({quotes:out,t:new Date().toISOString()});
  }
  if(p.action==='load'){
    var f=dataFile_();
    return json_({data:f?JSON.parse(f.getBlob().getDataAsString()):null,t:new Date().toISOString()});
  }
  return json_({ok:true});
}

function doPost(e){
  var p=(e&&e.parameter)||{};
  if(p.k!==KEY) return json_({error:'unauthorized'});
  try{
    var body=JSON.parse(e.postData.contents);
    if(body.action==='save'){
      var f=dataFile_();
      var s=JSON.stringify(body.data);
      if(f){f.setContent(s);}else{DriveApp.createFile(FILE_NAME,s,'application/json');}
      return json_({saved:true,t:new Date().toISOString()});
    }
  }catch(err){return json_({error:String(err)});}
  return json_({error:'unknown'});
}
