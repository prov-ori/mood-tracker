// Password-protected files only. This does not encrypt the live Supabase database.
const FORMAT='mood-atlas-encrypted',ITERATIONS=600000,MAX_BYTES=20*1024*1024;
const enc=new TextEncoder();
const aad=enc.encode('mood-atlas-encrypted:v1');
function requireCrypto(){if(!globalThis.crypto?.subtle)throw Error('Для защищённой копии нужен современный браузер и HTTPS (или localhost).');}
function validPassword(password){if(typeof password!=='string'||password.length<12||password.length>128)throw Error('Пароль копии: от 12 до 128 символов. Используйте отдельную длинную парольную фразу.');}
function base64(bytes){let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);}
function unbase64(value,max){if(typeof value!=='string'||value.length>Math.ceil(max/3)*4+4||value.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('Некорректный формат защищённой копии.');let s;try{s=atob(value);}catch{throw Error('Некорректный формат защищённой копии.');}if(s.length>max)throw Error('Защищённая копия слишком большая.');return Uint8Array.from(s,c=>c.charCodeAt(0));}
async function derive(password,salt){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
export async function encryptBackup(text,password){
  requireCrypto();validPassword(password);
  if(typeof text!=='string')throw Error('Некорректные данные копии.');
  const bytes=enc.encode(text);if(bytes.length>MAX_BYTES)throw Error('Копия превышает 20 МБ.');
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(password,salt);
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,bytes);
  return JSON.stringify({format:FORMAT,version:1,kdf:'PBKDF2-SHA256',iterations:ITERATIONS,cipher:'AES-256-GCM',salt:base64(salt),iv:base64(iv),data:base64(new Uint8Array(ciphertext))});
}
export function isEncryptedBackup(text){try{return JSON.parse(text)?.format===FORMAT;}catch{return false;}}
export async function decryptBackup(text,password){
  requireCrypto();validPassword(password);
  if(typeof text!=='string'||text.length>29*1024*1024)throw Error('Защищённая копия слишком большая.');
  let x;try{x=JSON.parse(text);}catch{throw Error('Некорректный формат защищённой копии.');}
  // Fixed allowlist prevents attacker-controlled algorithms or excessive work factors.
  if(x?.format!==FORMAT||x.version!==1||x.kdf!=='PBKDF2-SHA256'||x.iterations!==ITERATIONS||x.cipher!=='AES-256-GCM')throw Error('Неподдерживаемая версия защищённой копии.');
  const salt=unbase64(x.salt,16),iv=unbase64(x.iv,12),data=unbase64(x.data,MAX_BYTES+16);
  if(salt.length!==16||iv.length!==12||data.length<16)throw Error('Некорректный формат защищённой копии.');
  try{const key=await derive(password,salt);const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},key,data);return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
  catch{throw Error('Не удалось открыть копию: неверный пароль или файл повреждён.');}
}
