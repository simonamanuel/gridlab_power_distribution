import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const names=['Manufacturing','Commercial','EV charging'];
const loads=[120,60,40], closed=[true,true,true], ranges=[[20,300],[10,200],[0,200]];
const IDs=['FDR-01','FDR-02','FDR-03'];
let result=null, selected='TX-01', requestSerial=0;
const faults=[false,false,false],events=[];
const $=id=>document.getElementById(id);
const fmt=(n,d=1)=>Number.isFinite(n)?Number(n).toFixed(d):'—';
$('controls').innerHTML=names.map((n,i)=>`<div class="control"><div class="control-top"><strong>${IDs[i]} · ${n}</strong><output id="output${i}">${loads[i]} kW</output></div><input id="load${i}" type="range" min="${ranges[i][0]}" max="${ranges[i][1]}" step="10" value="${loads[i]}"></div>`).join('');
$('switches').innerHTML=names.map((n,i)=>`<label class="switchrow"><span>${IDs[i]} · Closed</span><input class="toggle" type="checkbox" id="switch${i}" checked></label>`).join('');
let debounce;
for(let i=0;i<3;i++){
  $('load'+i).addEventListener('input',e=>{loads[i]=Number(e.target.value);$('output'+i).textContent=loads[i]+' kW';clearTimeout(debounce);debounce=setTimeout(simulate,125)});
  $('switch'+i).addEventListener('change',e=>{if(faults[i]){e.target.checked=false;return;}closed[i]=e.target.checked;logEvent(`${IDs[i]} switch manually ${closed[i]?'closed':'opened'}`);simulate()});
}
$('faultcontrols').innerHTML=IDs.map((id,i)=>`<button class="faultbtn" type="button" id="fault${i}">Test fault on ${id}</button>`).join('');
function logEvent(message){events.unshift({time:new Date().toLocaleTimeString(),message});if(events.length>24)events.pop();$('eventlog').innerHTML=events.map(e=>`<div class="eventitem"><time>${e.time}</time><span>${e.message}</span></div>`).join('')}
let lastStudy=null;
function renderStudy(data){
 const el=$('faultresult');
 if(!el)return;
 el.innerHTML=`<strong>${data.feeder_id} · ${fmt(data.ikss_ka,3)} kA</strong><div>Three-phase initial symmetrical fault current</div><div>Example pickup: ${fmt(data.pickup_ka,2)} kA · ${data.pickup_exceeded?'EXCEEDED':'NOT EXCEEDED'}</div><small>${data.limitation}</small>`;
}
for(let i=0;i<3;i++)$('fault'+i).addEventListener('click',async()=>{
 if(faults[i] || !closed[i])return;
 const btn=$('fault'+i);btn.disabled=true;btn.textContent=`Calculating · ${IDs[i]}`;
 try{
  const res=await fetch('/api/fault-study',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({feeder_index:i,pickup_ka:1.0})});
  if(!res.ok)throw new Error(await res.text());const study=await res.json();lastStudy=study;renderStudy(study);
  logEvent(`${IDs[i]} fault study: ${fmt(study.ikss_ka,3)} kA (3φ initial symmetrical)`);
  if(!study.pickup_exceeded){btn.disabled=false;btn.textContent=`Test fault on ${IDs[i]}`;logEvent(`${IDs[i]} below example pickup — no simulated trip`);return;}
  faults[i]=true;closed[i]=false;$('switch'+i).checked=false;$('switch'+i).disabled=true;
  btn.textContent=`Disconnected · ${IDs[i]}`;btn.classList.add('latched');
  logEvent(`${IDs[i]} exceeds example pickup of 1.00 kA · simulated trip`);
  logEvent(`${IDs[i]} switch opened · post-isolation power flow recalculated`);
  selected=IDs[i];await simulate();
 }catch(err){btn.disabled=false;btn.textContent=`Test fault on ${IDs[i]}`;logEvent(`Fault study failed for ${IDs[i]} — ${String(err.message).slice(0,110)}`)}
});
$('restore').addEventListener('click',()=>{
 for(let i=0;i<3;i++){faults[i]=false;closed[i]=true;$('switch'+i).checked=true;$('switch'+i).disabled=false;$('fault'+i).disabled=false;$('fault'+i).classList.remove('latched');$('fault'+i).textContent=`Test fault on ${IDs[i]}`}
 lastStudy=null;$('faultresult').innerHTML='No fault test run yet.';logEvent('Reset complete — all three feeder switches closed');simulate();
});
logEvent('Simulator initialized · awaiting operator actions');
function metric(label,value){return `<div class="metric"><label>${label}</label><strong>${value}</strong></div>`}
function statusText(state){return state==='isolated'?'ISOLATED':state==='overload'?'OVERLOADED':state==='low_voltage'?'LOW VOLTAGE':'ENERGIZED'}
function statusClass(state){return state==='isolated'?'off':state==='energized'?'':'warn'}
function paint(){if(!result)return;
  const r=result;
  $('metrics').innerHTML=
    metric('Load supplied',fmt(r.served_kw,0)+' kW')+
    metric('Load disconnected',fmt(r.unserved_kw,0)+' kW')+
    metric('Main bus · BUS-01',fmt(r.main_voltage_v)+' V')+
    metric('Transformer · TX-01',fmt(r.transformer_loading_pct)+'%')+
    metric('Power losses',fmt(r.losses_kw,2)+' kW');
  $('feederrows').innerHTML=r.feeders.map(f=>`<tr><td>${f.id}</td><td>${f.name}</td><td><span class="status ${statusClass(f.status)}"><i class="dot"></i>${statusText(f.status)}</span></td><td>${fmt(f.served_kw,0)}</td><td>${fmt(f.voltage_v)}</td><td>${fmt(f.current_a)}</td><td>${fmt(f.loading_pct)}%</td></tr>`).join('');
  $('alerts').innerHTML=r.alerts.length?r.alerts.map(a=>`<div class="notice"><strong>${faults[IDs.indexOf(a.equipment)]?'SIMULATED TRIP':a.kind.toUpperCase()}</strong><br>${a.text}</div>`).join(''):'<div class="notice">No warnings for these settings.</div>';
  $('serverstatus').textContent=faults.some(Boolean)?'FEEDER DISCONNECTED · RESULTS UPDATED':'SIMULATION UPDATED';
  updateWorld();inspect(selected);
}
async function simulate(){const serial=++requestSerial;$('serverstatus').textContent='Updating results…';try{
  const response=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loads,closed})});
  if(!response.ok)throw new Error(await response.text());const data=await response.json();if(serial!==requestSerial)return;result=data;paint();
}catch(err){if(serial===requestSerial){$('serverstatus').textContent='SIMULATION ERROR';$('alerts').innerHTML=`<p class="error">${String(err.message).replaceAll('<','&lt;')}</p>`}}}
function inspect(id){selected=id;applySelection();const p=$('inspection');let obj;
  if(id==='TX-01')obj={title:'TX-01 · Main transformer',rows:[['Primary','13.8 kV'],['Secondary','600 V nominal'],['Nameplate','500 kVA'],['Loading',result?fmt(result.transformer_loading_pct)+'%':'—'],['Type','Liquid-filled step-down transformer']]};
  else if(id==='BUS-01')obj={title:'BUS-01 · Main switchboard',rows:[['Nominal','600 V'],['Calculated voltage',result?fmt(result.main_voltage_v)+' V':'—'],['Connected circuits','3 radial feeders'],['Enclosure','Indoor lineup']]};
  else if(id==='GRID-01')obj={title:'GRID-01 · Utility entrance',rows:[['Nominal voltage','13.8 kV'],['Source voltage','1.0 pu'],['Service arrangement','Overhead entrance']]};
  else {const f=result?.feeders.find(x=>x.id===id);obj={title:id+' · '+(f?.name||'Feeder'),rows:[['Switch state',f?.closed?'Closed':faults[IDs.indexOf(id)]?'Open · example pickup trip':'Open · manual'],['Requested demand',f?fmt(f.requested_kw,0)+' kW':'—'],['Served demand',f?fmt(f.served_kw,0)+' kW':'—'],['Voltage',f?fmt(f.voltage_v)+' V':'—'],['Current',f?fmt(f.current_a)+' A':'—'],['Feeder loading',f?fmt(f.loading_pct)+'%':'—'],['Cable length',f?fmt(f.length_km,2)+' km':'—']]}}
  p.innerHTML=`<div class="eyebrow">Equipment details</div><h3>${obj.title}</h3>${obj.rows.map(([k,v])=>`<div class="kvs"><span>${k}</span><span>${v}</span></div>`).join('')}<div class="scene-note">Values come from the simulation. The 3D equipment is simplified and is not a construction drawing.</div>`;
}
const vp=$('viewport'),scene=new THREE.Scene();scene.background=new THREE.Color('#101921');scene.fog=new THREE.Fog('#101921',38,88);
const camera=new THREE.PerspectiveCamera(40,1,.1,200);camera.position.set(23,18,29);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;vp.appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1.3,0);orbit.enableDamping=true;orbit.maxPolarAngle=Math.PI/2.05;orbit.minDistance=14;orbit.maxDistance=75;orbit.update();
scene.add(new THREE.HemisphereLight('#bcd7e6','#2a3137',2.2));const sun=new THREE.DirectionalLight('#fff1d9',2.4);sun.position.set(-16,28,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);

