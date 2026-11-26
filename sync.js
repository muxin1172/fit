/* MotionLog local-first sync. Loaded after the classic app.js script. */
(() => {
  'use strict';
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function normalise(value) {
    const state=object(value)?copy(value):{};
    state.records=Array.isArray(state.records)?state.records:[];
    for(const key of ['checkins','gifBindings','preferences','media'])if(!object(state[key]))state[key]={};
    return state;
  }
  // Arrays in the existing format have no set IDs. Apply a multiset delta,
  // preserving concurrent additions and the number of identical training sets.
  function mergeArray(before,after,remote) {
    const result=copy(Array.isArray(remote)?remote:[]),remaining=copy(after);
    for(const value of before) {
      const retained=remaining.findIndex(item=>equal(item,value));
      if(retained>=0)remaining.splice(retained,1);
      else {const index=result.findIndex(item=>equal(item,value));if(index>=0)result.splice(index,1);}
    }
    return result.concat(remaining);
  }
  function patch(before,after,remote) {
    if(equal(before,after))return copy(remote);
    if(equal(before,remote))return copy(after);
    if(object(after)) {
      const result=object(remote)?copy(remote):{};
      const previous=object(before)?before:{};
      for(const key of new Set([...Object.keys(previous),...Object.keys(after)])) {
        if(equal(previous[key],after[key]))continue;
        if(!own(after,key))delete result[key];
        else Object.defineProperty(result,key,{value:patch(previous[key],after[key],result[key]),enumerable:true,writable:true,configurable:true});
      }
      return result;
    }
    if(Array.isArray(after))return mergeArray(Array.isArray(before)?before:[],after,remote);
    return copy(after);
  }
  const recordMap=state=>Object.fromEntries(state.records.filter(row=>row&&row.id!=null).map(row=>[String(row.id),row]));
  function diff(before,after,makeRevision) {
    before=normalise(before);after=normalise(after);
    const result=[];
    for(const group of ['records','checkins','gifBindings','preferences','media']) {
      const left=group==='records'?recordMap(before):before[group];
      const right=group==='records'?recordMap(after):after[group];
      for(const key of new Set([...Object.keys(left),...Object.keys(right)])) {
        if(equal(left[key],right[key]))continue;
        result.push({...makeRevision(),group,key,before:copy(left[key]),after:copy(right[key]),deleted:!own(right,key)});
      }
    }
    return result;
  }
  function merge(remote,operations) {
    const result=normalise(remote);
    const meta=object(result._motionSync)?result._motionSync:{};
    meta.applied=object(meta.applied)?meta.applied:{};
    meta.tombstones=object(meta.tombstones)?meta.tombstones:{};
    meta.versions=object(meta.versions)?meta.versions:{};
    const rows=recordMap(result);
    for(const op of operations) {
      if(own(meta.applied,op.id))continue;
      if(!['records','checkins','gifBindings','preferences','media'].includes(op.group))continue;
      const target=op.group==='records'?rows:result[op.group],key=op.key,marker=`${op.group}/${key}`;
      const tombstone=meta.tombstones[marker];
      if((!tombstone||op.stamp>tombstone)&&(!op.deleted||!meta.versions[marker]||op.stamp>meta.versions[marker])) {
        if(op.deleted){delete target[key];meta.tombstones[marker]=op.stamp;}
        else {
          Object.defineProperty(target,key,{value:patch(op.before,op.after,target[key]),enumerable:true,writable:true,configurable:true});
          // Keep the deletion watermark even after an explicit undo.
        }
      }
      meta.versions[marker]=[meta.versions[marker]||'',op.stamp].sort().pop();
      Object.defineProperty(meta.applied,op.id,{value:true,enumerable:true,writable:true,configurable:true});
    }
    result.records=Object.values(rows);
    if(operations.length||result._motionSync)result._motionSync=meta;
    return result;
  }
  // Opt-in migration fills gaps. Existing account scalar fields win conflicts;
  // arrays keep the largest count of each value, so repeated imports are safe.
  function importValue(existing,incoming) {
    if(existing===undefined)return copy(incoming);
    if(Array.isArray(existing)&&Array.isArray(incoming)) {
      const result=copy(existing),unmatched=copy(existing);
      for(const value of incoming) {
        const match=unmatched.findIndex(item=>equal(item,value));
        if(match>=0)unmatched.splice(match,1);else result.push(copy(value));
      }
      return result;
    }
    if(object(existing)&&object(incoming)) {
      const result=copy(existing);
      for(const key of Object.keys(incoming))Object.defineProperty(result,key,{value:importValue(result[key],incoming[key]),enumerable:true,writable:true,configurable:true});
      return result;
    }
    return copy(existing);
  }
  function importState(account,anonymous) {
    const result=normalise(account),incoming=normalise(anonymous),rows=recordMap(result);
    for(const row of incoming.records)if(row?.id!=null)Object.defineProperty(rows,String(row.id),{value:importValue(rows[String(row.id)],row),enumerable:true,writable:true,configurable:true});
    result.records=Object.values(rows);
    for(const group of ['checkins','gifBindings','preferences'])result[group]=importValue(result[group],incoming[group]);
    return result;
  }
  const Core={normalise,diff,merge,importState};
  if(typeof module!=='undefined'&&module.exports){module.exports=Core;return;}


  const APP_ID='motionlog';
  const SUPABASE_URL='https://kikwvxgjrvwpxplqehsb.supabase.co';
  const SUPABASE_KEY='sb_publishable_3jEJQs6BDpK_aVw79qmRLQ_BRkm2cO8';
  const PREFIX='motionlog_sync_v15:';
  const LEGACY={records:'motionlog_records_v1',checkins:'motionlog_checkins_v1',gifBindings:'motionlog_gif_bindings_v1',preferences:'motionlog_preferences_v1'};
  const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const sessionId=uid();
  let clock=Date.now(),scope='anonymous',user=null,client=null,channel=null,generation=0;
  let envelope,observed,worker=null,timer=null,dirty=false,lastError='',retryDelay=2000,authGeneration=0;
  const rawGet=imageGet,rawPut=imagePut,rawDelete=imageDelete;
  function revision() {clock=Math.max(Date.now(),clock+1);return {id:`${sessionId}:${uid()}`,stamp:`${String(clock).padStart(16,'0')}:${sessionId}`};}
  function readJSON(key,fallback) {
    const raw=localStorage.getItem(key);
    if(raw===null)return fallback;
    try{return JSON.parse(raw);}catch{throw Error(`本地数据格式有误，已保留原数据：${key}`);}
  }
  function emptyCache(payload={}) {return {version:1,payload:normalise(payload),pending:[],mediaJobs:{},lastSyncedAt:null};}
  function readCache(target) {
    const cached=readJSON(PREFIX+target,null);
    if(cached===null)return null;
    if(!object(cached)||cached.version!==1||!object(cached.payload)||!Array.isArray(cached.pending)||!object(cached.mediaJobs))throw Error('本地同步缓存格式有误，已保留原数据');
    return cached;
  }
  function joinOperations(...lists) {return [...new Map(lists.flat().map(op=>[op.id,op])).values()].sort((a,b)=>a.stamp.localeCompare(b.stamp));}
  function persist(next,target=scope) {
    // One atomic localStorage write stores both the visible data and its outbox.
    localStorage.setItem(PREFIX+target,JSON.stringify(next));
    if(target===scope)envelope=next;
  }
  function loadScope(target) {
    let cached=readCache(target);
    if(!cached) {
      const legacy={};
      if(target==='anonymous')for(const [group,key] of Object.entries(LEGACY))legacy[group]=readJSON(key,group==='records'?[]:{});
      cached=emptyCache(legacy);
      if(target==='anonymous')cached.pending=diff({},cached.payload,revision);
      persist(cached,target);
    }
    return cached;
  }
  function appState() {return normalise({records,checkins,gifBindings,preferences:typeof appPreferences!=='undefined'?appPreferences:{}});}
  function renderCloudState() {
    if(typeof syncTrainingViews==='function')syncTrainingViews();
    if(typeof renderRecentActionChips==='function')renderRecentActionChips();
    if(typeof renderCatalogPreview==='function')renderCatalogPreview();
    window.dispatchEvent(new CustomEvent('motion:sync-applied',{detail:getStatus()}));
  }
  function applyToApp() {
    records=copy(envelope.payload.records);checkins=copy(envelope.payload.checkins);gifBindings=copy(envelope.payload.gifBindings);
    if(typeof appPreferences!=='undefined')appPreferences=copy(envelope.payload.preferences);
    observed=appState();
    renderCloudState();
  }
  function capture(group) {
    const current=appState();
    const before=normalise({[group]:observed[group]}),after=normalise({[group]:current[group]});
    const changes=diff(before,after,revision);
    if(!changes.length)return;
    const disk=readCache(scope);
    const pending=joinOperations(disk?.pending||[],envelope.pending,changes);
    const payload=merge(envelope.payload,pending);
    persist({...envelope,payload,pending,mediaJobs:{...disk?.mediaJobs,...envelope.mediaJobs}});
    observed[group]=copy(current[group]);
    changed();
  }
  function queueMedia(target,id,job) {
    const cached=target===scope?envelope:readCache(target)||emptyCache();
    const next={...cached,mediaJobs:{...cached.mediaJobs,[id]:job}};
    persist(next,target);
    if(target===scope)changed();
  }
  const photoKey=(target,id)=>`${PREFIX}photo:${encodeURIComponent(target)}:${encodeURIComponent(id)}`;
  const privatePath=(path,account)=>typeof path==='string'&&path.startsWith(`${APP_ID}/${account}/`);
  function checked(result) {if(result?.error)throw result.error;return result?.data;}
  const online=()=>navigator.onLine!==false;
  function getStatus() {
    const pending=envelope?.pending||[];
    const count=new Set(pending.filter(op=>['records','checkins','media'].includes(op.group)).map(op=>`${op.group}/${op.key}`));
    for(const id of Object.keys(envelope?.mediaJobs||{}))count.add(`media/${id}`);
    return {accountId:user?.id||null,scope,status:!user?'anonymous':!online()?'offline':worker?'syncing':lastError?'error':count.size?'pending':'synced',pendingCount:count.size||(pending.length?1:0),lastError,lastSyncedAt:envelope?.lastSyncedAt||null};
  }
  function renderStatus() {
    const state=getStatus();
    const labels={anonymous:'未登录',offline:'离线',syncing:'同步中',error:'同步失败',pending:'待同步',synced:'已同步'};
    const text=labels[state.status]+(state.pendingCount?` · 待同步 ${state.pendingCount} 项`:'');
    document.querySelectorAll('[data-motion-sync-status]').forEach(node=>{node.textContent=text;node.title=lastError||user?.email||'未登录也可使用；登录后可同步';node.dataset.status=state.status;});
    window.dispatchEvent(new CustomEvent('motion:sync-status',{detail:state}));
  }
  function changed() {dirty=true;renderStatus();schedule();}
  function schedule(delay=350) {
    clearTimeout(timer);
    if(user&&online()&&client)timer=setTimeout(()=>{timer=null;void flush();},delay);
  }
  function assertContext(ticket) {if(ticket!==generation)throw Error('SYNC_ACCOUNT_CHANGED');}
  function addOperations(next,operations) {
    return {...next,pending:joinOperations(next.pending,operations),payload:merge(next.payload,operations)};
  }
  // These wrappers deliberately do not call the legacy delegates: writing the
  // old shared keys while signed in would expose that account after sign-out.
  saveRecords=()=>capture('records');
  saveCheckins=()=>capture('checkins');
  if(typeof saveGifBindings!=='undefined')saveGifBindings=()=>capture('gifBindings');
  if(typeof savePreferences!=='undefined')savePreferences=()=>capture('preferences');
  imageGet=async id=>{
    const target=scope;
    const blob=await rawGet(photoKey(target,id));
    return blob||(target==='anonymous'?await rawGet(id):undefined);
  };
  imagePut=async(id,blob)=>{
    const target=scope;
    await rawPut(photoKey(target,id),blob);
    queueMedia(target,id,{action:'upload',token:uid()});
  };
  imageDelete=async id=>{
    const target=scope,cached=target===scope?envelope:readCache(target);
    const path=cached?.payload.media[id];
    await rawDelete(photoKey(target,id));
    // Never delete legacy media: it remains recoverable with the old backup.
    queueMedia(target,id,{action:'delete',path,token:uid()});
  };

  async function readRemote(account,ticket) {
    const row=checked(await client.from('personal_app_state').select('payload,updated_at').eq('app_id',APP_ID).eq('user_id',account).maybeSingle());
    assertContext(ticket);
    return row;
  }
  function acceptRemote(payload) {
    // Advance the local logical clock past known deletion watermarks.
    for(const stamp of Object.values(payload?._motionSync?.tombstones||{}))clock=Math.max(clock,Number(String(stamp).split(':')[0])||0);
    const pending=envelope.pending;
    persist({...envelope,payload:merge(payload,pending)});
    applyToApp();
  }
  async function reconcile(ticket=generation) {
    if(!user||!client||!online())return;
    const row=await readRemote(user.id,ticket);
    acceptRemote(row?.payload||{});
    await discoverDownloads(ticket);
  }
  async function discoverDownloads(ticket) {
    const account=user.id,target=scope;
    for(const id of new Set(Object.values(envelope.payload.checkins).flatMap(item=>Array.isArray(item?.photos)?item.photos:[]))) {
      const path=envelope.payload.media[id];
      if(envelope.mediaJobs[id]||!privatePath(path,account))continue;
      const cached=await rawGet(photoKey(target,id));assertContext(ticket);
      if(!cached)queueMedia(target,id,{action:'download',path,token:uid()});
    }
  }
  async function processMedia(ticket) {
    const account=user.id,target=scope,failures=[];
    for(const [id,job] of Object.entries(envelope.mediaJobs)) {
      assertContext(ticket);
      try {
        if(job.action==='upload') {
          const blob=await rawGet(photoKey(target,id))||(target==='anonymous'?await rawGet(id):null);
          assertContext(ticket);
          if(!blob)throw Error('照片尚未保存在本机，请重试或恢复备份');
          const path=`${APP_ID}/${account}/${encodeURIComponent(id)}-${job.token}`;
          checked(await client.storage.from('personal-app-media').upload(path,blob,{upsert:true,contentType:blob.type||'application/octet-stream'}));
          assertContext(ticket);
          if(envelope.mediaJobs[id]?.token!==job.token)continue;
          const next=copy(envelope),before=normalise({media:next.payload.media});
          const after=normalise({media:{...next.payload.media,[id]:path}});
          next.mediaJobs[id]={...job,action:'publish',path};
          persist(addOperations(next,diff(before,after,revision)));
        } else if(job.action==='delete') {
          const next=copy(envelope),before=normalise({media:next.payload.media}),media={...next.payload.media};delete media[id];
          next.mediaJobs[id]={...job,action:'cleanup',path:job.path||next.payload.media[id]};
          persist(addOperations(next,diff(before,{media},revision)));
        } else if(job.action==='download') {
          if(!privatePath(job.path,account))throw Error('照片路径不属于当前账号');
          const blob=checked(await client.storage.from('personal-app-media').download(job.path));assertContext(ticket);
          if(!blob)throw Error('照片下载失败');
          if(envelope.mediaJobs[id]?.token!==job.token)continue;
          await rawPut(photoKey(target,id),blob);assertContext(ticket);
          const next=copy(envelope);delete next.mediaJobs[id];persist(next);
          renderCloudState();
        }
      } catch(error) {assertContext(ticket);failures.push(error.message||String(error));}
    }
    return failures;
  }
  async function commitPending(ticket) {
    for(let attempt=0;attempt<3;attempt++) {
      const account=user.id,row=await readRemote(account,ticket);
      const operations=copy(envelope.pending);
      if(!operations.length){acceptRemote(row?.payload||{});return;}
      const payload=merge(row?.payload||{},operations);
      const previousTime=Date.parse(row?.updated_at)||0;
      const update={app_id:APP_ID,user_id:account,payload,updated_by:account,updated_at:new Date(Math.max(Date.now(),previousTime+1)).toISOString()};
      assertContext(ticket);
      // Compare-and-set avoids the read/upsert lost-update window. A new row
      // uses INSERT; a unique conflict is re-read and merged on the next pass.
      const result=row?
        await client.from('personal_app_state').update(update).eq('app_id',APP_ID).eq('user_id',account).eq('updated_at',row.updated_at).select('payload,updated_at').maybeSingle():
        await client.from('personal_app_state').insert(update).select('payload,updated_at').single();
      assertContext(ticket);
      if(result.error?.code==='23505'||(!result.error&&!result.data))continue;
      const saved=checked(result);
      const acknowledged=new Set(operations.map(op=>op.id));
      const pending=envelope.pending.filter(op=>!acknowledged.has(op.id));
      persist({...envelope,pending,payload:merge(saved.payload,pending),lastSyncedAt:saved.updated_at});
      applyToApp();
      return;
    }
    throw Error('另一个会话正在保存，稍后自动重试');
  }
  async function cleanupMedia(ticket) {
    const account=user.id,failures=[];
    for(const [id,job] of Object.entries(envelope.mediaJobs)) {
      if(job.action!=='publish'&&job.action!=='cleanup')continue;
      if(envelope.pending.some(op=>op.group==='media'&&op.key===id))continue;
      try {
        if(job.action==='cleanup'&&privatePath(job.path,account)) {
          checked(await client.storage.from('personal-app-media').remove([job.path]));assertContext(ticket);
        }
        if(envelope.mediaJobs[id]?.token!==job.token)continue;
        const next=copy(envelope);delete next.mediaJobs[id];persist(next);
      } catch(error) {assertContext(ticket);failures.push(error.message||String(error));}
    }
    return failures;
  }
  async function flush() {
    if(worker){dirty=true;return worker;}
    if(!client||!user||!online()){renderStatus();return;}
    clearTimeout(timer);timer=null;
    const ticket=generation;
    worker=(async()=>{
      try {
        // One pass also pulls remote updates when realtime was unavailable.
        let rounds=0,failures=[];
        do {
          dirty=false;
          await reconcile(ticket);
          failures=await processMedia(ticket);
          await commitPending(ticket);
          failures.push(...await cleanupMedia(ticket));
          lastError=failures.join('；');
          rounds++;
        } while(dirty&&rounds<4&&!failures.length);
        retryDelay=lastError?Math.min(retryDelay*2,60000):2000;
      } catch(error) {
        if(ticket===generation){lastError=error.message||String(error);retryDelay=Math.min(retryDelay*2,60000);}
      } finally {
        worker=null;
        renderStatus();
        if(ticket!==generation||dirty||getStatus().pendingCount||lastError)schedule(lastError?retryDelay:350);
      }
    })();
    renderStatus();
    return worker;
  }

  function subscribe(ticket) {
    const account=user.id;
    channel=client.channel(`motionlog-${account}-${sessionId}`).on('postgres_changes',{
      event:'*',schema:'public',table:'personal_app_state',filter:`user_id=eq.${account}`
    },event=>{
      if(ticket!==generation||event.new?.app_id!==APP_ID||event.new?.user_id!==account)return;
      // updated_by is the account ID in the existing schema, not a session ID.
      // Same-account events must be reconciled, including our own acknowledgements.
      if(envelope.pending.length||Object.keys(envelope.mediaJobs).length){changed();return;}
      void reconcile(ticket).then(()=>{lastError='';renderStatus();schedule();}).catch(error=>{if(ticket===generation){lastError=error.message;schedule(retryDelay);renderStatus();}});
    }).subscribe(status=>{
      if(ticket!==generation)return;
      if(status==='SUBSCRIBED')schedule(0);
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){lastError='实时连接中断，正在重试';schedule(retryDelay);renderStatus();}
    });
  }
  function switchSession(session) {
    const nextUser=session?.user||null,nextScope=nextUser?`account:${nextUser.id}`:'anonymous';
    if(nextScope===scope){user=nextUser;if(user)schedule(0);renderStatus();return;}
    generation++;
    if(channel){void client.removeChannel(channel);channel=null;}
    clearTimeout(timer);lastError='';dirty=false;
    user=nextUser;scope=nextScope;
    try {envelope=loadScope(scope);applyToApp();}
    catch(error) {
      // Do not leave the previous account's records visible if cache loading fails.
      envelope=emptyCache();records=[];checkins={};gifBindings={};if(typeof appPreferences!=='undefined')appPreferences={};observed=appState();lastError=error.message;renderCloudState();
      renderStatus();return;
    }
    document.getElementById('motion-cloud-auth')?.remove();
    if(user){subscribe(generation);schedule(0);}
    renderStatus();
  }
  async function importAnonymous({confirmed=false}={}) {
    if(!confirmed)throw Error('请明确确认将未登录数据导入当前账号');
    if(!user)throw Error('请先登录');
    const ticket=generation,target=scope,anonymous=readCache('anonymous');
    if(!anonymous)return;
    // Merge against the current account, preserving cloud conflicts. Never
    // import another scope's cloud paths, tombstones or applied-operation IDs.
    const imported=importState(envelope.payload,anonymous.payload);
    const operations=diff(envelope.payload,imported,revision);
    const ids=new Set(Object.values(anonymous.payload.checkins).flatMap(ch=>ch.photos||[]));
    for(const id of ids) {
      if(envelope.payload.media[id]||envelope.mediaJobs[id])continue;
      const blob=await rawGet(photoKey('anonymous',id))||await rawGet(id);assertContext(ticket);
      if(!blob)throw Error('未登录备份中的照片缺失，原数据已保留');
      await rawPut(photoKey(target,id),blob);assertContext(ticket);
      queueMedia(target,id,{action:'upload',token:uid()});
    }
    persist(addOperations(envelope,operations));applyToApp();changed();
  }
  async function boot() {
    try {
      if(!client&&!window.supabase?.createClient)throw Error('同步组件尚未加载；本地记录仍可使用');
      if(!client) {
      client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
      // Register before getSession; defer auth work out of Supabase's auth lock.
      client.auth.onAuthStateChange((_event,session)=>{
        authGeneration++;
        setTimeout(()=>switchSession(session),0);
      });
      }
      const request=authGeneration;
      const data=checked(await client.auth.getSession());
      if(request===authGeneration)switchSession(data?.session);
    } catch(error){lastError=error.message;renderStatus();}
  }

  function mount(host) {
    if(typeof host==='string')host=document.querySelector(host);
    if(!host)return;
    const button=document.createElement('button');button.type='button';button.className='btn btn-ghost btn-small motion-sync-button';
    if(!document.getElementById('motion-sync-status'))button.id='motion-sync-status';
    button.dataset.motionSyncStatus='';button.addEventListener('click',()=>showAccount());host.appendChild(button);renderStatus();
    return button;
  }
  function showAccount(message='') {
    document.getElementById('motion-cloud-auth')?.remove();
    const panel=document.createElement('dialog');panel.id='motion-cloud-auth';
    // All account and service strings are assigned as text, never interpolated HTML.
    panel.innerHTML='<form method="dialog"><h2>账号与同步</h2><p data-account></p><p data-status role="status"></p><div data-login><label>邮箱<input name="email" type="email" autocomplete="email" required></label><label>密码<input name="password" type="password" autocomplete="current-password" minlength="6" required></label><button type="button" data-login-action>登录</button><button type="button" data-signup>注册</button></div><div data-signed-in><label><input type="checkbox" data-import-confirm> 我确认将此浏览器的未登录数据导入当前账号</label><button type="button" data-import>导入未登录数据</button><button type="button" data-retry>立即同步</button><button type="button" data-signout>退出登录</button></div><button type="submit" formnovalidate>继续使用 / 关闭</button></form>';
    panel.querySelector('[data-account]').textContent=user?.email||'未登录也可记录训练；登录不会自动导入此浏览器的数据。';
    const msg=panel.querySelector('[data-status]');msg.textContent=message||lastError;
    panel.querySelector('[data-login]').hidden=!!user;panel.querySelector('[data-signed-in]').hidden=!user;
    const action=(selector,fn)=>panel.querySelector(selector).addEventListener('click',async event=>{
      const button=event.currentTarget;button.disabled=true;
      try {await fn();}catch(error){msg.textContent=error.message||String(error);}finally{button.disabled=false;}
    });
    const credentials=()=>{
      const email=panel.querySelector('[name=email]'),password=panel.querySelector('[name=password]');
      if(!email.reportValidity()||!password.reportValidity())throw Error('请填写有效邮箱和至少 6 位密码');
      return {email:email.value.trim(),password:password.value};
    };
    action('[data-login-action]',async()=>{if(!client)await boot();if(!client)throw Error(lastError);msg.textContent='正在登录…';checked(await client.auth.signInWithPassword(credentials()));});
    action('[data-signup]',async()=>{if(!client)await boot();if(!client)throw Error(lastError);const data=checked(await client.auth.signUp(credentials()));msg.textContent=data?.session?'注册成功':'请查收确认邮件后登录';});
    action('[data-signout]',async()=>{checked(await client.auth.signOut());switchSession(null);});
    action('[data-retry]',async()=>{await flush();msg.textContent=lastError||'同步完成';});
    action('[data-import]',async()=>{await importAnonymous({confirmed:panel.querySelector('[data-import-confirm]').checked});msg.textContent='已导入本地，等待同步';});
    panel.addEventListener('close',()=>panel.remove());document.body.appendChild(panel);panel.showModal();
  }
  const style=document.createElement('style');style.textContent=`
    .motion-sync-button{min-height:44px;max-width:100%;white-space:normal;text-align:left}
    #motion-cloud-auth{width:min(420px,calc(100vw - 32px));max-height:calc(100dvh - 32px);box-sizing:border-box;overflow:auto;border:1px solid var(--line,#33445b);border-radius:20px;background:var(--panel,#141c2a);color:var(--text,#f0f4fb);padding:24px}
    #motion-cloud-auth::backdrop{background:#020813aa}#motion-cloud-auth h2{margin:0 0 12px}#motion-cloud-auth p{font-size:13px;overflow-wrap:anywhere}
    #motion-cloud-auth label{display:block;font-size:13px;margin:14px 0}#motion-cloud-auth input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:6px;border:1px solid #33445b;border-radius:10px;background:#0d1420;color:#f0f4fb}
    #motion-cloud-auth button{min-height:44px;padding:10px 14px;margin:4px;border:1px solid #33445b;border-radius:10px;background:#193e3b;color:#b7f6dd;cursor:pointer}#motion-cloud-auth [hidden]{display:none}
  `;document.head.appendChild(style);
  window.MotionSync={getStatus,flush,markRecords:()=>capture('records'),markCheckins:()=>capture('checkins'),markGifBindings:()=>capture('gifBindings'),markPreferences:()=>capture('preferences'),importAnonymous,showAccount,mount,getSession:async()=>client?checked(await client.auth.getSession())?.session:null};
  window.motionLogCloudSignOut=async()=>{if(client){checked(await client.auth.signOut());switchSession(null);}};
  window.addEventListener('online',()=>{lastError='';retryDelay=2000;void boot();schedule(0);renderStatus();});
  window.addEventListener('offline',()=>{clearTimeout(timer);renderStatus();});
  window.addEventListener('focus',()=>schedule(0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(0);});
  window.addEventListener('storage',event=>{
    if(event.key!==PREFIX+scope||!event.newValue)return;
    try {
      const next=readCache(scope);next.pending=joinOperations(next.pending,envelope.pending);
      next.payload=merge(next.payload,next.pending);envelope=next;applyToApp();changed();
    }catch(error){lastError=error.message;renderStatus();}
  });
  try {envelope=loadScope(scope);applyToApp();}catch(error){envelope=emptyCache();observed=appState();lastError=error.message;}
  mount(document.querySelector('[data-motion-sync-slot]')||document.querySelector('.top-actions')||document.querySelector('.topbar'));
  renderStatus();void boot();
})();
