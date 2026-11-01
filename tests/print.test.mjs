import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {renderReport} from '../public/report-view.js';
import {preparePrint} from '../public/print-bridge.js';
const entry={date:'2026-01-01',low:1,activation:2,energy:3,anxiety:0,irritability:1,sleep:8,medication:'Личное назначение 931',events:'Прогулка',notes:'Запись <script>alert(1)</script>'};
const report={title:'Отчёт <img src=x>',created_at:'2026-01-02T12:00:00Z',snapshot:{version:1,start:entry.date,end:entry.date,timezone:'UTC',questions:'Вопросы\nк встрече',entries:[entry]}};
test('Shared report rendering preserves Cyrillic, questions, charts and escapes text',()=>{const html=renderReport(report);assert.ok(html.includes('Вопросы\nк встрече'));assert.ok(html.includes('Личное назначение 931'));assert.equal((html.match(/<svg /g)||[]).length,2);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x>'));assert.ok(html.includes('&lt;script&gt;'));});
test('Private report rendering never includes excluded details',()=>{const html=renderReport({...report,snapshot:{...report.snapshot,detailsIncluded:false}});assert.ok(!html.includes('Личное назначение 931'));assert.ok(!html.includes('Прогулка'));assert.ok(html.includes('исключены из этого снимка'));});
test('Print transfer is memory-only, contains no credentials and closes after delivery',()=>{let instance,expire;class Channel{constructor(name){this.name=name;instance=this;}postMessage(data){this.sent=data;}close(){this.closed=true;}}
 const url=preparePrint({...report,access_token:'do-not-copy'},{Channel,makeToken:()=> '12345678-1234-1234-1234-123456789abc',schedule:fn=>{expire=fn;return 1;},cancel:()=>{}});
 assert.equal(url,'/print.html#12345678-1234-1234-1234-123456789abc');assert.ok(!url.includes('Отчёт'));
 instance.onmessage({data:{type:'ready'}});assert.equal(instance.sent.report.access_token,undefined);assert.deepEqual(instance.sent.report.snapshot,report.snapshot);
 instance.onmessage({data:{type:'received'}});assert.equal(instance.closed,true);expire();
});
test('Print transfer expiration prevents stale access',()=>{let instance,expire;class Channel{constructor(){instance=this;}postMessage(){throw Error('expired data sent');}close(){this.closed=true;}}
 preparePrint(report,{Channel,schedule:fn=>{expire=fn;return 1;},cancel:()=>{}});expire();instance.onmessage({data:{type:'ready'}});assert.equal(instance.closed,true);
});
const source=(await readFile(new URL('../public/print.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
function printPage({hash='#12345678-1234-1234-1234-123456789abc',blocked=false}={}){const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',disabled:id==='#print-button',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;},setAttribute(key,value){this[key]=value;}});return nodes.get(id);}let channel,printed=0,cleaned=false;class Channel{constructor(){channel=this;}postMessage(data){this.sent=data;}close(){this.closed=true;}}
 const ctx={renderReport,document:{querySelector:node},location:{hash,pathname:'/print.html'},history:{replaceState(){cleaned=true;}},BroadcastChannel:Channel,setTimeout:()=>1,clearTimeout(){},window:{print(){printed++;if(blocked)throw Error('blocked');}}};vm.runInNewContext(source,ctx);return {node,channel,printed:()=>printed,cleaned:()=>cleaned};}
test('Dedicated print page receives the snapshot and calls print directly from its button',()=>{const t=printPage();assert.equal(t.cleaned(),true);assert.equal(t.channel.sent.type,'ready');t.channel.onmessage({data:{type:'report',report}});assert.equal(t.node('#print-button').disabled,false);assert.match(t.node('#report').innerHTML,/Вопросы/);assert.equal(t.channel.closed,true);t.node('#print-button').listeners.click();assert.equal(t.printed(),1);});
test('Blocked printing leaves visible keyboard and browser-menu fallback',()=>{const t=printPage({blocked:true});t.channel.onmessage({data:{type:'report',report}});t.node('#print-button').listeners.click();assert.match(t.node('#print-status').textContent,/Ctrl\+P/);assert.equal(t.node('#print-status').role,'alert');});
test('Opening or reloading print page without a transfer has explicit instructions',()=>{const t=printPage({hash:''});assert.equal(t.node('#print-button').disabled,true);assert.match(t.node('#print-status').textContent,/Мои отчёты/);});
