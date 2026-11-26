const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('./sync.js');
let serial=0;
const ops=(before,after,time=100)=>Core.diff(before,after,()=>({id:`op-${++serial}`,stamp:`${String(time).padStart(16,'0')}:${serial}`}));

test('local deletion survives stale remote rows and an explicit undo restores all fields',()=>{
 const record={id:'r1',name:'Pull',sets:[{weight:20,reps:8}],future:{x:1}};
 const deletion=ops({records:[record]},{records:[]});
 const removed=Core.merge({records:[record],futurePayload:{keep:true}},deletion);
 assert.deepEqual(removed.records,[]);
 const stale=ops({records:[record]},{records:[{...record,name:'stale'}]},90);
 assert.deepEqual(Core.merge(removed,stale).records,[]);
 const undo=ops({records:[]},{records:[record]},110);
 const restored=Core.merge(removed,undo);
 assert.deepEqual(restored.records,[record]);
 assert.deepEqual(restored.futurePayload,{keep:true});
});
test('reconciliation preserves other devices records, nested fields and concurrent appended sets',()=>{
 const base={records:[{id:'r',name:'Pull',sets:[{weight:10,reps:8}],future:'known'}]};
 const local={records:[{...base.records[0],sets:[...base.records[0].sets,{weight:20,reps:8}]}]};
 const remote={records:[{...base.records[0],future:'remote',sets:[...base.records[0].sets,{weight:30,reps:6}]},{id:'other',name:'Other'}],unknown:{flag:1}};
 const pending=ops(base,local);
 const merged=Core.merge(remote,pending);
 assert.deepEqual(merged.records[0].sets,[{weight:10,reps:8},{weight:30,reps:6},{weight:20,reps:8}]);
 assert.equal(merged.records[0].future,'remote');
 assert.equal(merged.records[1].id,'other');
 assert.deepEqual(merged.unknown,{flag:1});
 assert.deepEqual(Core.merge(merged,pending),merged,'a retry must not duplicate appended sets');
});
test('checkin edits merge concurrent photos and notes, and respect removals',()=>{
 const base={checkins:{day:{completed:true,photos:['a'],notes:[{id:'n',text:'old'}]}}};
 const local={checkins:{day:{completed:false,photos:['b'],notes:[]}}};
 const remote={checkins:{day:{completed:true,photos:['a','c'],notes:[{id:'n',text:'old'},{id:'remote',text:'new'}],unknown:42}}};
 assert.deepEqual(Core.merge(remote,ops(base,local)).checkins.day,{completed:false,photos:['c','b'],notes:[{id:'remote',text:'new'}],unknown:42});
});
test('preferences and GIF removals preserve unrelated remote preferences and payload data',()=>{
 const base={preferences:{units:{Pull:'kg'},timer:90},gifBindings:{Pull:{id:'old'}}};
 const local={preferences:{units:{Pull:'lb'},timer:90},gifBindings:{}};
 const remote={preferences:{units:{Pull:'kg',Squat:'kg'},timer:120,unrecognised:true},gifBindings:{Pull:{id:'old'},Squat:{id:'s'}},media:{p:'path'},extension:7};
 const result=Core.merge(remote,ops(base,local));
 assert.deepEqual(result.preferences,{units:{Pull:'lb',Squat:'kg'},timer:120,unrecognised:true});
 assert.deepEqual(result.gifBindings,{Squat:{id:'s'}});
 assert.equal(result.extension,7);
 assert.deepEqual(result.media,{p:'path'});
});
test('duplicate identical sets retain counts and adding after a deletion is idempotent',()=>{
 const set={weight:10,reps:5};
 const base={records:[{id:'r',sets:[set,set]}]};
 const local={records:[{id:'r',sets:[set]}]};
 const remote={records:[{id:'r',sets:[set,set,set]}]};
 const pending=ops(base,local);
 const result=Core.merge(remote,pending);
 assert.equal(result.records[0].sets.length,2);
 assert.deepEqual(Core.merge(result,pending),result);
});
test('unchanged state does not queue writes and missing payload starts blank',()=>{
 assert.deepEqual(ops({},{}),[]);
 assert.deepEqual(Core.normalise(null).records,[]);
 assert.deepEqual(Core.normalise(null).preferences,{});
});
test('a delayed stale delete cannot erase a later explicit undo',()=>{
 const r={id:'r',sets:[{weight:10,reps:5}]};
 const deleted=Core.merge({records:[r]},ops({records:[r]},{records:[]},100));
 const restored=Core.merge(deleted,ops({records:[]},{records:[r]},120));
 const oldDelete=ops({records:[r]},{records:[]},110);
 assert.deepEqual(Core.merge(restored,oldDelete).records,[r]);
});
test('editing one set preserves its original order',()=>{
 const base={records:[{id:'r',sets:[{weight:10,reps:5},{weight:20,reps:5}]}]};
 const changed={records:[{id:'r',sets:[{weight:11,reps:5},{weight:20,reps:5}]}]};
 assert.deepEqual(Core.merge(base,ops(base,changed)).records,changed.records);
});

