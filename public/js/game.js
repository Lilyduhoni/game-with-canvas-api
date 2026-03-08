(function() {
  const socket = io({ transports: ['websocket'] });

  const $ = id => document.getElementById(id);
  const loadingScreen = $('loading-screen');
  const menuScreen = $('menu-screen');
  const deathScreen = $('death-screen');
  const killedBy = $('killed-by');
  const canvas = $('game-canvas');
  const ctx = canvas.getContext('2d');
  const hud = $('hud');
  const killFeed = $('kill-feed');
  const hudLbList = $('hud-lb-list');
  const statKills = $('stat-kills');
  const statDeaths = $('stat-deaths');
  const statCoinsVal = $('stat-coins-val');
  const minimapCanvas = $('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');
  const loaderBar = $('loader-bar');
  const loaderText = $('loader-text');
  const nameInput = $('name-input');
  const playBtn = $('play-btn');
  const hpBar = $('hp-bar');
  const hpText = $('hp-text');
  const gunIndicatorImg = $('gun-indicator-img');
  const gunIndicatorName = $('gun-indicator-name');
  const shopScreen = $('shop-screen');
  const lbScreen = $('leaderboard-screen');
  const pingDisplay = $('ping-display');

  let myId = null;
  let mapSize = 5000;
  let gameState = { players: {}, bullets: [], pickups: [] };
  let prevState = { players: {}, bullets: [], pickups: [] };
  let lastStateTime = 0;
  let stateInterval = 1000 / 60;
  let mouseX = 0, mouseY = 0;
  let mouseAngle = 0;
  let shootInterval = null;
  let currentUser = null;
  let ownedSkins = ['default'];
  let ownedGuns = ['pistol'];
  let selectedSkin = 'default';
  let selectedGun = 'pistol';
  let shopData = { skins: {}, guns: {} };
  let mapObjects = [];
  let pickupData = [];
  let currentPing = 0;
  let lastPingTime = 0;

  const inputs = { up: false, down: false, left: false, right: false };

  const grassImg = new Image();

  const imagesToLoad = [
    'grass_tile', 'gun_pistol', 'gun_rifle', 'gun_shotgun', 'gun_sniper',
    'coin', 'crown', 'rock1', 'rock2', 'bush1', 'bush2', 'tree', 'crate', 'healthpack'
  ];
  const images = {};
  let loaded = 0;

  function loadImage(name) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        images[name] = img;
        loaded++;
        const pct = Math.round((loaded / imagesToLoad.length) * 100);
        loaderBar.style.width = pct + '%';
        loaderText.textContent = `Loading... (${pct}%)`;
        resolve();
      };
      img.onerror = () => { loaded++; resolve(); };
      img.src = `/images/${name}.png`;
    });
  }

  grassImg.src = '/images/grass_tile.png';

  Promise.all(imagesToLoad.map(loadImage)).then(() => {
    loaderText.textContent = 'Ready!';
    loaderBar.style.width = '100%';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      menuScreen.style.display = 'flex';
      nameInput.focus();
      checkSession();
    }, 500);
  });

  window.addEventListener('resize', () => {
    if (canvas.style.display !== 'none') resizeCanvas();
  });

  setInterval(() => {
    if (myId) {
      lastPingTime = Date.now();
      socket.emit('ping_check', lastPingTime);
    }
  }, 2000);

  socket.on('pong_check', (ts) => {
    currentPing = Date.now() - ts;
    if (pingDisplay) pingDisplay.textContent = `${currentPing}ms`;
  });

  async function checkSession() {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.user) {
        currentUser = data.user;
        ownedSkins = data.ownedSkins || ['default'];
        ownedGuns = data.ownedGuns || ['pistol'];
        selectedSkin = data.user.selected_skin;
        selectedGun = data.user.selected_gun;
        showLoggedIn();
      }
    } catch (e) {}
    try {
      const res = await fetch('/api/shop');
      shopData = await res.json();
    } catch (e) {}
  }

  function showSection(id) {
    ['guest-section', 'login-section', 'signup-section', 'logged-in-section'].forEach(s => {
      $(s).style.display = s === id ? 'flex' : 'none';
    });
  }

  function showLoggedIn() {
    $('user-display-name').textContent = currentUser.username;
    $('user-coins-display').textContent = currentUser.coins;
    $('user-kills').textContent = currentUser.kills;
    $('user-deaths').textContent = currentUser.deaths;
    $('user-best').textContent = currentUser.highest_score;
    showSection('logged-in-section');
  }

  $('show-login').addEventListener('click', () => showSection('login-section'));
  $('show-signup').addEventListener('click', () => showSection('signup-section'));
  $('back-to-guest-from-login').addEventListener('click', () => showSection('guest-section'));
  $('back-to-guest-from-signup').addEventListener('click', () => showSection('guest-section'));

  $('login-btn').addEventListener('click', async () => {
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const errorEl = $('login-error');
    errorEl.textContent = '';
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      currentUser = data.user;
      await checkSession();
      showLoggedIn();
    } catch (e) { errorEl.textContent = 'Connection error'; }
  });

  $('signup-btn').addEventListener('click', async () => {
    const username = $('signup-username').value.trim();
    const password = $('signup-password').value;
    const errorEl = $('signup-error');
    errorEl.textContent = '';
    try {
      const res = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      currentUser = data.user;
      await checkSession();
      showLoggedIn();
    } catch (e) { errorEl.textContent = 'Connection error'; }
  });

  $('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null; ownedSkins = ['default']; ownedGuns = ['pistol'];
    selectedSkin = 'default'; selectedGun = 'pistol';
    showSection('guest-section');
  });

  ['login-username', 'login-password'].forEach(id => { $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('login-btn').click(); }); });
  ['signup-username', 'signup-password'].forEach(id => { $(id).addEventListener('keydown', e => { if (e.key === 'Enter') $('signup-btn').click(); }); });

  function startGame(name) {
    menuScreen.style.display = 'none';
    canvas.style.display = 'block';
    hud.style.display = 'block';
    resizeCanvas();
    updateGunIndicator(selectedGun);
    socket.emit('join', { name });
  }

  function updateGunIndicator(gunId) {
    gunIndicatorImg.src = `/images/gun_${gunId}.png`;
    const gunNames = { pistol: 'Pistol', rifle: 'Rifle', shotgun: 'Shotgun', sniper: 'Sniper' };
    if (gunIndicatorName) gunIndicatorName.textContent = gunNames[gunId] || gunId;
  }

  playBtn.addEventListener('click', () => startGame(nameInput.value.trim() || 'Player'));
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') playBtn.click(); });
  $('play-logged-btn').addEventListener('click', () => startGame(currentUser.username));

  $('shop-btn').addEventListener('click', () => { shopScreen.style.display = 'block'; renderShop(); });
  $('shop-close').addEventListener('click', () => { shopScreen.style.display = 'none'; });

  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      $('shop-skins-grid').style.display = which === 'skins' ? 'grid' : 'none';
      $('shop-guns-grid').style.display = which === 'guns' ? 'grid' : 'none';
    });
  });

  function renderShop() {
    $('shop-coins').textContent = currentUser ? currentUser.coins : 0;
    const skinsGrid = $('shop-skins-grid');
    const gunsGrid = $('shop-guns-grid');
    skinsGrid.innerHTML = '';
    gunsGrid.innerHTML = '';

    for (const [id, skin] of Object.entries(shopData.skins)) {
      const owned = ownedSkins.includes(id);
      const selected = selectedSkin === id;
      const item = document.createElement('div');
      item.className = 'shop-item' + (owned ? ' owned' : '') + (selected ? ' selected' : '');
      let previewStyle = `background: ${skin.color}; border-color: ${skin.outline};`;
      if (skin.color === 'rainbow') previewStyle = 'background: conic-gradient(red, orange, yellow, green, cyan, blue, purple, red);';
      item.innerHTML = `
        <div class="shop-item-preview" style="${previewStyle}"></div>
        <div class="shop-item-name">${skin.name}</div>
        <div class="shop-item-desc">${skin.description}</div>
        ${selected ? '<div class="shop-item-status equipped">EQUIPPED</div>' :
          owned ? '<div class="shop-item-status">OWNED</div>' :
          `<div class="shop-item-price"><img src="/images/coin.png" class="coin-icon-sm"> ${skin.price}</div>`}
      `;
      item.addEventListener('click', () => handleSkinClick(id, skin, owned));
      skinsGrid.appendChild(item);
    }

    for (const [id, gun] of Object.entries(shopData.guns)) {
      const owned = ownedGuns.includes(id);
      const selected = selectedGun === id;
      const item = document.createElement('div');
      item.className = 'shop-item' + (owned ? ' owned' : '') + (selected ? ' selected' : '');
      item.innerHTML = `
        <img class="shop-item-gun-preview" src="/images/${gun.image}" alt="${gun.name}">
        <div class="shop-item-name">${gun.name}</div>
        <div class="shop-item-desc">${gun.description}</div>
        <div class="gun-stats">
          <span>DMG: ${gun.damage}</span>
          <span>SPD: ${gun.bulletSpeed}</span>
          <span>RATE: ${Math.round(1000/gun.fireRate)}/s</span>
        </div>
        ${selected ? '<div class="shop-item-status equipped">EQUIPPED</div>' :
          owned ? '<div class="shop-item-status">OWNED</div>' :
          `<div class="shop-item-price"><img src="/images/coin.png" class="coin-icon-sm"> ${gun.price}</div>`}
      `;
      item.addEventListener('click', () => handleGunClick(id, gun, owned));
      gunsGrid.appendChild(item);
    }
  }

  async function handleSkinClick(id, skin, owned) {
    if (!currentUser) return;
    if (owned) {
      const res = await fetch('/api/shop/select-skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId: id }) });
      if (res.ok) { selectedSkin = id; renderShop(); }
    } else {
      if (currentUser.coins < skin.price) return;
      const res = await fetch('/api/shop/buy-skin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skinId: id }) });
      if (res.ok) { const data = await res.json(); currentUser.coins = data.coins; ownedSkins.push(id); $('user-coins-display').textContent = currentUser.coins; renderShop(); }
    }
  }

  async function handleGunClick(id, gun, owned) {
    if (!currentUser) return;
    if (owned) {
      const res = await fetch('/api/shop/select-gun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gunId: id }) });
      if (res.ok) { selectedGun = id; renderShop(); }
    } else {
      if (currentUser.coins < gun.price) return;
      const res = await fetch('/api/shop/buy-gun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gunId: id }) });
      if (res.ok) { const data = await res.json(); currentUser.coins = data.coins; ownedGuns.push(id); $('user-coins-display').textContent = currentUser.coins; renderShop(); }
    }
  }

  document.querySelectorAll('.gun-slot').forEach(slot => {
    slot.addEventListener('click', () => {
      const gunId = slot.dataset.gun;
      if (gunId) switchGun(gunId);
    });
  });

  function updateGunSlots(activeGun) {
    document.querySelectorAll('.gun-slot').forEach(slot => {
      slot.classList.toggle('active', slot.dataset.gun === activeGun);
    });
  }

  $('lb-btn').addEventListener('click', async () => {
    lbScreen.style.display = 'block';
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      const table = $('lb-table');
      table.innerHTML = '';
      data.leaderboard.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML = `<span class="rank">#${i + 1}</span><span class="name">${escapeHtml(p.username)}</span><span class="score">${p.highest_score} pts</span>`;
        table.appendChild(row);
      });
    } catch (e) {}
  });
  $('lb-close').addEventListener('click', () => { lbScreen.style.display = 'none'; });

  socket.on('joined', (data) => {
    myId = data.id;
    mapSize = data.mapSize;
    mapObjects = data.mapObjects || [];
    pickupData = data.pickups || [];
    if (data.guns) shopData.guns = data.guns;
    if (data.skins) shopData.skins = data.skins;
  });

  socket.on('state', (state) => {
    prevState = gameState;
    gameState = state;
    lastStateTime = performance.now();

    if (state.pickups) {
      for (const pu of state.pickups) {
        const pd = pickupData.find(p => p.id === pu.id);
        if (pd) pd.active = pu.active;
      }
    }

    if (myId && state.players[myId]) {
      const me = state.players[myId];
      statKills.textContent = `Kills: ${me.kills}`;
      statDeaths.textContent = `Deaths: ${me.deaths}`;
      statCoinsVal.textContent = me.kills * 25;

      const hpPct = me.hp / me.maxHp;
      hpBar.style.width = (hpPct * 100) + '%';
      hpText.textContent = Math.max(0, me.hp);
      if (hpPct < 0.3) hpBar.style.background = 'linear-gradient(90deg, #f44336, #e53935)';
      else if (hpPct < 0.6) hpBar.style.background = 'linear-gradient(90deg, #ff9800, #f57c00)';
      else hpBar.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';

      if (!me.alive && deathScreen.style.display === 'none') deathScreen.style.display = 'flex';
      else if (me.alive && deathScreen.style.display !== 'none') deathScreen.style.display = 'none';

      if (me.gun) {
        updateGunIndicator(me.gun);
        updateGunSlots(me.gun);
      }
    }

    updateHudLeaderboard(state.players);
  });

  socket.on('kill', (data) => {
    if (myId && data.victimId === myId) killedBy.textContent = `Killed by ${data.killer}`;
    addKillMsg(data.killer, data.victim);
  });

  function addKillMsg(killer, victim) {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.innerHTML = `<span class="killer-name">${escapeHtml(killer)}</span> eliminated <span class="victim-name">${escapeHtml(victim)}</span>`;
    killFeed.appendChild(msg);
    setTimeout(() => msg.remove(), 3500);
  }

  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }

  function updateHudLeaderboard(players) {
    const sorted = Object.values(players).sort((a, b) => b.score - a.score).slice(0, 8);
    hudLbList.innerHTML = '';
    sorted.forEach(p => {
      const entry = document.createElement('div');
      entry.className = 'lb-entry' + (p.id === myId ? ' self' : '');
      entry.innerHTML = `<span class="lb-name">${escapeHtml(p.name)}</span><span class="lb-score">${p.kills} kills</span>`;
      hudLbList.appendChild(entry);
    });
  }

  function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function getInterpolatedPlayer(id) {
    const curr = gameState.players[id];
    const prev = prevState.players ? prevState.players[id] : null;
    if (!curr) return null;
    if (!prev) return curr;
    const t = Math.min((performance.now() - lastStateTime) / stateInterval, 1);
    return { ...curr, x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t) };
  }

  let rainbowHue = 0;

  function render() {
    requestAnimationFrame(render);
    if (!myId || !gameState.players[myId]) return;

    const me = getInterpolatedPlayer(myId);
    if (!me) return;

    rainbowHue = (rainbowHue + 2) % 360;
    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a3a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgX = -camX;
    const bgY = -camY;

    if (grassImg.complete && grassImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(bgX, bgY, mapSize, mapSize);
      ctx.clip();
      const pat = ctx.createPattern(grassImg, 'repeat');
      ctx.fillStyle = pat;
      ctx.fillRect(bgX, bgY, mapSize, mapSize);
      ctx.restore();
    } else {
      ctx.fillStyle = '#2d6b2d';
      ctx.fillRect(bgX, bgY, mapSize, mapSize);
    }

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 15;
    ctx.strokeRect(bgX, bgY, mapSize, mapSize);
    ctx.shadowBlur = 0;

    for (const obj of mapObjects) {
      const ox = obj.x - camX;
      const oy = obj.y - camY;
      if (ox < -120 || ox > canvas.width + 120 || oy < -120 || oy > canvas.height + 120) continue;

      const r = obj.radius;
      let img = null;
      if (obj.type === 'rock') img = images['rock' + (obj.variant || 1)];
      else if (obj.type === 'bush') img = images['bush' + (obj.variant || 1)];
      else if (obj.type === 'tree') img = images['tree'];
      else if (obj.type === 'crate') img = images['crate'];

      if (img) {
        ctx.drawImage(img, ox - r, oy - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fillStyle = obj.type === 'rock' ? '#888' : '#3a7a3a';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    for (const pu of pickupData) {
      if (!pu.active) continue;
      const px = pu.x - camX;
      const py = pu.y - camY;
      if (px < -40 || px > canvas.width + 40 || py < -40 || py > canvas.height + 40) continue;

      const bob = Math.sin(performance.now() / 400) * 3;
      const img = images['healthpack'];
      if (img) {
        ctx.drawImage(img, px - 16, py - 16 + bob, 32, 32);
      } else {
        ctx.beginPath();
        ctx.arc(px, py + bob, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
      }
    }

    for (const b of gameState.bullets) {
      const bx = b.x - camX;
      const by = b.y - camY;
      if (bx < -10 || bx > canvas.width + 10 || by < -10 || by > canvas.height + 10) continue;

      ctx.save();
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    const playerList = Object.keys(gameState.players);
    playerList.sort((a, b) => (a === myId ? 1 : 0) - (b === myId ? 1 : 0));

    for (const id of playerList) {
      const p = getInterpolatedPlayer(id);
      if (!p || !p.alive) continue;
      const px = p.x - camX;
      const py = p.y - camY;
      if (px < -80 || px > canvas.width + 80 || py < -80 || py > canvas.height + 80) continue;

      const isMe = id === myId;
      const radius = 22;
      let skinColor = p.skinColor || '#ff6b6b';
      let skinOutline = p.skinOutline || '#cc3333';
      if (skinColor === 'rainbow') {
        const hue = (rainbowHue + (parseInt(id.slice(-4), 16) || 0)) % 360;
        skinColor = `hsl(${hue}, 80%, 55%)`;
        skinOutline = `hsl(${hue}, 80%, 35%)`;
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.angle);
      const gunImg = images['gun_' + p.gun];
      if (gunImg) {
        ctx.drawImage(gunImg, 6, -12, 34, 24);
      } else {
        ctx.fillStyle = '#555';
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.fillRect(radius - 4, -3.5, 20, 7);
        ctx.strokeRect(radius - 4, -3.5, 20, 7);
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = skinColor;
      ctx.fill();
      ctx.strokeStyle = skinOutline;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px - 5, py - 4, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px - 5, py - 4, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#222';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px + 5, py - 4, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px + 5, py - 4, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#222';
      ctx.fill();

      if (isMe) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const hpW = 48, hpH = 5;
      const hpX = px - hpW / 2;
      const hpY = py - radius - 14;
      const hpPct = Math.max(0, p.hp / p.maxHp);

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(hpX - 1, hpY - 1, hpW + 2, hpH + 2, 3);
      ctx.fill();

      ctx.fillStyle = hpPct < 0.3 ? '#f44336' : hpPct < 0.6 ? '#ff9800' : '#4caf50';
      ctx.beginPath();
      ctx.roundRect(hpX, hpY, hpW * hpPct, hpH, 2);
      ctx.fill();

      ctx.font = 'bold 12px Poppins, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(p.name, px, py - radius - 20);
      ctx.fillText(p.name, px, py - radius - 20);
    }

    drawMinimap(me);
  }

  function drawMinimap(me) {
    const mw = minimapCanvas.width, mh = minimapCanvas.height;
    const scale = mw / mapSize;

    minimapCtx.clearRect(0, 0, mw, mh);
    minimapCtx.fillStyle = 'rgba(30, 60, 30, 0.9)';
    minimapCtx.fillRect(0, 0, mw, mh);

    for (const obj of mapObjects) {
      if (obj.type === 'rock' || obj.type === 'tree') {
        minimapCtx.beginPath();
        minimapCtx.arc(obj.x * scale, obj.y * scale, Math.max(1, obj.radius * scale * 0.5), 0, Math.PI * 2);
        minimapCtx.fillStyle = obj.type === 'rock' ? 'rgba(150,150,150,0.4)' : 'rgba(0,100,0,0.4)';
        minimapCtx.fill();
      }
    }

    for (const id in gameState.players) {
      const p = gameState.players[id];
      if (!p.alive) continue;
      minimapCtx.beginPath();
      minimapCtx.arc(p.x * scale, p.y * scale, id === myId ? 4 : 2.5, 0, Math.PI * 2);
      minimapCtx.fillStyle = id === myId ? '#4caf50' : '#ff4444';
      minimapCtx.fill();
    }

    minimapCtx.strokeStyle = 'rgba(255,68,68,0.5)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, mw, mh);
  }

  document.addEventListener('keydown', (e) => {
    if (!myId || e.target.tagName === 'INPUT') return;
    let changed = false;
    const k = e.key.toLowerCase();
    if ((k === 'w' || e.key === 'ArrowUp') && !inputs.up) { inputs.up = true; changed = true; }
    if ((k === 's' || e.key === 'ArrowDown') && !inputs.down) { inputs.down = true; changed = true; }
    if ((k === 'a' || e.key === 'ArrowLeft') && !inputs.left) { inputs.left = true; changed = true; }
    if ((k === 'd' || e.key === 'ArrowRight') && !inputs.right) { inputs.right = true; changed = true; }

    if (k === '1') switchGun('pistol');
    if (k === '2') switchGun('rifle');
    if (k === '3') switchGun('shotgun');
    if (k === '4') switchGun('sniper');

    if (changed) { e.preventDefault(); socket.emit('input', { inputs, angle: mouseAngle }); }
  });

  document.addEventListener('keyup', (e) => {
    if (!myId) return;
    let changed = false;
    const k = e.key.toLowerCase();
    if ((k === 'w' || e.key === 'ArrowUp') && inputs.up) { inputs.up = false; changed = true; }
    if ((k === 's' || e.key === 'ArrowDown') && inputs.down) { inputs.down = false; changed = true; }
    if ((k === 'a' || e.key === 'ArrowLeft') && inputs.left) { inputs.left = false; changed = true; }
    if ((k === 'd' || e.key === 'ArrowRight') && inputs.right) { inputs.right = false; changed = true; }
    if (changed) socket.emit('input', { inputs, angle: mouseAngle });
  });

  function switchGun(gunId) {
    if (!myId || !gameState.players[myId]) return;
    if (currentUser && !ownedGuns.includes(gunId)) return;
    if (!currentUser && gunId !== 'pistol') return;
    socket.emit('switchGun', { gunId });
    updateGunIndicator(gunId);
    updateGunSlots(gunId);
  }

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    mouseAngle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
    socket.emit('input', { inputs, angle: mouseAngle });
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    shoot();
    shootInterval = setInterval(shoot, 50);
  });

  canvas.addEventListener('mouseup', stopShooting);
  window.addEventListener('mouseup', stopShooting);
  window.addEventListener('blur', stopShooting);

  function stopShooting() { clearInterval(shootInterval); shootInterval = null; }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function shoot() {
    if (!myId || !gameState.players[myId] || !gameState.players[myId].alive) return;
    socket.emit('shoot', { angle: mouseAngle });
  }

  requestAnimationFrame(render);
})();
