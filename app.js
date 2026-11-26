/* ================== 模块 A：基础配置、历史记录、浏览器持久化 ================== */
const REGIONS = {
  '背部':{en:'BACK',intro:'背阔肌、斜方肌、菱形肌与竖脊肌。常见训练包括下拉、划船和单臂器械。',keys:['latissimus','trapezius','rhomboid','erector','infraspinatus','teres major','serratus posterior'],search:['back','latissimus','lats','trapezius','rowing','pulldown','pull up']},
  '胸部':{en:'CHEST',intro:'以胸大肌和胸小肌为主，常见训练包括卧推、器械推胸和夹胸。',keys:['pectoralis','pectoral'],search:['chest','pectoralis','bench press','chest press','fly']},
  '肩部':{en:'SHOULDERS',intro:'三角肌前束、中束与后束，肩部推举与侧平举均可追踪。',keys:['deltoid','supraspinatus','subscapularis'],search:['shoulder','deltoid','lateral raise','overhead press']},
  '二头肌':{en:'BICEPS',intro:'肱二头肌和肱肌，常见训练包括哑铃弯举、锤式弯举。',keys:['biceps brachii','brachialis','brachioradialis'],search:['biceps','curl','brachialis']},
  '三头肌':{en:'TRICEPS',intro:'肱三头肌，常见训练包括绳索下压、直杆下压和过顶屈伸。',keys:['triceps'],search:['triceps','pushdown','extension']},
  '腹部':{en:'CORE',intro:'腹直肌、腹外斜肌和腹内斜肌，结合卷腹及抗旋转动作。',keys:['rectus abdominis','external oblique','internal oblique','transversus abdominis'],search:['abs','abdominal','crunch','core','oblique']},
  '腿部':{en:'LEGS',intro:'股四头肌、腘绳肌、臀肌等，常见动作包括深蹲、腿举、腿弯举。',keys:['quadriceps','rectus femoris','vastus','biceps femoris','gluteus','adductor','hamstring'],search:['leg','quadriceps','squat','glute','hamstring','thigh']},
  '小腿':{en:'CALVES',intro:'腓肠肌、比目鱼肌和胫骨前肌，常见训练包括提踵。',keys:['gastrocnemius','soleus','tibialis anterior'],search:['calf','calves','gastrocnemius','heel raise']}
};
const MUSCLE_NAMES=Object.keys(REGIONS);
const STORAGE_KEY='motionlog_records_v1', CHECKIN_KEY='motionlog_checkins_v1';
const pad=n=>String(n).padStart(2,'0');
function localISO(d=new Date()){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
const today=()=>localISO();
const isoDate = d=>d ? d : '日期未注明';
const UID=()=> (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const h = text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readJSON(key,fallback){try{let s=localStorage.getItem(key);return s===null?fallback:JSON.parse(s);}catch{return fallback;}}
let records=readJSON(STORAGE_KEY,[]);if(!Array.isArray(records))records=[];
let saveRecords=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(records));
let checkins=readJSON(CHECKIN_KEY,{});if(!checkins || typeof checkins!=='object'||Array.isArray(checkins))checkins={};
let saveCheckins=()=>localStorage.setItem(CHECKIN_KEY,JSON.stringify(checkins));
const PREFERENCES_KEY='motionlog_preferences_v1';
let appPreferences=readJSON(PREFERENCES_KEY,{});if(!appPreferences||typeof appPreferences!=='object'||Array.isArray(appPreferences))appPreferences={};
let savePreferences=()=>localStorage.setItem(PREFERENCES_KEY,JSON.stringify(appPreferences));
let lastQuickAction='';
function saveQuickUnit(){const name=document.getElementById('quickAction').value.trim(),muscle=document.getElementById('quickMuscle').value,unit=document.getElementById('quickUnit').value;appPreferences.actionUnits={...(appPreferences.actionUnits||{}),[muscle+'|'+name]:unit};appPreferences.lastUnit=unit;savePreferences();}
function prefillQuickAction(){
 const name=document.getElementById('quickAction').value.trim();if(name===lastQuickAction)return;lastQuickAction=name;
 syncQuickActionMuscle();const muscle=document.getElementById('quickMuscle').value,date=document.getElementById('quickDate').value||today();
 const matching=records.filter(r=>r.name===name&&r.muscle===muscle&&r.date<=date).sort((a,b)=>byDate(a,b,true));
 const first=matching[0]?.sets?.find(s=>s.verified!==false);
 document.getElementById('quickWeight').value=first?.weight??'';document.getElementById('quickReps').value=first?.reps??'';
 document.getElementById('quickUnit').value=appPreferences.actionUnits?.[muscle+'|'+name]??first?.unit??appPreferences.lastUnit??'lb';
 if(document.getElementById('quickDuration'))document.getElementById('quickDuration').value=first?.duration??'';
 renderLastWorkout();
}
const getLoad=rec=>Array.isArray(rec.sets)?rec.sets.filter(s=>s.weight!==null&&s.weight!==''&&Number.isFinite(+s.weight)).map(s=>`${s.weight}${s.plus?'+':''}${s.unit?' '+s.unit:''}`).join(' / '):'';
const dateLabel=date=>date?`${date.slice(5,7)}/${date.slice(8,10)}/${date.slice(0,4)}`:'日期未注明';
const byDate=(a,b,desc=true)=>(desc?-1:1)*(String(a.date||'0000').localeCompare(String(b.date||'0000')) || (Number(a.createdAt)||0)-(Number(b.createdAt)||0));
function toast(msg,isError=false,undo=null){
 const e=document.querySelector('#toast');e.replaceChildren();e.setAttribute('role','status');e.dataset.error=String(isError);e.append(document.createTextNode(msg));
 if(undo){const b=document.createElement('button');b.type='button';b.textContent='撤销';b.onclick=()=>{clearTimeout(toast.t);undo();e.classList.remove('visible');};e.append(b);}
 e.classList.add('visible');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('visible'),undo?5000:3400);
}
function requestConfirmation(message,onConfirm,actionLabel='确认删除'){
 document.getElementById('inlineConfirmation')?.remove();
 const bar=document.createElement('div');bar.id='inlineConfirmation';bar.className='inline-confirmation';bar.setAttribute('role','alertdialog');bar.setAttribute('aria-label',message);
 const text=document.createElement('span');text.textContent=message;bar.append(text);
 const yes=document.createElement('button');yes.textContent=actionLabel;yes.className='btn btn-danger';yes.onclick=()=>{bar.remove();onConfirm();};
 const no=document.createElement('button');no.textContent='取消';no.className='btn';no.onclick=()=>bar.remove();bar.append(yes,no);
 (document.querySelector('.ml-overlay:not([hidden]) .ml-dialog')||document.body).append(bar);no.focus({preventScroll:true});
}
function removeTrainingRecord(id,setIndex=null){
 const record=records.find(r=>r.id===id);if(!record)return;
 requestConfirmation(setIndex===null?'删除这条训练记录？':'删除这一组？',()=>{
  const current=records.find(r=>r.id===id);if(!current)return;
  const original=structuredClone(current);let removedSet=null;
  if(setIndex===null){records=records.filter(r=>r.id!==id);}else{removedSet=current.sets.splice(setIndex,1)[0];if(!current.sets.length)records=records.filter(r=>r.id!==id);}
  saveRecords();if(editingId===id)closeOverlay('advancedOverlay');syncTrainingViews();
  toast('训练已删除',false,()=>{const existing=records.find(r=>r.id===id);if(removedSet&&existing)existing.sets.splice(Math.min(setIndex,existing.sets.length),0,removedSet);else if(!existing)records.push(original);saveRecords();syncTrainingViews();});
 });
}


/* ================== 模块 B：模块切换、概览与统计 ================== */
let selectedRegion='背部', selectedAction='', editingId=null;
function showView(view){if(view==='record')view='dashboard';document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===view));document.querySelectorAll('#nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===view));window.scrollTo({top:0,behavior:'smooth'});if(view==='dashboard')renderDashboard();if(view==='history')renderHistory();if(view==='checkin')renderCalendar();}
document.querySelector('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)showView(b.dataset.view);});
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.jump)));
document.querySelector('#quickAdd').addEventListener('click',()=>openEditor());
function renderDashboard(){
 const dates=new Set([...records.map(r=>r.date).filter(Boolean),...Object.entries(checkins).filter(([,c])=>c?.completed).map(([d])=>d)]);
 document.querySelector('#statDays').textContent=dates.size;
 document.querySelector('#statExercises').textContent=records.length;
 document.querySelector('#statSets').textContent=records.reduce((n,r)=>n+(r.sets||[]).filter(s=>s.verified).length,0);
 document.querySelector('#statMuscles').innerHTML=`${new Set(records.map(r=>r.muscle)).size}<small>/ 8</small>`;
 const sorted=[...records].sort((a,b)=>byDate(a,b,true)).slice(0,5);
 document.querySelector('#recentList').innerHTML=sorted.map(r=>`<div class="recent-item"><div class="recent-icon">${h(r.muscle[0])}</div><div class="recent-main"><strong>${h(r.name)}</strong><small>${dateLabel(r.date)} · ${h(r.muscle)}${r.legacy?' · 旧记录':''}</small></div><div class="recent-load">${h(getLoad(r)||'—')}<small style="display:block;font-size:10px;color:#77899e;font-weight:400">${r.sets.some(s=>s.unit)?'':'单位待确认'}</small></div></div>`).join('')||'<div class="empty-state">尚无记录</div>';
 // 肌群分布按确切训练组数，不按照动作条目数。历史数据中未确定的组数不参与计数。
 const counts=MUSCLE_NAMES.map(m=>({name:m,count:records.filter(r=>r.muscle===m).reduce((sum,r)=>sum+(r.sets||[]).filter(set=>set&&set.verified===true).length,0)})).sort((a,b)=>b.count-a.count), max=Math.max(1,...counts.map(x=>x.count));
 document.querySelector('#distribution').innerHTML=counts.map(x=>`<div class="bar-line"><span>${x.name}</span><div class="bar-track"><div class="bar-fill" style="width:${x.count/max*100}%"></div></div><span class="bar-num">${x.count}</span></div>`).join('');
}

