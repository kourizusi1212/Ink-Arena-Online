const $ = id => document.getElementById(id);
const canvas=$("game"), ctx=canvas.getContext("2d");
let ws=null, reconnectTimer=null;
let screen="menu", started=false, mapName="Garden", W=3000,H=1800, roomCode="";
let me={id:null,name:"Player",x:500,y:500,a:0,hp:100,ink:100,special:0,score:0,team:"cyan",weapon:"splatter",alive:true};
let players=new Map(), ink=[], keys={}, effects=[], lastState=0,lastShot=0, lastFrame=performance.now();
const colors={cyan:"#24d8ff",magenta:"#ff4d83"};
const maps={Garden:["#b8d9a8","#a6c895","#35464a"],Factory:["#b7b7b7","#a0a0a0","#343b42"],"Night City":["#141b30","#202947","#38415f"]};

function setStatus(s){$("status").textContent=s}
function setView(view){
  screen=view;
  $("menu").hidden=view!=="menu";
  $("lobby").hidden=view!=="lobby";
  $("hud").hidden=view!=="game";
  $("result").hidden=view!=="result";
  $("cross").hidden=view!=="game";
}
function send(o){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))}
function playerName(){return ($("player").value.trim()||"Player").slice(0,16)}

function connect(){
  clearTimeout(reconnectTimer);
  const proto=location.protocol==="https:"?"wss":"ws";
  ws=new WebSocket(`${proto}://${location.host}`);
  ws.onopen=()=>{
    setStatus("サーバーに接続しました");
    $("quickBtn").disabled=false;
    send({type:"rooms"});
  };
  ws.onclose=()=>{
    $("quickBtn").disabled=true;
    if(screen!=="game") setStatus("切断されました。再接続中…");
    reconnectTimer=setTimeout(connect,1500);
  };
  ws.onerror=()=>setStatus("通信エラー");
  ws.onmessage=e=>{
    let m;try{m=JSON.parse(e.data)}catch{return}
    if(m.type==="rooms") drawRooms(m.rooms||[]);
    if(m.type==="error"){setStatus("⚠ "+m.msg);return}
    if(m.type==="joined"){
      me.id=m.id; roomCode=m.code; mapName=m.map||"Garden"; W=m.world.w;H=m.world.h;
      started=false;
      setView("lobby");
      $("roomTitle").textContent=`ROOM #${roomCode} — ${mapName}`;
      $("lobbyStatus").textContent="参加者を待っています";
      send({type:"rooms"});
    }
    if(m.type==="players"){sync(m.players||[]);drawMembers()}
    if(m.type==="start"){
      started=true;setView("game");
      sync(m.players||[]);$("time").textContent=fmt(m.time??180);
    }
    if(m.type==="tick"||m.type==="state"){
      sync(m.players||[]);
      if(Array.isArray(m.ink))ink=m.ink;
      if(m.time!=null)$("time").textContent=fmt(m.time);
    }
    if(m.type==="result"){
      started=false;setView("result");showResult(m.players||[]);
    }
    if(m.type==="respawn"){const p=players.get(m.id);if(p)p.alive=true}
    if(m.type==="ko")effects.push({type:"ko",t:35})
    if(m.type==="special")effects.push({type:"special",x:m.x,y:m.y,t:30})
    if(m.type==="left"){
      started=false;roomCode="";
      setView("menu");
      setStatus("部屋から退出しました");send({type:"rooms"});
    }
  };
}
function sync(arr){
  const next=new Map();
  for(const p of arr){
    const old=players.get(p.id);
    next.set(p.id,{...p,rx:old?.rx??p.x,ry:old?.ry??p.y,ra:old?.ra??p.a});
  }
  players=next;
  const p=players.get(me.id);
  if(p){
    me.hp=p.hp;me.ink=p.ink;me.special=p.special;me.score=p.score;me.team=p.team;me.alive=p.alive;
    // Do not overwrite local x/y/a every network tick: that causes visible rubber-banding.
  }
}
function drawRooms(arr){
  const list=$("roomList");
  if(!arr.length){list.innerHTML="<p>部屋がありません</p>";return}
  list.innerHTML=arr.map(r=>{
    const disabled=r.started||r.count>=r.max;
    return `<div class="room"><div><b>${esc(r.name)}</b><br><small>#${r.code} · ${esc(r.map)} · ${r.count}/${r.max}${r.started?" · 試合中":""}</small></div><button ${disabled?"disabled":""} data-join="${esc(r.code)}">${r.started?"試合中":r.count>=r.max?"満員":"参加"}</button></div>`;
  }).join("");
  list.querySelectorAll("[data-join]").forEach(b=>b.onclick=()=>send({type:"join",code:b.dataset.join,player:playerName()}));
}
function drawMembers(){
  $("members").innerHTML=[...players.values()].map(p=>`<span class="member ${p.team}">${p.team==="cyan"?"🔵":"🔴"} ${esc(p.name)}${p.id===me.id?"（自分）":""}</span>`).join("")||"参加者なし";
  $("lobbyStatus").textContent=`参加者 ${players.size}/8`;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmt(s){return Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0")}

document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");
  ["quick","rooms","create"].forEach(id=>$(id).hidden=id!==b.dataset.tab);
  if(b.dataset.tab==="rooms")send({type:"rooms"});
});
$("refreshBtn").onclick=()=>send({type:"rooms"});
$("quickBtn").onclick=()=>send({type:"join",code:"1000",player:playerName()});
$("createBtn").onclick=()=>send({type:"create",name:$("roomName").value,map:$("map").value,mode:$("mode").value,player:playerName()});
$("startBtn").onclick=()=>send({type:"start"});
$("backBtn").onclick=()=>send({type:"leave"});
$("again").onclick=()=>{started=false;setView("lobby");$("lobbyStatus").textContent="ロビーに戻りました";send({type:"rooms"});drawMembers()};
$("rematch").onclick=()=>send({type:"restart"});

