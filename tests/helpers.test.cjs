const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..')+'/';
function load(file,extra={}){const ctx=vm.createContext({console,Blob,URL,Map,Set,...extra});ctx.globalThis=ctx;vm.runInContext(fs.readFileSync(root+file,'utf8'),ctx);return ctx;}
const set=(weight,reps=8,extra={})=>({weight,reps,unit:'kg',verified:true,plus:false,...extra});
const rec=(id,date,sets,extra={})=>({id,date,name:'Bench',muscle:'Chest',createdAt:Number(id)||1,sets,...extra});
test('PR excludes unverified/plus, other muscles and other units',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const history=[rec('1','2026-11-01',[set(60),set(300,8,{verified:false}),set(200,8,{plus:true}),set(500,8,{unit:'lb'})]),rec('2','2026-11-02',[set(400)],{muscle:'Shoulders'})];
 assert.equal(m.evaluatePR(history,rec('3','2026-11-03',[]),set(65)).weightPR,true);
 assert.equal(m.evaluatePR(history,rec('3','2026-11-03',[]),set(65,8,{verified:false})).isPR,false);
 assert.equal(m.evaluatePR(history,rec('3','2026-11-03',[]),set(65,8,{plus:true})).isPR,false);
});
test('equal weight/reps is not another PR; higher reps at same weight is',()=>{
 const m=load('training-metrics.js').TrainingMetrics, r=rec('1','2026-11-01',[set(60),set(65)]);
 assert.equal(m.evaluatePR([r],rec('2','2026-11-02',[]),set(65)).isPR,false);
 assert.equal(m.evaluatePR([r],rec('2','2026-11-02',[]),set(65,9)).repsPR,true);
 assert.equal(m.evaluatePR([],r,set(60)).isPR,false);
});
test('historical badges belong to original chronological set, never equal later sets',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const a=rec('1','2026-11-01',[set(60)]), b=rec('2','2026-11-02',[set(65),set(65)]), c=rec('3','2026-11-03',[set(65),set(65,9)]);
 const rows=m.getPRs([c,b,a]);
 assert.deepEqual(Array.from(rows,x=>[x.recordId,x.setIndex]),[['2',0],['3',1]]);
 assert.equal(m.evaluatePR([c,b,a],b,0).isPR,true);
 assert.equal(m.evaluatePR([c,b,a],b,1).isPR,false);
 assert.equal(m.evaluatePR([c,b,a],c,c.sets[0]).isPR,false);
});
test('Epley rejects unconfirmed, plus, bodyweight, missing or out-of-range reps',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 assert.equal(m.epley(100,12),140);
 assert.equal(m.estimate1RM(set(100,6)),120);
 for(const s of [set(100,13),set(100,0),set(0,8),set(null,8),set(100,null),set(100,8,{verified:false}),set(100,8,{plus:true}),set(100,8,{unit:'片'}),set(100,1.5)])assert.equal(m.estimate1RM(s),null);
});
test('timestamp timer survives background time and pauses without drift',()=>{
 let now=100000, saved; const c=load('rest-timer.js',{Date:class extends Date{static now(){return now}},setInterval:()=>1,clearInterval:()=>{}}),t=c.RestTimer;
 t.configure({getPrefs:()=>({duration:90,sound:false}),savePrefs:p=>{saved=p}});
 t.start(); now+=30000; assert.equal(t.getState().remaining,60);
 t.pause(); now+=30000; assert.equal(t.getState().remaining,60);
 t.add(15); assert.equal(t.getState().remaining,75);
 t.resume();now+=10000;assert.equal(t.getState().remaining,65);
 t.setPrefs({duration:120});assert.equal(saved.duration,120);assert.equal(saved.sound,false);
 t.close();assert.equal(t.getState().active,false);
});
test('timer expiry fires once and closing suppresses later completion',()=>{
 let now=0,count=0; const t=load('rest-timer.js',{Date:class extends Date{static now(){return now}},setInterval:()=>1,clearInterval:()=>{}}).RestTimer;
 t.configure({onComplete:()=>count++});t.start(1);now=2000;
 assert.equal(t.getState().remaining,0);t.getState();assert.equal(count,1);
 t.start(1);t.close();now+=3000;t.getState();assert.equal(count,1);
});
test('photo compression rejects empty and unsupported input without opening UI',async()=>{
 const p=load('photo-tools.js').PhotoTools;
 await assert.rejects(p.compress(new Blob([],{type:'image/jpeg'})));
 await assert.rejects(p.compress(new Blob(['text'],{type:'text/plain'})));
});
function workerHarness(options={}){
 const events={},writes=[],responses=new Map(),deleted=[];
 const cache={match:async request=>responses.get(typeof request==='string'?request:request.url)?.clone(),put:async(request,response)=>{writes.push(typeof request==='string'?request:request.url);responses.set(typeof request==='string'?request:request.url,response)}};
 const self={registration:{scope:'https://motionlog.test/'},location:new URL('https://motionlog.test/sw.js'),clients:{claim:async()=>{}},addEventListener:(name,fn)=>events[name]=fn};
 load('sw.js',{self,Request,Response,fetch:options.fetch|| (async()=>new Response('ok',{headers:{'Content-Type':'text/javascript'}})),caches:{open:async()=>cache,keys:async()=>options.cacheNames||[],delete:async name=>{deleted.push(name);return true}}});
 return {events,writes,responses,cache,deleted};
}
test('worker never intercepts private backend, uploads, queries or authenticated asset requests',()=>{
 const h=workerHarness();
 for(const request of [new Request('https://private.supabase.co/rest/v1/personal_app_state'),new Request('https://private.supabase.co/storage/v1/object/photo'),new Request('https://motionlog.test/app.js?token=secret'),new Request('https://motionlog.test/app.js',{headers:{Authorization:'Bearer secret'}}),new Request('https://motionlog.test/app.js',{method:'POST',body:'private'}),new Request('https://cdn.jsdelivr.net/npm/unapproved@1')]){
 let intercepted=false;h.events.fetch({request,respondWith(){intercepted=true},waitUntil(){}});assert.equal(intercepted,false,request.url);
 }
});
test('worker serves cached shell offline and caches only approved SDK responses',async()=>{
 const h=workerHarness();const url='https://motionlog.test/app.js';h.responses.set(url,new Response('offline shell'));
 let pending;h.events.fetch({request:new Request(url),respondWith(p){pending=p},waitUntil(){}});
 assert.equal(await(await pending).text(),'offline shell');assert.equal(h.writes.length,0);
 const sdk='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
 h.events.fetch({request:new Request(sdk),respondWith(p){pending=p},waitUntil(){}});
 assert.equal(await(await pending).text(),'ok');assert.deepEqual(h.writes,[sdk]);
});
// Browser Canvas is the boundary; these tests verify our fallback and size policy,
// not image encoder fidelity (which requires a browser acceptance run).
function photoHarness({webp=true,large=false,failure=false}={}){
 const calls=[],dimensions=[];let released=false;
 const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){dimensions.push([canvas.width,canvas.height])}}),toBlob(callback,type,quality){calls.push({type,quality});callback(failure?null:new Blob([new Uint8Array(large?1600000:type==='image/webp'&&!webp?600000:400000)],{type:type==='image/webp'&&!webp?'image/png':type}));}};
 const PhotoTools=load('photo-tools.js',{document:{createElement:()=>canvas},createImageBitmap:async()=>({width:4000,height:3000,close(){released=true}})}).PhotoTools;
 return {PhotoTools,calls,dimensions,get released(){return released}};
}
test('compression bounds dimensions, starts at .82, and explicitly falls back from PNG to JPEG',async()=>{
 const h=photoHarness({webp:false});const blob=await h.PhotoTools.compress(new Blob(['image'],{type:'image/jpeg'}));
 assert.equal(blob.type,'image/jpeg');assert.equal(blob.size,400000);
 assert.deepEqual(h.dimensions,[[1600,1200]]);assert.deepEqual(h.calls,[{type:'image/webp',quality:.82},{type:'image/jpeg',quality:.82}]);assert.equal(h.released,true);
});
test('compression never returns a file over 1.5MB and releases the decoder on failure',async()=>{
 const h=photoHarness({large:true});await assert.rejects(h.PhotoTools.compress(new Blob(['image'],{type:'image/png'})),/1.5 MB/);
 assert.equal(h.released,true);assert.ok(h.calls.some(c=>c.quality<.82));assert.ok(h.dimensions.at(-1)[0]<1600);
 const failure=photoHarness({failure:true});await assert.rejects(failure.PhotoTools.compress(new Blob(['image'],{type:'image/png'})));assert.equal(failure.released,true);
});
test('PR helpers are pure and isolate names; badges include reps records below maximum weight',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const r=rec('1','2026-11-01',[set(50,8),set(60,6),set(50,9),set(60,6)]);const all=[r];const before=JSON.stringify(all);
 assert.deepEqual(Array.from(m.buildPRIndex(all).keys()),['1:1','1:2']);
 assert.equal(m.evaluatePR(all,rec('2','2026-11-02',[],{name:'Squat'}),set(90)).isPR,false);
 assert.equal(m.evaluatePR(all,{record:r,setIndex:3}).isPR,false);assert.equal(JSON.stringify(all),before);
});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
async function shellFetch(request){
 const url=new URL(request.url);
 if(url.origin!=='https://motionlog.test')throw Error('CDN offline');
 const path=require('node:path');const bytes=fs.readFileSync(root+path.basename(url.pathname));
 return new Response(bytes,{headers:{'Content-Type':mime[path.extname(url.pathname)]}});
}
test('installation precaches every real app asset including layout; CDN offline is non-fatal',async()=>{
 const h=workerHarness({fetch:shellFetch});let pending;
 h.events.install({waitUntil(p){pending=p}});await pending;
 assert.deepEqual(h.writes.map(url=>new URL(url).pathname).sort(),['/app.css','/app.js','/icon.svg','/index.html','/layout.js','/manifest.json','/photo-tools.js','/rest-timer.js','/sync.js','/training-metrics.js']);
 const manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8'));
 assert.ok(fs.statSync(root+manifest.icons[0].src).isFile());assert.equal(manifest.start_url,'./');
});
test('missing or HTML-fallback shell asset fails installation before any cache writes',async()=>{
 for(const bad of ['missing','html-fallback']){
 const h=workerHarness({fetch:async request=>request.url.endsWith('/layout.js')?new Response('not js',{status:bad==='missing'?404:200,headers:{'Content-Type':'text/html'}}):shellFetch(request)});let pending;
 h.events.install({waitUntil(p){pending=p}});await assert.rejects(pending,/Invalid public shell asset/);assert.equal(h.writes.length,0);
 }
});
test('private and no-store responses are never added to the asset cache',async()=>{
 for(const control of ['private, max-age=0','no-store']){
 const h=workerHarness({fetch:async()=>new Response('private',{headers:{'Content-Type':'text/javascript','Cache-Control':control}})});let pending;
 h.events.fetch({request:new Request('https://motionlog.test/app.js'),respondWith(p){pending=p}});
 assert.equal((await pending).type,'error');assert.equal(h.writes.length,0);
 }
});
test('activation prunes only obsolete caches owned by this worker',async()=>{
 const h=workerHarness({cacheNames:['foreign-app','motionlog-v15-shell-0','motionlog-v15-shell-1']});let pending;
 h.events.activate({waitUntil(p){pending=p}});await pending;assert.deepEqual(h.deleted,['motionlog-v15-shell-0']);
});
test('navigation returns offline index for root and index.html without persisting query contents',async()=>{
 const h=workerHarness();h.responses.set('https://motionlog.test/index.html',new Response('safe shell'));
 for(const url of ['https://motionlog.test/','https://motionlog.test/index.html?code=secret']){
 let pending;h.events.fetch({request:{url,method:'GET',mode:'navigate',headers:new Headers()},respondWith(p){pending=p}});assert.equal(await(await pending).text(),'safe shell');
 }
 assert.equal(h.writes.length,0);
});
test('set timestamps interleave records and prevent retroactive quick PRs',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const quick=rec('quick','2026-11-25',[set(50,8,{createdAt:100}),set(55,8,{createdAt:300}),set(65,8,{createdAt:500})],{createdAt:100});
 const editor=rec('editor','2026-11-25',[set(60,8,{createdAt:200}),set(65,8,{createdAt:400})],{createdAt:200});
 const records=[editor,quick],before=JSON.stringify(records);
 assert.deepEqual(Array.from(m.buildPRIndex(records).keys()),['editor:0','editor:1']);
 assert.equal(m.evaluatePR(records,quick,1).isPR,false);
 assert.equal(m.evaluatePR(records,quick,1).previousWeight,60);
 assert.equal(m.evaluatePR(records,quick,2).isPR,false);
 assert.equal(m.evaluatePR(records,editor,0).weightPR,true);
 assert.equal(JSON.stringify(records),before);
});
test('backdated record dates take priority over set creation timestamps',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const backdated=rec('backdated','2026-11-24',[set(60,8,{createdAt:900})],{createdAt:900});
 const current=rec('current','2026-11-25',[set(55,8,{createdAt:100}),set(65,8,{createdAt:200})],{createdAt:100});
 assert.deepEqual(Array.from(m.buildPRIndex([current,backdated]).keys()),['current:1']);
 assert.equal(m.evaluatePR([current,backdated],current,0).isPR,false);
});
test('missing or invalid set timestamps fall back to record timestamps and stable indexes',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const legacy=rec('legacy','2026-11-25',[set(50),set(55,8,{createdAt:'bad'}),set(60,8,{createdAt:null})],{createdAt:100});
 const newer=rec('newer','2026-11-25',[set(65)],{createdAt:200});
 assert.deepEqual(Array.from(m.buildPRIndex([newer,legacy]).keys()),['legacy:1','legacy:2','newer:0']);
 const a=rec('a','2026-11-25',[set(50),set(55)],{createdAt:undefined});
 const b=rec('b','2026-11-25',[set(60)],{createdAt:undefined});
 assert.deepEqual(Array.from(m.buildPRIndex([a,b]).keys()),['a:1','b:0']);
 const tieA=rec('tieA','2026-11-25',[set(50),set(55)],{createdAt:100});
 const tieB=rec('tieB','2026-11-25',[set(60)],{createdAt:100});
 assert.deepEqual(Array.from(m.buildPRIndex([tieA,tieB]).keys()),['tieA:1','tieB:0']);
});
test('set timestamps accept zero and ISO strings without treating missing values as zero',()=>{
 const m=load('training-metrics.js').TrainingMetrics;
 const first=rec('first','2026-11-25',[set(50,8,{createdAt:0})],{createdAt:500});
 const second=rec('second','2026-11-25',[set(55,8,{createdAt:''})],{createdAt:100});
 assert.deepEqual(Array.from(m.buildPRIndex([second,first]).keys()),['second:0']);
 const iso=rec('iso','2026-11-25',[set(50,8,{createdAt:'2026-11-25T10:00:00Z'}),set(55,8,{createdAt:'2026-11-25T12:00:00Z'})],{createdAt:'2026-11-25T10:00:00Z'});
 const middle=rec('middle','2026-11-25',[set(60)],{createdAt:'2026-11-25T11:00:00Z'});
 assert.deepEqual(Array.from(m.buildPRIndex([middle,iso]).keys()),['middle:0']);
});
