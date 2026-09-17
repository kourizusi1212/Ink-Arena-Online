const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 10000);
const PUBLIC = path.join(__dirname, "public");
const WORLD = { w: 3000, h: 1800 };
const rooms = new Map();
let nextPlayerId = 1;
let nextRoomCode = 1001;

const weapons = {
  splatter: { damage: 25, rate: 170, ink: 8, range: 900 },
  roller:   { damage: 40, rate: 480, ink: 15, range: 500 },
  charger:  { damage: 80, rate: 850, ink: 18, range: 1500 }
};

function safe(v, fallback, max) {
  return String(v ?? fallback).trim().slice(0, max);
}
function send(ws, data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcast(room, data) {
  for (const p of room.players.values()) send(p.ws, data);
}
function snapshot(room) {
  return [...room.players.values()].map(p => ({
    id:p.id, name:p.name, team:p.team, x:p.x, y:p.y, a:p.a,
    hp:p.hp, ink:p.ink, special:p.special, score:p.score,
    weapon:p.weapon, alive:p.alive
  }));
}
function roomList() {
  return [...rooms.values()].map(r => ({
    code:r.code, name:r.name, map:r.map, mode:r.mode,
    count:r.players.size, max:r.max, started:r.started
  }));
}
function sendRooms(ws) { send(ws, { type:"rooms", rooms:roomList() }); }

function makeRoom(name, map, mode) {
  const room = {
    code:String(nextRoomCode++),
    name:safe(name, "Ink Room", 24) || "Ink Room",
    map:["Garden","Factory","Night City"].includes(map) ? map : "Garden",
    mode:mode === "solo" ? "solo" : "team",
    max:8,
    players:new Map(),
    started:false,
    time:180,
    ink:[]
  };
  rooms.set(room.code, room);
  return room;
}
if (!rooms.has("1000")) {
  rooms.set("1000", {
    code:"1000", name:"Quick Match", map:"Garden", mode:"team",
    max:8, players:new Map(), started:false, time:180, ink:[]
  });
}


const OBSTACLES = Array.from({length:15},(_,i)=>({x:180+(i*379)%2550,y:150+(i*613)%1400,w:180+(i%3)*70,h:70+(i%2)*70}));
function blocked(x,y,r=28){
  if(x-r<0||y-r<0||x+r>WORLD.w||y+r>WORLD.h)return true;
  return OBSTACLES.some(o=>x+r>o.x&&x-r<o.x+o.w&&y+r>o.y&&y-r<o.y+o.h);
}
function spawn(team){
  for(let i=0;i<100;i++){
    const x=team === "cyan" ? 350 + Math.random()*650 : WORLD.w - 1000 + Math.random()*650;
    const y=250 + Math.random()*(WORLD.h-500);
    if(!blocked(x,y,32)) return {x,y};
  }
  return team === "cyan" ? {x:70,y:70} : {x:WORLD.w-70,y:WORLD.h-70};
}
function applyPosition(p,x,y){
  x=Number(x);y=Number(y);
  if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const maxStep=48;
  let dx=Math.max(-maxStep,Math.min(maxStep,x-p.x));
  let dy=Math.max(-maxStep,Math.min(maxStep,y-p.y));
  const nx=p.x+dx, ny=p.y+dy;
  if(!blocked(nx,p.y,28))p.x=nx;
  if(!blocked(p.x,ny,28))p.y=ny;
}
function assignTeam(room) {
  if (room.mode === "solo") return room.players.size % 2 ? "magenta" : "cyan";
  const c = [...room.players.values()].filter(p=>p.team==="cyan").length;
  const m = [...room.players.values()].filter(p=>p.team==="magenta").length;
  return c <= m ? "cyan" : "magenta";
}
function resetMatch(room) {
  room.started = true;
  room.time = 180;
  room.ink = [];
  for (const p of room.players.values()) {
    const s = spawn(p.team);
    Object.assign(p, {
      x:s.x,y:s.y,hp:100,ink:100,special:0,score:0,alive:true,lastShot:0
    });
  }
}

function leaveRoom(p, notify=true) {
  if (!p.room) return;
  const room = rooms.get(p.room);
  const oldCode = p.room;
  p.room = null;
  if (room) {
    room.players.delete(p.id);
    if (room.players.size === 0 && room.code !== "1000") rooms.delete(room.code);
    else broadcast(room, {type:"players", players:snapshot(room)});
  }
  if (notify) send(p.ws, {type:"left", code:oldCode});
}

const server = http.createServer((req,res) => {
  let url = decodeURIComponent(req.url.split("?")[0]);
  if (url === "/") url = "/index.html";
  const file = path.normalize(path.join(PUBLIC, url.replace(/^\/+/, "")));
  if (!file.startsWith(PUBLIC)) return res.writeHead(403).end("Forbidden");
  fs.readFile(file, (err,data) => {
    if (err) return res.writeHead(404).end("Not found");
    const ext = path.extname(file);
    const types = {
      ".html":"text/html; charset=utf-8",
      ".js":"text/javascript; charset=utf-8",
      ".css":"text/css; charset=utf-8"
    };
    res.writeHead(200, {"Content-Type":types[ext] || "application/octet-stream"});
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
wss.on("connection", ws => {
  const p = {
    ws, id:String(nextPlayerId++), name:"Player", room:null,
    x:400,y:400,a:0,hp:100,ink:100,special:0,score:0,
    team:"cyan",weapon:"splatter",alive:true,lastShot:0
  };

  sendRooms(ws);

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return send(ws,{type:"error",msg:"通信データが不正です"}); }
    const type = String(m.type || "");

    if (type === "rooms") return sendRooms(ws);

    if (type === "create") {
      leaveRoom(p, false);
      const room = makeRoom(m.name, m.map, m.mode);
      p.room = room.code;
      p.name = safe(m.player, "Player", 16) || "Player";
      p.team = assignTeam(room);
      room.players.set(p.id,p);
      send(ws,{type:"joined",code:room.code,id:p.id,map:room.map,mode:room.mode,world:WORLD});
      broadcast(room,{type:"players",players:snapshot(room)});
      sendRooms(ws);
      return;
    }

    if (type === "join") {
      const code = safe(m.code,"",12);
      const room = rooms.get(code);
      if (!room) return send(ws,{type:"error",msg:"その部屋は存在しません"});
      if (room.started) return send(ws,{type:"error",msg:"その部屋は試合中です"});
      if (room.players.size >= room.max) return send(ws,{type:"error",msg:"その部屋は満員です"});
      leaveRoom(p,false);
      p.room = room.code;
      p.name = safe(m.player, "Player", 16) || "Player";
      p.team = assignTeam(room);
      room.players.set(p.id,p);
      send(ws,{type:"joined",code:room.code,id:p.id,map:room.map,mode:room.mode,world:WORLD});
      broadcast(room,{type:"players",players:snapshot(room)});
      sendRooms(ws);
      return;
    }

    if (type === "leave") {
      leaveRoom(p,true);
      sendRooms(ws);
      return;
    }

    if (!p.room) return send(ws,{type:"error",msg:"先に部屋へ参加してください"});
    const room = rooms.get(p.room);
    if (!room || !room.players.has(p.id)) return send(ws,{type:"error",msg:"部屋情報が失われました。部屋一覧を更新してください"});

    if (type === "start" || type === "restart") {
      if (room.players.size < 1) return send(ws,{type:"error",msg:"参加者がいません"});
      resetMatch(room);
      broadcast(room,{type:"start",players:snapshot(room),time:room.time});
      return;
    }

    if (type === "state") {
      if (!room.started || !p.alive) return;
      applyPosition(p,m.x,m.y);
      p.a=Number.isFinite(Number(m.a)) ? Number(m.a) : p.a;
      if (weapons[m.weapon]) p.weapon=m.weapon;
      return;
    }

    if (type === "paint") {
      if (!room.started || !p.alive || p.ink < 4) return;
      const x=Number(m.x)||p.x, y=Number(m.y)||p.y;
      const r=Math.max(20,Math.min(110,Number(m.r)||60));
      room.ink.push({x,y,r,team:p.team,t:Date.now()});
      p.ink=Math.max(0,p.ink-Number(m.cost||6));
      p.special=Math.min(100,p.special+Number(m.special||4));
      return;
    }

    if (type === "shoot") {
      if (!room.started || !p.alive) return;
      const w=weapons[p.weapon], now=Date.now();
      if (now-p.lastShot < w.rate || p.ink < w.ink) return;
      p.lastShot=now; p.ink-=w.ink; p.special=Math.min(100,p.special+5);
      const dx=Math.cos(p.a), dy=Math.sin(p.a);
      for (const q of room.players.values()) {
        if (q.id===p.id || q.team===p.team || !q.alive) continue;
        const px=q.x-p.x, py=q.y-p.y;
        const t=px*dx+py*dy, d=Math.abs(px*dy-py*dx);
        if (t>0 && t<w.range && d<44) {
          q.hp-=w.damage;
          if (q.hp<=0) {
            q.hp=0; q.alive=false; p.score++;
            broadcast(room,{type:"ko",killer:p.id,target:q.id});
            setTimeout(()=>{
              if (!room.players.has(q.id) || room.started===false) return;
              const s=spawn(q.team);
              Object.assign(q,{x:s.x,y:s.y,hp:100,ink:100,alive:true,special:0});
              broadcast(room,{type:"respawn",id:q.id});
            },1500);
          }
          break;
        }
      }
      return;
    }

    if (type === "special") {
      if (!room.started || !p.alive || p.special < 100) return;
      p.special=0;
      for (const q of room.players.values()) {
        if (q.id===p.id || q.team===p.team || !q.alive) continue;
        if (Math.hypot(q.x-p.x,q.y-p.y)<320) {
          q.hp-=65;
          if (q.hp<=0) {
            q.hp=0;q.alive=false;p.score++;
            broadcast(room,{type:"ko",killer:p.id,target:q.id});
          }
        }
      }
      broadcast(room,{type:"special",id:p.id,x:p.x,y:p.y});
    }
  });

  ws.on("close",()=>leaveRoom(p,false));
});

setInterval(()=>{
  for (const room of rooms.values()) {
    if (!room.started) continue;
    room.time--;
    room.ink=room.ink.filter(s=>Date.now()-s.t<15000);
    if (room.time<=0) {
      room.time=0;
      room.started=false;
      broadcast(room,{type:"result",players:snapshot(room)});
    } else {
      broadcast(room,{type:"tick",players:snapshot(room),ink:room.ink,time:room.time});
    }
  }
},1000);

setInterval(()=>{
  for (const room of rooms.values()) if (room.started)
    broadcast(room,{type:"state",players:snapshot(room),ink:room.ink});
},100);

server.listen(PORT,()=>console.log(`Ink Arena server listening on ${PORT}`));