// Run the actual browser adapter with only the browser/network boundaries replaced.
// The cloud double is an in-memory table with real version-conflict behavior.
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('./sync.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
async function browser({legacy={},session=null,rows={},storage,blobs}={}) {
 const store=storage||new Map(),images=blobs||new Map(),timers=new Map(),events={},table=new Map(Object.entries(rows).map(([id,payload])=>[id,{payload:plain(payload),updated_at:'2026-01-01T00:00:00.000Z'}]));
 for(const [key,value] of Object.entries(legacy))store.set(`motionlog_${key}_v1`,JSON.stringify(value));
 let auth,remoteEvent,timerId=0,blockedWrite=null,failMedia=false,conflicts=0;
 const nodes=[];
 const node=()=>({dataset:{},style:{},appendChild(child){nodes.push(child);},addEventListener(){},remove(){},querySelector(){return node();},showModal(){},reportValidity(){return true;}});
 const document={head:node(),body:node(),createElement:node,querySelector:()=>node(),querySelectorAll:()=>nodes.filter(n=>ownData(n,'motionSyncStatus')),getElementById:id=>nodes.find(n=>n.id===id),addEventListener:(name,fn)=>{events[name]=fn;},visibilityState:'visible'};
 function ownData(n,key){return Object.hasOwn(n.dataset,key);}
 const sdk={
  auth:{onAuthStateChange(fn){auth=fn;return {data:{subscription:{unsubscribe(){}}}};},async getSession(){return {data:{session},error:null};},async signOut(){session=null;auth('SIGNED_OUT',null);return {error:null};}},
  channel(){return {on(_event,_filter,fn){remoteEvent=fn;return this;},subscribe(){return this;}};},async removeChannel(){},
  storage:{from(){return {async upload(){return failMedia?{error:Error('upload unavailable')}:{data:{path:'ok'},error:null};},async download(){return {data:new Blob(['remote photo']),error:null};},async remove(){return {data:[],error:null};}};}},
  from(name){assert.equal(name,'personal_app_state');let mode='read',update,filters={};const q={
   select(){return q;},eq(key,value){filters[key]=value;return q;},update(row){mode='update';update=plain(row);return q;},insert(row){mode='insert';update=plain(row);return q;},
   async maybeSingle(){return run();},async single(){return run();}
  };async function run(){
   const id=update?.user_id||filters.user_id;
   assert.equal(update?.app_id||filters.app_id,'motionlog');
   if(mode==='read')return {data:plain(table.get(id)||null),error:null};
   if(blockedWrite){const gate=blockedWrite;blockedWrite=null;await gate;}
   const current=table.get(id);
   if(conflicts>0){conflicts--;return {data:null,error:null};}
   if(mode==='insert'&&current)return {data:null,error:{code:'23505',message:'duplicate'}};
   if(mode==='update'&&current?.updated_at!==filters.updated_at)return {data:null,error:null};
   table.set(id,{payload:update.payload,updated_at:update.updated_at});return {data:plain(table.get(id)),error:null};
  }return q;}
 };
 const sandbox={console,Blob,crypto:require('node:crypto').webcrypto,document,navigator:{onLine:true},localStorage:{getItem:key=>store.get(key)??null,setItem:(key,val)=>store.set(key,String(val))},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),addEventListener:(name,fn)=>{events[name]=fn;},dispatchEvent(){},supabase:{createClient:()=>sdk},records:plain(legacy.records||[]),checkins:plain(legacy.checkins||{}),gifBindings:plain(legacy.gif_bindings||{}),appPreferences:plain(legacy.preferences||{}),saveRecords(){},saveCheckins(){},saveGifBindings(){},savePreferences(){},async imageGet(id){return images.get(id);},async imagePut(id,blob){images.set(id,blob);},async imageDelete(id){images.delete(id);},syncTrainingViews(){}};
 sandbox.window=sandbox;
 const context=vm.createContext(sandbox);vm.runInContext(source,context);await settle();
 const runTimers=async()=>{const tasks=[...timers.values()];timers.clear();for(const task of tasks)task();await settle();};
 return {context,store,images,table,nodes,events,runTimers,async login(id){session=id?{user:{id,email:`${id}@example.com`}}:null;auth('SIGNED_IN',session);await runTimers();},async flush(){await context.MotionSync.flush();await settle();},blockNextWrite(){let release;blockedWrite=new Promise(resolve=>release=resolve);return release;},setFailMedia(value){failMedia=value;},setConflicts(value){conflicts=value;},realtime(payload,id){table.set(id,{payload:plain(payload),updated_at:new Date().toISOString()});remoteEvent({new:{app_id:'motionlog',user_id:id,updated_by:id,payload}});}};
}

