
const http=require("http"),fs=require("fs"),path=require("path");
const {WebSocketServer}=require("ws");
const PORT=process.env.PORT||3000, PUBLIC=path.join(__dirname,"public");
const W=3000,H=1800, rooms=new Map(); let nextId=1, nextRoom=1001;
const weapons={
 splatter:{damage:25,rate:170,speed:18,ink:8,range:900},
 roller:{damage:40,rate:480,speed:11,ink:15,range:500},
 charger:{damage:80,rate:850,speed:27,ink:18,range:1500}
};
const teams=["cyan","magenta"];
function spawn(team){return {x:team==="cyan"?260+Math.random()*700:W-960+Math.random()*700,y:300+Math.random()*(H-600)}}
function send(ws,o){if(ws.readyState===1)ws.send(JSON.stringify(o))}
function roomList(){return [...rooms.values()].map(r=>({code:r.code,name:r.name,map:r.map,mode:r.mode,count:r.players.size,max:r.max,started:r.started}))}
function broadcast(r,o){for(const p of r.players.values())send(p.ws,o)}
function snapshot(r){return [...r.players.values()].map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,a:p.a,hp:p.hp,score:p.score,team:p.team,weapon:p.weapon,special:p.special,ink:p.ink,alive:p.alive}))}
function makeRoom(name,map,mode){
 let r={code:String(nextRoom++),name:name||"Ink Room",map:map||"Garden",mode:mode||"team",max:8,players:new Map(),started:false,time:180,ink:[],specials:[]};
 rooms.set(r.code,r);return r
}
makeRoom("Quick Match","Garden","team");
function leave(p){
 const r=rooms.get(p.room); if(!r)return;
 const old=p.room; p.room=null;
 r.players.delete(p.id); broadcast(r,{type:"players",players:snapshot(r)});
 if(!r.players.size && r.code!=="1001")rooms.delete(r.code);
 send(p.ws,{type:"left",code:old});
}
function resetMatch(r){
 r.started=true; r.time=180; r.ink=[];
 for(const q of r.players.values()){
  q.hp=100;q.alive=true;q.score=0;q.special=0;q.ink=100;q.lastShot=0;
  const s=spawn(q.team);q.x=s.x;q.y=s.y;
 }
}
const server=http.createServer((req,res)=>{
 let u=req.url.split("?")[0], file=u==="/"?"index.html":u.replace(/^\/+/,"");
 let full=path.join(PUBLIC,file); if(!full.startsWith(PUBLIC))return res.writeHead(403).end();
 fs.readFile(full,(e,d)=>{if(e)return res.writeHead(404).end("Not found");
 const ext=path.extname(full),ct={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",".css":"text/css;charset=utf-8"}[ext]||"application/octet-stream";
 res.writeHead(200,{"Content-Type":ct});res.end(d)})
});
const wss=new WebSocketServer({server});
wss.on("connection",ws=>{
 const p={ws,id:String(nextId++),name:"Player",room:null,x:0,y:0,a:0,hp:100,score:0,team:"cyan",weapon:"splatter",special:0,ink:100,alive:true,lastShot:0};
 send(ws,{type:"rooms",rooms:roomList()});
 ws.on("message",raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.type==="rooms"){send(ws,{type:"rooms",rooms:roomList()});return}
  if(m.type==="leave"){leave(p);send(ws,{type:"rooms",rooms:roomList()});return}
  if(m.type==="create"){
   if(p.room)leave(p); const r=makeRoom(String(m.name||"Room").slice(0,24),m.map,m.mode);
   p.room=r.code;p.name=String(m.player||"Player").slice(0,16);p.team="cyan";r.players.set(p.id,p);
   send(ws,{type:"joined",code:r.code,id:p.id,world:{W,H},map:r.map,mode:r.mode});broadcast(r,{type:"players",players:snapshot(r)});return;
  }
  if(m.type==="join"){
   if(p.room)leave(p); const r=rooms.get(String(m.code));
   if(!r||r.started||r.players.size>=r.max)return send(ws,{type:"error",msg:"その部屋には参加できません"});
   p.room=r.code;p.name=String(m.player||"Player").slice(0,16);
   const counts=[...r.players.values()].filter(x=>x.team==="cyan").length;
   const counts2=[...r.players.values()].filter(x=>x.team==="magenta").length;
   p.team=counts<=counts2?"cyan":"magenta";r.players.set(p.id,p);
   send(ws,{type:"joined",code:r.code,id:p.id,world:{W,H},map:r.map,mode:r.mode});broadcast(r,{type:"players",players:snapshot(r)});return;
  }
  if(!p.room)return;
  const r=rooms.get(p.room); if(!r)return;
  if(m.type==="start" && r.players.get(p.id)){ resetMatch(r); broadcast(r,{type:"start",players:snapshot(r),time:r.time});return; }
  if(m.type==="restart" && r.players.get(p.id)){ resetMatch(r); broadcast(r,{type:"start",players:snapshot(r),time:r.time});return; }
  if(m.type==="state"){
   p.x=Math.max(30,Math.min(W-30,+m.x||p.x));p.y=Math.max(30,Math.min(H-30,+m.y||p.y));p.a=+m.a||0;
   p.weapon=weapons[m.weapon]?m.weapon:"splatter";
   p.hp=Math.max(0,Math.min(100,+m.hp||p.hp));p.ink=Math.max(0,Math.min(100,+m.ink||p.ink));
  }
  if(m.type==="paint"){
   if(!r.started)return;
   const x=+m.x,y=+m.y,rad=Math.max(20,Math.min(100,+m.r||50));
   r.ink.push({x,y,r:rad,team:p.team,t:Date.now()});
   p.ink=Math.max(0,p.ink-(m.cost||5));p.special=Math.min(100,p.special+(m.special||3));
  }
  if(m.type==="shoot"){
   if(!r.started||!p.alive)return;
   const w=weapons[p.weapon],now=Date.now();if(now-p.lastShot<w.rate||p.ink<w.ink)return;
   p.lastShot=now;p.ink-=w.ink;p.special=Math.min(100,p.special+5);
   // server-side hit check along ray
   const dx=Math.cos(p.a),dy=Math.sin(p.a);
   for(const q of r.players.values()){
    if(q.id===p.id||q.team===p.team||!q.alive)continue;
    const px=q.x-p.x,py=q.y-p.y,t=px*dx+py*dy,d=Math.abs(px*dy-py*dx);
    if(t>0&&t<w.range&&d<42){
      q.hp-=w.damage;
      if(q.hp<=0){q.hp=0;q.alive=false;p.score++;p.special=Math.min(100,p.special+20);
       broadcast(r,{type:"ko",killer:p.id,target:q.id});
       setTimeout(()=>{if(r.players.has(q.id)){const s=spawn(q.team);q.x=s.x;q.y=s.y;q.hp=100;q.alive=true;q.ink=100;broadcast(r,{type:"respawn",id:q.id})}},1800)}
      break;
    }
   }
  }
  if(m.type==="special"){
   if(!r.started||!p.alive||p.special<100)return;
   p.special=0;
   const dx=Math.cos(p.a),dy=Math.sin(p.a);
   for(const q of r.players.values()){
    if(q.id===p.id||q.team===p.team||!q.alive)continue;
    const d=Math.hypot(q.x-p.x,q.y-p.y);
    if(d<320){q.hp-=65;if(q.hp<=0){q.hp=0;q.alive=false;p.score++;setTimeout(()=>{if(r.players.has(q.id)){const s=spawn(q.team);q.x=s.x;q.y=s.y;q.hp=100;q.alive=true;q.ink=100}},1800)}}
   }
   broadcast(r,{type:"special",id:p.id,x:p.x,y:p.y});
  }
  if(m.type==="ready"){broadcast(r,{type:"players",players:snapshot(r)})}
 });
 ws.on("close",()=>{leave(p)});
});
setInterval(()=>{
 for(const r of rooms.values()){
  if(!r.started)continue;
  r.time--; if(r.time<=0){r.started=false;broadcast(r,{type:"result",players:snapshot(r)});continue}
  const now=Date.now();r.ink=r.ink.filter(s=>now-s.t<15000);
  broadcast(r,{type:"tick",players:snapshot(r),ink:r.ink,time:r.time});
 }
},1000);
setInterval(()=>{for(const r of rooms.values())if(r.started)broadcast(r,{type:"state",players:snapshot(r),ink:r.ink})},80);
server.listen(PORT,()=>console.log("Ink Arena Full on "+PORT));