const pickable=[];const equipment=new Map();const feeders=[];const annotations=[];const selectRings=[];
function stdMat(color,rough=.86,metal=.08){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:metal})}
function box(w,h,d,color,x,y,z,rough=.86,metal=.08){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),stdMat(color,rough,metal));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m}
function cylinder(r,h,x,y,z,color,segments=14,rough=.8,metal=.2){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),stdMat(color,rough,metal));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m}
function sphere(r,color,x,y,z){const m=new THREE.Mesh(new THREE.SphereGeometry(r,18,18),stdMat(color,.35,.3));m.position.set(x,y,z);m.castShadow=true;scene.add(m);return m}
function register(id,meshes,anchor){for(const mesh of meshes){mesh.userData.equipment=id;pickable.push(mesh)}equipment.set(id,meshes); if(anchor){const ring=new THREE.Mesh(new THREE.TorusGeometry(1.1,.05,16,60),new THREE.MeshBasicMaterial({color:'#b1d8d0',transparent:true,opacity:0}));ring.rotation.x=Math.PI/2;ring.position.copy(anchor);scene.add(ring);selectRings.push({id,ring})}}
function label(text,x,y,z){const c=document.createElement('canvas');c.width=512;c.height=110;const ctx=c.getContext('2d');ctx.fillStyle='rgba(14,22,29,.90)';ctx.fillRect(0,0,512,110);ctx.strokeStyle='#5d7884';ctx.strokeRect(1,1,510,108);ctx.fillStyle='#e5ecf1';ctx.font='600 40px Arial';ctx.textAlign='center';ctx.fillText(text,256,70);const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));spr.position.set(x,y,z);spr.scale.set(4.2,.92,1);scene.add(spr);annotations.push(spr);return spr}
function pipe(points,color,width=.10){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,64,width,8,false),new THREE.MeshStandardMaterial({color,metalness:.4,roughness:.48}));mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);return mesh}
function fenceSegment(x1,z1,x2,z2,posts=8){for(let i=0;i<=posts;i++){const t=i/posts;const x=x1+(x2-x1)*t,z=z1+(z2-z1)*t;cylinder(.04,1.55,x,.82,z,'#8e9aa0',8,.7,.4)}const yHigh=1.36,yLow=.42;for(const y of [yHigh,yLow]){const a=new THREE.Vector3(x1,y,z1),b=new THREE.Vector3(x2,y,z2);const rail=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,a.distanceTo(b),8),stdMat('#909ca2',.6,.5));rail.position.copy(a).add(b).multiplyScalar(.5);rail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());scene.add(rail)}}