test('anonymous data and legacy keys survive reload and never enter an account implicitly',async()=>{
 const record={id:'anon',sets:[{weight:10,reps:5}]};
 const b=await browser({legacy:{records:[record],preferences:{lastUnit:'kg'}}});
 assert.deepEqual(plain(b.context.records),[record]);
 b.context.records.push({id:'anon2'});b.context.saveRecords();
 assert.deepEqual(JSON.parse(b.store.get('motionlog_records_v1')),[record]);
 assert.equal(b.context.MotionSync.getStatus().pendingCount,2);
 await b.login('A');
 assert.deepEqual(plain(b.context.records),[]);
 assert.deepEqual(plain(b.context.appPreferences),{});
 assert.equal(b.table.has('A'),false);
 await assert.rejects(b.context.MotionSync.importAnonymous(),/明确确认/);
 await b.login(null);
 assert.deepEqual(plain(b.context.records).map(r=>r.id),['anon','anon2']);
 const reload=await browser({storage:b.store,blobs:b.images});
 assert.deepEqual(plain(reload.context.records).map(r=>r.id),['anon','anon2']);
 assert.ok(b.nodes.some(n=>n.id==='motion-sync-status'),'canonical status button is available to layout.js');
});
test('one workout plus unit preferences displays one pending item; preference-only displays one',async()=>{
 const b=await browser();
 b.context.appPreferences={lastUnit:'kg',actionUnits:{Pull:'kg'}};b.context.savePreferences();
 assert.equal(b.context.MotionSync.getStatus().pendingCount,1);
 b.context.records=[{id:'r',sets:[{weight:10,reps:5}]}];b.context.saveRecords();
 assert.equal(b.context.MotionSync.getStatus().pendingCount,1);
});
test('in-flight saves retain new sets and rerun without requiring a later user action',async()=>{
 const b=await browser({session:{user:{id:'A'}},rows:{A:{records:[]}}});
 const release=b.blockNextWrite();
 b.context.records=[{id:'r',sets:[{weight:10,reps:5}]}];b.context.saveRecords();
 const writing=b.context.MotionSync.flush();await settle();
 b.context.records[0].sets.push({weight:20,reps:5});b.context.saveRecords();
 release();await writing;await settle();
 assert.deepEqual(b.table.get('A').payload.records[0].sets,[{weight:10,reps:5},{weight:20,reps:5}]);
 assert.equal(b.context.MotionSync.getStatus().pendingCount,0);
});
test('delete and undo during a save restore the complete row in cloud and cache',async()=>{
 const r={id:'r',name:'Pull',sets:[{weight:10,reps:5}],future:{preserve:1}};
 const b=await browser({session:{user:{id:'A'}},rows:{A:{records:[r]}}});
 await b.flush();
 const release=b.blockNextWrite();
 b.context.records=[];b.context.saveRecords();const writing=b.context.MotionSync.flush();await settle();
 b.context.records=[plain(r)];b.context.saveRecords();release();await writing;await settle();
 assert.deepEqual(b.table.get('A').payload.records,[r]);
 assert.equal(b.context.MotionSync.getStatus().pendingCount,0);
});
test('same-account realtime updates are applied while pending local edits survive rebase',async()=>{
 const r={id:'r',name:'Pull',sets:[{weight:10,reps:5}]};
 const b=await browser({session:{user:{id:'A'}},rows:{A:{records:[r]}}});await b.flush();
 b.context.navigator.onLine=false;
 b.context.records[0].sets.push({weight:20,reps:5});b.context.saveRecords();
 b.realtime({records:[{...r,name:'remote name',sets:[...r.sets,{weight:30,reps:4}]}],unknown:'keep'},'A');
 b.context.navigator.onLine=true;await b.flush();
 const row=b.table.get('A').payload;
 assert.equal(row.records[0].name,'remote name');assert.equal(row.unknown,'keep');
 assert.deepEqual(row.records[0].sets,[{weight:10,reps:5},{weight:30,reps:4},{weight:20,reps:5}]);
 b.realtime({records:[{id:'from-other-session'}]},'A');await settle();
 assert.deepEqual(plain(b.context.records),[{id:'from-other-session'}]);
});
test('failed photo uploads retain a durable pending job and recover on retry',async()=>{
 const b=await browser({session:{user:{id:'A'}}});await b.flush();b.setFailMedia(true);
 await b.context.imagePut('photo',new Blob(['photo']));
 b.context.checkins={day:{photos:['photo'],completed:true}};b.context.saveCheckins();await b.flush();
 assert.ok(b.context.MotionSync.getStatus().pendingCount>0);
 assert.match(b.context.MotionSync.getStatus().lastError,/upload unavailable/);
 const cache=JSON.parse(b.store.get('motionlog_sync_v15:account:A'));
 assert.equal(cache.mediaJobs.photo.action,'upload');
 b.setFailMedia(false);await b.flush();
 assert.equal(b.context.MotionSync.getStatus().pendingCount,0);
 assert.match(b.table.get('A').payload.media.photo,/^motionlog\/A\//);
 await b.login('B');assert.equal(await b.context.imageGet('photo'),undefined);
});
test('conditional-write collisions retry within a bound and preserve the outbox',async()=>{
 const b=await browser({session:{user:{id:'A'}},rows:{A:{records:[]}}});await b.flush();
 b.context.records=[{id:'r'}];b.context.saveRecords();b.setConflicts(10);await b.flush();
 assert.equal(b.context.MotionSync.getStatus().pendingCount,1);
 assert.match(b.context.MotionSync.getStatus().lastError,/另一个会话/);
 b.setConflicts(0);await b.flush();assert.deepEqual(b.table.get('A').payload.records,[{id:'r'}]);
});
test('explicit anonymous import avoids duplicate sets and preserves cloud conflicts and unknown fields',async()=>{
 const r={id:'r',name:'Pull',sets:[{weight:10,reps:5}]};
 const b=await browser({legacy:{records:[{...r,sets:[...r.sets,{weight:20,reps:5}]}]},session:{user:{id:'A'}},rows:{A:{records:[{...r,name:'Cloud name',unknown:42}]}}});
 await b.flush();await b.context.MotionSync.importAnonymous({confirmed:true});await b.flush();
 const result=b.table.get('A').payload.records;
 assert.deepEqual(result,[{...r,name:'Cloud name',unknown:42,sets:[...r.sets,{weight:20,reps:5}]}]);
 await b.context.MotionSync.importAnonymous({confirmed:true});await b.flush();
 assert.deepEqual(b.table.get('A').payload.records,result,'repeating opt-in import is safe');
});
test('an account switch during a pending write cannot expose the old account in the new view',async()=>{
 const b=await browser({session:{user:{id:'A'}},rows:{A:{records:[]},B:{records:[{id:'B-only'}]}}});await b.flush();
 const release=b.blockNextWrite();b.context.records=[{id:'A-only'}];b.context.saveRecords();
 const writing=b.context.MotionSync.flush();await settle();await b.login('B');release();await writing;await b.runTimers();
 assert.deepEqual(plain(b.context.records),[{id:'B-only'}]);
 assert.deepEqual(b.table.get('B').payload.records,[{id:'B-only'}]);
 assert.ok(JSON.parse(b.store.get('motionlog_sync_v15:account:A')).pending.length,'old account outbox stays recoverable');
});
