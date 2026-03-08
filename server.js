const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 2000,
  pingTimeout: 5000
});

app.use(express.static(path.join(__dirname, 'public')));

const MAP_SIZE = 4000;
const PLAYER_RADIUS = 25;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 12;
const BULLET_RADIUS = 5;
const BULLET_LIFETIME = 2000;
const MAX_HP = 100;
const BULLET_DAMAGE = 20;
const RESPAWN_TIME = 3000;
const TICK_RATE = 60;

const players = {};
const bullets = [];
const leaderboard = [];

function randomSpawn() {
  return {
    x: Math.random() * (MAP_SIZE - 200) + 100,
    y: Math.random() * (MAP_SIZE - 200) + 100
  };
}

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    if (!data || typeof data !== 'object') return;
    const spawn = randomSpawn();
    players[socket.id] = {
      id: socket.id,
      name: (typeof data.name === 'string' ? data.name.slice(0, 16).trim() : '') || 'Player',
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      hp: MAX_HP,
      maxHp: MAX_HP,
      kills: 0,
      deaths: 0,
      score: 0,
      inputs: { up: false, down: false, left: false, right: false },
      alive: true,
      lastShot: 0
    };
    socket.emit('joined', { id: socket.id, mapSize: MAP_SIZE });
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive || !data || typeof data !== 'object') return;
    const inp = data.inputs;
    if (inp && typeof inp === 'object') {
      p.inputs = {
        up: !!inp.up,
        down: !!inp.down,
        left: !!inp.left,
        right: !!inp.right
      };
    }
    if (typeof data.angle === 'number' && isFinite(data.angle)) {
      p.angle = data.angle;
    }
  });

  socket.on('shoot', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive || !data || typeof data !== 'object') return;
    if (typeof data.angle !== 'number' || !isFinite(data.angle)) return;
    const now = Date.now();
    if (now - p.lastShot < 150) return;
    p.lastShot = now;

    const angle = data.angle;
    bullets.push({
      id: socket.id,
      x: p.x + Math.cos(angle) * (PLAYER_RADIUS + 10),
      y: p.y + Math.sin(angle) * (PLAYER_RADIUS + 10),
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      born: now
    });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
  });
});

function updateGame() {
  const now = Date.now();

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    let dx = 0, dy = 0;
    if (p.inputs.up) dy -= 1;
    if (p.inputs.down) dy += 1;
    if (p.inputs.left) dx -= 1;
    if (p.inputs.right) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    p.x += dx * PLAYER_SPEED;
    p.y += dy * PLAYER_SPEED;

    p.x = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE - PLAYER_RADIUS, p.y));
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    if (now - b.born > BULLET_LIFETIME || b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
      bullets.splice(i, 1);
      continue;
    }

    for (const id in players) {
      if (id === b.id) continue;
      const p = players[id];
      if (!p.alive) continue;
      const dist = Math.sqrt((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
      if (dist < PLAYER_RADIUS + BULLET_RADIUS) {
        p.hp -= BULLET_DAMAGE;
        bullets.splice(i, 1);

        if (p.hp <= 0) {
          p.alive = false;
          p.deaths++;
          const shooter = players[b.id];
          if (shooter) {
            shooter.kills++;
            shooter.score += 100;
          }
          io.emit('kill', {
            killer: shooter ? shooter.name : 'Unknown',
            victim: p.name,
            victimId: id
          });

          setTimeout(() => {
            if (players[id]) {
              const spawn = randomSpawn();
              players[id].x = spawn.x;
              players[id].y = spawn.y;
              players[id].hp = MAX_HP;
              players[id].alive = true;
            }
          }, RESPAWN_TIME);
        }
        break;
      }
    }
  }

  const state = {
    players: {},
    bullets: bullets.map(b => ({ x: b.x, y: b.y }))
  };

  for (const id in players) {
    const p = players[id];
    state.players[id] = {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      angle: p.angle,
      hp: p.hp,
      maxHp: p.maxHp,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      alive: p.alive
    };
  }

  io.volatile.emit('state', state);
}

setInterval(updateGame, 1000 / TICK_RATE);

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`gunsbattle.io server running on port ${PORT}`);
});