// Site ground and paved areas
const ground=new THREE.Mesh(new THREE.PlaneGeometry(76,58),stdMat('#233139',1,0));ground.rotation.x=-Math.PI/2;ground.position.y=-.05;ground.receiveShadow=true;scene.add(ground);
const substationYard=box(18,.08,13,'#707978',-8.5,.04,-3.8,1,0);const campusPad=box(34,.06,22,'#5c666d',2,.03,6,1,0); const road=box(44,.05,4.6,'#39474f',2,.02,13.5,1,0); for(let x=-18;x<=22;x+=4)box(2.0,.01,.10,'#b8bfbd',x,.06,13.5,.8,0);
box(6,.05,2.5,'#3f4a50',-19,.02,-12,.95,0); box(8,.05,2.8,'#3f4a50',18,.02,8,.95,0);

// Utility pole line and service entrance
for(let x of [-22,-17,-12]){cylinder(.12,6.9,x,3.45,-12.5,'#7f8d92',10,.72,.18);box(2.5,.14,.20,'#b2b9ba',x,6.05,-12.5,.65,.14)}
for(let z of [-13.05,-12.5,-11.95])pipe([[-22,5.9,z],[-19.5,5.5,z],[-17,5.9,z],[-14.5,5.5,z],[-12,5.9,z]],'#9fadb4',.026);
const source=[box(2.2,1.6,1.6,'#556a77',-11,.82,-10.0,.78,.12),box(2.45,.16,1.85,'#86959a',-11,.08,-10,.92,0)];
register('GRID-01',source,new THREE.Vector3(-11,.15,-10));label('GRID-01',-11,3.2,-10.2);

