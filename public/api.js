const cfg=window.MOOD_CONFIG||{};
export const configured=!!cfg.supabaseUrl&&!!cfg.supabaseKey;
const base=(cfg.supabaseUrl||'').replace(/\/$/,'');
if(configured && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||cfg.supabaseKey.startsWith('sb_secret_'))) throw Error('Проверьте публичную конфигурацию Supabase.');
let session=null,refreshing=null;
try{session=JSON.parse(sessionStorage.getItem('mood-session')||'null');}catch{sessionStorage.removeItem('mood-session');}
function save(s){session=s;if(s)sessionStorage.setItem('mood-session',JSON.stringify(s));else sessionStorage.removeItem('mood-session');}
async function request(path,{method='GET',body,auth=false,headers={}}={}) {
  if(!configured)throw Error('Сначала настройте public/config.js по инструкции README.');
  if(auth)await token();
  const response=await fetch(base+path,{method,headers:{apikey:cfg.supabaseKey,...(auth?{Authorization:'Bearer '+session.access_token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data=null;}
  if(!response.ok){const message=data?.msg||data?.message||data?.error_description||data?.error||`Ошибка ${response.status}`;throw Error(message);}
  return data;
}
function setTokens(s){save({...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)});}
async function token(){
  if(!session?.access_token)throw Error('Войдите в аккаунт.');
  if(session.expires_at>Date.now()/1000+60)return;
  if(!refreshing)refreshing=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(setTokens).catch(e=>{save(null);throw e;}).finally(()=>refreshing=null);
  await refreshing;
}
export const api={
  async callback(){const h=new URLSearchParams(location.hash.slice(1));if(h.has('error_description')){history.replaceState(null,'',location.pathname);throw Error(h.get('error_description'));}if(!h.get('access_token'))return false;
    setTokens({access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:Number(h.get('expires_in'))||3600});const recovery=h.get('type')==='recovery';history.replaceState(null,'',location.pathname);return recovery;},
  async current(){if(!session)return null;await token();return request('/auth/v1/user',{auth:true});},
  async login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});setTokens(s);return s.user;},
  async signup(email,password){return request('/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin),{method:'POST',body:{email,password}});},
  async recover(email){await request('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin),{method:'POST',body:{email}});},
  async password(password){return request('/auth/v1/user',{method:'PUT',auth:true,body:{password}});},
  async logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',auth:true});}finally{save(null);}},
  clear(){save(null);},
  async all(table){let out=[],offset=0;for(;;){const rows=await request(`/rest/v1/${table}?select=*&order=${table==='entries'?'date.asc':'created_at.desc,id.asc'}&limit=1000&offset=${offset}`,{auth:true});out.push(...rows);if(rows.length<1000)return out;offset+=rows.length;}},
  async upsert(table,data,conflict){return request(`/rest/v1/${table}?on_conflict=${conflict}`,{method:'POST',auth:true,body:data,headers:{Prefer:'resolution=merge-duplicates,return=representation'}});},
  async insert(table,data){return request('/rest/v1/'+table,{method:'POST',auth:true,body:data,headers:{Prefer:'return=representation'}});},
  async remove(table,filter){return request(`/rest/v1/${table}?${filter}`,{method:'DELETE',auth:true});},
  async rpc(name,body={}){return request('/rest/v1/rpc/'+name,{method:'POST',auth:true,body});}
};
