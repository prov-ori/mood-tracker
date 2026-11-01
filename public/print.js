import {renderReport} from './report-view.js';
const status=document.querySelector('#print-status'),button=document.querySelector('#print-button');
const token=location.hash.slice(1);
history.replaceState(null,'',location.pathname);
function fail(message){status.textContent=message;status.setAttribute('role','alert');}
button.addEventListener('click',()=>{if(!button.disabled){status.textContent='В окне печати выберите сохранение в PDF. Если окно не появилось, используйте Ctrl+P или меню браузера → Печать.';try{window.print();}catch{fail('Браузер не разрешил вызвать печать. Используйте Ctrl+P или меню браузера → Печать.');}}});
if(!/^[0-9a-f-]{36}$/i.test(token)||typeof BroadcastChannel!=='function'){
 fail('Откройте «Мои отчёты» в дневнике, выберите отчёт и снова нажмите «Печать / сохранить PDF».');
}else{
 const channel=new BroadcastChannel('mood-atlas-print:'+token);
 const timer=setTimeout(()=>{channel.close();fail('Отчёт не получен. Вернитесь в открытую вкладку дневника и нажмите кнопку печати заново.');},15000);
 channel.onmessage=event=>{
  if(event.data?.type!=='report')return;
  try{document.querySelector('#report').innerHTML=renderReport(event.data.report);button.disabled=false;status.textContent='Отчёт готов. Можно сохранить PDF.';channel.postMessage({type:'received'});}
  catch{fail('Не удалось подготовить этот отчёт. Вернитесь в дневник и создайте новый снимок.');}
  finally{clearTimeout(timer);channel.close();}
 };
 channel.postMessage({type:'ready'});
}