// Fenced substation compound
fenceSegment(-17,-9,-17,.7); fenceSegment(-17,.7,-4.2,.7); fenceSegment(-4.2,.7,-4.2,-9); fenceSegment(-17,-9,-12,-9); fenceSegment(-9.4,-9,-4.2,-9);
for(let x=-15;x<=-6;x+=1.5)box(.12,.03,.65,'#d3bc76',x,.14,.95,.65,0); // curb / safety marking near gate

// Transformer yard
box(7.2,.22,5.3,'#8f9995',-10,.16,-4.8,.96,0); const tx=[box(4.0,3.0,2.95,'#6a828e',-10,1.85,-4.8,.62,.18)];
for(let j=0;j<9;j++)tx.push(box(.09,2.45,2.8,'#435b67',-12.2+j*.13,1.8,-4.8,.5,.28));
for(let x of [-11.1,-10,-8.9]){tx.push(cylinder(.18,.75,x,3.65,-4.8,'#c4c6bb',12,.45,.45));tx.push(cylinder(.08,.50,x,4.22,-4.8,'#6e7f88',12,.55,.35));}
for(let x of [-11,-10,-9])tx.push(sphere(.11,'#cfd8d1',x,4.56,-4.8));
box(1.1,.95,1.0,'#596b73',-7.2,.67,-6.4,.65,.22); box(1.6,.16,1.3,'#8b9390',-7.2,.18,-6.4,.95,0);
pipe([[-11,1.0,-10],[-11,1.0,-8.2],[-10.8,1.2,-7.0],[-10.7,1.2,-6.3]],'#7e9ea6',.11);
register('TX-01',tx,new THREE.Vector3(-10,.16,-4.8));label('TX-01',-10,5.2,-4.9);

