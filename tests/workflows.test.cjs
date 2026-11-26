const {test,afterEach}=require('node:test');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const openDoms=[];
afterEach(()=>{for(const dom of openDoms.splice(0))dom.window.close();});
function app(records=[],checkins={}) {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  openDoms.push(dom);
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}});
  w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.confirm=()=>true;
  w.localStorage.setItem('motionlog_records_v1',JSON.stringify(records));w.localStorage.setItem('motionlog_checkins_v1',JSON.stringify(checkins));
  for(const file of ['training-metrics.js','rest-timer.js','photo-tools.js','app.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),dom.getInternalVMContext(),{filename:file});
  const $=id=>w.document.getElementById(id);
  const state=()=>JSON.parse(w.eval('JSON.stringify({records,checkins,appPreferences})'));
  const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,w,$,state,submit};
}
const record=(id='r',date='2026-11-19',sets=[{weight:7,reps:6,unit:'片',verified:true}])=>({id,date,name:'器械动作',muscle:'背部',sets,notes:'保留备注',createdAt:1});
test('existing local keys load without seed data and newer set metadata survives edits',()=>{
 const t=app([record()],{'2026-11-19':{completed:true,notes:[{id:'note',text:'感受',time:1}],photos:[]}});
 assert.equal(t.state().records.length,1);assert.equal(t.state().checkins['2026-11-19'].notes[0].text,'感受');
 t.w.openEditor('r');t.submit('trainingForm');assert.equal(t.state().records[0].sets[0].unit,'片');t.dom.window.close();
});
test('invalid zero reps leaves advanced editor open and records unchanged',()=>{
 const t=app();t.w.openEditor();t.$('trainName').value='测试动作';
 const reps=t.w.document.querySelector('[data-field=reps]');reps.value='0';reps.dispatchEvent(new t.w.Event('input',{bubbles:true}));
 t.submit('trainingForm');assert.equal(t.$('advancedOverlay').hidden,false);assert.equal(t.state().records.length,0);assert.match(t.$('toast').textContent,/次数/);t.dom.window.close();
});
test('bodyweight quick entry keeps values; deletion/undo restores full record',()=>{
 const t=app();t.$('quickAction').value='自重动作';t.$('quickReps').value='8';t.submit('quickForm');
 assert.equal(t.state().records[0].sets[0].weight,null);assert.equal(t.$('quickReps').value,'8');assert.equal(t.$('quickWeight').value,'');
 const before=t.state().records[0];t.w.removeTrainingRecord(before.id,0);t.$('inlineConfirmation').querySelector('button').click();assert.equal(t.state().records.length,0);
 t.$('toast').querySelector('button').click();assert.deepEqual(t.state().records[0],before);assert.equal(t.w.isTrainingDay(t.$('quickDate').value),true);t.dom.window.close();
});
test('action prefills first prior set including plate unit and retains manual unit',()=>{
 const t=app([record()]);t.$('quickAction').value='器械动作';t.w.prefillQuickAction();
 assert.equal(t.$('quickWeight').value,'7');assert.equal(t.$('quickReps').value,'6');assert.equal(t.$('quickUnit').value,'片');
 t.$('quickUnit').value='kg';t.w.saveQuickUnit();assert.equal(t.state().appPreferences.actionUnits['背部|器械动作'],'kg');t.dom.window.close();
});
test('timed bodyweight sets record duration and render a duration trend',()=>{
 const t=app();t.$('quickAction').value='计时动作';t.$('quickDuration').value='60';t.submit('quickForm');
 assert.equal(t.state().records[0].sets[0].duration,60);assert.equal(t.state().records[0].sets[0].reps,null);
 t.w.eval("selectedTrendMetric='duration';renderTrend()");assert.match(t.$('trendChart').innerHTML,/circle/);t.dom.window.close();
});
test('editor does not navigate away from history; dates show Mondays first',()=>{
 const t=app([record()]);t.w.showView('history');t.w.openEditor('r');assert.equal(t.$('history').classList.contains('active'),true);
 t.w.closeOverlay('advancedOverlay');t.w.eval("calMonth=new Date(2026,10,1);renderCalendar()");
 assert.equal([...t.$('calendarDays').children].indexOf(t.$('calendarDays').querySelector('[data-day="2026-11-01"]')),6);t.dom.window.close();
});
test('history initially limits 20 dates and expands only latest two',()=>{
 const rows=Array.from({length:25},(_,i)=>record('r'+i,`2026-10-${String(i+1).padStart(2,'0')}`));const t=app(rows);t.w.renderHistory();
 assert.equal(t.w.document.querySelectorAll('[data-history-day]').length,20);assert.equal(t.w.document.querySelectorAll('[data-history-day][open]').length,2);
 t.$('loadMoreDays').click();assert.equal(t.w.document.querySelectorAll('[data-history-day]').length,25);t.dom.window.close();
});
test('best volume uses sum of all sets and detailed mode keeps fifth set',()=>{
 const t=app([record('r','2026-11-19',Array.from({length:5},(_,i)=>({weight:10+i,reps:10,unit:'kg',verified:true})))]);
 const data=JSON.parse(t.w.eval("JSON.stringify(collectActionTrend({name:'器械动作',muscle:'背部'}, {start:'',end:today()},'volume','kg'))"));
 assert.equal(data.series.length,1);assert.equal(data.series[0].values[0],600);
 const details=JSON.parse(t.w.eval("trendDisplay='sets';JSON.stringify(collectActionTrend({name:'器械动作',muscle:'背部'}, {start:'',end:today()},'weight','kg'))"));assert.equal(details.series.length,5);assert.equal(details.series[4].values[0],14);t.dom.window.close();
});
test('v1 backup restores exactly supplied records/checkins without personal seeding',async()=>{
 const t=app();const backup={app:'MotionLog',version:1,trainingNotesBatch:'old-batch',records:[record('backup')],checkins:{'2026-11-19':{completed:true,notes:[],photos:[]}},images:{},gifBindings:{}};
 Object.defineProperty(t.$('importFile'),'files',{value:[{text:async()=>JSON.stringify(backup)}],configurable:true});t.$('importFile').dispatchEvent(new t.w.Event('change'));
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(t.state().records.length,1);assert.equal(t.state().records[0].id,'backup');assert.equal(t.state().checkins['2026-11-19'].completed,true);t.dom.window.close();
});
test('malformed nested backups and malformed media leave current records and photos unchanged',async()=>{
 const t=app([record()]);const initial=t.state();assert.throws(()=>t.w.validateBackup({app:'MotionLog',version:1,records:[{...record(),sets:'bad'}],checkins:{}}),/格式/);
 const writes=[];t.w.imagePut=async(id,blob)=>writes.push(id);const invalid={app:'MotionLog',version:1,records:[],checkins:{},images:{first:'data:image/png;base64,aGk=',second:'data:image/png;base64,%%%'}};
 await assert.rejects(t.w.restoreBackup(invalid));assert.deepEqual(writes,[]);assert.deepEqual(t.state(),initial);
});
test('a set removed during the confirmation delay cannot delete a different set',()=>{
 const t=app([record('r','2026-11-19',[{id:'a',weight:10,reps:5},{id:'b',weight:20,reps:5}])]);
 t.w.removeTrainingRecord('r',0);t.w.eval("records[0].sets.shift()");t.$('inlineConfirmation').querySelector('button').click();assert.equal(t.state().records[0].sets[0].id,'b');
});
test('prefill keeps historical numeric weight and its unit together',()=>{
 const t=app([record('r','2026-11-19',[{weight:110,reps:12,unit:'lb',verified:true}])]);t.w.eval("appPreferences.actionUnits={'背部|器械动作':'kg'}");t.$('quickAction').value='器械动作';t.w.prefillQuickAction();assert.equal(t.$('quickUnit').value,'lb');
});
test('advanced save failure restores the original record',()=>{
 const t=app([record()]);const initial=t.state().records;t.w.openEditor('r');t.$('trainName').value='变更名称';t.w.eval("saveRecords=()=>{throw Error('quota')}");t.submit('trainingForm');assert.deepEqual(t.state().records,initial);assert.equal(t.$('advancedOverlay').hidden,false);
});
