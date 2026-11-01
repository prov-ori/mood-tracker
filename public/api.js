const cfg=window.MOOD_CONFIG||{};
const base=typeof cfg.supabaseUrl==='string'?cfg.supabaseUrl.replace(/\/$/,''):'';
const key=typeof cfg.supabaseKey==='string'?cfg.supabaseKey:'';
let unsafeKey=key.startsWith('sb_secret_');
try{if(key.split('.').length===3){const raw=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');unsafeKey ||= JSON.parse(atob(raw)).role==='service_role';}}catch{/* Invalid tokens are rejected by Supabase. */}
export const configError=base||key?(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key||unsafeKey?'Проверьте Project URL и публичный Publishable / anon key в config.js. Секретный ключ использовать нельзя.':''):'';
export const configured=!!base&&!!key&&!configError;
let session=null,refreshing=null;
function save(s){session=s;try{if(s)sessionStorage.setItem('mood-session',JSON.stringify(s));else sessionStorage.removeItem('mood-session');}catch{/* Private browser modes can deny storage; keep the session in memory. */}}
try{const s=JSON.parse(sessionStorage.getItem('mood-session')||'null');if(s?.access_token&&s?.refresh_token&&Number.isFinite(s.expires_at))session=s;else save(null);}catch{save(null);}
async function request(path,{method='GET',body,auth=false,headers={}}={}) {
  if(!configured)throw Error(configError||'Сначала настройте public/config.js по инструкции README.');
  if(auth)await token();
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);
  try{
    const response=await fetch(base+path,{method,signal:controller.signal,headers:{apikey:key,...(auth?{Authorization:'Bearer '+session.access_token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw Error('Сервер вернул неожиданный ответ. Обновите данные и повторите.');}
    if(!response.ok){const error=Error(data?.msg||data?.message||data?.error_description||data?.error||`Ошибка ${response.status}`);error.status=response.status;throw error;}
    return data;
  }catch(e){if(e.name==='AbortError')throw Error(method==='GET'?'Сервер не ответил вовремя. Повторите загрузку.':'Ответ сервера не получен. Действие могло выполниться: сначала обновите данные, затем проверьте результат.');throw e;}
  finally{clearTimeout(timeout);}
}
function setTokens(s){if(!s?.access_token||!s?.refresh_token)throw Error('Сервер не вернул сеанс входа.');save({...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)});}
async function token(){
  if(!session?.access_token)throw Error('Сеанс завершён. Выйдите и войдите снова.');
  if(session.expires_at>Date.now()/1000+60)return;
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(setTokens).catch(e=>{if([400,401,403].includes(e.status))save(null);throw e;}).finally(()=>refreshing=null);
  await refreshing;
}
const orders={entries:'date.asc',profiles:'user_id.asc',reports:'created_at.desc,id.asc'};
export const api={
  async callback(){const h=new URLSearchParams(location.hash.slice(1));if(h.has('error_description')){history.replaceState(null,'',location.pathname);throw Error(h.get('error_description'));}if(!h.get('access_token'))return false;
    const recovery=h.get('type')==='recovery';const tokens={access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:Number(h.get('expires_in'))||3600};history.replaceState(null,'',location.pathname);setTokens(tokens);return recovery;},
  async current(){if(!session)return null;return request('/auth/v1/user',{auth:true});},
  async login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:email.trim(),password}});setTokens(s);return s.user;},
  async signup(email,password){return request('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin),{method:'POST',body:{email:email.trim(),password}});},
  async recover(email){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin),{method:'POST',body:{email:email.trim()}});},
  async password(password){return request('/auth/v1/user',{method:'PUT',auth:true,body:{password}});},
  async logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',auth:true});}finally{save(null);}},
  clear(){save(null);},
  async all(table){
    if(!orders[table])throw Error('Неизвестная таблица.');
    let out=[],offset=0;
    for(;;){const rows=await request(`/rest/v1/${table}?select=*&order=${orders[table]}&limit=1000&offset=${offset}`,{auth:true});if(!Array.isArray(rows))throw Error('Некорректный ответ при загрузке данных.');out.push(...rows);if(rows.length<1000)return out;offset+=rows.length;}
  },
  async upsert(table,data,conflict){return request(`/rest/v1/${table}?on_conflict=${conflict}`,{method:'POST',auth:true,body:data,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});},
  async insert(table,data){return request('/rest/v1/'+table,{method:'POST',auth:true,body:data,headers:{Prefer:'return=representation'}});},
  async remove(table,filter){return request(`/rest/v1/${table}?${filter}`,{method:'DELETE',auth:true});},
  async rpc(name,body={}){return request('/rest/v1/rpc/'+name,{method:'POST',auth:true,body});}
};