// Main LV switchboard / switchroom
const boards=[];box(6.1,.20,3.2,'#7e8784',-1.1,.16,-4.2,.96,0);for(let i=0;i<6;i++){boards.push(box(.90,2.8,1.9,'#72898e',-3.4+i*1.06,1.62,-4.2,.62,.18));for(let j=0;j<4;j++)boards.push(box(.50,.03,.04,'#3f545d',-3.4+i*1.06,2.35-j*.14,-3.22,.45,.12));boards.push(box(.24,.22,.04,'#c4c8c1',-3.08+i*1.06,1.88,-3.19,.4,.2));}
register('BUS-01',boards,new THREE.Vector3(-1.1,.16,-4.2));label('BUS-01',-1.2,4.2,-4.2);pipe([[-7.9,1.1,-4.8],[-5.7,1.1,-4.8],[-4.8,1.05,-4.2]],'#7d9aa3',.20);

// Main bus support structures and overhead buswork inside compound
for(const x of [-2.6,-1.0,.6]){cylinder(.07,2.25,x,1.28,-7.9,'#909da5',10,.6,.45);cylinder(.07,2.25,x,1.28,-6.2,'#909da5',10,.6,.45);box(.16,.16,1.9,'#9ca7ac',x,2.37,-7.05,.6,.42)}
pipe([[-2.6,2.45,-7.05],[-1.0,2.45,-7.05],[.6,2.45,-7.05]],'#b3b9bc',.04);

// Manufacturing facility
const factory=[];factory.push(box(9.0,4.2,6.8,'#5f757f',-10,2.15,6.8,.78,.08));factory.push(box(9.5,.30,7.3,'#93a2a9',-10,4.42,6.8,.7,.08));factory.push(box(2.8,1.4,1.1,'#667980',-6.2,1.0,10.25,.75,.08));
for(let x of [-12.8,-10.0,-7.2]){factory.push(box(1.85,2.15,.08,'#8fa0a1',x,1.15,10.24,.55,.08));for(let y of [.55,.95,1.35,1.75])factory.push(box(1.82,.05,.06,'#566a73',x,y,10.29,.45,.1));}
for(let x of [-12.5,-10,-7.5]){factory.push(box(1.0,.55,.95,'#72858a',x,4.82,5.2,.75,.12));factory.push(cylinder(.30,.10,x,5.12,5.2,'#5f7077',16,.48,.3));}
register('FDR-01',factory,new THREE.Vector3(-10,.16,6.8));label('FDR-01 · MFG',-10,5.85,6.8);

// Commercial building
const commercial=[];commercial.push(box(6.8,4.8,5.6,'#667c83',3.2,2.45,5.6,.80,.08));commercial.push(box(7.1,.28,5.9,'#9ca9aa',3.2,4.95,5.6,.7,.08));
for(let x of [1.2,3.2,5.2]) for(let y of [1.65,3.15]) commercial.push(box(1.15,.95,.06,'#2f4c59',x,y,8.43,.35,.22));
commercial.push(box(1.1,2.0,.10,'#aab4b1',3.2,1.05,8.44,.4,.12)); register('FDR-02',commercial,new THREE.Vector3(3.2,.16,5.6));label('FDR-02 · COM',3.2,6.2,5.6);

// EV charging area with canopy and chargers
const chargers=[];box(8.4,.08,6.4,'#495156',13,.09,6.0,1,0); chargers.push(box(5.4,.14,2.8,'#738288',13,3.00,6.0,.58,.12)); for(let x of [11.1,14.9]) chargers.push(cylinder(.09,2.75,x,1.40,6.0,'#89979c',12,.55,.24)); for(let x of [11.4,13.1,14.8]){chargers.push(box(.60,1.6,.52,'#c6cfcb',x,.92,4.8,.42,.14));chargers.push(box(.47,.56,.03,'#355d67',x,1.18,5.06,.35,.2)); box(.10,.03,4.2,'#b7bbad',x,.17,6.2,.9,0)} register('FDR-03',chargers,new THREE.Vector3(13,.16,6.0)); label('FDR-03 · EVC',13,4.0,6.0);

