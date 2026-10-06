// "Modo Fill" bookmarklet: runs on the carrier's order-status page (Verizon first), fills the order number,
// ZIP, email and last name that Modo put on the clipboard, presses the search button, reads the status off
// the page and sends it back to the sale in Modo. Everything runs in the agent's own browser — no API keys,
// no server scraping (carriers block that), nothing installed except one bookmark.
//
// Clipboard payload: "MODO1:" + base64(JSON {o: order, z: zip, e: email, l: last name, p: phone, id: sale id, u: Modo origin, c: carrier})

export const FILL_PREFIX = "MODO1:";

export const CARRIER_ORDER_PAGES = {
  verizon: "https://www.verizon.com/digital/nsa/nos/ui/orders/trackmyorder/",
  att: "https://www.att.com/orderstatus/",
  tmobile: "https://www.t-mobile.com/order-status",
};

export const ORDER_STATUSES = ["Order received", "Processing", "Shipped", "Out for delivery", "Delivered", "Ready for pickup", "Backordered", "Activated", "Cancelled", "Other"];

// Map a carrier's wording to Modo's tracking status (used by the Order tracking page).
export function normalizeOrderStatus(s) {
  const t = String(s || "").toLowerCase();
  if (/deliver(ed)?\b/.test(t) && !/out for/.test(t)) return "delivered";
  if (/out for delivery/.test(t)) return "out_for_delivery";
  if (/ship|transit/.test(t)) return "in_transit";
  if (/cancel|return/.test(t)) return /return/.test(t) ? "returned" : "exception";
  if (/back ?order|delay|hold|problem|exception/.test(t)) return "exception";
  if (/pick ?up/.test(t)) return "dropped_off";
  return "pending";
}

export function encodeFill(sale, origin, carrier = "verizon") {
  const name = String(sale.customer || "").trim().split(/\s+/);
  const data = { o: String(sale.orderNumber || "").trim(), z: String(sale.zip || "").replace(/\D/g, "").slice(0, 5), e: sale.email || "", l: name.length > 1 ? name[name.length - 1] : "",
    p: String(sale.phone || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""), id: sale.id, u: origin, c: carrier };
  return FILL_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

// Status is only read once the order number itself shows up on the page (the results), so marketing text
// on the search form ("track a delivered order…") can't be mistaken for a status.
// Payload for reading a UPS tracking page (Track on UPS): k = "ups", o = tracking number.
export function encodeUps(sale, origin) {
  const data = { k: "ups", o: String(sale.num || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase(), id: sale.id, u: origin };
  return FILL_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(data))));
}

