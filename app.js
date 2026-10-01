/* ===== CONFIGURACIÓN (fácil de modificar) ===== */
const FRUIT_PINS=[['🍓','Fresa'],['🍋','Limón'],['🍉','Sandía'],['🍍','Piña'],['🍇','Uva'],['🍒','Cereza']];
const USER_MENU=[['forros','Forros para celulares'],['pedF','Pedidos de forros'],['pins','Pins'],['pedP','Pedidos de Pins'],['qr','QR']];
const ADMIN_MENU=[['aF','Forros para celulares VIP'],['aP','Pins VIP'],['aPed','Pedidos generales']];
const ST={P:'Pendiente',OK:'Pedido aceptado',NO:'Pedido rechazado',C:'Cancelado'};
const BUCKET='gojo-images';

/* ===== UTILIDADES ===== */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rid=()=>Math.random().toString(36).slice(2,10);
function toast(t){const e=document.createElement('div');e.className='toast';e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),2500)}
function resize(file){return new Promise((res,rej)=>{const r=new FileReader();r.onerror=rej;r.onload=()=>{const im=new Image();im.onerror=rej;im.onload=()=>{const m=520,k=Math.min(1,m/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=im.width*k;c.height=im.height*k;c.getContext('2d').drawImage(im,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.75))};im.src=r.result};r.readAsDataURL(file)})}

/* ===== SUPABASE (datos reales) ===== */
let sb=null,cid=null,isAdmin=false;const S={products:[],orders:[]};
const pub=p=>p?sb.storage.from(BUCKET).getPublicUrl(p).data.publicUrl:'';
const mapProd=(t,r)=>({id:r.id,type:t,img:pub(r.imagen_path),path:r.imagen_path,price:r.precio,ts:+new Date(r.created_at)});
const mapOrd=r=>({id:r.id,code:r.codigo,type:r.tipo=='Forro'?'forro':'pin',item:r.producto,name:r.nombre,phone:r.telefono,img:pub(r.imagen_path),price:r.precio,status:r.estado,productId:r.producto_id,owner:r.owner_id,ts:+new Date(r.created_at),emoji:(FRUIT_PINS.find(f=>r.producto=='Pin de '+f[1])||[])[0]});
async function load(){
  const [f,p,o]=await Promise.all([sb.from('forros').select('*'),sb.from('pins').select('*'),sb.from('pedidos').select('*').order('created_at',{ascending:false})]);
  if(f.error||p.error||o.error)return toast('Error al cargar datos');
  S.products=[...f.data.map(r=>mapProd('forro',r)),...p.data.map(r=>mapProd('pin',r))];
  S.orders=o.data.map(mapOrd);if(V.view!='gate')render();
}
function live(){sb.channel('gt').on('postgres_changes',{event:'*',schema:'public'},()=>{clearTimeout(live.t);live.t=setTimeout(load,300)}).subscribe();setInterval(load,30000)}
async function setUser(s){cid=s&&s.user.id;const r=cid?await sb.rpc('is_admin'):null;isAdmin=!!r&&r.data===true}
async function logout(){await sb.auth.signOut();const r=await sb.auth.signInAnonymously();await setUser(r.data.session);await load()}
async function upload(dataUrl,folder){const blob=await (await fetch(dataUrl)).blob();const path=folder+'/'+crypto.randomUUID()+'.jpg';
  const {error}=await sb.storage.from(BUCKET).upload(path,blob,{contentType:'image/jpeg'});if(error)throw error;return path}
async function run(p,msg){try{const r=await p;if(r&&r.error)throw r.error;if(msg)toast(msg);await load();return r}catch(e){toast('Error: '+(e.message||e))}}
async function boot(){
  if(!window.supabase||!window.SUPABASE_URL||SUPABASE_URL.includes('TU-PROYECTO')){$('#app').innerHTML='<div class="home"><h1>Gojo Tech</h1><p>Configura js/config.js con la URL y la clave pública de tu proyecto Supabase.</p></div>';return}
  sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  let {data:{session}}=await sb.auth.getSession();
  if(!session){const r=await sb.auth.signInAnonymously();if(r.error)toast('Activa "Anonymous sign-ins" en Supabase Auth');session=r.data.session}
  await setUser(session);render();await load();live();
}

/* ===== ESTADO DE LA INTERFAZ ===== */
let V={view:'home',sec:'welcome',menu:true};
if(innerWidth<700)V.menu=false;