// Facility-site embellishment
for(let x of [8.6,10.6,12.6,14.6,16.6]) box(.08,.02,3.7,'#b8bbb0',x,.20,8.2,.9,0); // parking bay marks
for(let x of [-4.0,4.7]){const treeTrunk=cylinder(.10,1.25,x,.64,12.5,'#70503a',10,.9,.05); const crown=sphere(.85,'#5f745e',x,1.6,12.5); crown.material.roughness=.95;}

// feeder routes
const line1=pipe([[-2.0,0.6,-3.4],[-6.3,0.6,-3.4],[-9.3,0.6,1.2],[-10.0,0.6,3.0]],'#56b0a4',.12);
const line2=pipe([[0.0,0.6,-3.4],[2.0,0.6,-2.4],[3.2,0.6,1.6],[3.2,0.6,2.8]],'#56b0a4',.12);
const line3=pipe([[1.0,0.6,-3.8],[8.5,0.6,-2.3],[12.0,0.6,1.3],[13.0,0.6,2.9]],'#56b0a4',.12);
feeders.push(line1,line2,line3);

// camera and controls
let cameraTween=null;
function flyTo(pos,target){cameraTween={start:performance.now(),duration:900,fromPos:camera.position.clone(),toPos:new THREE.Vector3(...pos),fromTarget:orbit.target.clone(),toTarget:new THREE.Vector3(...target)}}
$('reset').addEventListener('click',()=>flyTo([23,18,29],[0,1.2,0]));
$('view-substation').addEventListener('click',()=>{inspect('TX-01');flyTo([-3,12,9],[-8,1.5,-4.8])});
$('view-feeders').addEventListener('click',()=>flyTo([16,15,24],[3,1,6]));
let labelsVisible=true;
$('toggle-labels').addEventListener('click',()=>{labelsVisible=!labelsVisible;annotations.forEach(s=>s.visible=labelsVisible);$('toggle-labels').textContent='Labels: '+(labelsVisible?'on':'off')});
function tickCamera(){if(!cameraTween)return;let u=Math.min(1,(performance.now()-cameraTween.start)/cameraTween.duration);const t=u*u*(3-2*u);camera.position.lerpVectors(cameraTween.fromPos,cameraTween.toPos,t);orbit.target.lerpVectors(cameraTween.fromTarget,cameraTween.toTarget,t);if(u>=1)cameraTween=null}

function applySelection(){for(const {id,ring} of selectRings){ring.material.opacity=id===selected?.toString()?0.95:0.0; ring.material.color.set(id===selected?.toString()?'#bfe5d8':'#6e8794')}}
function updateWorld(){if(!result)return; result.feeders.forEach((f,i)=>{const c=f.status==='isolated'?'#7b8994':f.status==='energized'?'#4db0a1':'#d4a35c';feeders[i].material.color.set(c);for(const mesh of equipment.get(f.id)||[])mesh.material.color.set(f.status==='isolated'?'#526168':f.status==='overload'?'#9d7e61':(i===0?'#70878e':i===1?'#788c90':'#8b968f'))}); const sourceClr='#607783'; for(const mesh of equipment.get('GRID-01')||[])mesh.material.color.set(sourceClr); for(const mesh of equipment.get('TX-01')||[])mesh.material.color.set('#6a828e'); for(const mesh of equipment.get('BUS-01')||[])mesh.material.color.set('#73898e'); }

const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
renderer.domElement.addEventListener('click',event=>{const bounds=renderer.domElement.getBoundingClientRect();mouse.set(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects(pickable);if(hits.length)inspect(hits[0].object.userData.equipment)});
renderer.domElement.addEventListener('mousemove',event=>{const bounds=renderer.domElement.getBoundingClientRect();mouse.set(((event.clientX-bounds.left)/bounds.width)*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);ray.setFromCamera(mouse,camera);const hits=ray.intersectObjects(pickable);renderer.domElement.style.cursor=hits.length?'pointer':'grab'});
const resize=new ResizeObserver(()=>{const w=vp.clientWidth,h=vp.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h)}); resize.observe(vp);
function render(){requestAnimationFrame(render);tickCamera();orbit.update();const pulse=.72+.28*Math.sin(performance.now()/340); for(const {id,ring} of selectRings){if(id===selected){ring.scale.setScalar(1+.03*pulse)}} renderer.render(scene,camera)} render();
simulate();