// The bookmarklet source (kept readable here; minified into a javascript: URL below).
const SRC = String.raw`(async()=>{
const P='MODO1:';const AUTO=!!window.__MODO_AUTO;let raw=String(window.__MODO_CODE||'').trim();
if(!raw.startsWith(P)&&!AUTO){try{raw=(await navigator.clipboard.readText()||'').trim()}catch(e){}
if(!raw.startsWith(P))raw=(prompt('Modo Fill: paste the order code from Modo (Ctrl+V)')||'').trim();}
if(!raw.startsWith(P)){if(!AUTO)alert('Modo Fill: no order code found. In Modo press "Check order" first, then click this bookmark on the carrier page.');return}
let d;try{d=JSON.parse(decodeURIComponent(escape(atob(raw.slice(P.length)))))}catch(e){alert('Modo Fill: that code is damaged. Press "Check order" in Modo again.');return}
if(d.k==='ups'){
const UB=document.createElement('div');UB.id='modo-fill';document.getElementById('modo-fill')?.remove();
UB.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:290px;font:13px/1.45 system-ui,sans-serif;color:#eef0fa;background:#10111e;border:1px solid rgba(139,92,246,.5);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px';
document.body.appendChild(UB);
const ST=[['label','Label made'],['dropped_off','Dropped off'],['in_transit','On the way'],['out_for_delivery','Out for delivery'],['delivered','Delivered'],['exception','Problem'],['returned','Returned']];
const PH=[[/\bout for delivery\b/i,'out_for_delivery'],[/\bdelivered\b(?! by)/i,'delivered'],[/\bon the way\b/i,'in_transit'],[/\bin transit\b/i,'in_transit'],[/\bwe have your package\b/i,'dropped_off'],[/\bdrop-?off\b|\bdropped off\b/i,'dropped_off'],[/\breturned to sender\b/i,'returned'],[/\bdelivery attempted\b|\bexception\b|\baction required\b/i,'exception'],[/\blabel created\b|\bshipper created a label\b/i,'label']];
const txt=()=>[...document.body.children].filter(n=>n!==UB&&n.tagName!=='SCRIPT').map(n=>n.innerText||'').join('\n');
const scanU=()=>{const b=txt();const at=b.toUpperCase().indexOf(d.o);if(at<0)return null;const z=b.slice(Math.max(0,at-400));let best=null;for(const[re,st]of PH){const m=z.match(re);if(m&&(!best||m.index<best.i))best={i:m.index,st}}if(!best)return null;return{st:best.st,snip:z.slice(best.i,best.i+150).split('\n').slice(0,2).join(' · ').replace(/\s+/g,' ').trim()}};
const btnS='background:linear-gradient(135deg,#22d3ee,#8b5cf6);color:#fff;border:0;border-radius:999px;padding:7px 12px;font-weight:700;cursor:pointer';
const save=(st,sn)=>{try{sessionStorage.removeItem('modo-code')}catch(e){}window.open(d.u+'/order-status?k=ups&i='+encodeURIComponent(d.id)+'&s='+encodeURIComponent(st)+'&n='+encodeURIComponent((sn||'').slice(0,200)),'_blank');UB.querySelector('#mu-save').textContent='Sent ✓'};
const drawU=(r,msg)=>{UB.innerHTML='<b style="font-size:14px">Modo · UPS '+d.o+'</b><div style="opacity:.7;margin:2px 0 8px">'+msg+'</div><select id="mu-s" style="width:100%;margin:0 0 8px;padding:6px;border-radius:8px;background:#1b1c2e;color:#fff;border:1px solid #333">'+ST.map(([k,l])=>'<option value="'+k+'"'+(r&&r.st===k?' selected':'')+'>'+l+'</option>').join('')+'</select><div style="display:flex;gap:6px"><button id="mu-save" style="'+btnS+'">Save to Modo</button><button id="mu-x" style="margin-left:auto;background:none;border:0;color:#aaa;cursor:pointer;font-size:16px">✕</button></div>';
UB.querySelector('#mu-x').onclick=()=>UB.remove();UB.querySelector('#mu-s').onfocus=()=>{UB.dataset.stop='1'};
UB.querySelector('#mu-save').onclick=()=>save(UB.querySelector('#mu-s').value,r?r.snip:'');
if(r&&AUTO){let k=3;const b=UB.querySelector('#mu-save');const tick=()=>{if(!UB.isConnected||UB.dataset.stop)return;if(k===0){b.click();return}b.textContent='Saving in '+k--+'…';setTimeout(tick,1000)};tick()}};
drawU(null,'Reading UPS…');let tr=0;const iv=setInterval(()=>{const r=scanU();if(r||++tr>30){clearInterval(iv);r?drawU(r,'UPS says this — '+(AUTO?'saving it to Modo…':'check it and save.')):drawU(null,'Couldn\'t read the status. If UPS asks you to verify, do that — or pick the step and save.')}},1000);
return}

const all=(sel,root=document,out=[])=>{root.querySelectorAll(sel).forEach(x=>out.push(x));root.querySelectorAll('*').forEach(x=>x.shadowRoot&&all(sel,x.shadowRoot,out));return out};
const vis=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(el).visibility!=='hidden'};
const txt=el=>[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('data-testid'),el.autocomplete,el.labels?[...el.labels].map(l=>l.textContent).join(' '):'',(el.closest('label,div,fieldset')||{}).textContent?.slice(0,80)].join(' ').toLowerCase();
const put=(el,v)=>{el.focus();const pr=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(pr,'value').set.call(el,v);['input','change','keyup','blur'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})))};
const fill=()=>{let n=0;const used=new Set();for(const el of all('input,textarea')){if(!vis(el)||/hidden|submit|button|checkbox|radio|search/.test(el.type))continue;const t=txt(el);let v=null,k='';
if(/order/.test(t)&&!used.has('o')){v=d.o;k='o'}else if(/zip|postal/.test(t)&&!used.has('z')){v=d.z;k='z'}else if(/e-?mail/.test(t)&&!used.has('e')){v=d.e;k='e'}else if(/last ?name|surname/.test(t)&&!used.has('l')){v=d.l;k='l'}else if(/phone|mobile|wireless number/.test(t)&&!used.has('p')){v=d.p;k='p'}
if(v){put(el,v);used.add(k);n++}}return n};
let n=fill();
const S=['out for delivery','delivered','in transit','shipped','ready for pickup','backordered','back ordered','on backorder','processing','in progress','order received','received','pending','activated','complete','cancelled','canceled','returned','on hold','delayed'];
const box=document.createElement('div');box.id='modo-fill';
box.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;width:300px;font:13px/1.45 system-ui,sans-serif;color:#eef0fa;background:#10111e;border:1px solid rgba(139,92,246,.5);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px';
document.getElementById('modo-fill')?.remove();document.body.appendChild(box);
const btn='background:linear-gradient(135deg,#22d3ee,#8b5cf6);color:#fff;border:0;border-radius:999px;padding:7px 12px;font-weight:700;cursor:pointer';
const render=(st,snip,msg)=>{box.innerHTML='<b style="font-size:14px">Modo · order #'+d.o+'</b><div style="opacity:.7;margin:2px 0 8px">'+(msg||'')+'</div>'
+'<label style="display:block;opacity:.7;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Status</label><select id="mf-s" style="width:100%;margin:4px 0 8px;padding:6px;border-radius:8px;background:#1b1c2e;color:#fff;border:1px solid #333">'
+['Order received','Processing','Shipped','Out for delivery','Delivered','Ready for pickup','Backordered','Activated','Cancelled','Other'].map(x=>'<option'+(st&&x.toLowerCase()===st.toLowerCase()?' selected':'')+'>'+x+'</option>').join('')+'</select>'
+'<textarea id="mf-n" rows="3" style="width:100%;box-sizing:border-box;padding:6px;border-radius:8px;background:#1b1c2e;color:#fff;border:1px solid #333" placeholder="Details (ship date, tracking #…)">'+(snip||'').replace(/</g,'&lt;')+'</textarea>'
+'<div style="display:flex;gap:6px;margin-top:8px"><button id="mf-save" style="'+btn+'">Save to Modo</button><button id="mf-fill" style="background:none;color:#ccc;border:1px solid #444;border-radius:999px;padding:7px 12px;cursor:pointer">Fill again</button><button id="mf-x" style="margin-left:auto;background:none;border:0;color:#aaa;cursor:pointer;font-size:16px">✕</button></div>';
box.querySelector('#mf-x').onclick=()=>box.remove();box.querySelector('#mf-fill').onclick=()=>{n=fill();go(true)};box.querySelectorAll('select,textarea').forEach(x=>x.addEventListener('focus',()=>{box.dataset.stop='1';const b=box.querySelector('#mf-save');if(b&&/Saving/.test(b.textContent))b.textContent='Save to Modo'}));
box.querySelector('#mf-save').onclick=()=>{try{sessionStorage.removeItem('modo-code')}catch(e){}const s=box.querySelector('#mf-s').value,no=box.querySelector('#mf-n').value.slice(0,280);window.open(d.u+'/order-status?i='+encodeURIComponent(d.id)+'&s='+encodeURIComponent(s)+'&n='+encodeURIComponent(no)+'&c='+encodeURIComponent(d.c||''),'_blank');box.querySelector('#mf-save').textContent='Sent ✓'}};
const map=w=>({'back ordered':'Backordered','on backorder':'Backordered','backordered':'Backordered','in transit':'Shipped','shipped':'Shipped','out for delivery':'Out for delivery','delivered':'Delivered','ready for pickup':'Ready for pickup','processing':'Processing','in progress':'Processing','order received':'Order received','received':'Order received','pending':'Processing','activated':'Activated','complete':'Delivered','cancelled':'Cancelled','canceled':'Cancelled','returned':'Other','on hold':'Backordered','delayed':'Backordered'}[w]||'Other');
const scan=()=>{const body=[...document.body.children].filter(n=>n!==box&&n.tagName!=='SCRIPT').map(n=>n.innerText||'').join('\n');const low=body.toLowerCase();const at=d.o?low.indexOf(d.o.toLowerCase()):-1;if(at<0)return null;const zone=low.slice(Math.max(0,at-600),at+1500);
for(const w of S){const i=zone.indexOf(w);if(i>=0){const raw=body.slice(Math.max(0,at-600),at+1500);return{st:map(w),snip:raw.slice(Math.max(0,i-60),i+120).replace(/\s+/g,' ').trim()}}}return null};
const go=(force)=>{render(null,'',n?('Filled '+n+' field'+(n>1?'s':'')+'. Searching…'):'Couldn\'t find the form fields — type them in, search, then press Fill again.');
const sub=all('button,input[type=submit],a[role=button]').find(b=>vis(b)&&!b.disabled&&/track|check|search|submit|continue|find|view|look ?up|go\b/i.test((b.textContent||b.value||b.getAttribute('aria-label')||'').trim())&&!/sign ?in|log ?in/i.test(b.textContent||''));
const K='mf-'+d.o;let once='';try{once=sessionStorage.getItem(K)||''}catch(e){}if(n&&sub&&(!once||force)){try{sessionStorage.setItem(K,'1')}catch(e){}setTimeout(()=>sub.click(),400)}
let tries=0;const t=setInterval(()=>{const r=scan();if(r||++tries>30){clearInterval(t);r?(render(r.st,r.snip,AUTO?'Found the status — saving it to Modo…':'Found the status on this page — check it and save.'),AUTO&&(()=>{let k=3;const b=box.querySelector('#mf-save');const tick=()=>{if(!box.isConnected||box.dataset.stop)return;if(k===0){b.click();return}b.textContent='Saving in '+k--+'… (tap the status to change)';setTimeout(tick,1000)};tick()})()):render(null,'','No status found yet. If the page asks you to sign in or verify, do that, then press Fill again. Or pick the status yourself and save.')}},1000)};
go();
})()`;