const EXERCISES_ROOT='https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main/';
let exerciseDatabase=null, gifError='', gifsLoading=null;
async function ensureGifs(){if(exerciseDatabase || gifError)return;if(gifsLoading)return gifsLoading;gifsLoading=(async()=>{try{const r=await fetch(EXERCISES_ROOT+'data/exercises.json');if(!r.ok)throw Error('HTTP '+r.status);const a=await r.json();if(!Array.isArray(a))throw Error('动作 JSON 格式不正确');exerciseDatabase=a;}catch(e){gifError=e.message||String(e);}finally{renderCatalogPreview();}})();return gifsLoading;}
function mediaUrl(path){if(!path)return '';if(/^https?:\/\//.test(path))return path;return EXERCISES_ROOT+String(path).replace(/^\.\//,'').replace(/^\//,'');}

let draftSets=[];
const blankSet=()=>({weight:'',reps:'',failureAt:'',formBreakAt:'',unit:'lb',duration:'',plus:false,verified:true});
function initFormFields(){document.querySelector('#trainMuscle').innerHTML=MUSCLE_NAMES.map(m=>`<option>${m}</option>`).join('');}
function renderSetRows(){
 // 逐组作为独立卡片：主要输入重量和重复次数，右侧保留动作质量监测。
 document.querySelector('#setRows').innerHTML=draftSets.map((s,i)=>`<div class="set-card" data-i="${i}">
  <div class="set-card-header"><strong>第 ${pad(i+1)} 组</strong><div class="set-card-head-actions">${i?`<button type="button" data-copy="${i}" title="复制上一组的重量和单位">沿用上一组</button>`:''}<button type="button" class="set-remove" data-del="${i}" title="移除此组">删除</button></div></div>
  <div class="set-fields">
    <div class="field"><label>重量</label><input type="number" min="0" step="0.1" inputmode="decimal" placeholder="例如 35" data-field="weight" value="${h(s.weight??'')}"></div>
    <div class="field"><label>重复次数</label><input type="number" min="1" max="999" step="${typeof s.reps==='number' && !Number.isInteger(s.reps)?'any':'1'}" placeholder="例如 10" data-field="reps" value="${h(s.reps??'')}"></div>
    <div class="field"><label>时长（秒，选填）</label><input type="number" min="1" data-field="duration" value="${h(s.duration??'')}"></div><div class="field optional"><label>第几次力竭 <small>选填</small></label><input type="number" min="1" max="999" step="1" placeholder="—" data-field="failureAt" value="${h(s.failureAt??'')}"></div>
    <div class="field optional"><label>第几次变形 <small>选填</small></label><input type="number" min="1" max="999" step="1" placeholder="—" data-field="formBreakAt" value="${h(s.formBreakAt??'')}"></div>
  </div>
  <div class="set-bottom"><label>重量单位 <select data-unit="${i}"><option value="lb" ${s.unit==='lb'?'selected':''}>lb</option><option value="kg" ${s.unit==='kg'?'selected':''}>kg</option><option value="片" ${s.unit==='片'?'selected':''}>片</option><option value="" ${!s.unit?'selected':''}>未标明</option></select></label><label><input type="checkbox" data-plus="${i}" ${s.plus?'checked':''}> 重量带 +</label>${s.verified===false?'<span style="color:#ffc290">旧重量，组数待确认</span>':''}</div>
  ${s.weightText||s.repsText||s.note?`<div class="history-set-note">${h([s.weightText&&!s.weight?`原记重量 ${s.weightText}`:'',s.repsText?`原记次数 ${s.repsText}`:'',s.note].filter(Boolean).join(' · '))}</div>`:''}
 </div>`).join('');
 document.querySelector('#setSummary').textContent=`${draftSets.length} 组 · 可逐组修改`;
}
const setRows=document.querySelector('#setRows');setRows.addEventListener('input',e=>{const row=e.target.closest('[data-i]');if(!row)return;const s=draftSets[+row.dataset.i];if(e.target.dataset.field!==undefined)s[e.target.dataset.field]=e.target.value;});setRows.addEventListener('change',e=>{if(e.target.dataset.unit!==undefined)draftSets[+e.target.dataset.unit].unit=e.target.value;if(e.target.dataset.plus!==undefined)draftSets[+e.target.dataset.plus].plus=e.target.checked;});setRows.addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(!b){const cp=e.target.closest('[data-copy]');if(cp){const i=+cp.dataset.copy;if(i>0){draftSets[i].weight=draftSets[i-1].weight;draftSets[i].weightText=draftSets[i-1].weightText;draftSets[i].unit=draftSets[i-1].unit;renderSetRows();}}return;}if(draftSets.length<=1)return toast('至少保留一组；未知信息可以留空',true);draftSets.splice(+b.dataset.del,1);renderSetRows();});
document.querySelector('#addSet').addEventListener('click',()=>{const prev=draftSets.at(-1);draftSets.push({...blankSet(),weight:prev?.weight??'',weightText:prev?.weightText,unit:prev?.unit??'lb'});renderSetRows();});
function openEditor(id=null,muscle=selectedRegion,name=''){
 const r=id?records.find(x=>x.id===id):null;editingId=r?r.id:null;document.getElementById('deleteRecord').hidden=!r;
 document.querySelector('#formTitle').textContent=r?'编辑训练记录':'记录一次训练';const dateInput=document.querySelector('#trainDate');dateInput.value=r?(r.date||''):today();dateInput.required=!(r&&!r.date);
 document.querySelector('#trainMuscle').value=r?.muscle||muscle;
 document.querySelector('#trainName').value=r?.name||name;
 const sourceName=document.querySelector('#trainSourceName');
 sourceName.hidden=!r?.sourceName||r.sourceName===r.name;
 sourceName.textContent=sourceName.hidden?'':`原记动作：${r.sourceName}`;
 document.querySelector('#trainNotes').value=r?.notes||'';
 draftSets=r?(r.sets||[]).map(s=>({...s,weight:s.weight??'',reps:s.reps??'',failureAt:s.failureAt??'',formBreakAt:s.formBreakAt??'',unit:s.unit||'',plus:!!s.plus,verified:s.verified!==false})): [blankSet()];
 renderSetRows();const names=[...new Set(records.filter(x=>x.recentV4===true).map(x=>x.name))];document.querySelector('#recentActions').innerHTML=names.map(n=>`<option value="${h(n)}"></option>`).join('');catalogMuscle=document.querySelector('#trainMuscle').value;catalogEquip='全部';renderCatalog();renderRecentActionChips();openOverlay('advancedOverlay');
}
document.querySelector('#cancelEdit').onclick=()=>{editingId=null;openEditor(null,document.querySelector('#trainMuscle').value);toast('表单已清空');};
document.querySelector('#trainingForm').addEventListener('submit',e=>{e.preventDefault();const name=document.querySelector('#trainName').value.trim(), date=document.querySelector('#trainDate').value,muscle=document.querySelector('#trainMuscle').value;const old=records.find(x=>x.id===editingId);
 if(!name||(!date&&(!old||old.date)))return toast('请填写训练日期和动作名称',true);
 const sets=draftSets.map(s=>({...s,duration:s.duration===''||s.duration==null?null:+s.duration,weight:s.weight===''?null:+s.weight,reps:s.reps===''?null:+s.reps,failureAt:s.failureAt===''?null:+s.failureAt,formBreakAt:s.formBreakAt===''?null:+s.formBreakAt,unit:s.unit||'',plus:!!s.plus,verified:s.verified!==false,
  weightText:s.weight===''?s.weightText:undefined,repsText:s.reps===''?s.repsText:undefined}));
 for(let i=0;i<sets.length;i++){const s=sets[i];if([s.weight,s.reps,s.duration,s.failureAt,s.formBreakAt].some(x=>x!==null&&(!Number.isFinite(x)||x<0)))return toast(`第 ${i+1} 组有无效数值`,true);if(s.duration!==null&&s.duration<=0)return toast(`第 ${i+1} 组时长须为正数`,true);if(!old&&s.reps===null&&s.duration===null)return toast(`第 ${i+1} 组请填写次数或时长`,true);if(s.reps!==null&&(s.reps<1||s.reps>999))return toast(`第 ${i+1} 组次数须在 1 至 999 之间`,true);if([s.failureAt,s.formBreakAt].some(x=>x!==null&&(!Number.isInteger(x)||x<1)))return toast(`第 ${i+1} 组力竭/变形次数须为正整数`,true);if(s.reps!==null&&((s.failureAt!==null&&s.failureAt>s.reps)||(s.formBreakAt!==null&&s.formBreakAt>s.reps)))return toast(`第 ${i+1} 组力竭/变形次数不能超过已完成次数`,true);}
 const item={...old,id:editingId||UID(),date:date||null,muscle,name,sets,legacy:!!old?.legacy && sets.every(s=>!s.verified),quickEntry:old?.quickEntry===true,recentV4:old?.recentV4===true||!editingId,notes:document.querySelector('#trainNotes').value.trim(),createdAt:old?.createdAt||Date.now()};
 if(old){records=records.map(x=>x.id===editingId?item:x);}else records.push(item);try{saveRecords();}catch{toast('浏览器空间不足，保存失败',true);return;}editingId=null;toast('训练已保存 · 已更新历史与日历');renderDashboard();renderHistory();renderCalendar();closeOverlay('advancedOverlay');refreshQuickHome();
});

/* ================== 模块 E：历史查询、编辑、删除、同单位趋势 ================== */
/* ================== 模块 E.1：可视化统计 ==================
   所有图均使用浏览器原生 SVG/CSS，无额外库；采用本地日期以免跨时区偏移。
   活跃日期及动作趋势只使用不晚于今天的已知日期。
   一周从周一开始，按真实训练日期去重统计训练天数。 */