// GRIDLAB v1.4: deterministic incident investigation; all model facts come from /api/assess.
let latestReport='';
function assessmentSection(title,items){
 const header=document.createElement('h4');header.textContent=title;
 const list=document.createElement('ul');for(const item of items){const li=document.createElement('li');li.textContent=item;list.append(li)}
 return [header,list];
}
$('assess').addEventListener('click',async()=>{
 const btn=$('assess');btn.disabled=true;btn.textContent='Checking…';
 const output=$('assessment');output.replaceChildren();output.textContent='Checking the latest simulation results…';
 try{
  const response=await fetch('/api/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scenario:{loads,closed},fault:lastStudy,events:events.map(e=>e.message)})});
  if(!response.ok)throw new Error(await response.text());const assessment=await response.json();
  latestReport=assessment.report;
  output.replaceChildren();
  const lead=document.createElement('p');lead.textContent=assessment.summary;output.append(lead);
  for(const [title,items] of [['From the simulation',assessment.facts],['Things to check',assessment.flags],['Next checks',assessment.recommendations]]){output.append(...assessmentSection(title,items))}
  const note=document.createElement('small');note.textContent='These notes are generated from model results, not approved engineering advice.';output.append(note);
  $('copyreport').disabled=false;logEvent('Generated notes for current network');
 }catch(error){output.textContent='Assessment could not be generated: '+String(error.message);latestReport='';$('copyreport').disabled=true}
 finally{btn.disabled=false;btn.textContent='Check current results'}
});
$('copyreport').addEventListener('click',async()=>{
 if(!latestReport)return;
 try{await navigator.clipboard.writeText(latestReport);$('copyreport').textContent='Copied';setTimeout(()=>$('copyreport').textContent='Copy report',1600)}
 catch(err){$('copyreport').textContent='Copy unavailable';setTimeout(()=>$('copyreport').textContent='Copy report',1600)}
});


// v1.5 read-only assistant. The server performs its own fresh simulation; browser values are only scenario inputs.
async function refreshCopilotStatus(){
 try{const response=await fetch('/api/copilot/status');const d=await response.json();
 $('copilotmode').textContent=d.online_ai_configured ? 'AI mode enabled (read-only)' : 'Offline mode (no AI API key)';
 }catch(error){$('copilotmode').textContent='Offline status unavailable';}
}
refreshCopilotStatus();
for(const button of document.querySelectorAll('[data-prompt]')){
 button.addEventListener('click',()=>{$('copilotquestion').value=button.dataset.prompt;$('copilotquestion').focus()});
}
$('copilotform').addEventListener('submit',async event=>{
 event.preventDefault();const question=$('copilotquestion').value.trim();if(!question)return;
 const send=$('copilotsend'),area=$('copilotanswer');send.disabled=true;send.textContent='Checking…';area.textContent='Preparing an answer based on the model…';
 try{
  const response=await fetch('/api/copilot/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,scenario:{loads:[...loads],closed:[...closed]},fault_feeder_index:lastStudy?IDs.indexOf(lastStudy.feeder_id):null})});
  if(!response.ok){const detail=await response.json().catch(()=>({detail:'Request failed'}));throw new Error(detail.detail||'Request failed')}
  const data=await response.json();area.textContent=data.answer+'\n\nSOURCE: '+data.grounded_in+' · MODE: '+data.mode;
  logEvent('Answered question ('+data.mode+')');
 }catch(error){area.textContent='Copilot unavailable: '+String(error.message)+'\nThe existing engineering assessment remains available above.';}
 finally{send.disabled=false;send.textContent='Ask a question'}
});