/* ===== VISTAS ===== */
function render(){
  const a=$('#app');document.body.className=V.view=='admin'?'adm':'';
  if(V.view=='home')a.innerHTML=`<div class="home"><h1>Gojo Tech</h1><p>Elige cómo quieres ingresar</p><div class="opts"><button class="b1" data-a="user">Ingresar como Usuario</button><button class="b1" data-a="gate" style="background:linear-gradient(135deg,#1e3a8a,#0e7490);border:2px solid var(--gold)">Ingresar como Administrador</button></div></div>`;
  else if(V.view=='gate')a.innerHTML=`<div class="home"><h1>Administrador</h1><div class="card" style="width:320px"><form data-f="pw"><input id="em" class="fld" type="email" placeholder="Correo" autocomplete="username"><input id="pw" class="fld" type="password" placeholder="Contraseña" autocomplete="current-password"><div class="row"><button type="button" class="b2" data-a="home">Volver</button><button class="b1">Entrar</button></div></form></div></div>`;
  else shell(a);
  if(V.view=='gate')setTimeout(()=>$('#em')&&$('#em').focus(),0);
  if(V.sec=='qr'&&V.view=='user')drawQr();
}
function shell(a){
  const adm=V.view=='admin',menu=adm?ADMIN_MENU:USER_MENU;
  a.innerHTML=`<header><button data-a="menu" aria-label="Menú">☰</button><h1 data-a="sec" data-id="welcome">Gojo <span>Tech</span>${adm?' · Admin':''}</h1><button data-a="home">← Inicio</button></header>
  <div class="wrap"><nav class="${V.menu?'':'hide'}">${menu.map(m=>`<button class="${V.sec==m[0]?'on':''}" data-a="sec" data-id="${m[0]}">${m[1]}</button>`).join('')}</nav><main>${section(adm)}</main></div>`;
}
function section(adm){
  const s=V.sec;
  if(s=='welcome')return`<div class="hero"><h2>${adm?'Bienvenido Gojo Tech':'Bienvenido a Gojo Tech'}</h2></div>`;
  if(s=='forros')return`<h2 class="t">Forros para celulares</h2><div class="grid"><div class="card"><button class="tile" data-a="custom"><div class="case"><span class="plus">+</span></div><div class="pr">Pedido personalizado</div></button></div>${prods('forro').map(p=>`<div class="card"><div class="case"><img src="${esc(p.img)}" alt="Forro"></div><div class="pr">$${esc(p.price)}</div><button class="b1" style="margin-top:8px" data-a="buyF" data-id="${p.id}">Pedir</button></div>`).join('')}</div>`;
  if(s=='pins')return`<h2 class="t">Pins</h2><div class="grid">${FRUIT_PINS.map((f,i)=>`<div class="card"><button class="tile" data-a="buyFruit" data-id="${i}"><div class="pin">${f[0]}</div><div>Pin de ${f[1]}</div></button></div>`).join('')}${prods('pin').map(p=>`<div class="card"><button class="tile" data-a="buyP" data-id="${p.id}"><div class="pin"><img src="${esc(p.img)}" alt="Pin"></div><div class="pr">$${esc(p.price)}</div></button></div>`).join('')}</div>`;
  if(s=='pedF'||s=='pedP'){const t=s=='pedF'?'forro':'pin',l=S.orders.filter(o=>o.owner==cid&&o.type==t).sort((a,b)=>b.ts-a.ts);
    return`<h2 class="t">${s=='pedF'?'Pedidos de forros':'Pedidos de Pins'}</h2>${l.map(o=>ord(o,false)).join('')||'<div class="empty">Aún no tienes pedidos.</div>'}`}
  if(s=='qr')return`<div class="qr"><h2 class="t">Código QR de Gojo Tech</h2><div id="qr"></div><small>${esc(home())}</small></div>`;
  if(s=='aF'||s=='aP'){const t=s=='aF'?'forro':'pin';
    return`<h2 class="t vip">${s=='aF'?'Forros para celulares VIP':'Pins VIP'}</h2><div class="grid"><div class="card"><button class="tile" data-a="add" data-id="${t}"><div class="${t=='forro'?'case':'pin'}"><span class="plus">+</span></div><div class="pr">Agregar ${t=='forro'?'forro':'pin'}</div></button></div>${prods(t).map(p=>`<div class="card"><div class="${t=='forro'?'case':'pin'}"><img src="${esc(p.img)}" alt=""></div><div class="pr">$${esc(p.price)}</div><button class="bd" style="margin-top:8px" data-a="delProd" data-id="${p.id}">Eliminar</button></div>`).join('')}</div>`}
  if(s=='aPed')return`<h2 class="t vip">Pedidos generales</h2>${[...S.orders].sort((a,b)=>b.ts-a.ts).map(o=>ord(o,true)).join('')||'<div class="empty">No hay pedidos todavía.</div>'}`;
  return'';
}
const prods=t=>S.products.filter(p=>p.type==t).sort((a,b)=>a.ts-b.ts);
function ord(o,adm){
  const cls=o.status==ST.OK?'ok':o.status==ST.NO?'no':o.status==ST.C?'ca':'pe';
  const th=o.img?`<img src="${esc(o.img)}" alt="">`:esc(o.emoji||'🛍️');
  const btn=adm?`<button class="bk" data-a="set" data-id="${o.id}" data-s="OK">Aceptar pedido</button><button class="bd" data-a="set" data-id="${o.id}" data-s="NO">Rechazar pedido</button>`
   :(o.status==ST.P?`<button class="b2" data-a="editO" data-id="${o.id}">Editar</button><button class="bd" data-a="cancelO" data-id="${o.id}">Cancelar pedido</button>`:'');
  return`<div class="ord"><div class="th">${th}</div><div class="in"><div>Código: <span class="code">${esc(o.code)}</span></div><div><b>${esc(o.item)}</b> · ${o.type=='forro'?'Forro':'Pin'}${o.price?' · $'+esc(o.price):''}</div><div>Usuario: <b>${esc(o.name)}</b> · Tel: <b>${esc(o.phone)}</b></div><div style="margin-top:6px"><span class="st ${cls}">${esc(o.status)}</span></div></div><div class="act">${btn}</div></div>`;
}
const home=()=>location.href.split('#')[0];
function drawQr(){const e=$('#qr');if(!e)return;e.innerHTML='';
  if(window.QRCode)new QRCode(e,{text:home(),width:220,height:220});else e.textContent='QR no disponible'}