const CHART_COLORS=['#8de4c8','#8aa9f4','#edba83','#cb9de3','#6dcdbd','#efa1b0','#90bacd','#c5d487'];
function datedRecords(){return records.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(String(r.date||''))&&r.date<=today());}
function chartMonday(d){const copy=new Date(d.getFullYear(),d.getMonth(),d.getDate(),12);copy.setDate(copy.getDate()-(copy.getDay()+6)%7);return copy;}
function fmtNum(n){return Number(n.toFixed(1)).toString();}
function isTrainingDay(day){return !!checkins[day]?.completed||records.some(r=>r.date===day&&(r.sets||[]).some(s=>s.verified!==false));}
function trainingDays(){return [...new Set([...records.filter(r=>(r.sets||[]).some(s=>s.verified!==false)).map(r=>r.date),...Object.keys(checkins).filter(d=>checkins[d]?.completed)])].filter(d=>d&&d<=today()).sort();}
function showFinishTraining(){
 const day=document.getElementById('quickDate').value||today(),items=records.filter(r=>r.date===day);const sets=items.flatMap(r=>(r.sets||[]).filter(s=>s.verified!==false));
 const volume={};for(const s of sets)if(Number.isFinite(s.weight)&&Number.isFinite(s.reps)&&!s.plus)volume[s.unit||'未标单位']=(volume[s.unit||'未标单位']||0)+s.weight*s.reps;
 let summary=document.getElementById('finishSummary');if(!summary){summary=document.createElement('p');summary.id='finishSummary';document.getElementById('quickPhotoForm').prepend(summary);}
 summary.textContent=`${dateLabel(day)} · ${new Set(items.map(r=>r.muscle+'|'+r.name)).size} 个动作 · ${sets.length} 组 · 总训练量 ${Object.entries(volume).map(([u,n])=>fmtNum(n)+' '+u+'×次').join(' / ')||'—'} · ${sets.filter(s=>s.pr).length} 个 PR`;
 document.getElementById('quickCheckinDialogTitle').textContent='结束训练';document.getElementById('quickSavePhoto').textContent='保存训练小结';openOverlay('quickCheckinOverlay');
}
function renderAnalytics(){
 const base=chartMonday(new Date());const activity=[];
 // “活跃日”同时包含训练日期和明确完成的打卡日期，避免打卡后图表不更新。
 // 同一天兼有训练与打卡只计一次，不改变独立的肌群分布统计。
 const dates=new Set([...datedRecords().map(r=>r.date),...Object.entries(checkins).filter(([d,c])=>d<=today()&&c?.completed).map(([d])=>d)]);
 const checkinDays=trainingDays().length;
 const pulse=document.querySelector('#historyCheckinPulse');if(pulse){const trainedToday=isTrainingDay(today());pulse.innerHTML=`<span class="history-sync-dot ${trainedToday?'complete':''}"></span>${trainedToday?'今天已训练':'今天未训练'}<span class="history-sync-sep">·</span>累计 ${checkinDays} 个训练日`;}

 for(let i=11;i>=0;i--){const monday=new Date(base);monday.setDate(base.getDate()-i*7);const end=new Date(monday);end.setDate(monday.getDate()+6);
  const start=localISO(monday),last=localISO(end),n=[...dates].filter(d=>d>=start&&d<=last).length;
  activity.push({start,end:last,count:n,label:`${monday.getMonth()+1}/${monday.getDate()}`});}
 const max=Math.max(1,...activity.map(x=>x.count));
 document.querySelector('#weeklyActivityChart').innerHTML=`<div class="weekly-columns">${activity.map((w,i)=>`<div class="weekly-col" title="${w.start} 至 ${w.end}：${w.count} 个活跃日"><div class="weekly-bar-area"><div class="weekly-track"><div class="weekly-fill" style="height:${Math.max(0,w.count/max*100)}%"></div></div></div><span class="weekly-tick">${i%2===0||i===11?h(w.label):''}</span></div>`).join('')}</div><div class="weekly-axis"><span>0</span><span>${max} 天 / 周（最高）</span></div>`;
 const counts=MUSCLE_NAMES.map(name=>({name,n:records.filter(r=>r.muscle===name).reduce((sum,r)=>sum+(r.sets||[]).filter(st=>st&&st.verified===true).length,0)})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n);
 const total=counts.reduce((n,x)=>n+x.n,0),fallback='conic-gradient(#2b3f50 0% 100%)';
 let acc=0;
 const segments=counts.map((x,i)=>{const from=acc;acc+=100*x.n/total;return `${CHART_COLORS[i%CHART_COLORS.length]} ${from.toFixed(2)}% ${acc.toFixed(2)}%`;});
 document.querySelector('#muscleOverviewChart').innerHTML=total?`<div class="muscle-donut" role="img" aria-label="已确认的肌群训练组数占比" style="background:conic-gradient(${segments.join(',')})"><div class="muscle-donut-hole"><span>${counts.length}<small>训练肌群</small></span></div></div><div class="muscle-legend">${counts.map((x,i)=>`<div class="muscle-legend-item" title="${h(x.name)}：${x.n} 条"><span class="muscle-legend-key"><i style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></i>${h(x.name)}</span><span>${Math.round(x.n/total*100)}%</span></div>`).join('')}</div>`:`<div class="empty-state">暂时没有已确认的训练组。</div>`;
}
/* ================== 模块 E.2：训练记录的三个查看入口 ================== */
let historyMode='date',historyDayLimit=20;
const historyExpandedDays=new Map();
const historyFilters={date:'',muscle:'',action:''};
const historyLabels={date:'日期',muscle:'肌群',action:'动作'};
const recordMuscle=record=>record.muscle||'未分类';
const recordAction=record=>record.name||'未命名动作';
const recordActionKey=record=>JSON.stringify([recordMuscle(record),recordAction(record)]);
const recordDateKey=record=>record.date||'unknown';
const historyKeys={date:recordDateKey,muscle:recordMuscle,action:recordActionKey};
function groupRecords(source,keyOf) {
 const buckets=new Map();
 for (const record of source) {
  const key=keyOf(record);
  if (!buckets.has(key)) buckets.set(key,[]);
  buckets.get(key).push(record);
 }
 return [...buckets];
}
function renderHistoryAction(action,showName) {
 // 重量参考无组号；每条已确认记录占用实际组序，重复组单独保留。
 let ordinal=0;
 const details=action.sets.map(({set,recordId,legacy})=>{
  const label=legacy?'重量参考':`第 ${pad(++ordinal)} 组`;
  const extras=[
   set.failureAt>0?`第 ${h(set.failureAt)} 次力竭`:'',
   set.formBreakAt>0?`第 ${h(set.formBreakAt)} 次变形`:'',
   h(set.note)
  ].filter(Boolean).join(' · ');
  return `<div class="history-set-row"><span class="history-set-num">${label}</span><strong>${quickSetText(set)}</strong>${extras?`<small>${extras}</small>`:''}<button type="button" data-edit="${h(recordId)}">编辑</button><button type="button" data-remove="${h(recordId)}" class="btn-danger">删除</button></div>`;
 }).join('');
 const notes=action.records.filter(record=>record.notes).map(record=>`<div class="history-set-note">${h(record.notes)}</div>`).join('');
 return `<div class="history-action-panel"><div class="history-action-title">${showName?`<strong>${h(action.name)}</strong>`:''}<span>${ordinal?`${ordinal} 组`:'组数未注明'}</span></div>${details||'<div class="history-set-note">暂无逐组数据</div>'}${notes}</div>`;
}
function renderHistoryDays(source,mode,sort) {
 const days=groupRecords(source,recordDateKey).sort(([a],[b])=>{
  if (a==='unknown') return 1;
  if (b==='unknown') return -1;
  return sort==='old'?a.localeCompare(b):b.localeCompare(a);
 });
 return days.slice(0,historyDayLimit).map(([date,items],dayIndex)=>{
  const title=date==='unknown'?'未注明日期':dateLabel(date);
  // 同一日内沿用动作记录的先后顺序，组序与趋势图一致。
  const groups=workoutGroupsForDate(date==='unknown'?null:date,[...items].sort((a,b)=>byDate(a,b,false)));
  const body=groups.map(group=>`<section class="history-muscle-section">${mode==='date'?
   `<header class="history-muscle-title"><span class="muscle-accent"></span><h3>${h(group.muscle)}</h3><small>${group.actions.length} 个动作</small></header>`:''}
   ${group.actions.map(action=>renderHistoryAction(action,mode!=='action')).join('')}</section>`).join('');
  const summary=items.reduce((n,r)=>n+(r.sets||[]).filter(s=>s.verified!==false).length,0);const muscles=[...new Set(items.map(recordMuscle))].join('、');const open=historyExpandedDays.get(date)??dayIndex<2;
  return `<details class="session-day ${date==='unknown'?'unknown-day':''}" data-history-day="${h(date)}" ${open?'open':''}><summary class="session-header"><span class="session-date">${h(title)}</span><span>${h(muscles)} · ${summary} 组</span></summary>${body}</details>`;
 }).join('');
}
function renderHistory() {
 const filter=document.querySelector('#historyFilter');
 const sort=document.querySelector('#historySort');
 const keyOf=historyKeys[historyMode];
 const buckets=groupRecords(records,keyOf);
 const labelFor=(key,items)=>historyMode==='date'?(key==='unknown'?'未注明日期':key)
  :historyMode==='muscle'?key:`${recordAction(items[0])} · ${recordMuscle(items[0])}`;
 const options=buckets.map(([key,items])=>[key,labelFor(key,items)]).sort(([a,labelA],[b,labelB])=>{
  if (historyMode==='date') return a==='unknown'?1:b==='unknown'?-1:b.localeCompare(a);
  return labelA.localeCompare(labelB,'zh');
 });
 let selected=historyFilters[historyMode];
 if (selected&&!options.some(([key])=>key===selected)) historyFilters[historyMode]=selected='';
 filter.innerHTML=`<option value="">全部${historyLabels[historyMode]}</option>`+options.map(([key,label])=>`<option value="${h(key)}">${h(label)}</option>`).join('');
 filter.value=selected;
 filter.setAttribute?.('aria-label',`筛选${historyLabels[historyMode]}`);
 sort.hidden=historyMode!=='date';
 for (const button of document.querySelectorAll('[data-history-mode]')) {
  button.setAttribute('aria-pressed',String(button.dataset.historyMode===historyMode));
 }
 const groups=selected?buckets.filter(([key])=>key===selected):buckets;
 const data=selected?(groups[0]?.[1]||[]):records;
 document.querySelector('#historyCount').textContent=`${data.length} 条记录`;
 let html;
 if (historyMode==='date') {
  html=renderHistoryDays(data,'date',sort.value);
 } else {
  const sorted=groups.map(([key,items])=>({key,items,label:labelFor(key,items)})).sort((a,b)=>a.label.localeCompare(b.label,'zh'));
  html=sorted.map(({key,items,label})=>`<section class="history-view-group" data-history-group="${historyMode}">
   <h3 class="${recordAction(items[0]).includes('待确认')?'needs-confirmation':''}">${h(historyMode==='action'?recordAction(items[0]):key)}${historyMode==='action'?`<small>${h(recordMuscle(items[0]))}</small>`:''}</h3>
   ${historyMode==='action'?`<button type="button" class="btn btn-small" data-rename-action="${h(recordAction(items[0]))}" data-rename-muscle="${h(recordMuscle(items[0]))}">重命名 / 合并到标准动作</button>`:''}${renderHistoryDays(items,historyMode,'new')}
  </section>`).join('');
 }
 if(new Set(data.map(recordDateKey)).size>historyDayLimit)html+='<button class="btn" id="loadMoreDays" type="button">加载更多训练日</button>';
 document.querySelector('#historyList').innerHTML=html||'<div class="empty-state">暂无训练记录</div>';
 renderAnalytics();
 renderTrend();
}
document.querySelector('#historyModes').addEventListener('click',event=>{
 const button=event.target.closest('[data-history-mode]');
 if (!button) return;
 historyMode=button.dataset.historyMode;
 renderHistory();
});
document.querySelector('#historyFilter').addEventListener('change',event=>{
 historyFilters[historyMode]=event.target.value;
 renderHistory();
});
document.querySelector('#historySort').addEventListener('change',renderHistory);
document.querySelector('#historyList').addEventListener('click',e=>{const edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');if(edit)openEditor(edit.dataset.edit);if(remove)removeTrainingRecord(remove.dataset.remove);});


/* ================== 模块 E.3：同动作的逐组趋势 ==================
   当前数据模型以日期为训练场次。同日同肌群同动作，按记录创建顺序及条目内组序拼接。
   旧版重量参考不占组序。每个序号在筛选单位、重量和次数之前确定，缺值只在该组留空。 */
const TREND_SETS=[
 {name:'第 1 组',color:'#91ead0',dash:''},
 {name:'第 2 组',color:'#a8b5ff',dash:'8 4'},
 {name:'第 3 组',color:'#ffd093',dash:'2 4'}
];
const TREND_METRICS={weight:'重量',reps:'次数',duration:'时长（秒）',volume:'训练量'};
const trendUnitName=unit=>unit||'未标单位';
const TREND_UNIT_ORDER=['kg','lb','片',''];
let selectedTrendAction='',selectedTrendUnit=null,trendPickerMuscle='全部';
let selectedTrendMetric='weight',selectedTrendRange='all',activeTrendData=null;
function trendRangeBounds(preset,startValue,endValue) {
 if (preset==='custom') {
  const end=endValue&&endValue<today()?endValue:today();
  if (startValue&&startValue>end) return {start:startValue,end,invalid:true};
  return {start:startValue,end};
 }
 if (preset==='all') return {start:'',end:today()};
 const today=new Date(today()+'T12:00:00');
 today.setDate(today.getDate()-Number(preset)+1);
 return {start:localISO(today),end:today()};
}
function hasConfirmedSets(record) {
 return !record.legacy&&(record.sets||[]).some(set=>set&&set.verified!==false);
}
function trendActionEntries() {
 return groupRecords(datedRecords(),recordActionKey).map(([key,items])=>{
  const name=recordAction(items[0]),muscle=recordMuscle(items[0]);
  const days=new Set(items.map(record=>record.date));
  const realDays=new Set(items.filter(hasConfirmedSets).map(record=>record.date));
  const aliases=items.map(record=>record.sourceName||'').join(' ');
  const english=CATALOG.find(item=>item.zh===name&&item.muscle===muscle)?.en||'';
  return {key,name,muscle,count:days.size,confirmedDays:realDays.size,search:`${name} ${muscle} ${aliases} ${english}`.toLowerCase()};
 }).sort((a,b)=>b.confirmedDays-a.confirmedDays||b.count-a.count||a.name.localeCompare(b.name,'zh'));
}
function renderTrendPicker() {
 const entries=trendActionEntries();
 const search=document.querySelector('#trendSearch').value.trim().toLowerCase();
 const muscles=['全部',...new Set(entries.map(item=>item.muscle))];
 if (!muscles.includes(trendPickerMuscle)) trendPickerMuscle='全部';
 document.querySelector('#trendMuscles').innerHTML=muscles.map(muscle=>
  `<button type="button" aria-pressed="${muscle===trendPickerMuscle}" class="${muscle===trendPickerMuscle?'active':''}" data-trend-muscle="${h(muscle)}">${h(muscle)}</button>`).join('');
 const matches=entries.filter(item=>(trendPickerMuscle==='全部'||item.muscle===trendPickerMuscle)&&item.search.includes(search));
 const selected=matches.find(item=>item.key===selectedTrendAction)||matches[0];
 if (selected) selectedTrendAction=selected.key;
 document.querySelector('#trendActionCount').textContent=`${matches.length} 项`;
 document.querySelector('#trendActionList').innerHTML=matches.map(item=>
  `<button type="button" class="trend-action ${item===selected?'selected':''}" aria-pressed="${item===selected}" data-trend-action="${h(item.key)}"><span class="trend-action-copy"><b>${h(item.name)}</b><small>${h(item.muscle)} · ${item.count} 个训练日</small></span><span class="trend-action-arrow" aria-hidden="true">›</span></button>`
 ).join('')||'<div class="empty-state">没有匹配的动作</div>';
 return selected;
}
function numericSetValue(value) {
 return value===undefined||value===null||value===''||!Number.isFinite(+value)?null:+value;
}
function trendSetValue(set,metric,unit) {
 if(metric==='duration')return numericSetValue(set.duration);
 if (!set) return null;
 const rawReps=numericSetValue(set.reps);
 const reps=rawReps!==null&&rawReps>0?rawReps:null;
 if (metric==='reps') return reps;
 const weight=numericSetValue(set.weight);
 if (weight===null||weight<0||set.plus||(set.unit||'')!==unit) return null;
 return metric==='volume'?(reps===null?null:weight*reps):weight;
}
function collectActionTrend(action,range,metric,preferredUnit) {
 const filtered=action&&!range.invalid?datedRecords().filter(record=>recordMuscle(record)===action.muscle&&recordAction(record)===action.name&&
   record.date>=range.start&&record.date<=range.end&&hasConfirmedSets(record)):[];
 const sorted=[...filtered].sort((a,b)=>byDate(a,b,false));
 const sessions=groupRecords(sorted,recordDateKey).map(([date,items])=>({
  date,sets:items.flatMap(record=>record.sets.filter(set=>set&&set.verified!==false))
 }));
 const allSets=sessions.flatMap(session=>session.sets);
 const units=[...new Set(allSets.filter(set=>numericSetValue(set.weight)!==null).map(set=>set.unit||''))];
 units.sort((a,b)=>TREND_UNIT_ORDER.indexOf(a)-TREND_UNIT_ORDER.indexOf(b));
 // 单位切换只影响重量/训练量。默认用最近有记录的单位，未标单位作为独立选项。
 const lastLoaded=allSets.findLast(set=>numericSetValue(set.weight)!==null&&!set.plus);
 const unit=units.includes(preferredUnit)?preferredUnit:(lastLoaded?(lastLoaded.unit||''):(units[0]||''));
 const series=TREND_SETS.map((style,index)=>({...style,values:sessions.map(session=>trendSetValue(session.sets[index],metric,unit))}));
 const eligibleLoads=allSets.map(set=>trendSetValue(set,'weight',unit)).filter(value=>value!==null);
 const recent=sessions.at(-1);
 const recentValues=(recent?.sets||[]).map(set=>trendSetValue(set,'volume',unit)).filter(value=>value!==null);
 return {dates:sessions.map(session=>session.date),series,units,unit,setCount:allSets.length,
  peak:eligibleLoads.length?Math.max(...eligibleLoads):null,
  lastVolume:{value:recentValues.length?recentValues.reduce((sum,value)=>sum+value,0):null,count:recentValues.length,total:recent?.sets.length||0}
 };
}
function trendSvg(data,unit,message) {
 const valid=data.series.flatMap(line=>line.values.filter(value=>value!==null));
 if (!valid.length) return `<div class="chart-empty"><span>${h(message)}</span></div>`;
 const W=720,H=264,L=51,R=25,T=19,B=39,plotW=W-L-R,plotH=H-T-B;
 // 使用 UTC 日序绘制纯日期，跨夏令时不影响等间距。
 const times=data.dates.map(date=>Date.parse(date+'T00:00:00Z'));
 const from=times[0],until=times.at(-1);
 const xs=times.map(time=>from===until?L+plotW/2:L+(time-from)/(until-from)*plotW);
 const peak=Math.max(1,...valid);
 const rawStep=peak*1.08/4,base=10**Math.floor(Math.log10(rawStep));
 const step=([1,2,2.5,5,10].find(value=>value*base>=rawStep)||10)*base;
 const yAt=value=>T+plotH-value/(4*step)*plotH;
 const grid=Array.from({length:5},(_,i)=>{
  const value=i*step,y=yAt(value);
  return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" class="trend-grid-line"/><text x="${L-9}" y="${y+4}" text-anchor="end">${fmtNum(value)}</text>`;
 }).join('');
 const dateY=H-11;
 const tickIndexes=new Set();
 const tickCount=Math.min(5,data.dates.length);
 for (let i=0;i<tickCount;i++) tickIndexes.add(tickCount===1?0:Math.round(i*(data.dates.length-1)/(tickCount-1)));
 let lastTickX=-Infinity;
 const ticks=[...tickIndexes].filter(index=>{
  if (index!==data.dates.length-1&&(xs[index]-lastTickX<44||xs.at(-1)-xs[index]<45)) return false;
  lastTickX=xs[index];return true;
 }).map(i=>`<text x="${xs[i]}" y="${dateY}" text-anchor="middle">${h(data.dates[i].slice(5).replace('-','/'))}</text>`).join('');
 let lines='',dots='';
 data.series.forEach((line,seriesIndex)=>{
  const segments=[];
  let points=[];
  line.values.forEach((value,i)=>{
   if (value===null) {
    if (points.length>1) segments.push(points);
    points=[];
    return;
   }
   const x=xs[i],y=yAt(value);
   points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
   // 外环、中环、实心点可在三组数值完全重合时同时辨认。
   const radius=[8,5,2.6][seriesIndex];
   const fill=seriesIndex===2?line.color:'#111b2a';
   dots+=`<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${line.color}" stroke-width="1.7"/>`;
  });
  if (points.length>1) segments.push(points);
  for (const segment of segments) {
   lines+=`<path data-line="${seriesIndex+1}" d="M${segment.join(' L')}" fill="none" stroke="${line.color}" stroke-width="${[3.7,2.8,2][seriesIndex]}" stroke-dasharray="${line.dash}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
 });
 const hotspots=xs.map((x,i)=>{
  if (data.series.every(line=>line.values[i]===null)) return '';
  const x0=i===0?L-12:(xs[i-1]+x)/2;
  const x1=i===xs.length-1?W-R+12:(x+xs[i+1])/2;
  const label=`${data.dates[i]} · ${data.series.map(line=>`${line.name} ${line.values[i]??'—'}`).join(' · ')} ${unit}`;
  return `<rect class="trend-hit" data-chart-date="${data.dates[i]}" data-point-index="${i}" x="${x0}" y="${T-9}" width="${x1-x0}" height="${plotH+20}" tabindex="0" role="button" aria-label="${h(label)}"><title>${h(label)}</title></rect>`;
 }).join('');
 return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="逐组${TREND_METRICS[selectedTrendMetric]}趋势"><g class="trend-axis">${grid}${ticks}</g>${lines}${dots}${hotspots}</svg>`;
}
function renderTrendReadout(index) {
 const host=document.querySelector('#trendReadout');
 if (!activeTrendData||index<0||!activeTrendData.dates[index]) {host.innerHTML='';return;}
 const {dates,series,suffix}=activeTrendData;
 host.innerHTML=`<time datetime="${dates[index]}">${dates[index]}</time>`+
  series.map(line=>`<span><i style="--set-color:${line.color}"></i>${line.name}<b>${line.values[index]===null?'—':h(fmtNum(line.values[index])+(suffix?' '+suffix:''))}</b></span>`).join('');
}
function renderTrendInsights(data) {
 const unit=data.unit;
 const cards=[
  ['训练天数',data.dates.length,'天',''],
  ['完成组数',data.setCount,'组','含第 4 组及以后'],
  ['区间最高重量',data.peak,trendUnitName(unit),''],
  ['最近单日训练量',data.lastVolume.value,unit?`${unit}·次`:'',data.lastVolume.total?`计入 ${data.lastVolume.count}/${data.lastVolume.total} 组 · 重量×次数`:'重量×次数']
 ];
 document.querySelector('#trendInsights').innerHTML=cards.map(([label,value,suffix,detail])=>
  `<div class="trend-insight"><div class="trend-insight-label">${label}</div><div class="trend-insight-value">${value===null?'—':fmtNum(value)}${value!==null&&suffix?`<small>${h(suffix)}</small>`:''}</div>${detail?`<div class="trend-insight-detail">${detail}</div>`:''}</div>`
 ).join('');
}
function renderTrend() {
 const selected=renderTrendPicker();
 const startInput=document.querySelector('#trendStart'),endInput=document.querySelector('#trendEnd');
 startInput.max=today();endInput.max=today();
 document.querySelector('#trendCustomRange').hidden=selectedTrendRange!=='custom';
 const range=trendRangeBounds(selectedTrendRange,startInput.value,endInput.value);
 const data=collectActionTrend(selected,range,selectedTrendMetric,selectedTrendUnit);
 const unitSelect=document.querySelector('#trendUnits');
 unitSelect.innerHTML=data.units.map(unit=>`<option value="${h(unit)}">${h(trendUnitName(unit))}</option>`).join('');
 unitSelect.value=data.unit;
 unitSelect.hidden=selectedTrendMetric==='reps'||data.units.length<2;
 const metric=selectedTrendMetric,suffix=metric==='reps'?'次':metric==='volume'?(data.unit?`${data.unit}·次`:''):data.unit;
 const axisUnit=suffix||trendUnitName(data.unit);
 const title=document.querySelector('#trendChartTitle');
 title.textContent=selected?selected.name:'选择一个动作';
 document.querySelector('#trendChartMetric').textContent=`${TREND_METRICS[metric]}${metric==='reps'?'（次）':`（${axisUnit}）`}`;
 document.querySelector('#trendLegend').innerHTML=TREND_SETS.map((line,index)=>
  `<span class="trend-series-${index+1}"><i style="--set-color:${line.color}"></i>${line.name}</span>`).join('');
 const missing=range.invalid?'开始日期应早于或等于结束日期':!selected?'请选择一个动作':
  data.dates.length?`所选${TREND_METRICS[metric]}暂无可比较记录`:'所选时间内暂无逐组记录';
 document.querySelector('#trendChart').innerHTML=trendSvg(data,axisUnit,missing);
 activeTrendData={...data,suffix};
 const last=data.dates.findLastIndex((_,index)=>data.series.some(line=>line.values[index]!==null));
 renderTrendReadout(last);
 renderTrendInsights(data);
 const rangeSelect=document.querySelector('#trendRange');rangeSelect.value=selectedTrendRange;
 for (const button of document.querySelectorAll('[data-trend-metric]')) {
  button.setAttribute('aria-pressed',String(button.dataset.trendMetric===metric));
 }
}
const trendChart=document.querySelector('#trendChart');
function trendPoint(event) {return event.target.closest('[data-chart-date]');}
function showTrendDay(point) {
 historyMode='date';
 historyFilters.date=point.dataset.chartDate;
 renderHistory();
 document.querySelector('#historyDetailTitle').focus({preventScroll:true});
 document.querySelector('.history-redesign').scrollIntoView?.({behavior:'smooth',block:'start'});
}
trendChart.addEventListener('pointerover',event=>{
 const point=trendPoint(event);if (point) renderTrendReadout(Number(point.dataset.pointIndex));
});
trendChart.addEventListener('focusin',event=>{
 const point=trendPoint(event);if (point) renderTrendReadout(Number(point.dataset.pointIndex));
});
trendChart.addEventListener('click',event=>{
 const point=trendPoint(event);if (point) showTrendDay(point);
});
trendChart.addEventListener('keydown',event=>{
 const point=trendPoint(event);
 if (point&&(event.key==='Enter'||event.key===' ')) {event.preventDefault();showTrendDay(point);}
});
document.querySelector('#trendMuscles').addEventListener('click',event=>{
 const button=event.target.closest('[data-trend-muscle]');
 if (button) {trendPickerMuscle=button.dataset.trendMuscle;renderTrend();}
});
document.querySelector('#trendActionList').addEventListener('click',event=>{
 const button=event.target.closest('[data-trend-action]');
 if (button) {selectedTrendAction=button.dataset.trendAction;selectedTrendUnit=null;renderTrend();}
});
document.querySelector('#trendMetrics').addEventListener('click',event=>{
 const button=event.target.closest('[data-trend-metric]');
 if (button) {selectedTrendMetric=button.dataset.trendMetric;renderTrend();}
});
document.querySelector('#trendRange').addEventListener('change',event=>{selectedTrendRange=event.target.value;renderTrend();});
document.querySelector('#trendUnits').addEventListener('change',event=>{selectedTrendUnit=event.target.value;renderTrend();});
for (const id of ['trendStart','trendEnd']) document.getElementById(id).addEventListener('change',renderTrend);
document.querySelector('#trendSearch').addEventListener('input',renderTrend);

/* ================== 模块 F：IndexedDB 照片管理 / 本地日历打卡 ================== */
const DB_NAME='motionlog_images_v1',PHOTO_STORE='photos';let dbPromise=null;
function openImageDB(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(PHOTO_STORE))req.result.createObjectStore(PHOTO_STORE);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return dbPromise;}
async function imagePut(id,file){const db=await openImageDB();return new Promise((resolve,reject)=>{const tx=db.transaction(PHOTO_STORE,'readwrite');tx.objectStore(PHOTO_STORE).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
async function imageGet(id){const db=await openImageDB();return new Promise((resolve,reject)=>{const req=db.transaction(PHOTO_STORE,'readonly').objectStore(PHOTO_STORE).get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function imageDelete(id){const db=await openImageDB();return new Promise((resolve,reject)=>{const tx=db.transaction(PHOTO_STORE,'readwrite');tx.objectStore(PHOTO_STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
let activeDay=today(),calMonth=new Date(Number(today().slice(0,4)),Number(today().slice(5,7))-1,1),incomingPhotos=[];let draftPhotoUrls=[],savedPhotoUrls=[],dayRenderIndex=0;
// 临时上传预览和已经保存的照片分开管理 URL，切换日期时清理资源避免内存泄漏。
function makePhotoURL(blob,collection=draftPhotoUrls){const url=URL.createObjectURL(blob);collection.push(url);return url;}
function releasePhotos(){draftPhotoUrls.forEach(url=>URL.revokeObjectURL(url));draftPhotoUrls=[];}
function releaseSavedPhotos(){savedPhotoUrls.forEach(url=>URL.revokeObjectURL(url));savedPhotoUrls=[];}
function chooseDay(day){activeDay=day;document.querySelector('#checkinDate').value=day;document.querySelector('#checkinTitle').textContent=`${day.slice(5).replace('-',' 月 ')} 日 · 打卡`;renderCalendar();renderDayDetails();}
function renderCalendar(){
 document.querySelector('#monthLabel').textContent=`${calMonth.getFullYear()} 年 ${calMonth.getMonth()+1} 月`;
 const start=calMonth.getDay(),length=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,0).getDate();let markup='';
 const monthPrefix=`${calMonth.getFullYear()}-${pad(calMonth.getMonth()+1)}`;
 const monthlyRecords=records.filter(r=>r.date?.startsWith(monthPrefix));
 const dayCount=new Set([...monthlyRecords.map(r=>r.date),...Object.keys(checkins).filter(d=>d.startsWith(monthPrefix)&&checkins[d]?.completed)]).size;
 const photoDays=Object.entries(checkins).filter(([d,c])=>d.startsWith(monthPrefix)&&(c.photos||[]).length).length;
 document.querySelector('#checkinStats').innerHTML=`<div class="checkin-metric"><b>${dayCount}</b><small>本月活跃日</small></div><div class="checkin-metric"><b>${monthlyRecords.reduce((n,r)=>n+(r.sets||[]).filter(st=>st&&st.verified===true).length,0)}</b><small>确认训练组数</small></div><div class="checkin-metric"><b>${photoDays}</b><small>有照片的日期</small></div>`;
 for(let k=0;k<Math.ceil((start+length)/7)*7;k++){
  const day=k-start+1;if(day<1||day>length){markup+='<span class="cal-day muted" aria-hidden="true"></span>';continue;}
  const date=`${monthPrefix}-${pad(day)}`,cnt=monthlyRecords.filter(r=>r.date===date).length,ch=checkins[date],checked=isTrainingDay(date),photos=(ch?.photos||[]).length;
  const daySets=monthlyRecords.filter(r=>r.date===date).reduce((n,r)=>n+(r.sets||[]).filter(st=>st&&st.verified===true).length,0);
  const level=daySets>=5?3:daySets>=2?2:cnt||checked?1:0;
  markup+=`<button type="button" data-day="${date}" class="cal-day level-${level} ${date===today()?'today':''} ${date===activeDay?'selected':''}" title="${date}：${cnt} 项动作${checked?' · 已打卡':''}${photos?' · '+photos+' 张照片':''}"><span class="cal-number">${day}</span><span class="cal-day-flags">${checked?'<span class="cal-check" aria-label="已打卡">✓</span>':''}${photos?'<span class="cal-photo" aria-label="有照片">▣</span>':''}</span><span class="cal-day-bottom">${daySets?`<span class="cal-count">${daySets} 组</span>`:(cnt?`<span class="cal-count">有记录</span>`:'')}</span></button>`;
 }
 document.querySelector('#calendarDays').innerHTML=markup;renderDayDetails();
}
document.querySelector('#calendarDays').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b)chooseDay(b.dataset.day);});
for(const [id,offset] of [['prevMonth',-1],['nextMonth',1]])document.querySelector('#'+id).addEventListener('click',()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+offset,1);renderCalendar();});
document.querySelector('#checkinDate').addEventListener('change',e=>{if(!e.target.value)return;const d=e.target.value;calMonth=new Date(+d.slice(0,4),+d.slice(5,7)-1,1);chooseDay(d);});
document.querySelector('#checkinPhotos').addEventListener('change',e=>{for(const file of [...e.target.files]){if(!file.type.startsWith('image/')){toast('只能上传图片格式',true);continue;}if(file.size>12*1024*1024){toast('单张图片不得超过 12 MB',true);continue;}incomingPhotos.push(file);}e.target.value='';renderIncomingPhotos();});
function renderIncomingPhotos(){releasePhotos();document.querySelector('#selectedPhotos').innerHTML=incomingPhotos.map((f,i)=>`<div class="photo-wrap"><img src="${makePhotoURL(f)}" alt="待上传图片 ${i+1}"><button type="button" data-dropincoming="${i}" aria-label="移除此图片">×</button></div>`).join('');}
document.querySelector('#selectedPhotos').addEventListener('click',e=>{const b=e.target.closest('[data-dropincoming]');if(b){incomingPhotos.splice(+b.dataset.dropincoming,1);renderIncomingPhotos();}});
document.querySelector('#checkinForm').addEventListener('submit',async e=>{e.preventDefault();const date=document.querySelector('#checkinDate').value;const text=document.querySelector('#checkinNote').value.trim();if(!date)return toast('请选择日期',true);// 允许只点击按钮完成打卡；感受与图片均为可选内容。
 const old=checkins[date]||{notes:[],photos:[]};const stored=[];try{for(const file of incomingPhotos){const id=UID();await imagePut(id,file);stored.push(id);}}catch(err){for(const id of stored)await imageDelete(id).catch(()=>{});return toast('照片保存失败；请检查浏览器是否允许 IndexedDB',true);}
 checkins[date]={completed:true,notes:[...(old.notes||[]),...(text?[{id:UID(),text,time:Date.now()}]:[])],photos:[...(old.photos||[]),...stored]};try{saveCheckins();}catch{return toast('打卡保存失败，可能是存储空间不足',true);}incomingPhotos=[];document.querySelector('#checkinNote').value='';renderIncomingPhotos();syncTrainingViews();if(!old.completed)celebrateCheckin();toast('打卡成功');});
async function renderDayDetails(){const requestIndex=++dayRenderIndex;releaseSavedPhotos();const day=activeDay,host=document.querySelector('#dayDetails');const r=records.filter(x=>x.date===day),ch=checkins[day]||{notes:[],photos:[]};let txt=(ch.completed?'<div class="checkin-item"><b style="color:var(--mint)">✓ 当日已打卡</b> <button class="btn btn-small btn-ghost" data-undo-checkin style="margin-left:12px">撤销打卡</button></div>':'')+workoutGroupsForDate(day).map(group=>`<div class="checkin-item day-calendar-muscle"><b>${h(group.muscle)}</b>${group.actions.map(action=>`<div class="day-calendar-action"><strong>${h(action.name)}</strong>${action.sets.map((part,i)=>`<div class="day-calendar-set"><small>${part.legacy?'重量参考':`第 ${pad(action.sets.slice(0,i+1).filter(x=>!x.legacy).length)} 组`}</small><span>${quickSetText(part.set)}</span></div>`).join('')}</div>`).join('')}</div>`).join('')+(ch.notes||[]).map(n=>`<div class="checkin-item"><small>${new Date(n.time).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</small><p>${h(n.text)}</p><button class="btn btn-small btn-danger" data-del-note="${h(n.id)}">删除这条感受</button></div>`).join('');txt+=`<div class="photo-grid" id="storedPhotoGrid"></div>`;host.innerHTML=txt||'<div class="subtle" style="font-size:12px">这天还没有记录。</div>';if(!r.length&&!ch.notes?.length&&!ch.photos?.length&&!ch.completed)host.innerHTML='<div class="subtle" style="font-size:12px">这天还没有记录。</div>';
 const grid=document.querySelector('#storedPhotoGrid');if(!grid)return;const photos=[];
 for(const id of (ch.photos||[])){try{const photo=await imageGet(id);if(photo)photos.push({id,photo});}catch{}}
 // IndexedDB 是异步的；旧请求结束时不能覆盖新选中日期的内容。
 if(day!==activeDay||requestIndex!==dayRenderIndex)return;
 grid.innerHTML=photos.map(({id,photo})=>`<div class="photo-wrap"><img src="${makePhotoURL(photo,savedPhotoUrls)}" alt="当天打卡照片"><button type="button" data-del-photo="${h(id)}" aria-label="删除照片">×</button></div>`).join('');}
document.querySelector('#dayDetails').addEventListener('click',async e=>{const note=e.target.closest('[data-del-note]'),photo=e.target.closest('[data-del-photo]'),undo=e.target.closest('[data-undo-checkin]');if(!note&&!photo&&!undo)return;if(!confirm('删除这项打卡内容？'))return;const ch=checkins[activeDay];if(!ch)return;if(undo)ch.completed=false;if(note)ch.notes=ch.notes.filter(x=>x.id!==note.dataset.delNote);if(photo){await imageDelete(photo.dataset.delPhoto).catch(()=>{});ch.photos=ch.photos.filter(x=>x!==photo.dataset.delPhoto);}if(!ch.notes.length&&!ch.photos.length&&!ch.completed)delete checkins[activeDay];saveCheckins();syncTrainingViews();});

/* ================== 模块 G：完整备份（包含图片）与恢复 ================== */
function blobAsDataURL(blob){return new Promise((resolve,reject)=>{const rd=new FileReader();rd.onload=()=>resolve(rd.result);rd.onerror=reject;rd.readAsDataURL(blob);});}
async function exportData(){const b=document.querySelector('#exportBtn');b.disabled=true;b.textContent='正在准备备份…';try{const photoIds=[...new Set(Object.values(checkins).flatMap(ch=>ch.photos||[]))],images={};for(const id of photoIds){try{const blob=await imageGet(id);if(blob)images[id]=await blobAsDataURL(blob);}catch{}}
 const payload={app:'MotionLog',version:1,exportedAt:new Date().toISOString(),records,checkins,images,gifBindings};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`motionlog-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('已生成完整 JSON 备份');}catch(e){toast('备份失败：'+e.message,true);}finally{b.disabled=false;b.textContent='导出备份';}}
document.querySelector('#exportBtn').onclick=exportData;document.querySelector('#importBtn').onclick=()=>document.querySelector('#importFile').click();

function dataURLtoBlob(url){const [header,base64]=url.split(',');const type=header.match(/data:(.*?);base64/)?.[1]||'application/octet-stream';const raw=atob(base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type});}
document.querySelector('#importFile').addEventListener('change',async e=>{
 const file=e.target.files[0];
 e.target.value='';
 if (!file) return;
 try {
  const backup=JSON.parse(await file.text());
  if (backup.app!=='MotionLog'||backup.version!==1||!Array.isArray(backup.records)||!backup.checkins||typeof backup.checkins!=='object') {
   throw Error('不是有效的 MotionLog v1 备份');
  }
  if (!confirm(`从备份恢复 ${backup.records.length} 条训练记录？将覆盖当前训练与打卡记录。`)) return;
  // 旧备份缺少补录标记，恢复前先合并。新版备份已记录本批导入状态，可保留用户的后续增删。
  
  for (const [id,src] of Object.entries(backup.images||{})) {
   if (typeof src==='string'&&src.startsWith('data:')) await imagePut(id,dataURLtoBlob(src));
  }
  records=backup.records;
  checkins=backup.checkins;
  saveRecords();
  saveCheckins();
  
  if (backup.gifBindings&&typeof backup.gifBindings==='object'&&!Array.isArray(backup.gifBindings)) {
   gifBindings=backup.gifBindings;
   localStorage.setItem(GIF_BINDINGS_KEY,JSON.stringify(gifBindings));
   renderCatalogPreview();
  }
  syncTrainingViews();
  toast('备份已恢复');
 } catch (err) {
  toast('导入失败：'+err.message,true);
 }
});

/* ================== 模块 I：本地中英双语常见动作选择器 ==================
   此列表是标准动作中文/英文对照，不依赖 GIF 库的连通性。
   请注意用户的原始口语动作名称（如“背拉”“侧提”）存在歧义，不做不可靠的自动替换。
   在线演示仅在能够可靠找到对应英文动作时展示，避免错误 GIF。 */
const ACTION_GROUPS={
 '背部':[
  ['高位下拉','Lat Pulldown','器械'],['窄握高位下拉','Close-Grip Lat Pulldown','器械'],['坐姿划船','Seated Cable Row','绳索'],['坐姿器械划船','Seated Machine Row','器械'],['单臂器械划船','Single-Arm Machine Row','器械'],['单臂哑铃划船','One-Arm Dumbbell Row','哑铃'],['俯身哑铃划船','Bent-Over Dumbbell Row','哑铃'],['胸托哑铃划船','Chest-Supported Dumbbell Row','训练凳'],['杠铃俯身划船','Barbell Bent-Over Row','杠铃'],['T 杠划船','T-Bar Row','器械'],['直臂下压','Straight-Arm Pulldown','绳索'],['辅助引体向上','Assisted Pull-Up','器械'],['引体向上','Pull-Up','自重'],['哑铃耸肩','Dumbbell Shrug','哑铃']],
 '胸部':[
  ['器械推胸','Machine Chest Press','器械'],['平板哑铃卧推','Dumbbell Bench Press','训练凳'],['上斜哑铃卧推','Incline Dumbbell Bench Press','训练凳'],['平板杠铃卧推','Barbell Bench Press','杠铃'],['上斜杠铃卧推','Incline Barbell Bench Press','杠铃'],['坐姿夹胸','Pec Deck Fly','器械'],['哑铃飞鸟','Dumbbell Chest Fly','训练凳'],['上斜哑铃飞鸟','Incline Dumbbell Fly','训练凳'],['绳索夹胸','Cable Chest Fly','绳索'],['史密斯卧推','Smith Machine Bench Press','器械'],['俯卧撑','Push-Up','自重'],['双杠臂屈伸','Chest Dip','自重']],
 '肩部':[
  ['哑铃侧平举','Dumbbell Lateral Raise','哑铃'],['哑铃前平举','Dumbbell Front Raise','哑铃'],['哑铃肩推','Dumbbell Shoulder Press','哑铃'],['器械肩推','Machine Shoulder Press','器械'],['器械侧平举','Machine Lateral Raise','器械'],['哑铃反向飞鸟','Dumbbell Reverse Fly','哑铃'],['反向蝴蝶机飞鸟','Reverse Pec Deck Fly','器械'],['绳索侧平举','Cable Lateral Raise','绳索'],['绳索面拉','Cable Face Pull','绳索'],['阿诺德推举','Arnold Press','哑铃'],['杠铃推举','Barbell Overhead Press','杠铃'],['俯身侧平举','Bent-Over Lateral Raise','哑铃']],
 '二头肌':[
  ['哑铃弯举','Dumbbell Biceps Curl','哑铃'],['哑铃锤式弯举','Hammer Curl','哑铃'],['单臂哑铃弯举','Single-Arm Dumbbell Curl','哑铃'],['斜板哑铃弯举','Incline Dumbbell Curl','训练凳'],['牧师凳弯举','Preacher Curl','训练凳'],['集中弯举','Concentration Curl','哑铃'],['器械弯举','Machine Biceps Curl','器械'],['绳索弯举','Cable Biceps Curl','绳索'],['绳索锤式弯举','Cable Rope Hammer Curl','绳索'],['杠铃弯举','Barbell Biceps Curl','杠铃'],['EZ 杆弯举','EZ-Bar Curl','杠铃'],['反握弯举','Reverse Curl','哑铃']],
 '三头肌':[
  ['绳索下压','Rope Triceps Pushdown','绳索'],['直杆下压','Straight-Bar Triceps Pushdown','绳索'],['反手绳索下压','Reverse-Grip Cable Pushdown','绳索'],['单臂绳索下压','Single-Arm Cable Pushdown','绳索'],['绳索过顶屈伸','Cable Overhead Triceps Extension','绳索'],['哑铃过顶屈伸','Dumbbell Overhead Triceps Extension','哑铃'],['单臂哑铃颈后屈伸','Single-Arm Overhead Triceps Extension','哑铃'],['哑铃臂后伸','Dumbbell Triceps Kickback','哑铃'],['仰卧三头臂屈伸','Lying Triceps Extension','训练凳'],['窄距卧推','Close-Grip Bench Press','杠铃'],['辅助双杠臂屈伸','Assisted Dip','器械']],
 '腹部':[
  ['器械卷腹','Machine Abdominal Crunch','器械'],['绳索卷腹','Cable Crunch','绳索'],['卷腹','Abdominal Crunch','自重'],['反向卷腹','Reverse Crunch','自重'],['仰卧起坐','Sit-Up','自重'],['平板支撑','Plank','自重'],['侧平板支撑','Side Plank','自重'],['悬垂举腿','Hanging Leg Raise','自重'],['仰卧举腿','Lying Leg Raise','训练凳'],['腹肌轮','Ab Wheel Rollout','自重'],['俄罗斯转体','Russian Twist','自重'],['死虫式','Dead Bug','自重']],
 '腿部':[
  ['腿举','Leg Press','器械'],['哈克深蹲','Hack Squat','器械'],['坐姿腿屈伸','Leg Extension','器械'],['坐姿腿弯举','Seated Leg Curl','器械'],['俯卧腿弯举','Lying Leg Curl','器械'],['史密斯深蹲','Smith Machine Squat','器械'],['杠铃深蹲','Barbell Back Squat','杠铃'],['哑铃杯式深蹲','Goblet Squat','哑铃'],['哑铃弓步蹲','Dumbbell Lunge','哑铃'],['保加利亚分腿蹲','Bulgarian Split Squat','训练凳'],['罗马尼亚硬拉','Romanian Deadlift','杠铃'],['臀桥','Glute Bridge','自重'],['臀推','Hip Thrust','训练凳'],['髋外展器械','Hip Abduction Machine','器械']],
 '小腿':[
  ['站姿提踵','Standing Calf Raise','器械'],['坐姿提踵','Seated Calf Raise','器械'],['腿举机提踵','Leg Press Calf Raise','器械'],['哑铃提踵','Dumbbell Calf Raise','哑铃'],['单腿提踵','Single-Leg Calf Raise','自重']]
};
const CATALOG=Object.entries(ACTION_GROUPS).flatMap(([muscle,items])=>items.map(([zh,en,equipment])=>({muscle,zh,en,equipment})));
let catalogMuscle='背部',catalogEquip='全部',catalogSelected=null,renameActionSource=null;
const EQ_OPTIONS=['全部','器械','哑铃','训练凳','绳索','杠铃','自重'];
function renderRecentActionChips(){
 // 从本版本开始新保存的训练才加入快捷入口；旧记录只在历史页展示。
 const fresh=records.filter(r=>r.recentV4===true && !r.legacy)
  .sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));
 const seen=new Set();const names=[];
 for(const r of fresh){const key=r.muscle+'|'+r.name;if(!seen.has(key)){seen.add(key);names.push(r.name);}if(names.length>=5)break;}
 document.querySelector('#recentActionsRow').hidden=!names.length;
 document.querySelector('#recentActionChips').innerHTML=names.map(n=>`<button type="button" class="quick-chip" data-recent="${h(n)}">${h(n)}</button>`).join('');
}
function renderCatalog(){
 document.querySelector('#catalogMuscles').innerHTML=MUSCLE_NAMES.map(m=>`<button type="button" class="${catalogMuscle===m?'active':''}" data-catmuscle="${m}">${m}</button>`).join('');
 document.querySelector('#catalogEquipment').innerHTML=EQ_OPTIONS.map(eq=>`<button type="button" class="${catalogEquip===eq?'active':''}" data-catequip="${eq}">${eq}</button>`).join('');
 const q=document.querySelector('#catalogSearch').value.trim().toLowerCase();
 const results=CATALOG.filter(x=>(!q?x.muscle===catalogMuscle:true)&&(catalogEquip==='全部'||x.equipment===catalogEquip)&&(!q||(x.zh+' '+x.en+' '+x.muscle+' '+x.equipment).toLowerCase().includes(q))).slice(0,50);
 document.querySelector('#libraryCount').textContent=`${results.length} 个动作`;
 document.querySelector('#catalogList').innerHTML=results.length?results.map((a,i)=>`<button type="button" class="catalog-action ${catalogSelected?.zh===a.zh?'selected':''}" data-action="${h(a.zh)}"><span class="catalog-index">${pad(i+1)}</span><span class="catalog-copy"><b>${h(a.zh)}</b><small>${h(a.en)} · ${h(a.equipment)}</small></span><span class="catalog-arrow">＋</span></button>`).join(''):'<div class="empty-state">没有匹配动作。你仍可直接在左侧输入名称。</div>';
}
/* ================== 模块 I.1：动作演示的语义安全匹配 ==================
   以前的规则会按照共同关键词打分，只要达到一个很低的阈值就显示 GIF。
   例如“坐姿划船”与“坐姿高位下拉”可能同时含有 seated、cable、back，
   所以出现了“选择划船，却播放下拉动作”的错误。

   新规则：
   1. 以动作核心类别为硬约束：row / pulldown / press 等绝不能互相替代；
   2. 以器械和姿势修饰词为硬约束，拒绝关键修饰词缺失/冲突；
   3. 允许英文名称的词序变化，例如 Seated Cable Row 与 Cable Seated Row；
   4. 未找到可靠对应素材则不显示 GIF，不猜测；
   5. 用户可以手动浏览同类 GIF 并保存明确选择，优先级高于自动匹配。
   外部图库只用于显示动作，不影响训练历史和记录。 */
const GIF_BINDINGS_KEY='motionlog_gif_bindings_v1';
let gifBindings=readJSON(GIF_BINDINGS_KEY,{});
if(!gifBindings||typeof gifBindings!=='object'||Array.isArray(gifBindings))gifBindings={};
let choosingCatalogGif=false;

/* 对英文表达做统一化处理，避免词序、连字符、单复数造成误判。 */
function gymTokens(value){
 let s=String(value||'').toLowerCase()
  .replace(/\b(one|single)[\s-]*arm\b/g,' singlearm ')
  .replace(/\b(one|single)[\s-]*leg\b/g,' singleleg ')
  .replace(/\bpull[\s-]*downs?\b/g,' pulldown ')
  .replace(/\bpull[\s-]*ups?\b/g,' pullup ')
  .replace(/\bpush[\s-]*downs?\b/g,' pushdown ')
  .replace(/\bpush[\s-]*ups?\b/g,' pushup ')
  .replace(/\btricep\b/g,' triceps ')
  .replace(/\bbicep\b/g,' biceps ')
  .replace(/\bleverage\b/g,' machine ')
  .replace(/\bdumb[\s-]*bells?\b/g,' dumbbell ')
  .replace(/\bbar[\s-]*bells?\b/g,' barbell ')
  .replace(/\brows?\b/g,' row ')
  .replace(/\bcurls?\b/g,' curl ')
  .replace(/\bflies\b|\bflyes\b/g,' fly ')
  .replace(/\braises\b/g,' raise ')
  .replace(/\bpresses\b/g,' press ')
  .replace(/\bcables\b/g,' cable ')
  .replace(/\bsupported\b/g,' supported ')
  .replace(/[^a-z0-9]+/g,' ').trim();
 return s?s.split(/\s+/):[];
}
function gymFamily(value){
 const t=new Set(gymTokens(value));
 // 重要：必须先匹配具有明确动作方向的类别，再匹配通用的 press/raise。
 for(const kind of ['row','pulldown','pullup','pushdown','pushup','fly','curl','press',
  'extension','squat','deadlift','lunge','crunch','plank','raise','dip','shrug',
  'thrust','bridge','wheel','twist','rollout']){
  if(t.has(kind))return kind;
 }
 return null;
}
/* 不能把动作变式当作同一个动作，例如单臂/双臂、上斜/平板、反握/正握。 */
const GYM_SPECIFIERS=new Set([
 'seated','standing','incline','decline','flat','lying','reverse','close','wide','narrow',
 'singlearm','singleleg','overhead','underhand','overhand','neutral','hammer','front',
 'lateral','rear','straight','bent','assisted','smith','machine','cable','dumbbell',
 'barbell','band','bench','rope','preacher','chest','supported','high','low','hip',
 'leg','lat','shoulder','biceps','triceps','tbar','kneeling','alternating','alternate'
]);
const GYM_SAFE_EXTRAS=new Set(['machine','cable','bench','weight','exercise']);
function gymEquipmentOK(action,ex){
 const wanted=gymTokens(action.en),actual=gymTokens(`${ex.name||''} ${ex.equipment||''}`);
 const actualSet=new Set(actual);
 // 英文名称明确写出的器械，必须真的存在于素材名称或 equipment 元信息中。
 for(const t of ['cable','dumbbell','barbell','smith','rope','band']){
  if(wanted.includes(t)&&!actualSet.has(t))return false;
 }
 if(wanted.includes('machine')&&!actualSet.has('machine')&&!actualSet.has('lever'))return false;
 // 没有明确包含“弹力带”的动作不能自动匹配成弹力带版本。
 if(actualSet.has('band')&&!wanted.includes('band'))return false;
 return true;
}
function gymAutomaticMatch(action,ex){
 if(!ex?.gif_url||!ex.name)return false;
 const actionFamily=gymFamily(action.en),sourceFamily=gymFamily(ex.name);
 if(!actionFamily||actionFamily!==sourceFamily)return false;
 // 若图库标题同时包含划船、下拉等多个不同动作类别，视为复合/歧义动作，禁止自动绑定。
 const sourceKinds=new Set(gymTokens(ex.name));
 if(['row','pulldown','pullup','pushdown'].filter(k=>sourceKinds.has(k)).length>1)return false;
 if(!gymEquipmentOK(action,ex))return false;
 const wanted=new Set(gymTokens(action.en));
 const source=new Set(gymTokens(ex.name));
 // 名称必须覆盖所选动作的所有有意义的词；动作方向已由上面的类别检查确保。
 if(![...wanted].every(t=>source.has(t)))return false;
 // 若图库给出“上斜、反握、窄距、单手”等额外变式，不能冒充原动作。
 if([...source].some(t=>GYM_SPECIFIERS.has(t)&&!wanted.has(t)&&!GYM_SAFE_EXTRAS.has(t)))return false;
 // 因为未知的新动作变种不能随意当作同一动作，所以限制额外修饰词数量。
 const extras=[...source].filter(t=>!wanted.has(t)&&!GYM_SAFE_EXTRAS.has(t));
 return extras.length===0; // 不接受无法解释的额外变式；需要时由用户手动绑定。
}
function gymActionKey(action){return `${action.muscle}|${action.zh}|${action.en}`;}
function findCatalogGifMatch(action){
 if(!exerciseDatabase||!action)return null;
 const bound=gifBindings[gymActionKey(action)];
 if(bound?.id!=null){
  const chosen=exerciseDatabase.find(e=>String(e.id)===String(bound.id)&&e.name===bound.name&&e.gif_url);
  if(chosen)return {exercise:chosen,source:'manual'};
 }
 const possibilities=exerciseDatabase.filter(e=>gymAutomaticMatch(action,e));
 if(!possibilities.length)return null;
 // 最精确的词集合优先，避免随机取同类的复杂变式。
 const aTokens=new Set(gymTokens(action.en));
 possibilities.sort((x,y)=>{
  const dx=gymTokens(x.name).filter(t=>!aTokens.has(t)).length;
  const dy=gymTokens(y.name).filter(t=>!aTokens.has(t)).length;
  return dx-dy||String(x.name).localeCompare(String(y.name));
 });
 return {exercise:possibilities[0],source:'automatic'};
}
/* 找出同一动作类别的候选供用户自行核对图像，而不自动替换名称。 */
function catalogGifCandidates(action){
 if(!exerciseDatabase||!action)return [];
 const kind=gymFamily(action.en);if(!kind)return [];
 const wanted=new Set(gymTokens(action.en));
 return exerciseDatabase.filter(e=>e.gif_url&&gymFamily(e.name)===kind)
  .map(e=>{
   const source=gymTokens(e.name);
   let score=source.filter(t=>wanted.has(t)).length*10;
   if(gymEquipmentOK(action,e))score+=14;
   if(String(e.category||'').toLowerCase().includes(
    ({'背部':'back','胸部':'chest','肩部':'shoulder','二头肌':'biceps',
      '三头肌':'triceps','腹部':'waist','腿部':'leg','小腿':'calves'})[action.muscle]||'---'))score+=3;
   return {exercise:e,score};
  }).sort((x,y)=>y.score-x.score||String(x.exercise.name).localeCompare(String(y.exercise.name)))
  .slice(0,12).map(x=>x.exercise);
}
/* 单张展示卡：始终列出图库的英文原名，使用户能判断是否对应。 */
function renderCatalogPreview(){
 const host=document.querySelector('#catalogPreview');if(!host)return;
 if(!catalogSelected){
  host.className='catalog-preview empty';
  host.innerHTML='<span>点击一个动作，在这里查看对应 GIF 动图演示</span>';
  return;
 }
 const a=catalogSelected;
 host.className='catalog-preview';
 const match=findCatalogGifMatch(a);
 const isReady=!!exerciseDatabase;
 const media=match
  ?`<div class="catalog-preview-media"><img alt="${h(match.exercise.name)} 动作演示" src="${h(mediaUrl(match.exercise.gif_url))}" loading="lazy" onerror="this.style.display='none';this.parentElement.textContent='GIF 载入失败，请检查网络或手动选择其他演示。'"></div>`
  :'';
 const heading=`<div class="catalog-preview-title"><div><strong>${h(a.zh)}</strong><small>${h(a.en)}</small></div><span class="preview-badge">${match?(match.source==='manual'?'手动指定 GIF':'名称匹配 GIF'):'动作展示'}</span></div>`;
 const meta=`<div class="preview-meta"><span>目标：${h(a.muscle)}</span><span>器械：${h(a.equipment)}</span>${match?'<span>来源：Gym visual</span>':''}</div>`;
 let explanation='';
 if(match){
  explanation=`<div class="preview-tip">素材原名：<b>${h(match.exercise.name)}</b><br>这段演示${match.source==='manual'?'由你手动指定':'通过动作类型、关键修饰词和器械信息匹配'}；请以动图中的实际动作为准。</div>`;
 }else if(!isReady){
  explanation=`<div class="preview-tip">动作图库${gifError?'加载失败':'正在加载'}，目前不显示任何未经核实的 GIF。训练记录仍然可以正常保存。</div>`;
 }else{
  explanation='<div class="preview-tip">没有找到名称、动作类型及器械都可靠对应的 GIF，因此不会再用下拉等其他动作代替。你可以在下方自行挑选对应演示。</div>';
 }
 let choices='';
 if(choosingCatalogGif&&isReady){
  const candidates=catalogGifCandidates(a);
  choices=`<div class="gif-chooser"><div class="gif-chooser-head"><strong>从图库中选择动作演示</strong><small>请检查实际动作后再绑定</small></div><div class="gif-chooser-grid">${
   candidates.length?candidates.map(e=>`<button type="button" class="gif-choice" data-gif-id="${h(e.id)}"><img loading="lazy" src="${h(mediaUrl(e.gif_url))}" alt="${h(e.name)}" onerror="this.style.display='none'"><span>${h(e.name)}</span></button>`).join('')
    :'<p class="preview-tip">图库中暂时没有同类动作演示。</p>'
  }</div></div>`;
 }
 host.innerHTML=`<div class="catalog-preview-card">${media}<div class="${match?'catalog-preview-body':'catalog-preview-fallback'}">${heading}${meta}${explanation}
 <div class="preview-actions"><span class="mini">动作已同步到左侧记录表单。</span>
 <div class="preview-buttons">${isReady?`<button type="button" class="btn btn-small btn-ghost" data-toggle-gif-picker="1">${choosingCatalogGif?'收起图库':match?'更换演示':'选择演示'}</button>`:''}
 ${match?.source==='manual'?'<button type="button" class="btn btn-small btn-ghost" data-remove-gif="1">取消绑定</button>':''}
 <button type="button" class="btn btn-small btn-primary" data-use-selected="1">继续记录这个动作</button></div></div>${choices}</div></div>`;
}
function applyCatalogAction(zh){
 const a=CATALOG.find(x=>x.zh===zh);if(!a)return;
 if(renameActionSource){const original=renameActionSource;renameActionSource=null;requestConfirmation(`将「${original.name}」合并为「${a.zh}」？`,()=>{for(const row of records)if(row.name===original.name&&row.muscle===original.muscle){row.sourceName=row.sourceName||row.name;row.name=a.zh;row.muscle=a.muscle;}saveRecords();closeOverlay('pickerOverlay');syncTrainingViews();toast('动作名称已合并');},'确认合并');return;}
 catalogSelected=a;catalogMuscle=a.muscle;choosingCatalogGif=false;
 document.querySelector('#trainMuscle').value=a.muscle;document.querySelector('#trainName').value=a.zh;
 document.getElementById('quickAction').value=a.zh;document.getElementById('quickMuscle').value=a.muscle;prefillQuickAction();
 renderCatalog();renderCatalogPreview();
 /* V6：表单隐藏于高级记录弹窗，选中后先预览 GIF，不转移焦点。 */
}
// 用事件代理兼容频繁重绘的按钮。
document.querySelector('#catalogMuscles').addEventListener('click',e=>{const b=e.target.closest('[data-catmuscle]');if(b){catalogMuscle=b.dataset.catmuscle;document.querySelector('#trainMuscle').value=catalogMuscle;catalogEquip='全部';renderCatalog();}});
document.querySelector('#catalogEquipment').addEventListener('click',e=>{const b=e.target.closest('[data-catequip]');if(b){catalogEquip=b.dataset.catequip;renderCatalog();}});
document.querySelector('#catalogSearch').addEventListener('input',renderCatalog);
document.querySelector('#catalogList').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)applyCatalogAction(b.dataset.action);});
document.querySelector('#catalogPreview').addEventListener('click',e=>{
 if(e.target.closest('[data-use-selected]'))return;
 if(e.target.closest('[data-toggle-gif-picker]')){choosingCatalogGif=!choosingCatalogGif;renderCatalogPreview();return;}
 if(e.target.closest('[data-remove-gif]')){delete gifBindings[gymActionKey(catalogSelected)];localStorage.setItem(GIF_BINDINGS_KEY,JSON.stringify(gifBindings));renderCatalogPreview();return;}
 const picked=e.target.closest('[data-gif-id]');
 if(!picked||!catalogSelected||!exerciseDatabase)return;
 const candidate=catalogGifCandidates(catalogSelected).find(item=>String(item.id)===picked.dataset.gifId);
 if(!candidate)return;
 gifBindings[gymActionKey(catalogSelected)]={id:candidate.id,name:candidate.name};
 localStorage.setItem(GIF_BINDINGS_KEY,JSON.stringify(gifBindings));
 choosingCatalogGif=false;
 renderCatalogPreview();
});
document.querySelector('#trainMuscle').addEventListener('change',e=>{catalogMuscle=e.target.value;catalogEquip='全部';renderCatalog();});
document.querySelector('#recentActionChips').addEventListener('click',e=>{const b=e.target.closest('[data-recent]');if(!b)return;const r=[...records].sort((a,b)=>byDate(a,b,true)).find(x=>x.name===b.dataset.recent);document.querySelector('#trainName').value=b.dataset.recent;if(r){document.querySelector('#trainMuscle').value=r.muscle;catalogMuscle=r.muscle;}renderCatalog();});

document.querySelector('#todayCheckin').addEventListener('click',()=>{const d=today();calMonth=new Date(+d.slice(0,4),+d.slice(5,7)-1,1);chooseDay(d);});
document.querySelector('#dayNewWorkout').addEventListener('click',()=>{openEditor(null,selectedRegion);document.querySelector('#trainDate').value=activeDay;});


/* ================== V6：快速录入、每日打卡及弹窗协调 ==================
   复用 records/checkins、历史筛选与 IndexedDB 图片存储，不引入新依赖。
   新首页的“记录这一组”会将相同日期 + 肌群 + 动作的快捷记录合并到逐组数组中。 */
let mlActiveOverlay=null,mlReturnFocus=null;
function openOverlay(id){
 const node=document.getElementById(id);if(!node)return;
 if(mlActiveOverlay&&mlActiveOverlay!==node){mlActiveOverlay.hidden=true;}
 mlReturnFocus=document.activeElement;node.hidden=false;mlActiveOverlay=node;
 document.body.style.overflow='hidden';
 const target=node.querySelector('[data-close-overlay]');target?.focus({preventScroll:true});
 
}
function closeOverlay(id){
 const node=document.getElementById(id);if(!node)return;
 node.hidden=true;if(mlActiveOverlay===node){mlActiveOverlay=null;document.body.style.overflow='';}
 if(mlReturnFocus?.isConnected)mlReturnFocus.focus({preventScroll:true});
}
document.querySelectorAll('[data-close-overlay]').forEach(b=>b.addEventListener('click',()=>closeOverlay(b.dataset.closeOverlay)));
document.querySelectorAll('.ml-overlay').forEach(node=>node.addEventListener('pointerdown',e=>{if(e.target===node)closeOverlay(node.id);}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mlActiveOverlay){e.preventDefault();closeOverlay(mlActiveOverlay.id);}});
function fillQuickActionSuggestions(){
 const items=[...new Set([...CATALOG.map(x=>x.zh),...records.map(r=>r.name)])];
 document.getElementById('quickActionSuggestions').innerHTML=items.map(n=>`<option value="${h(n)}"></option>`).join('');
}
function syncQuickActionMuscle(){
 const name=document.getElementById('quickAction').value.trim();
 const matched=CATALOG.find(x=>x.zh===name||x.en.toLowerCase()===name.toLowerCase())||[...records].reverse().find(r=>r.name===name);
 if(matched?.muscle)document.getElementById('quickMuscle').value=matched.muscle;
}
/* ================= 模块 Q：当天训练的三级汇总 =================
   展示结构为：肌群 > 动作 > 每一组。
   原始 records 不做去重或合并；即使同一天的两组重量/次数完全相同，
   也展示为两行。由快速录入和详细表单创建的不同记录只在视觉上归组。
   对于早期导入数据，verified=false 的项表示“重量参考”，不能冒充已知组数。
*/
function workoutGroupsForDate(date, sourceRecords=records){
 const dayRecords=sourceRecords.filter(r=>(r.date||null)===(date||null));
 const muscles=new Map();
 for(const r of dayRecords){
  const muscle=r.muscle||'未分类';
  if(!muscles.has(muscle))muscles.set(muscle,new Map());
  const byName=muscles.get(muscle),name=r.name||'未命名动作';
  if(!byName.has(name))byName.set(name,{name,records:[],sets:[]});
  const target=byName.get(name);target.records.push(r);
  (r.sets||[]).forEach((set,index)=>target.sets.push({set,recordId:r.id,index,legacy:r.legacy||set.verified===false}));
 }
 const order=new Map(MUSCLE_NAMES.map((name,i)=>[name,i]));
 return [...muscles.entries()].sort((a,b)=>(order.get(a[0])??99)-(order.get(b[0])??99))
  .map(([muscle,group])=>({muscle,actions:[...group.values()]}));
}
function quickSetText(set){
 const weight=set?.weight!==null&&set?.weight!==undefined&&set.weight!==''?`${set.weight}${set.plus?'+':''}${set.unit?' '+set.unit:''}`:(set?.weightText||'自重');
 const reps=set?.duration>0?`${set.duration} 秒`:set?.reps!==null&&set?.reps!==undefined&&set.reps!==''?`${set.reps} 次`:(set?.repsText||'—');
 return `${h(weight)} <em>×</em> ${h(reps)}`;
}
function renderQuickDayGroups(date,hostId){
 const host=document.getElementById(hostId);if(!host)return;
 const groups=workoutGroupsForDate(date);
 if(!groups.length){host.innerHTML='<div class="quick-empty">还没有训练。记录第一组后会出现在这里。</div>';return;}
 host.innerHTML=groups.map(group=>`<section class="day-muscle-group"><div class="day-muscle-title"><span class="muscle-accent"></span><h3>${h(group.muscle)}</h3><small>${group.actions.length} 个动作</small></div><div class="day-action-groups">${group.actions.map(action=>{
  const confirmed=action.sets.filter(x=>x.set.verified!==false).length;
  const label=confirmed?`${confirmed} 组`:'旧记录';
  const rows=action.sets.map((part,i)=>`<div class="day-set-row"><span class="day-set-no">${part.legacy?'参考':`第 ${pad(action.sets.slice(0,i+1).filter(x=>!x.legacy).length)} 组`}</span><strong>${quickSetText(part.set)}</strong>${part.legacy?'<span class="day-set-legacy">组数不明</span>':''}<button type="button" data-quick-edit="${h(part.recordId)}" aria-label="编辑 ${h(action.name)} 第 ${i+1} 条记录">编辑</button><button type="button" data-remove-set="${h(part.recordId)}" data-set-index="${part.index}" aria-label="删除 ${h(action.name)} 第 ${i+1} 组">删除</button></div>`).join('');
  return `<div class="day-action-group"><div class="day-action-title"><strong>${h(action.name)}</strong><span>${label}</span></div><div class="day-set-list">${rows||'<div class="quick-empty">无组数据</div>'}</div></div>`;
 }).join('')}</div></section>`).join('');
}

/* ================== 模块 K：按肌群回看上一次训练 ==================
   现有记录以训练日期为单位。只查早于当前录入日期的同肌群记录，
   同一天同一动作下的每一组都保留，旧重量参考单独标明。 */
const lastWorkoutTargets = new Map([
 ['哑铃侧平举','三角肌中束'], ['器械侧平举','三角肌中束'], ['绳索侧平举','三角肌中束'],
 ['哑铃前平举','三角肌前束'], ['前平举','三角肌前束'], ['肩上推举','三角肌前束 / 中束'],
 ['哑铃反向飞鸟','三角肌后束'], ['反向蝴蝶机飞鸟','三角肌后束'],
 ['哑铃肩推','三角肌前束 / 中束'], ['器械肩推','三角肌前束 / 中束'],
 ['高位下拉','背阔肌'], ['窄握高位下拉','背阔肌'], ['直臂下压','背阔肌']
]);
let lastWorkoutDay = '';
function copyableLastWeight(set) {
 return Number.isFinite(set.weight) && set.weight >= 0 && !set.plus && ['kg','lb','片',''].includes(set.unit);
}
function copyableLastReps(set) {
 return Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 999;
}
function renderLastWorkout() {
 const muscle = document.getElementById('quickMuscle').value;
 const trainingDate = document.getElementById('quickDate').value || today();
 const source = records.filter(record => record.muscle === muscle && /^\d{4}-\d{2}-\d{2}$/.test(record.date || '') && record.date < trainingDate && record.date <= today());
 lastWorkoutDay = source.reduce((latest, record) => record.date > latest ? record.date : latest, '');
 const dayLabel = document.getElementById('lastWorkoutDate');
 const summary = document.getElementById('lastWorkoutSummary');
 const body = document.getElementById('lastWorkoutBody');
 dayLabel.textContent = lastWorkoutDay;
 dayLabel.dateTime = lastWorkoutDay;
 if (!lastWorkoutDay) {
  summary.textContent = muscle;
  body.innerHTML = '<p class="last-workout-empty">暂无更早的训练记录。</p>';
  return;
 }
 // 复用历史页的日期、肌群和动作分组，保持相同数据的重复组。
 const [{actions}] = workoutGroupsForDate(lastWorkoutDay, source);
 const sets = actions.flatMap(action => action.sets);
 const total = sets.filter(part => !part.legacy).length;
 const hasLegacy = sets.some(part => part.legacy);
 summary.textContent = [muscle, `${actions.length} 个动作`, total > 0 ? `${total} 组` : '', hasLegacy ? (total ? '含组数未记的旧记录' : '组数未记') : ''].filter(Boolean).join(' · ');
 body.innerHTML = actions.map(action => {
  const catalogAction = CATALOG.find(item => item.muscle === muscle && item.en.toLowerCase() === action.name.toLowerCase());
  // 仅标明能从明确动作名称判断的部位，保留历史动作的原名。
  const target = lastWorkoutTargets.get(catalogAction?.zh || action.name);
  let setNumber = 0;
  const rows = action.sets.map(({set,index,recordId,legacy}) => {
   const groupLabel = legacy ? '重量参考' : `第 ${++setNumber} 组`;
   const quality = [
    set.failureAt > 0 ? `第 ${set.failureAt} 次力竭` : '',
    set.formBreakAt > 0 ? `第 ${set.formBreakAt} 次变形` : '',
    set.note,
    Number.isFinite(set.weight) && !set.unit ? '单位未记' : ''
   ].filter(Boolean).join(' · ');
   const canFill = !legacy && (copyableLastWeight(set) || copyableLastReps(set));
   return `<div class="last-workout-set">
    <div><div class="last-workout-values"><span>${groupLabel}</span><strong>${quickSetText(set)}</strong></div>${quality ? `<span class="last-workout-quality">${h(quality)}</span>` : ''}</div>
    ${canFill ? `<button type="button" class="last-workout-use" data-last-record="${h(recordId)}" data-last-set="${index}" title="带入第 ${setNumber} 组">带入</button>` : ''}
   </div>`;
  }).join('');
  const notes = action.records.filter(record => record.notes).map(record => `<p class="last-workout-note">${h(record.notes)}</p>`).join('');
  return `<section class="last-workout-action">
   <header class="last-workout-action-heading"><div><h3>${h(action.name)}</h3>${target ? `<small class="last-workout-target">${h(target)}</small>` : ''}</div>
   <button type="button" class="last-workout-use" data-last-record="${h(action.records[0].id)}">选此动作</button></header>${rows}${notes}
  </section>`;
 }).join('');
}
document.getElementById('lastWorkoutBody').addEventListener('click', event => {
 const button = event.target.closest('[data-last-record]');
 if (!button) return;
 const muscle = document.getElementById('quickMuscle').value;
 const record = records.find(item => item.id === button.dataset.lastRecord && item.date === lastWorkoutDay && item.muscle === muscle);
 if (!record) return;
 const set = button.dataset.lastSet ? record.sets?.[Number(button.dataset.lastSet)] : null;
 const usableSet = set && !record.legacy && set.verified !== false;
 const weight = document.getElementById('quickWeight');
 document.getElementById('quickAction').value = record.name;
 // 只将可靠数值带入草稿，力竭、变形和备注留在历史侧供参考。
 weight.value = usableSet && copyableLastWeight(set) ? String(set.weight) : '';
 document.getElementById('quickReps').value = usableSet && copyableLastReps(set) ? String(set.reps) : '';
 if (usableSet && ['kg','lb','片',''].includes(set.unit)) document.getElementById('quickUnit').value = set.unit;
 weight.focus();
});

function refreshQuickHome(){
 if(!document.getElementById('quickTodayList'))return;
 const date=document.getElementById('quickDate').value||today();
 const chosen=records.filter(r=>r.date===date);
 const count=chosen.reduce((sum,r)=>sum+(r.sets||[]).filter(s=>s.verified!==false).length,0);
 document.getElementById('quickLogHeading').textContent=date===today()?'今日训练':date.slice(5).replace('-',' / ')+' 训练';
 document.getElementById('quickLogCount').textContent=`${count} 组`;
 renderQuickDayGroups(date,'quickTodayList');
 renderLastWorkout();
 const ch=checkins[date]||{};const done=isTrainingDay(date);
 document.querySelector('.quick-checkin').classList.toggle('is-complete',done);
 document.getElementById('quickCheckinTitle').textContent=done?'训练日已记录':'结束训练';
 document.getElementById('quickCheckinSub').textContent=done?(ch.photos?.length?`${ch.photos.length} 张照片 · 已保存`:'打卡已保存'):'训练完成后点击打卡';
 document.getElementById('quickCheckinBtn').textContent=ch.finished?'查看训练小结':'结束训练';
 document.getElementById('quickCheckinBtn').disabled=false;
 fillQuickActionSuggestions();
}
function syncTrainingViews(){
 // 无论从首页、详细弹窗、月历完成打卡，都统一刷新全部可见视图。
 renderDashboard();renderHistory();renderCalendar();refreshQuickHome();
}
document.getElementById('quickDate').value=today();
document.getElementById('quickMuscle').innerHTML=MUSCLE_NAMES.map(x=>`<option value="${h(x)}">${h(x)}</option>`).join('');
document.getElementById('quickAction').addEventListener('change',()=>{
 prefillQuickAction();
});
document.getElementById('quickMuscle').addEventListener('change',renderLastWorkout);
document.getElementById('quickDate').addEventListener('change',refreshQuickHome);
document.getElementById('openPicker').addEventListener('click',()=>{catalogMuscle=document.getElementById('quickMuscle').value;catalogEquip='全部';renderCatalog();openOverlay('pickerOverlay');void ensureGifs();});
document.getElementById('quickAdvanced').addEventListener('click',()=>{
 openEditor(null,document.getElementById('quickMuscle').value,document.getElementById('quickAction').value.trim());
 document.querySelector('#trainDate').value=document.getElementById('quickDate').value;
 if(draftSets[0]){draftSets[0].weight=document.getElementById('quickWeight').value;draftSets[0].reps=document.getElementById('quickReps').value;draftSets[0].unit=document.getElementById('quickUnit').value;renderSetRows();}
 openOverlay('advancedOverlay');
});
document.getElementById('quickForm').addEventListener('submit',e=>{
 e.preventDefault();
 const name=document.getElementById('quickAction').value.trim(),date=document.getElementById('quickDate').value,muscle=document.getElementById('quickMuscle').value;
 const durationValue=document.getElementById('quickDuration').value;const duration=durationValue===''?null:+durationValue;
 const w=document.getElementById('quickWeight').value,reps=document.getElementById('quickReps').value,unit=document.getElementById('quickUnit').value;
 if(!name||!date||(reps===''&&duration===null))return toast('请填写动作、日期和次数或时长',true);
 const weight=w===''?null:+w,rep=reps===''?null:+reps;
 if((weight!==null&&(!Number.isFinite(weight)||weight<0))||(rep!==null&&(!Number.isInteger(rep)||rep<1||rep>999))||(duration!==null&&(!Number.isFinite(duration)||duration<=0)))return toast('重量应为非负数，次数应为正整数',true);
 const s={id:UID(),weight,reps:rep,duration,unit,plus:false,failureAt:null,formBreakAt:null,verified:true};
 saveQuickUnit();
 const existing=[...records].reverse().find(r=>r.quickEntry===true&&r.date===date&&r.name===name&&r.muscle===muscle);
 if(existing){existing.sets.push(s);}else{records.push({id:UID(),date,name,muscle,sets:[s],legacy:false,quickEntry:true,recentV4:true,notes:'',createdAt:Date.now()});}
 try{saveRecords();}catch(err){if(existing)existing.sets.pop();else records.pop();return toast('本地空间不足，训练未保存',true);}
 
 syncTrainingViews();renderRecentActionChips();
 toast('已记录 1 组',false,()=>{for(const r of records)r.sets=r.sets.filter(set=>set.id!==s.id);records=records.filter(r=>r.sets.length);saveRecords();syncTrainingViews();});document.getElementById('quickReps').focus();document.getElementById('quickReps').select();
});
document.getElementById('quickTodayList').addEventListener('click',e=>{const b=e.target.closest('[data-quick-edit]');if(b)openEditor(b.dataset.quickEdit);const del=e.target.closest('[data-remove-set]');if(del)removeTrainingRecord(del.dataset.removeSet,+del.dataset.setIndex);});
document.getElementById('quickShowInsights').addEventListener('click',()=>{renderDashboard();openOverlay('insightsOverlay');});
document.getElementById('quickGoHistory').addEventListener('click',()=>showView('history'));
document.getElementById('quickPhoto').addEventListener('click',()=>openOverlay('quickCheckinOverlay'));

/* ================== 模块 J：打卡成功礼花 / 彩纸 ==================
   1. 仅在成功写入本地打卡状态后触发；首次完成打卡才庆祝。
   2. 原生 Canvas，无外部库、不修改已有记录或统计功能。
   3. 限制帧数、粒子数量和持续时间；离屏或销毁时主动清理。
   4. 尊重 prefers-reduced-motion，静态反馈代替高速运动。 */
let celebrationCleanup=null;
function celebrateCheckin(){
  // 如果动画还在播放，先清理上一次，防止节点和 requestAnimationFrame 累积。
  if(celebrationCleanup)celebrationCleanup();
  const label=document.createElement('div');
  label.className='checkin-celebrate-label';
  label.setAttribute('role','status');
  label.innerHTML='<strong>打卡完成！</strong><small>今天的训练，已留下记录</small>';
  document.body.appendChild(label);
  const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduceMotion){
    const t=setTimeout(()=>{label.remove();celebrationCleanup=null;},1400);
    celebrationCleanup=()=>{clearTimeout(t);label.remove();celebrationCleanup=null;};
    return;
  }
  const canvas=document.createElement('canvas');
  canvas.id='checkinCelebrationCanvas';canvas.setAttribute('aria-hidden','true');
  document.body.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx){canvas.remove();const t=setTimeout(()=>label.remove(),1700);celebrationCleanup=()=>{clearTimeout(t);label.remove();celebrationCleanup=null;};return;}
  const colors=['#92e3cc','#b4a7ff','#f9c77b','#fb8f9e','#83c5f7','#f5f0cc'];
  let w=0,height=0,dpr=1,frame=0,ticker=0;
  const fit=()=>{w=window.innerWidth;height=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(w*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};
  fit();window.addEventListener('resize',fit,{passive:true});
  const random=(lo,hi)=>lo+Math.random()*(hi-lo);
  // 彩纸从画面上部向下飘散，每张会翻转而不是平面下落。
  const confetti=Array.from({length:Math.min(140,Math.max(85,Math.round(w/10)))},()=>({
    x:random(0,w),y:random(-height*.95,-25),vx:random(-1.35,1.35),vy:random(1.7,4.0),
    size:random(4,9),angle:random(0,6.283),spin:random(-.09,.09),phase:random(0,6.283),
    color:colors[Math.floor(random(0,colors.length))]
  }));
  // 四束烟花从屏幕两侧绽放，避免挡住中间的成功文案。
  const sparks=[];
  for(const [cx,cy] of [[.18,.30],[.82,.27],[.12,.56],[.88,.52]]){
    const ox=w*cx,oy=height*cy;
    for(let i=0;i<38;i++){
      const angle=2*Math.PI*i/38+random(-.13,.13),speed=random(2.2,5.3);
      sparks.push({x:ox,y:oy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,
        age:0,life:random(48,78),color:colors[(i+Math.round(cx*10))%colors.length],r:random(1.3,2.8)});
    }
  }
  const begin=performance.now(),duration=2450;
  let stopped=false;
  const cleanup=()=>{
    if(stopped)return;stopped=true;
    cancelAnimationFrame(frame);window.removeEventListener('resize',fit);canvas.remove();label.remove();
    if(celebrationCleanup===cleanup)celebrationCleanup=null;
  };
  celebrationCleanup=cleanup;
  function draw(now){
    if(stopped)return;
    const elapsed=now-begin;
    if(elapsed>=duration||document.hidden){cleanup();return;}
    const fade=Math.min(1,(duration-elapsed)/420);
    ctx.clearRect(0,0,w,height);
    for(const p of confetti){
      p.y+=p.vy;p.x+=p.vx+Math.sin(elapsed*.003+p.phase)*.7;p.angle+=p.spin;
      if(p.y>height+15)continue;
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.globalAlpha=fade;
      ctx.fillStyle=p.color;ctx.fillRect(-p.size/2,-p.size/3,p.size,Math.max(1.5,Math.abs(Math.cos(p.angle))*p.size*.65));ctx.restore();
    }
    for(const p of sparks){
      p.x+=p.vx;p.y+=p.vy;p.vx*=.985;p.vy=p.vy*.985+.045;p.age++;
      if(p.age>=p.life)continue;
      ctx.beginPath();ctx.fillStyle=p.color;ctx.globalAlpha=fade*(1-p.age/p.life);ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
}

document.getElementById('quickCheckinBtn').addEventListener('click',showFinishTraining);
let quickPhotoFiles=[],quickPhotoUrls=[];
function renderQuickPhotoPreviews(){
 quickPhotoUrls.forEach(url=>URL.revokeObjectURL(url));quickPhotoUrls=[];
 document.getElementById('quickFilePreviews').innerHTML=quickPhotoFiles.map((f,i)=>{
  const url=URL.createObjectURL(f);quickPhotoUrls.push(url);
  return `<div class="quick-file-thumb"><img src="${url}" alt="待保存照片 ${i+1}"><button type="button" data-quick-remove-photo="${i}" aria-label="删除待上传照片">×</button></div>`;
 }).join('');
}
document.getElementById('quickFiles').addEventListener('change',e=>{
 for(const f of [...e.target.files]){
  if(!f.type.startsWith('image/')){toast('请选择图片文件',true);continue;}
  if(f.size>12*1024*1024){toast('单张图片不能超过 12MB',true);continue;}
  quickPhotoFiles.push(f);
 }
 e.target.value='';renderQuickPhotoPreviews();
});
document.getElementById('quickFilePreviews').addEventListener('click',e=>{const b=e.target.closest('[data-quick-remove-photo]');if(b){quickPhotoFiles.splice(+b.dataset.quickRemovePhoto,1);renderQuickPhotoPreviews();}});
document.getElementById('quickPhotoForm').addEventListener('submit',async e=>{
 e.preventDefault();const btn=document.getElementById('quickSavePhoto');btn.disabled=true;
 const day=document.getElementById('quickDate').value||today();
 const note=document.getElementById('quickNote').value.trim(),photos=[];
 try{
  for(const file of quickPhotoFiles){const id=UID();await imagePut(id,file);photos.push(id);}
  const old=checkins[day]||{notes:[],photos:[]};
  checkins[day]={...old,completed:true,finished:true,notes:[...(old.notes||[]),...(note?[{id:UID(),text:note,time:Date.now()}]:[])],photos:[...(old.photos||[]),...photos]};
  saveCheckins();
  quickPhotoFiles=[];document.getElementById('quickNote').value='';renderQuickPhotoPreviews();
  syncTrainingViews();closeOverlay('quickCheckinOverlay');if(!old.finished)celebrateCheckin();toast('训练小结已保存');
 }catch(err){for(const id of photos)await imageDelete(id).catch(()=>{});toast('照片保存失败：'+(err.message||err),true);}
 finally{btn.disabled=false;}
});

/* 点击动图展示卡的“继续记录”才结束浏览动作，防止无法观看预览。 */
document.querySelector('#catalogPreview').addEventListener('click',e=>{
 if(e.target.closest('[data-use-selected]')){
  closeOverlay('pickerOverlay');document.getElementById('quickWeight').focus({preventScroll:true});
 }
});
/* 在旧训练表单保存、历史删除、JSON 恢复后刷新首页汇总。 */

document.getElementById('historyList').addEventListener('click',()=>setTimeout(refreshQuickHome,40));
refreshQuickHome();

/* 页面初始化：先将 CRUD/旧记录功能启动；Three.js 使用另一个 ES module 加载 */
initFormFields();document.querySelector('#clockDate').textContent=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'short'}).format(new Date());
document.querySelector('#heroDate').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());renderDashboard();renderHistory();document.querySelector('#checkinDate').value=today();chooseDay(today());catalogMuscle='背部';renderCatalog();renderRecentActionChips();showView('dashboard');
// CDN 可能被浏览器扩展或离线环境阻断；超时后给出明确提示，而不是永久显示加载中。


document.getElementById('deleteRecord').addEventListener('click',()=>removeTrainingRecord(editingId));

let lastObservedToday=today();
function refreshDateBoundary(){const next=today();if(next===lastObservedToday)return;const input=document.getElementById('quickDate');if(input.value===lastObservedToday)input.value=next;lastObservedToday=next;document.getElementById('heroDate').textContent=dateLabel(next);syncTrainingViews();}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDateBoundary();});window.addEventListener('focus',refreshDateBoundary);

document.getElementById('quickUnit').addEventListener('change',saveQuickUnit);

document.getElementById('historyList').addEventListener('click',e=>{const b=e.target.closest('[data-rename-action]');if(!b)return;renameActionSource={name:b.dataset.renameAction,muscle:b.dataset.renameMuscle};catalogMuscle=renameActionSource.muscle;catalogEquip='全部';renderCatalog();openOverlay('pickerOverlay');void ensureGifs();});

document.getElementById('historyList').addEventListener('click',e=>{if(e.target.closest('#loadMoreDays')){historyDayLimit+=20;renderHistory();}});
document.getElementById('historyList').addEventListener('toggle',e=>{if(e.target.dataset?.historyDay)historyExpandedDays.set(e.target.dataset.historyDay,e.target.open);},true);
