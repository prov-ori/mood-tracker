// Reports travel only between same-origin tabs; no persistent storage or auth tokens.
let stopPrevious=()=>{};
export function preparePrint(report,{Channel=globalThis.BroadcastChannel,makeToken=()=>crypto.randomUUID(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof Channel!=='function')throw Error('Браузер не поддерживает отдельную страницу печати. Откройте сайт в актуальном Chrome, Edge или Firefox.');
 stopPrevious();
 const token=makeToken();
 const channel=new Channel('mood-atlas-print:'+token);
 let snapshot=structuredClone({title:report.title,created_at:report.created_at,snapshot:report.snapshot}),closed=false,timer;
 const close=()=>{if(closed)return;closed=true;snapshot=null;cancel(timer);channel.close();};
 channel.onmessage=event=>{if(event.data?.type==='ready'&&!closed)channel.postMessage({type:'report',report:snapshot});if(event.data?.type==='received')close();};
 timer=schedule(close,120000);stopPrevious=close;
 return '/print.html#'+token;
}
