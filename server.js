const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingInterval: 2000,
  pingTimeout: 5000
});

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const sessionMiddleware = session({
  store: new pgSession({ pool, tableName: 'session', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'gunsbattle-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000, secure: false }
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

io.engine.use(sessionMiddleware);

const SKINS = {
  default: { name: 'Default', color: '#ff6b6b', outline: '#cc3333', price: 0, description: 'Standard red' },
  blue: { name: 'Arctic', color: '#4a9eff', outline: '#2266cc', price: 200, description: 'Cool blue frost' },
  green: { name: 'Toxic', color: '#4aff6b', outline: '#22aa44', price: 200, description: 'Radioactive green' },
  purple: { name: 'Phantom', color: '#a855f7', outline: '#7722cc', price: 300, description: 'Mysterious purple' },
  gold: { name: 'Golden', color: '#ffd700', outline: '#cc9900', price: 500, description: 'Pure gold' },
  orange: { name: 'Blaze', color: '#ff8c00', outline: '#cc6600', price: 250, description: 'Fiery orange' },
  pink: { name: 'Bubblegum', color: '#ff69b4', outline: '#cc4488', price: 250, description: 'Sweet pink' },
  cyan: { name: 'Neon', color: '#00ffff', outline: '#00aaaa', price: 350, description: 'Electric cyan' },
  black: { name: 'Shadow', color: '#444444', outline: '#222222', price: 400, description: 'Dark as night' },
  white: { name: 'Ghost', color: '#eeeeee', outline: '#aaaaaa', price: 400, description: 'Spectral white' },
  rainbow: { name: 'Rainbow', color: 'rainbow', outline: '#888888', price: 1000, description: 'All the colors' },
  diamond: { name: 'Diamond', color: '#b9f2ff', outline: '#77ccdd', price: 800, description: 'Sparkling diamond' }
};

const GUNS = {
  pistol: { name: 'Pistol', price: 0, damage: 20, fireRate: 200, bulletSpeed: 12, spread: 0, bullets: 1, image: 'gun_pistol.png', description: 'Reliable sidearm' },
  rifle: { name: 'Assault Rifle', price: 500, damage: 12, fireRate: 80, bulletSpeed: 14, spread: 0.05, bullets: 1, image: 'gun_rifle.png', description: 'Rapid fire' },
  shotgun: { name: 'Shotgun', price: 400, damage: 18, fireRate: 600, bulletSpeed: 10, spread: 0.15, bullets: 5, image: 'gun_shotgun.png', description: 'Close range beast' },
  sniper: { name: 'Sniper', price: 700, damage: 55, fireRate: 1000, bulletSpeed: 22, spread: 0, bullets: 1, image: 'gun_sniper.png', description: 'One shot threat' }
};

const COINS_PER_KILL = 25;
const MAP_SIZE = 5000;
const PLAYER_RADIUS = 22;
const PLAYER_SPEED = 4.5;
const BULLET_RADIUS = 4;
const BULLET_LIFETIME = 1500;
const MAX_HP = 100;
const RESPAWN_TIME = 3000;
const TICK_RATE = 60;
const HEALTH_PICKUP_HEAL = 30;
const PICKUP_RESPAWN = 15000;

const players = {};
const bullets = [];
const mapObjects = [];
const pickups = [];

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateMap() {
  const rng = seededRandom(42);
  const objects = [];

  for (let i = 0; i < 60; i++) {
    objects.push({
      type: 'rock',
      variant: rng() > 0.5 ? 1 : 2,
      x: rng() * (MAP_SIZE - 200) + 100,
      y: rng() * (MAP_SIZE - 200) + 100,
      radius: 25 + rng() * 30,
      collide: true
    });
  }

  for (let i = 0; i < 80; i++) {
    objects.push({
      type: 'bush',
      variant: rng() > 0.5 ? 1 : 2,
      x: rng() * (MAP_SIZE - 200) + 100,
      y: rng() * (MAP_SIZE - 200) + 100,
      radius: 20 + rng() * 20,
      collide: false
    });
  }

  for (let i = 0; i < 30; i++) {
    objects.push({
      type: 'tree',
      x: rng() * (MAP_SIZE - 300) + 150,
      y: rng() * (MAP_SIZE - 300) + 150,
      radius: 35 + rng() * 25,
      collide: true
    });
  }

  for (let i = 0; i < 15; i++) {
    objects.push({
      type: 'crate',
      x: rng() * (MAP_SIZE - 200) + 100,
      y: rng() * (MAP_SIZE - 200) + 100,
      radius: 20,
      collide: true
    });
  }

  return objects;
}

function generatePickups() {
  const rng = seededRandom(123);
  const p = [];
  for (let i = 0; i < 20; i++) {
    p.push({
      id: i,
      type: rng() > 0.5 ? 'health' : 'health',
      x: rng() * (MAP_SIZE - 200) + 100,
      y: rng() * (MAP_SIZE - 200) + 100,
      radius: 15,
      active: true,
      respawnAt: 0
    });
  }
  return p;
}

mapObjects.push(...generateMap());
pickups.push(...generatePickups());

function randomSpawn() {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = Math.random() * (MAP_SIZE - 400) + 200;
    const y = Math.random() * (MAP_SIZE - 400) + 200;
    let clear = true;
    for (const obj of mapObjects) {
      if (obj.collide) {
        const dist = Math.sqrt((x - obj.x) ** 2 + (y - obj.y) ** 2);
        if (dist < obj.radius + PLAYER_RADIUS + 20) { clear = false; break; }
      }
    }
    if (clear) return { x, y };
  }
  return { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3 || username.length > 16) return res.status(400).json({ error: 'Username must be 3-16 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });

    const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, coins, selected_skin, selected_gun, kills, deaths, highest_score',
      [username, hash]
    );

    await pool.query('INSERT INTO user_skins (user_id, skin_id) VALUES ($1, $2)', [result.rows[0].id, 'default']);
    await pool.query('INSERT INTO user_guns (user_id, gun_id) VALUES ($1, $2)', [result.rows[0].id, 'pistol']);

    req.session.userId = result.rows[0].id;
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const result = await pool.query('SELECT * FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    req.session.userId = user.id;
    res.json({
      user: {
        id: user.id, username: user.username, coins: user.coins,
        selected_skin: user.selected_skin, selected_gun: user.selected_gun,
        kills: user.kills, deaths: user.deaths, highest_score: user.highest_score
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get('/api/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const result = await pool.query(
      'SELECT id, username, coins, selected_skin, selected_gun, kills, deaths, highest_score FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) return res.json({ user: null });
    const skins = await pool.query('SELECT skin_id FROM user_skins WHERE user_id = $1', [req.session.userId]);
    const guns = await pool.query('SELECT gun_id FROM user_guns WHERE user_id = $1', [req.session.userId]);
    res.json({ user: result.rows[0], ownedSkins: skins.rows.map(r => r.skin_id), ownedGuns: guns.rows.map(r => r.gun_id) });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/shop', (req, res) => { res.json({ skins: SKINS, guns: GUNS }); });

app.post('/api/shop/buy-skin', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { skinId } = req.body;
  if (!SKINS[skinId]) return res.status(400).json({ error: 'Invalid skin' });
  try {
    const user = await pool.query('SELECT coins FROM users WHERE id = $1', [req.session.userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const owned = await pool.query('SELECT id FROM user_skins WHERE user_id = $1 AND skin_id = $2', [req.session.userId, skinId]);
    if (owned.rows.length > 0) return res.status(400).json({ error: 'Already owned' });
    if (user.rows[0].coins < SKINS[skinId].price) return res.status(400).json({ error: 'Not enough coins' });
    await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [SKINS[skinId].price, req.session.userId]);
    await pool.query('INSERT INTO user_skins (user_id, skin_id) VALUES ($1, $2)', [req.session.userId, skinId]);
    const updated = await pool.query('SELECT coins FROM users WHERE id = $1', [req.session.userId]);
    res.json({ coins: updated.rows[0].coins });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/shop/buy-gun', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { gunId } = req.body;
  if (!GUNS[gunId]) return res.status(400).json({ error: 'Invalid gun' });
  try {
    const user = await pool.query('SELECT coins FROM users WHERE id = $1', [req.session.userId]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const owned = await pool.query('SELECT id FROM user_guns WHERE user_id = $1 AND gun_id = $2', [req.session.userId, gunId]);
    if (owned.rows.length > 0) return res.status(400).json({ error: 'Already owned' });
    if (user.rows[0].coins < GUNS[gunId].price) return res.status(400).json({ error: 'Not enough coins' });
    await pool.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [GUNS[gunId].price, req.session.userId]);
    await pool.query('INSERT INTO user_guns (user_id, gun_id) VALUES ($1, $2)', [req.session.userId, gunId]);
    const updated = await pool.query('SELECT coins FROM users WHERE id = $1', [req.session.userId]);
    res.json({ coins: updated.rows[0].coins });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/shop/select-skin', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { skinId } = req.body;
  try {
    const owned = await pool.query('SELECT id FROM user_skins WHERE user_id = $1 AND skin_id = $2', [req.session.userId, skinId]);
    if (owned.rows.length === 0) return res.status(400).json({ error: 'Not owned' });
    await pool.query('UPDATE users SET selected_skin = $1 WHERE id = $2', [skinId, req.session.userId]);
    res.json({ selected_skin: skinId });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/shop/select-gun', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const { gunId } = req.body;
  try {
    const owned = await pool.query('SELECT id FROM user_guns WHERE user_id = $1 AND gun_id = $2', [req.session.userId, gunId]);
    if (owned.rows.length === 0) return res.status(400).json({ error: 'Not owned' });
    await pool.query('UPDATE users SET selected_gun = $1 WHERE id = $2', [gunId, req.session.userId]);
    res.json({ selected_gun: gunId });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query('SELECT username, kills, deaths, highest_score FROM users ORDER BY highest_score DESC LIMIT 20');
    res.json({ leaderboard: result.rows });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

io.on('connection', (socket) => {
  const sess = socket.request.session;

  socket.on('ping_check', (ts) => { socket.emit('pong_check', ts); });

  socket.on('join', async (data) => {
    if (!data || typeof data !== 'object') return;
    const spawn = randomSpawn();
    let userId = null;
    let skinId = 'default';
    let gunId = 'pistol';
    let playerName = (typeof data.name === 'string' ? data.name.slice(0, 16).trim() : '') || 'Player';

    if (sess && sess.userId) {
      try {
        const userResult = await pool.query('SELECT id, username, selected_skin, selected_gun FROM users WHERE id = $1', [sess.userId]);
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          userId = user.id;
          playerName = user.username;
          const ownedSkins = await pool.query('SELECT skin_id FROM user_skins WHERE user_id = $1', [userId]);
          const ownedGuns = await pool.query('SELECT gun_id FROM user_guns WHERE user_id = $1', [userId]);
          const ownedSkinIds = ownedSkins.rows.map(r => r.skin_id);
          const ownedGunIds = ownedGuns.rows.map(r => r.gun_id);
          if (ownedSkinIds.includes(user.selected_skin)) skinId = user.selected_skin;
          if (ownedGunIds.includes(user.selected_gun)) gunId = user.selected_gun;
        }
      } catch (err) { console.error('Join auth error:', err); }
    }

    const skinData = SKINS[skinId] || SKINS.default;
    const gunData = GUNS[gunId] || GUNS.pistol;

    players[socket.id] = {
      id: socket.id, name: playerName, x: spawn.x, y: spawn.y, angle: 0,
      hp: MAX_HP, maxHp: MAX_HP, kills: 0, deaths: 0, score: 0,
      inputs: { up: false, down: false, left: false, right: false },
      alive: true, lastShot: 0,
      skin: skinId, skinColor: skinData.color, skinOutline: skinData.outline,
      gun: gunId, gunDamage: gunData.damage, gunFireRate: gunData.fireRate,
      gunBulletSpeed: gunData.bulletSpeed, gunSpread: gunData.spread, gunBullets: gunData.bullets,
      userId: userId
    };

    socket.emit('joined', {
      id: socket.id, mapSize: MAP_SIZE, skins: SKINS, guns: GUNS,
      mapObjects: mapObjects.map(o => ({ type: o.type, variant: o.variant, x: o.x, y: o.y, radius: o.radius })),
      pickups: pickups.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, active: p.active }))
    });
  });

  socket.on('switchGun', async (data) => {
    const p = players[socket.id];
    if (!p || !data || typeof data !== 'object') return;
    const gunId = data.gunId;
    if (!GUNS[gunId]) return;

    if (sess && sess.userId) {
      try {
        const owned = await pool.query('SELECT id FROM user_guns WHERE user_id = $1 AND gun_id = $2', [sess.userId, gunId]);
        if (owned.rows.length === 0) return;
      } catch (err) { return; }
    } else {
      if (gunId !== 'pistol') return;
    }

    const gunData = GUNS[gunId];
    p.gun = gunId;
    p.gunDamage = gunData.damage;
    p.gunFireRate = gunData.fireRate;
    p.gunBulletSpeed = gunData.bulletSpeed;
    p.gunSpread = gunData.spread;
    p.gunBullets = gunData.bullets;
  });

  socket.on('input', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive || !data || typeof data !== 'object') return;
    const inp = data.inputs;
    if (inp && typeof inp === 'object') {
      p.inputs = { up: !!inp.up, down: !!inp.down, left: !!inp.left, right: !!inp.right };
    }
    if (typeof data.angle === 'number' && isFinite(data.angle)) p.angle = data.angle;
  });

  socket.on('shoot', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive || !data || typeof data !== 'object') return;
    if (typeof data.angle !== 'number' || !isFinite(data.angle)) return;
    const now = Date.now();
    if (now - p.lastShot < p.gunFireRate) return;
    p.lastShot = now;

    for (let i = 0; i < p.gunBullets; i++) {
      const spread = (Math.random() - 0.5) * p.gunSpread * 2;
      const angle = data.angle + spread;
      bullets.push({
        id: socket.id, x: p.x + Math.cos(angle) * (PLAYER_RADIUS + 8),
        y: p.y + Math.sin(angle) * (PLAYER_RADIUS + 8),
        vx: Math.cos(angle) * p.gunBulletSpeed, vy: Math.sin(angle) * p.gunBulletSpeed,
        born: now, damage: p.gunDamage
      });
    }
  });

  socket.on('disconnect', async () => {
    const p = players[socket.id];
    if (p && p.userId) {
      try {
        await pool.query(
          'UPDATE users SET kills = kills + $1, deaths = deaths + $2, highest_score = GREATEST(highest_score, $3), coins = coins + $4 WHERE id = $5',
          [p.kills, p.deaths, p.score, p.kills * COINS_PER_KILL, p.userId]
        );
      } catch (err) { console.error('Save stats error:', err); }
    }
    delete players[socket.id];
  });
});

function circleCollision(x1, y1, r1, x2, y2, r2) {
  const dx = x1 - x2, dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist < r1 + r2 ? dist : false;
}

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
    if (dx !== 0 && dy !== 0) { const len = Math.sqrt(dx * dx + dy * dy); dx /= len; dy /= len; }

    const newX = p.x + dx * PLAYER_SPEED;
    const newY = p.y + dy * PLAYER_SPEED;

    let blocked = false;
    for (const obj of mapObjects) {
      if (!obj.collide) continue;
      const dist = circleCollision(newX, newY, PLAYER_RADIUS, obj.x, obj.y, obj.radius);
      if (dist !== false) {
        if (dist < 0.01) {
          p.x = obj.x + (obj.radius + PLAYER_RADIUS + 1);
          p.y = obj.y;
        } else {
          const nx = (newX - obj.x) / dist;
          const ny = (newY - obj.y) / dist;
          p.x = obj.x + nx * (obj.radius + PLAYER_RADIUS);
          p.y = obj.y + ny * (obj.radius + PLAYER_RADIUS);
        }
        blocked = true;
      }
    }

    if (!blocked) { p.x = newX; p.y = newY; }
    p.x = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE - PLAYER_RADIUS, p.x));
    p.y = Math.max(PLAYER_RADIUS, Math.min(MAP_SIZE - PLAYER_RADIUS, p.y));

    for (const pickup of pickups) {
      if (!pickup.active) continue;
      const dist = Math.sqrt((p.x - pickup.x) ** 2 + (p.y - pickup.y) ** 2);
      if (dist < PLAYER_RADIUS + pickup.radius) {
        if (pickup.type === 'health' && p.hp < MAX_HP) {
          p.hp = Math.min(MAX_HP, p.hp + HEALTH_PICKUP_HEAL);
          pickup.active = false;
          pickup.respawnAt = now + PICKUP_RESPAWN;
        }
      }
    }
  }

  for (const pickup of pickups) {
    if (!pickup.active && now >= pickup.respawnAt) {
      pickup.active = true;
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;

    if (now - b.born > BULLET_LIFETIME || b.x < 0 || b.x > MAP_SIZE || b.y < 0 || b.y > MAP_SIZE) {
      bullets.splice(i, 1);
      continue;
    }

    let hit = false;
    for (const obj of mapObjects) {
      if (!obj.collide) continue;
      const dist = Math.sqrt((b.x - obj.x) ** 2 + (b.y - obj.y) ** 2);
      if (dist < obj.radius + BULLET_RADIUS) { hit = true; break; }
    }
    if (hit) { bullets.splice(i, 1); continue; }

    for (const id in players) {
      if (id === b.id) continue;
      const p = players[id];
      if (!p.alive) continue;
      const dist = Math.sqrt((b.x - p.x) ** 2 + (b.y - p.y) ** 2);
      if (dist < PLAYER_RADIUS + BULLET_RADIUS) {
        p.hp -= b.damage;
        bullets.splice(i, 1);
        if (p.hp <= 0) {
          p.alive = false;
          p.deaths++;
          const shooter = players[b.id];
          if (shooter) { shooter.kills++; shooter.score += 100; }
          io.emit('kill', { killer: shooter ? shooter.name : 'Unknown', victim: p.name, victimId: id });
          setTimeout(() => {
            if (players[id]) {
              const spawn = randomSpawn();
              players[id].x = spawn.x; players[id].y = spawn.y;
              players[id].hp = MAX_HP; players[id].alive = true;
            }
          }, RESPAWN_TIME);
        }
        break;
      }
    }
  }

  const state = {
    players: {},
    bullets: bullets.map(b => ({ x: b.x, y: b.y })),
    pickups: pickups.map(p => ({ id: p.id, active: p.active }))
  };

  for (const id in players) {
    const p = players[id];
    state.players[id] = {
      id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
      hp: p.hp, maxHp: p.maxHp, kills: p.kills, deaths: p.deaths, score: p.score,
      alive: p.alive, skin: p.skin, skinColor: p.skinColor, skinOutline: p.skinOutline, gun: p.gun
    };
  }

  io.volatile.emit('state', state);
}

setInterval(updateGame, 1000 / TICK_RATE);

const PORT = 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`gunsbattle.io server running on port ${PORT}`);
});
