(function() {
  const socket = io({ transports: ['websocket'] });

  const loadingScreen = document.getElementById('loading-screen');
  const loadingBg = document.getElementById('loading-bg');
  const menuScreen = document.getElementById('menu-screen');
  const menuBg = document.getElementById('menu-bg');
  const deathScreen = document.getElementById('death-screen');
  const killedBy = document.getElementById('killed-by');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const killFeed = document.getElementById('kill-feed');
  const hudLbList = document.getElementById('hud-lb-list');
  const statKills = document.getElementById('stat-kills');
  const statDeaths = document.getElementById('stat-deaths');
  const statCoinsVal = document.getElementById('stat-coins-val');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');
  const loaderBar = document.getElementById('loader-bar');
  const loaderText = document.getElementById('loader-text');
  const nameInput = document.getElementById('name-input');
  const playBtn = document.getElementById('play-btn');
  const hpBar = document.getElementById('hp-bar');
  const hpText = document.getElementById('hp-text');
  const gunIndicatorImg = document.getElementById('gun-indicator-img');
  const shopScreen = document.getElementById('shop-screen');
  const lbScreen = document.getElementById('leaderboard-screen');

  let myId = null;
  let mapSize = 4000;
  let gameState = { players: {}, bullets: [] };
  let prevState = { players: {}, bullets: [] };
  let lastStateTime = 0;
  let stateInterval = 1000 / 60;
  let mouseX = 0, mouseY = 0;
  let mouseAngle = 0;
  let mouseDown = false;
  let shootInterval = null;
  let currentUser = null;
  let ownedSkins = ['default'];
  let ownedGuns = ['pistol'];
  let selectedSkin = 'default';
  let selectedGun = 'pistol';
  let shopData = { skins: {}, guns: {} };
  let sessionCoins = 0;

  const inputs = { up: false, down: false, left: false, right: false };

  let grassPattern = null;
  const grassImg = new Image();

  function drawGrassBg(cvs) {
    const bgCtx = cvs.getContext('2d');
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    if (grassImg.complete && grassImg.naturalWidth > 0) {
      const pat = bgCtx.createPattern(grassImg, 'repeat');
      bgCtx.fillStyle = pat;
      bgCtx.fillRect(0, 0, cvs.width, cvs.height);
    } else {
      bgCtx.fillStyle = '#2d6b2d';
      bgCtx.fillRect(0, 0, cvs.width, cvs.height);
    }
    bgCtx.fillStyle = 'rgba(0,0,0,0.3)';
    bgCtx.fillRect(0, 0, cvs.width, cvs.height);
  }

  const imagesToLoad = ['grass_tile', 'gun_pistol', 'gun_rifle', 'gun_shotgun', 'gun_sniper', 'coin', 'crown'];
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

  grassImg.onload = () => {
    drawGrassBg(loadingBg);
  };
  grassImg.src = '/images/grass_tile.png';

  function getGrassPattern(targetCtx) {
    if (!grassImg.complete) return null;
    return targetCtx.createPattern(grassImg, 'repeat');
  }

  Promise.all(imagesToLoad.map(loadImage)).then(() => {
    loaderText.textContent = 'Ready!';
    loaderBar.style.width = '100%';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      menuScreen.style.display = 'flex';
      drawGrassBg(menuBg);
      nameInput.focus();
      checkSession();
    }, 600);
  });

  window.addEventListener('resize', () => {
    if (menuScreen.style.display !== 'none') drawGrassBg(menuBg);
    if (canvas.style.display !== 'none') resizeCanvas();
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
      document.getElementById(s).style.display = s === id ? 'flex' : 'none';
    });
  }

  function showLoggedIn() {
    document.getElementById('user-display-name').textContent = currentUser.username;
    document.getElementById('user-coins-display').textContent = currentUser.coins;
    document.getElementById('user-kills').textContent = currentUser.kills;
    document.getElementById('user-deaths').textContent = currentUser.deaths;
    document.getElementById('user-best').textContent = currentUser.highest_score;
    showSection('logged-in-section');
  }

  document.getElementById('show-login').addEventListener('click', () => showSection('login-section'));
  document.getElementById('show-signup').addEventListener('click', () => showSection('signup-section'));
  document.getElementById('back-to-guest-from-login').addEventListener('click', () => showSection('guest-section'));
  document.getElementById('back-to-guest-from-signup').addEventListener('click', () => showSection('guest-section'));

  document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      currentUser = data.user;
      await checkSession();
      showLoggedIn();
    } catch (e) { errorEl.textContent = 'Connection error'; }
  });

  document.getElementById('signup-btn').addEventListener('click', async () => {
    const username = document.getElementById('signup-username').value.trim();
    const password = document.getElementById('signup-password').value;
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { errorEl.textContent = data.error; return; }
      currentUser = data.user;
      await checkSession();
      showLoggedIn();
    } catch (e) { errorEl.textContent = 'Connection error'; }
  });

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    ownedSkins = ['default'];
    ownedGuns = ['pistol'];
    selectedSkin = 'default';
    selectedGun = 'pistol';
    showSection('guest-section');
  });

  ['login-username', 'login-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn').click();
    });
  });
  ['signup-username', 'signup-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('signup-btn').click();
    });
  });

  function startGame(name) {
    menuScreen.style.display = 'none';
    canvas.style.display = 'block';
    hud.style.display = 'block';
    resizeCanvas();
    sessionCoins = 0;
    gunIndicatorImg.src = `/images/gun_${selectedGun}.png`;
    socket.emit('join', { name: name });
  }

  playBtn.addEventListener('click', () => startGame(nameInput.value.trim() || 'Player'));
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') playBtn.click(); });
  document.getElementById('play-logged-btn').addEventListener('click', () => {
    startGame(currentUser.username);
  });

  document.getElementById('shop-btn').addEventListener('click', () => {
    shopScreen.style.display = 'block';
    renderShop();
  });
  document.getElementById('shop-close').addEventListener('click', () => {
    shopScreen.style.display = 'none';
  });

  document.querySelectorAll('.shop-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      document.getElementById('shop-skins-grid').style.display = which === 'skins' ? 'grid' : 'none';
      document.getElementById('shop-guns-grid').style.display = which === 'guns' ? 'grid' : 'none';
    });
  });

  function renderShop() {
    document.getElementById('shop-coins').textContent = currentUser ? currentUser.coins : 0;
    const skinsGrid = document.getElementById('shop-skins-grid');
    const gunsGrid = document.getElementById('shop-guns-grid');
    skinsGrid.innerHTML = '';
    gunsGrid.innerHTML = '';

    for (const [id, skin] of Object.entries(shopData.skins)) {
      const owned = ownedSkins.includes(id);
      const selected = selectedSkin === id;
      const item = document.createElement('div');
      item.className = 'shop-item' + (owned ? ' owned' : '') + (selected ? ' selected' : '');

      let previewColor = skin.color;
      let previewStyle = `background: ${previewColor};`;
      if (skin.color === 'rainbow') {
        previewStyle = 'background: linear-gradient(135deg, red, orange, yellow, green, blue, purple);';
      }

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
      const res = await fetch('/api/shop/select-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skinId: id })
      });
      if (res.ok) { selectedSkin = id; renderShop(); }
    } else {
      if (currentUser.coins < skin.price) return;
      const res = await fetch('/api/shop/buy-skin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skinId: id })
      });
      if (res.ok) {
        const data = await res.json();
        currentUser.coins = data.coins;
        ownedSkins.push(id);
        document.getElementById('user-coins-display').textContent = currentUser.coins;
        renderShop();
      }
    }
  }

  async function handleGunClick(id, gun, owned) {
    if (!currentUser) return;
    if (owned) {
      const res = await fetch('/api/shop/select-gun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gunId: id })
      });
      if (res.ok) { selectedGun = id; renderShop(); }
    } else {
      if (currentUser.coins < gun.price) return;
      const res = await fetch('/api/shop/buy-gun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gunId: id })
      });
      if (res.ok) {
        const data = await res.json();
        currentUser.coins = data.coins;
        ownedGuns.push(id);
        document.getElementById('user-coins-display').textContent = currentUser.coins;
        renderShop();
      }
    }
  }

  document.getElementById('lb-btn').addEventListener('click', async () => {
    lbScreen.style.display = 'block';
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      const table = document.getElementById('lb-table');
      table.innerHTML = '';
      data.leaderboard.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML = `<span class="rank">#${i + 1}</span><span class="name">${escapeHtml(p.username)}</span><span class="score">${p.highest_score} pts &middot; ${p.kills} kills</span>`;
        table.appendChild(row);
      });
    } catch (e) {}
  });
  document.getElementById('lb-close').addEventListener('click', () => {
    lbScreen.style.display = 'none';
  });

  socket.on('joined', (data) => {
    myId = data.id;
    mapSize = data.mapSize;
  });

  socket.on('state', (state) => {
    prevState = gameState;
    gameState = state;
    lastStateTime = performance.now();

    if (myId && state.players[myId]) {
      const me = state.players[myId];
      statKills.textContent = `Kills: ${me.kills}`;
      statDeaths.textContent = `Deaths: ${me.deaths}`;
      statCoinsVal.textContent = me.kills * 25;

      hpBar.style.width = (me.hp / me.maxHp * 100) + '%';
      hpText.textContent = Math.max(0, me.hp);
      if (me.hp / me.maxHp < 0.3) hpBar.style.background = 'linear-gradient(90deg, #f44336, #e53935)';
      else if (me.hp / me.maxHp < 0.6) hpBar.style.background = 'linear-gradient(90deg, #ff9800, #f57c00)';
      else hpBar.style.background = 'linear-gradient(90deg, #4caf50, #8bc34a)';

      if (!me.alive && deathScreen.style.display === 'none') {
        deathScreen.style.display = 'flex';
      } else if (me.alive && deathScreen.style.display !== 'none') {
        deathScreen.style.display = 'none';
      }
    }

    updateHudLeaderboard(state.players);
  });

  socket.on('kill', (data) => {
    if (myId && data.victimId === myId) {
      killedBy.textContent = `Killed by ${data.killer}`;
    }
    addKillMsg(data.killer, data.victim);
  });

  function addKillMsg(killer, victim) {
    const msg = document.createElement('div');
    msg.className = 'kill-msg';
    msg.innerHTML = `<span class="killer-name">${escapeHtml(killer)}</span> eliminated <span class="victim-name">${escapeHtml(victim)}</span>`;
    killFeed.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

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

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getInterpolatedPlayer(id) {
    const curr = gameState.players[id];
    const prev = prevState.players ? prevState.players[id] : null;
    if (!curr) return null;
    if (!prev) return curr;
    const elapsed = performance.now() - lastStateTime;
    const t = Math.min(elapsed / stateInterval, 1);
    return { ...curr, x: lerp(prev.x, curr.x, t), y: lerp(prev.y, curr.y, t) };
  }

  let rainbowHue = 0;

  function render() {
    requestAnimationFrame(render);
    if (!myId || !gameState.players[myId]) return;

    const me = getInterpolatedPlayer(myId);
    if (!me) return;

    rainbowHue = (rainbowHue + 1) % 360;

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

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const GRID = 100;
    const startCol = Math.floor(camX / GRID);
    const endCol = Math.ceil((camX + canvas.width) / GRID);
    const startRow = Math.floor(camY / GRID);
    const endRow = Math.ceil((camY + canvas.height) / GRID);

    for (let col = startCol; col <= endCol; col++) {
      const x = col * GRID - camX;
      if (col * GRID >= 0 && col * GRID <= mapSize) {
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, bgY));
        ctx.lineTo(x, Math.min(canvas.height, bgY + mapSize));
        ctx.stroke();
      }
    }
    for (let row = startRow; row <= endRow; row++) {
      const y = row * GRID - camY;
      if (row * GRID >= 0 && row * GRID <= mapSize) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, bgX), y);
        ctx.lineTo(Math.min(canvas.width, bgX + mapSize), y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff4444';
    ctx.shadowBlur = 10;
    ctx.strokeRect(bgX, bgY, mapSize, mapSize);
    ctx.shadowBlur = 0;

    for (const b of gameState.bullets) {
      const bx = b.x - camX;
      const by = b.y - camY;
      ctx.save();
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
      ctx.restore();
    }

    for (const id in gameState.players) {
      const p = getInterpolatedPlayer(id);
      if (!p || !p.alive) continue;
      const px = p.x - camX;
      const py = p.y - camY;
      if (px < -80 || px > canvas.width + 80 || py < -80 || py > canvas.height + 80) continue;

      const isMe = id === myId;
      const radius = 25;
      let skinColor = p.skinColor || '#ff6b6b';
      if (skinColor === 'rainbow') {
        skinColor = `hsl(${(rainbowHue + parseInt(id.slice(-4), 16)) % 360}, 80%, 60%)`;
      }

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.angle);

      const gunImg = images['gun_' + p.gun];
      if (gunImg) {
        ctx.drawImage(gunImg, 8, -14, 36, 28);
      } else {
        ctx.fillStyle = '#555';
        ctx.fillRect(radius - 5, -4, 22, 8);
      }
      ctx.restore();

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      gradient.addColorStop(0, skinColor);
      gradient.addColorStop(1, darkenColor(skinColor, 30));
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = darkenColor(skinColor, 50);
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isMe) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const hpBarWidth = 50;
      const hpBarHeight = 6;
      const hpX = px - hpBarWidth / 2;
      const hpY = py - radius - 16;
      const hpPct = p.hp / p.maxHp;

      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.roundRect(hpX - 1, hpY - 1, hpBarWidth + 2, hpBarHeight + 2, 3);
      ctx.fill();

      let hpColor = '#4caf50';
      if (hpPct < 0.3) hpColor = '#f44336';
      else if (hpPct < 0.6) hpColor = '#ff9800';
      ctx.fillStyle = hpColor;
      ctx.beginPath();
      ctx.roundRect(hpX, hpY, hpBarWidth * hpPct, hpBarHeight, 2);
      ctx.fill();

      ctx.font = 'bold 13px Poppins, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.textAlign = 'center';
      ctx.strokeText(p.name, px, py - radius - 22);
      ctx.fillText(p.name, px, py - radius - 22);
    }

    drawMinimap(me);
  }

  function darkenColor(hex, amount) {
    if (hex.startsWith('hsl')) return hex;
    try {
      let r = parseInt(hex.slice(1, 3), 16);
      let g = parseInt(hex.slice(3, 5), 16);
      let b = parseInt(hex.slice(5, 7), 16);
      r = Math.max(0, r - amount);
      g = Math.max(0, g - amount);
      b = Math.max(0, b - amount);
      return `rgb(${r},${g},${b})`;
    } catch (e) {
      return hex;
    }
  }

  function drawMinimap(me) {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const scale = mw / mapSize;

    minimapCtx.clearRect(0, 0, mw, mh);
    minimapCtx.fillStyle = 'rgba(30, 60, 30, 0.9)';
    minimapCtx.fillRect(0, 0, mw, mh);

    minimapCtx.strokeStyle = 'rgba(255,68,68,0.4)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, mw, mh);

    for (const id in gameState.players) {
      const p = gameState.players[id];
      if (!p.alive) continue;
      minimapCtx.beginPath();
      minimapCtx.arc(p.x * scale, p.y * scale, id === myId ? 3 : 2, 0, Math.PI * 2);
      minimapCtx.fillStyle = id === myId ? '#4caf50' : '#6b9fff';
      minimapCtx.fill();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!myId || e.target.tagName === 'INPUT') return;
    let changed = false;
    if ((e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') && !inputs.up) { inputs.up = true; changed = true; }
    if ((e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') && !inputs.down) { inputs.down = true; changed = true; }
    if ((e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') && !inputs.left) { inputs.left = true; changed = true; }
    if ((e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') && !inputs.right) { inputs.right = true; changed = true; }
    if (changed) { e.preventDefault(); socket.emit('input', { inputs, angle: mouseAngle }); }
  });

  document.addEventListener('keyup', (e) => {
    if (!myId) return;
    let changed = false;
    if ((e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') && inputs.up) { inputs.up = false; changed = true; }
    if ((e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') && inputs.down) { inputs.down = false; changed = true; }
    if ((e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') && inputs.left) { inputs.left = false; changed = true; }
    if ((e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') && inputs.right) { inputs.right = false; changed = true; }
    if (changed) socket.emit('input', { inputs, angle: mouseAngle });
  });

  canvas.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    mouseAngle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
    socket.emit('input', { inputs, angle: mouseAngle });
  });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDown = true;
    shoot();
    shootInterval = setInterval(shoot, 100);
  });

  canvas.addEventListener('mouseup', stopShooting);
  window.addEventListener('mouseup', stopShooting);
  window.addEventListener('blur', stopShooting);

  function stopShooting() {
    mouseDown = false;
    clearInterval(shootInterval);
    shootInterval = null;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function shoot() {
    if (!myId || !gameState.players[myId] || !gameState.players[myId].alive) return;
    socket.emit('shoot', { angle: mouseAngle });
  }

  requestAnimationFrame(render);
})();
