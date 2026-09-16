const c=document.getElementById("game"),x=c.getContext("2d");let socket;
const menu=q("menu"),lobby=q("lobby"),hud=q("hud"),result=q("result"),status=q("status"),rooms=q("roomList");
let me={id:null,name:"Player",x:1500,y:900,a:0,hp:100,ink:100,sp:0,score:0,team:"cyan",weapon:"splatter",alive:true},ps=new Map(),ink=[];
let W=3000,H=1800,started=false,cam={x:1500,y:900},keys={},mouse={x:innerWidth/2,y:innerHeight/2,down:false},lastShot=0,effects=[];
const colors={cyan:"#25d7ff",magenta:"#ff4f81"};
const maps={Garden:{bg:"#b9d8ad",grid:"#a9c99c",obs:"#33434c"},Factory:{bg:"#b9b9b9",grid:"#a3a3a3",obs:"#353b42"},"Night City":{bg:"#151c31",grid:"#202b48",obs:"#353b58"}};
let mapName="Garden";
function q(id){return document.getElementById(id)} function esc(s){return String(s).replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[a]))}
function connect(){socket=new WebSocket((location.protocol==="https:"?"wss://":"ws://")+location.host);
socket.onopen=()=>{status.textContent="接続しました";q("quickBtn").disabled=false;send({type:"rooms"})};
socket.onclose=()=>status.textContent="サーバーから切断されました";
socket.onerror=()=>status.textContent="接続できません";
socket.onmessage=e=>{let m=JSON.parse(e.data);
if(m.type==="rooms")drawRooms(m.rooms);
if(m.type==="joined"){me.id=m.id;mapName=m.map;W=m.world.W;H=m.world.H;menu.hidden=true;lobby.hidden=false;q("roomTitle").textContent="ROOM #"+m.code+" — "+mapName}
if(m.type==="players"){sync(m.players);drawMembers()}
if(m.type==="start"){started=true;lobby.hidden=true;hud.hidden=false;sync(m.players);me.hp=100;me.ink=100}
if(m.type==="state"||m.type==="tick"){sync(m.players);if(m.ink)ink=m.ink;if(m.time!=null)q("time").textContent=fmt(m.time)}
if(m.type==="ko")effects.push({type:"ko",t:50});
if(m.type==="special")effects.push({type:"special",x:m.x,y:m.y,t:30});
if(m.type==="respawn"){let p=ps.get(m.id);if(p)p.alive=true}
if(m.type==="result"){started=false;hud.hidden=true;showResult(m.players)}
if(m.type==="error")status.textContent=m.msg;
};}
function send(o){if(socket?.readyState===1)socket.send(JSON.stringify(o))}
function sync(a){ps=new Map(a.map(p=>[p.id,p]));let p=ps.get(me.id);if(p)me={...me,...p};}
function drawMembers(){let a=[...ps.values()];q("members").innerHTML=a.map(p=>`<span class="member ${p.team}">${p.team==="cyan"?"🔵":"🔴"} ${esc(p.name)}</span>`).join("")||"参加者なし"}
function drawRooms(a){rooms.innerHTML=a.length?a.map(r=>`<div class="room"><div><b>${esc(r.name)}</b><br><small>#${r.code} · ${esc(r.map)} · ${r.count}/${r.max}</small></div><button onclick="joinRoom('${r.code}')">${r.started?"開始済み":"参加"}</button></div>`).join(""):"部屋がありません"}
window.joinRoom=code=>send({type:"join",code,player:q("player").value.trim()||"Player"});
q("quickBtn").onclick=()=>{send({type:"join",code:"1001",player:q("player").value.trim()||"Player"})};
q("createBtn").onclick=()=>send({type:"create",name:q("roomName").value,map:q("map").value,mode:q("mode").value,player:q("player").value.trim()||"Player"});
q("startBtn").onclick=()=>send({type:"start"});q("backBtn").onclick=()=>{location.reload()};q("again").onclick=()=>location.reload();
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(z=>z.classList.remove("active"));b.classList.add("active");["quick","rooms","create"].forEach(id=>q(id).hidden=id!==b.dataset.tab);if(b.dataset.tab==="rooms")send({type:"rooms"})});
addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=1;if(e.key==="1")me.weapon="splatter";if(e.key==="2")me.weapon="roller";if(e.key==="3")me.weapon="charger";if(e.code==="Space")send({type:"special"})});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=0);addEventListener("mousemove",e=>{mouse.x=e.clientX;mouse.y=e.clientY});addEventListener("mousedown",()=>mouse.down=1);addEventListener("mouseup",()=>mouse.down=0);addEventListener("contextmenu",e=>e.preventDefault());
function fmt(s){return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}
function update(){if(!started)return;let dx=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0),dy=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);if(dx||dy){let l=Math.hypot(dx,dy);me.x+=dx/l*6;me.y+=dy/l*6}
me.x=Math.max(30,Math.min(W-30,me.x));me.y=Math.max(30,Math.min(H-30,me.y));me.a=Math.atan2(mouse.y-innerHeight/2,mouse.x-innerWidth/2);
if(mouse.down)shoot();send({type:"state",x:me.x,y:me.y,a:me.a,hp:me.hp,ink:me.ink,weapon:me.weapon});cam.x+=(me.x-cam.x)*.12;cam.y+=(me.y-cam.y)*.12;
q("hp").textContent=Math.round(me.hp);q("ink").textContent=Math.round(me.ink);q("sp").textContent=Math.round(me.special);q("score").textContent=me.score;q("weapon").textContent=me.weapon.toUpperCase()}
function shoot(){let rates={splatter:170,roller:480,charger:850},now=performance.now();if(now-lastShot<rates[me.weapon])return;lastShot=now;send({type:"shoot"});let dx=Math.cos(me.a),dy=Math.sin(me.a),dist=me.weapon==="charger"?900:500;for(let d=30;d<dist;d+=55)ink.push({x:me.x+dx*d,y:me.y+dy*d,r:me.weapon==="roller"?38:25,team:me.team,t:Date.now()})}
function paint(){if(!started||me.ink<4)return;let dx=Math.cos(me.a),dy=Math.sin(me.a);for(let d=40;d<330;d+=65)ink.push({x:me.x+dx*d+(Math.random()-.5)*30,y:me.y+dy*d+(Math.random()-.5)*30,r:35+Math.random()*25,team:me.team,t:Date.now()});send({type:"paint",x:me.x+dx*150,y:me.y+dy*150,r:75,cost:8,special:4})}
function draw(){let m=maps[mapName]||maps.Garden;x.fillStyle=m.bg;x.fillRect(0,0,innerWidth,innerHeight);x.save();x.translate(innerWidth/2-cam.x,innerHeight/2-cam.y);x.fillStyle=m.bg;x.fillRect(0,0,W,H);x.strokeStyle=m.grid;x.lineWidth=2;for(let i=0;i<W;i+=90){x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke()}for(let j=0;j<H;j+=90){x.beginPath();x.moveTo(0,j);x.lineTo(W,j);x.stroke()}
for(let i=0;i<14;i++){let ox=180+(i*379)%2600,oy=160+(i*613)%1450;x.fillStyle=m.obs;x.fillRect(ox,oy,180+(i%3)*80,70+(i%2)*70)}
ink.forEach(s=>{x.globalAlpha=.5;x.fillStyle=colors[s.team]||"#fff";x.beginPath();x.arc(s.x,s.y,s.r,0,7);x.fill()});x.globalAlpha=1;
for(let p of ps.values()){if(!p.alive)continue;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle="#0004";x.beginPath();x.ellipse(0,25,34,14,0,0,7);x.fill();x.fillStyle=colors[p.team]||"#fff";x.beginPath();x.arc(0,0,29,0,7);x.fill();x.fillStyle="#fff";x.beginPath();x.arc(9,-9,6,0,7);x.fill();x.beginPath();x.arc(9,9,6,0,7);x.fill();x.fillStyle="#222";x.fillRect(18,-7,35,14);x.restore();x.fillStyle="#111";x.font="bold 13px Arial";x.textAlign="center";x.fillText(p.name,p.x,p.y-40)}
effects=effects.filter(e=>e.t-- >0);effects.forEach(e=>{if(e.type==="special"){x.strokeStyle="#fff";x.lineWidth=8;x.beginPath();x.arc(e.x,e.y,(30-e.t)*15,0,7);x.stroke()}});
x.restore()}
function showResult(a){let c=a.filter(p=>p.team==="cyan").reduce((s,p)=>s+p.score,0),m=a.filter(p=>p.team==="magenta").reduce((s,p)=>s+p.score,0);q("resultText").innerHTML=`🔵 ${c} KO　　🔴 ${m} KO<br><br>${a.sort((u,v)=>v.score-u.score).slice(0,5).map(p=>`${esc(p.name)} — ${p.score} KO`).join("<br>")}`;result.hidden=false}
function loop(){update();draw();requestAnimationFrame(loop)}connect();loop();

addEventListener("mousedown",e=>{if(e.button===2)paint()});