addEventListener("keydown",e=>{
  keys[e.key.toLowerCase()]=true;
  if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();
  if(e.key==="1")me.weapon="splatter";
  if(e.key==="2")me.weapon="roller";
  if(e.key==="3")me.weapon="charger";
  if(e.code==="Space")send({type:"special"});
});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
addEventListener("mousemove",e=>{ if(document.pointerLockElement===canvas){ me.a+=e.movementX*0.004; } });
addEventListener("mousedown",e=>{ if(e.button===0)shoot(); if(e.button===2)paint(); });
canvas.addEventListener("click",()=>{ if(started && document.pointerLockElement!==canvas) canvas.requestPointerLock?.(); });
addEventListener("contextmenu",e=>e.preventDefault());

function shoot(){
  if(!started||!me.alive)return;
  const rates={splatter:170,roller:480,charger:850},now=performance.now();
  if(now-lastShot<rates[me.weapon])return;
  lastShot=now;send({type:"shoot"});
  const dx=Math.cos(me.a),dy=Math.sin(me.a),dist=me.weapon==="charger"?900:520;
  for(let d=40;d<dist;d+=60)ink.push({x:me.x+dx*d,y:me.y+dy*d,r:me.weapon==="roller"?38:22,team:me.team,t:Date.now()});
}
function paint(){
  if(!started||me.ink<4)return;
  const dx=Math.cos(me.a),dy=Math.sin(me.a);
  for(let d=50;d<360;d+=65)ink.push({x:me.x+dx*d+(Math.random()-.5)*30,y:me.y+dy*d+(Math.random()-.5)*30,r:30+Math.random()*25,team:me.team,t:Date.now()});
  send({type:"paint",x:me.x+dx*170,y:me.y+dy*170,r:75,cost:7,special:4});
}
const obstacles=Array.from({length:15},(_,i)=>({x:180+(i*379)%2550,y:150+(i*613)%1400,w:180+(i%3)*70,h:70+(i%2)*70}));
function blocked(x,y,r=28){
  if(x-r<0||y-r<0||x+r>W||y+r>H)return true;
  return obstacles.some(o=>x+r>o.x&&x-r<o.x+o.w&&y+r>o.y&&y-r<o.y+o.h);
}
function tryMove(dx,dy){
  const r=28;
  const nx=me.x+dx, ny=me.y+dy;
  if(!blocked(nx,me.y,r))me.x=nx;
  if(!blocked(me.x,ny,r))me.y=ny;
}
function update(){
  if(!started)return;
  const now=performance.now(), dt=Math.min(.033,(now-lastFrame)/1000); lastFrame=now;
  let dx=(keys.w||keys.arrowup?1:0)-(keys.s||keys.arrowdown?1:0);
  let dy=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0);
  if(dx||dy){const l=Math.hypot(dx,dy);const speed=360;tryMove(dx/l*speed*dt,dy/l*speed*dt)}
  if(performance.now()-lastState>50){
    lastState=performance.now();
    send({type:"state",x:me.x,y:me.y,a:me.a,hp:me.hp,ink:me.ink,weapon:me.weapon});
  }
  for(const p of players.values()){
    if(p.id===me.id)continue;
    p.rx+=(p.x-p.rx)*Math.min(1,dt*14); p.ry+=(p.y-p.ry)*Math.min(1,dt*14); p.ra+=(p.a-p.ra)*Math.min(1,dt*14);
  }
  $("hp").textContent=Math.round(me.hp);$("ink").textContent=Math.round(me.ink);$("sp").textContent=Math.round(me.special);$("score").textContent=me.score;$("weapon").textContent=me.weapon.toUpperCase();
}
function draw(){
  const mm=maps[mapName]||maps.Garden;
  ctx.fillStyle=mm[0];ctx.fillRect(0,0,innerWidth,innerHeight);
  ctx.save();ctx.translate(innerWidth/2-me.x,innerHeight/2-me.y);
  ctx.fillStyle=mm[0];ctx.fillRect(0,0,W,H);
  ctx.strokeStyle=mm[1];ctx.lineWidth=2;
  for(let i=0;i<W;i+=90){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,H);ctx.stroke()}
  for(let j=0;j<H;j+=90){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(W,j);ctx.stroke()}
  for(const o of obstacles){ctx.fillStyle=mm[2];ctx.fillRect(o.x,o.y,o.w,o.h)}
  ink.forEach(s=>{ctx.globalAlpha=.48;ctx.fillStyle=colors[s.team]||"#fff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  for(const p of players.values()){
    if(!p.alive)continue;
    const px=p.id===me.id?me.x:p.rx, py=p.id===me.id?me.y:p.ry, pa=p.id===me.id?me.a:p.ra;
    ctx.save();ctx.translate(px,py);ctx.rotate(pa);
    ctx.fillStyle=colors[p.team]||"#fff";ctx.beginPath();ctx.arc(0,0,29,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#222";ctx.fillRect(17,-7,38,14);ctx.restore();
    ctx.fillStyle="#111";ctx.font="bold 13px Arial";ctx.textAlign="center";ctx.fillText(p.name,px,py-40);
  }
  ctx.restore();
}
function showResult(arr){
  const cyan=arr.filter(p=>p.team==="cyan").reduce((s,p)=>s+p.score,0);
  const mag=arr.filter(p=>p.team==="magenta").reduce((s,p)=>s+p.score,0);
  $("resultText").innerHTML=`🔵 ${cyan} KO　　🔴 ${mag} KO<br><br>`+arr.slice().sort((a,b)=>b.score-a.score).map(p=>`${esc(p.name)} — ${p.score} KO`).join("<br>");
  $("result").hidden=false;
}
function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
addEventListener("resize",resize);resize();
function loop(){update();draw();requestAnimationFrame(loop)}
setView("menu");
connect();loop();
