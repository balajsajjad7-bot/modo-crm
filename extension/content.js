// Modo Fill add-on: when Modo opens a carrier order page with #modo=<code>, fill it, search,
// read the status and save it back to Modo. Runs only on the carrier order pages listed in manifest.json.
(function () {
  if (/modo-crm1\.vercel\.app$/.test(location.hostname)) { document.documentElement.dataset.modoFill = "1"; return; }
  var m = location.hash.match(/[#&]modo=([^&]+)/);
  if (m) {
    try { sessionStorage.setItem("modo-code", decodeURIComponent(m[1])); } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  var code = ""; try { code = sessionStorage.getItem("modo-code") || ""; } catch (e) {}
  if (!code) return;
  window.__MODO_CODE = code; window.__MODO_AUTO = 1;
  var run = function () { setTimeout(function () {
(async()=>{
const P='MODO1:';const AUTO=!!window.__MODO_AUTO;let raw=String(window.__MODO_CODE||'').trim();
if(!raw.startsWith(P)&&!AUTO){try{raw=(await navigator.clipboard.readText()||'').trim()}catch(e){}
if(!raw.startsWith(P))raw=(prompt('Modo Fill: paste the order code from Modo (Ctrl+V)')||'').trim();}
if(!raw.startsWith(P)){if(!AUTO)alert('Modo Fill: no order code found. In Modo press "Check order" first, then click this bookmark on the carrier page.');return}
let d;try{d=JSON.parse(decodeURIComponent(escape(atob(raw.slice(P.length)))))}catch(e){alert('Modo Fill: that code is damaged. Press "Check order" in Modo again.');return}
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
})()
  }, 1200); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
