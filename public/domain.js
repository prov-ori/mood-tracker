export const fields = ['low','activation','energy','anxiety','irritability'];
export const labels = {low:'Сниженное настроение',activation:'Активация / возбуждение',energy:'Энергия',anxiety:'Тревога',irritability:'Раздражительность',sleep:'Сон, часов'};
export function localDate(date = new Date(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
export function validDate(s) {return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;}
export function validateEntry(input) {
  if (!input || !validDate(input.date)) throw Error('Некорректная дата записи.');
  const out={date:input.date};
  for(const k of fields) {
    if(typeof input[k]!=='number' || !Number.isInteger(input[k]) || input[k]<0 || input[k]>4) throw Error(`Показатель «${labels[k]}» должен быть целым числом от 0 до 4.`);
    out[k]=input[k];
  }
  if(typeof input.sleep!=='number' || !Number.isFinite(input.sleep) || input.sleep<0 || input.sleep>24 || input.sleep*4%1!==0) throw Error('Сон: от 0 до 24 часов с шагом 0,25.');
  out.sleep=input.sleep;
  for(const k of ['notes','medication','events']) {
    if(input[k]!==undefined && typeof input[k]!=='string') throw Error('Текстовое поле имеет неверный формат.');
    out[k]=input[k]||'';
    if(out[k].length>5000) throw Error('Максимум 5000 символов в текстовом поле.');
  }
  return out;
}
export function daysBetween(start,end) {
  if(!validDate(start)||!validDate(end)||end<start) throw Error('Проверьте период: начало должно быть не позже конца.');
  return Math.round((Date.parse(end)-Date.parse(start))/86400000)+1;
}
export function summary(entries,start,end) {
  const days=daysBetween(start,end);
  const selected=entries.filter(e=>e.date>=start&&e.date<=end).sort((a,b)=>a.date.localeCompare(b.date));
  const averages=Object.fromEntries([...fields,'sleep'].map(k=>[k,selected.length?selected.reduce((s,e)=>s+e[k],0)/selected.length:null]));
  return {days,filled:selected.length,missing:days-selected.length,coverage:Math.round(selected.length/days*100),averages,entries:selected};
}
export function escapeHTML(s) {return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function csv(entries) {
  const cols=['date',...fields,'sleep','medication','events','notes'];
  const cell=v=>{let s=String(v??''); if(/^[\s]*[=+\-@]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[cols.map(k=>cell(labels[k]||({date:'Дата',medication:'Препараты',events:'События',notes:'Заметки'}[k]))).join(';'),...entries.map(e=>cols.map(k=>cell(e[k])).join(';'))].join('\r\n');
}
export function parseBackup(raw) {
  const x=JSON.parse(raw);
  if(x?.format!=='mood-atlas' || x.version!==1 || !Array.isArray(x.entries) || x.entries.length>20000) throw Error('Это не поддерживаемая резервная копия Mood Atlas.');
  const entries=x.entries.map(validateEntry);
  if(new Set(entries.map(e=>e.date)).size!==entries.length) throw Error('В копии есть повторяющиеся даты.');
  const reports=(x.reports||[]).map(r=>{
    if(typeof r.title!=='string'||r.title.length>120||!r.snapshot||r.snapshot.version!==1) throw Error('Некорректный отчёт в копии.');
    const snap=r.snapshot;daysBetween(snap.start,snap.end);
    if(!Array.isArray(snap.entries)||snap.entries.length>20000) throw Error('Некорректные записи отчёта.');
    const rows=snap.entries.map(validateEntry);
    if(new Set(rows.map(e=>e.date)).size!==rows.length || rows.some(e=>e.date<snap.start||e.date>snap.end)) throw Error('Некорректный период записей отчёта.');
    const zone=snap.timezone||'UTC';new Intl.DateTimeFormat('ru',{timeZone:zone});
    return {title:r.title,snapshot:{version:1,start:snap.start,end:snap.end,timezone:zone,entries:rows}};
  });
  if(reports.length>500) throw Error('В копии слишком много отчётов (максимум 500).');
  return {entries,reports};
}
export function demoEntries(today) {
  return Array.from({length:60},(_,i)=>{
    const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-59+i);
    const v=Math.sin(i/6);
    return {date:d.toISOString().slice(0,10),low:Math.max(0,Math.round(1-v)),activation:Math.max(0,Math.round(v+1)),energy:Math.round(2+v),anxiety:Math.round(1+Math.abs(v)),irritability:i%7===0?2:1,sleep:7.5-Math.round(v*4)/4,medication:'',events:i%9===0?'Прогулка, спокойный вечер':'',notes:i%9===0?'После прогулки было легче сосредоточиться.':''};
  }).filter((_,i)=>i%8!==0);
}