export const FILL_SRC = SRC;

export const BOOKMARKLET = "javascript:" + encodeURIComponent(SRC.replace(/\n/g, ""));

// Read a status out of text the agent copied from the carrier's page (phone flow, no bookmark needed).
const WORDS = [["out for delivery", "Out for delivery"], ["delivered", "Delivered"], ["in transit", "Shipped"], ["shipped", "Shipped"], ["ready for pickup", "Ready for pickup"],
  ["backordered", "Backordered"], ["back ordered", "Backordered"], ["on backorder", "Backordered"], ["on hold", "Backordered"], ["delayed", "Backordered"], ["cancelled", "Cancelled"], ["canceled", "Cancelled"],
  ["activated", "Activated"], ["processing", "Processing"], ["in progress", "Processing"], ["pending", "Processing"], ["order received", "Order received"], ["received", "Order received"], ["complete", "Delivered"]];
export function detectStatus(text, orderNumber) {
  const body = String(text || ""); const low = body.toLowerCase();
  const at = orderNumber ? low.indexOf(String(orderNumber).toLowerCase()) : -1;
  const zone = at >= 0 ? low.slice(Math.max(0, at - 600), at + 1500) : low;
  const base = at >= 0 ? Math.max(0, at - 600) : 0;
  let best = null;
  for (const [w, st] of WORDS) { const i = zone.indexOf(w); if (i >= 0 && (!best || i < best.i)) best = { i, st, w }; }
  if (!best) return null;
  const s = base + best.i;
  return { status: best.st, note: body.slice(Math.max(0, s - 60), s + 140).replace(/\s+/g, " ").trim() };
}