/* ===== FORMULARIOS ===== */
function modal(title,fields,init,btn,fn){
  const v=Object.assign({},init),m=document.createElement('div');m.className='ov';
  m.innerHTML=`<div class="md"><h3>${title}</h3>${fields.map(f=>`<label>${f.l}<input data-k="${f.k}" type="${f.t}" ${f.t=='file'?'accept="image/*"':f.t=='number'?'min="0" step="any"':''} ${f.t!='file'&&v[f.k]?`value="${esc(v[f.k])}"`:''}></label>`).join('')}<img class="pv" ${v.img?`src="${esc(v.img)}"`:'hidden'} alt=""><div class="row"><button class="b2" data-x>Cancelar</button><button class="b1" data-ok hidden>${btn}</button></div></div>`;
  document.body.appendChild(m);
  const ok=m.querySelector('[data-ok]'),chk=()=>{ok.hidden=!fields.every(f=>String(v[f.k]||'').trim())};
  m.addEventListener('input',async e=>{const k=e.target.dataset.k;if(!k)return;
    if(e.target.type=='file'){const f=e.target.files[0];if(!f)return;try{v[k]=await resize(f);const p=m.querySelector('.pv');p.src=v[k];p.hidden=false}catch(x){toast('Imagen no válida')}}
    else v[k]=e.target.value;chk()});
  m.addEventListener('click',e=>{if(e.target==m||e.target.hasAttribute('data-x'))m.remove();
    if(e.target.hasAttribute('data-ok')){m.remove();fn(v)}});
  chk();
}
const F={img:{k:'img',l:'Imagen (desde tu computador)',t:'file'},name:{k:'name',l:'Nombre',t:'text'},phone:{k:'phone',l:'Número de teléfono',t:'tel'},price:{k:'price',l:'Precio',t:'number'}};

/* ===== ACCIONES ===== */
async function mkOrder(type,item,v,x){x=x||{};
  try{const path=x.productId?null:(v.img?await upload(v.img,'pedidos/'+cid):null);
    const r=await sb.from('pedidos').insert({tipo:type=='forro'?'Forro':'Pin',producto:item,producto_id:x.productId||null,nombre:v.name.trim(),telefono:v.phone.trim(),imagen_path:path}).select('codigo').single();
    if(r.error)throw r.error;toast('Pedido enviado: '+r.data.codigo);V.sec=type=='forro'?'pedF':'pedP';await load()}catch(e){toast('Error: '+(e.message||e))}}
const mine=el=>S.orders.find(x=>x.id==el.dataset.id&&x.owner==cid&&x.status==ST.P);
const A={
  user(){V={view:'user',sec:'welcome',menu:innerWidth>=700}},
  gate(){if(isAdmin)V={view:'admin',sec:'welcome',menu:innerWidth>=700};else V.view='gate'},
  home(){if(V.view=='admin')logout();V={view:'home',sec:'welcome',menu:true}},
  menu(){V.menu=!V.menu},
  sec(el){V.sec=el.dataset.id;if(innerWidth<700)V.menu=false},
  custom(){modal('Pedido personalizado',[F.img,F.name,F.phone],{},'Enviar pedido',v=>mkOrder('forro','Forro personalizado',v))},
  buyF(el){const p=S.products.find(x=>x.id==el.dataset.id);if(p)modal('Pedir forro',[F.name,F.phone],{img:p.img},'Enviar pedido',v=>mkOrder('forro','Forro VIP',v,{productId:p.id}))},
  buyFruit(el){const f=FRUIT_PINS[el.dataset.id];modal('Pedir pin de '+f[1],[F.name,F.phone],{},'Realizar pedido',v=>mkOrder('pin','Pin de '+f[1],v))},
  buyP(el){const p=S.products.find(x=>x.id==el.dataset.id);if(p)modal('Pedir pin',[F.name,F.phone],{img:p.img},'Realizar pedido',v=>mkOrder('pin','Pin VIP',v,{productId:p.id}))},
  editO(el){const o=mine(el);if(!o)return;const custom=o.type=='forro'&&!o.productId;
    modal('Editar pedido '+o.code,custom?[F.img,F.name,F.phone]:[F.name,F.phone],{img:o.img,name:o.name,phone:o.phone},'Guardar cambios',async v=>{
      try{const u={nombre:v.name.trim(),telefono:v.phone.trim()};if(custom&&v.img&&v.img.startsWith('data:'))u.imagen_path=await upload(v.img,'pedidos/'+cid);
        run(sb.from('pedidos').update(u).eq('id',o.id),'Pedido actualizado')}catch(e){toast('Error: '+(e.message||e))}})},
  cancelO(el){const o=mine(el);if(o&&confirm('¿Cancelar el pedido '+o.code+'?'))run(sb.from('pedidos').update({estado:ST.C}).eq('id',o.id),'Pedido cancelado')},
  add(el){const t=el.dataset.id,n=t=='forro'?'Forro':'Pin';modal('Nuevo '+n+' VIP',[F.img,F.price],{},'Guardar',async v=>{
    try{const path=await upload(v.img,'productos');run(sb.from(t=='forro'?'forros':'pins').insert({nombre:n+' '+new Date().toLocaleDateString(),imagen_path:path,precio:+v.price}),'Producto agregado')}catch(e){toast('Error: '+(e.message||e))}})},
  async delProd(el){const p=S.products.find(x=>x.id==el.dataset.id);if(!p||!confirm('¿Eliminar este producto?'))return;
    const r=await run(sb.from(p.type=='forro'?'forros':'pins').delete().eq('id',p.id),'Producto eliminado');if(r)sb.storage.from(BUCKET).remove([p.path])},
  set(el){run(sb.from('pedidos').update({estado:ST[el.dataset.s]}).eq('id',el.dataset.id))}
};
document.addEventListener('click',e=>{const el=e.target.closest('[data-a]');if(!el)return;const f=A[el.dataset.a];if(f){f(el);render()}});
document.addEventListener('submit',async e=>{if(e.target.dataset.f!='pw')return;e.preventDefault();
  const r=await sb.auth.signInWithPassword({email:$('#em').value.trim(),password:$('#pw').value});
  if(!r.error){await setUser(r.data.session);if(isAdmin){V={view:'admin',sec:'welcome',menu:innerWidth>=700};await load();return render()}await logout()}
  toast('Credenciales de administrador incorrectas');V.view='home';render()});

boot();
