(function() {
  const socket = io({ transports: ['websocket'] });

  const loadingScreen = document.getElementById('loading-screen');
  const menuScreen = document.getElementById('menu-screen');
  const deathScreen = document.getElementById('death-screen');
  const killedBy = document.getElementById('killed-by');
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const hud = document.getElementById('hud');
  const killFeed = document.getElementById('kill-feed');
  const lbList = document.getElementById('lb-list');
  const statKills = document.getElementById('stat-kills');
  const statDeaths = document.getElementById('stat-deaths');
  const minimapCanvas = document.getElementById('minimap');
  const minimapCtx = minimapCanvas.getContext('2d');
  const loaderBar = document.getElementById('loader-bar');
  const loaderText = document.getElementById('loader-text');
  const nameInput = document.getElementById('name-input');
  const playBtn = document.getElementById('play-btn');

  let myId = null;
  let mapSize = 4000;
  let gameState = { players: {}, bullets: [] };
  let prevState = { players: {}, bullets: [] };
  let interpFactor = 0;
  let lastStateTime = 0;
  let stateInterval = 1000 / 60;
  let mouseX = 0, mouseY = 0;
  let mouseAngle = 0;
  let mouseDown = false;
  let shootInterval = null;

  const inputs = { up: false, down: false, left: false, right: false };

  const GRID_SIZE = 100;
  const GRID_COLOR = 'rgba(255,255,255,0.04)';
  const BG_COLOR = '#1a1a2e';
  const BORDER_COLOR = '#ff3c3c';

  function createParticles(container) {
    for (let i = 0; i < 30; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (3 + Math.random() * 5) + 's';
      p.style.animationDelay = Math.random() * 5 + 's';
      p.style.width = (2 + Math.random() * 3) + 'px';
      p.style.height = p.style.width;
      container.appendChild(p);
    }
  }

  createParticles(document.getElementById('particles'));
  createParticles(document.getElementById('menu-particles'));

  const imagesToLoad = ['grass', 'player'];
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
        loaderText.textContent = `Loading ${name}... ${pct}%`;
        resolve();
      };
      img.onerror = () => {
        loaded++;
        resolve();
      };
      img.src = `/images/${name}.png`;
    });
  }

  Promise.all(imagesToLoad.map(loadImage)).then(() => {
    loaderText.textContent = 'Ready!';
    loaderBar.style.width = '100%';
    setTimeout(() => {
      loadingScreen.style.display = 'none';
      menuScreen.style.display = 'flex';
      nameInput.focus();
    }, 500);
  });

  function startGame() {
    const name = nameInput.value.trim() || 'Player';
    menuScreen.style.display = 'none';
    canvas.style.display = 'block';
    hud.style.display = 'block';
    resizeCanvas();
    socket.emit('join', { name });
  }

  playBtn.addEventListener('click', startGame);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGame();
  });

  socket.on('joined', (data) => {
    myId = data.id;
    mapSize = data.mapSize;
  });

  socket.on('state', (state) => {
    prevState = JSON.parse(JSON.stringify(gameState));
    gameState = state;
    lastStateTime = performance.now();

    if (myId && state.players[myId]) {
      const me = state.players[myId];
      statKills.textContent = `Kills: ${me.kills}`;
      statDeaths.textContent = `Deaths: ${me.deaths}`;

      if (!me.alive && deathScreen.style.display === 'none') {
        deathScreen.style.display = 'flex';
      } else if (me.alive && deathScreen.style.display !== 'none') {
        deathScreen.style.display = 'none';
      }
    }

    updateLeaderboard(state.players);
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

  function updateLeaderboard(players) {
    const sorted = Object.values(players)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    lbList.innerHTML = '';
    sorted.forEach(p => {
      const entry = document.createElement('div');
      entry.className = 'lb-entry' + (p.id === myId ? ' self' : '');
      entry.innerHTML = `<span class="lb-name">${escapeHtml(p.name)}</span><span class="lb-score">${p.kills} kills</span>`;
      lbList.appendChild(entry);
    });
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getInterpolatedPlayer(id) {
    const curr = gameState.players[id];
    const prev = prevState.players[id];
    if (!curr) return null;
    if (!prev) return curr;

    const elapsed = performance.now() - lastStateTime;
    const t = Math.min(elapsed / stateInterval, 1);

    return {
      ...curr,
      x: lerp(prev.x, curr.x, t),
      y: lerp(prev.y, curr.y, t)
    };
  }

  function render() {
    requestAnimationFrame(render);
    if (!myId || !gameState.players[myId]) return;

    const me = getInterpolatedPlayer(myId);
    if (!me) return;

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const bgX = -camX;
    const bgY = -camY;
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(bgX, bgY, mapSize, mapSize);

    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;
    const startCol = Math.floor(camX / GRID_SIZE);
    const endCol = Math.ceil((camX + canvas.width) / GRID_SIZE);
    const startRow = Math.floor(camY / GRID_SIZE);
    const endRow = Math.ceil((camY + canvas.height) / GRID_SIZE);

    for (let col = startCol; col <= endCol; col++) {
      const x = col * GRID_SIZE - camX;
      if (col * GRID_SIZE >= 0 && col * GRID_SIZE <= mapSize) {
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, bgY));
        ctx.lineTo(x, Math.min(canvas.height, bgY + mapSize));
        ctx.stroke();
      }
    }
    for (let row = startRow; row <= endRow; row++) {
      const y = row * GRID_SIZE - camY;
      if (row * GRID_SIZE >= 0 && row * GRID_SIZE <= mapSize) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, bgX), y);
        ctx.lineTo(Math.min(canvas.width, bgX + mapSize), y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(bgX, bgY, mapSize, mapSize);

    for (const b of gameState.bullets) {
      const bx = b.x - camX;
      const by = b.y - camY;
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffcc00';
      ctx.fill();
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    for (const id in gameState.players) {
      const p = getInterpolatedPlayer(id);
      if (!p || !p.alive) continue;
      const px = p.x - camX;
      const py = p.y - camY;

      if (px < -60 || px > canvas.width + 60 || py < -60 || py > canvas.height + 60) continue;

      const isMe = id === myId;
      const radius = 25;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(p.angle);

      ctx.fillStyle = '#666';
      ctx.fillRect(radius - 5, -4, 20, 8);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(radius - 5, -4, 20, 8);

      ctx.restore();

      const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
      if (isMe) {
        gradient.addColorStop(0, '#ff6b6b');
        gradient.addColorStop(1, '#cc3333');
      } else {
        gradient.addColorStop(0, '#6b9fff');
        gradient.addColorStop(1, '#3366cc');
      }
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = isMe ? '#ff3c3c' : '#2255bb';
      ctx.lineWidth = 2;
      ctx.stroke();

      const hpBarWidth = 50;
      const hpBarHeight = 5;
      const hpX = px - hpBarWidth / 2;
      const hpY = py - radius - 14;
      const hpPct = p.hp / p.maxHp;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(hpX - 1, hpY - 1, hpBarWidth + 2, hpBarHeight + 2);

      let hpColor = '#4caf50';
      if (hpPct < 0.3) hpColor = '#f44336';
      else if (hpPct < 0.6) hpColor = '#ff9800';
      ctx.fillStyle = hpColor;
      ctx.fillRect(hpX, hpY, hpBarWidth * hpPct, hpBarHeight);

      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, px, py - radius - 20);
    }

    drawMinimap(me);
  }

  function drawMinimap(me) {
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    const scale = mw / mapSize;

    minimapCtx.clearRect(0, 0, mw, mh);
    minimapCtx.fillStyle = 'rgba(26, 26, 46, 0.8)';
    minimapCtx.fillRect(0, 0, mw, mh);

    minimapCtx.strokeStyle = 'rgba(255,60,60,0.3)';
    minimapCtx.lineWidth = 1;
    minimapCtx.strokeRect(0, 0, mw, mh);

    for (const id in gameState.players) {
      const p = gameState.players[id];
      if (!p.alive) continue;
      const px = p.x * scale;
      const py = p.y * scale;
      minimapCtx.beginPath();
      minimapCtx.arc(px, py, id === myId ? 3 : 2, 0, Math.PI * 2);
      minimapCtx.fillStyle = id === myId ? '#ff3c3c' : '#6b9fff';
      minimapCtx.fill();
    }
  }

  document.addEventListener('keydown', (e) => {
    if (!myId) return;
    let changed = false;
    if ((e.key === 'w' || e.key === 'ArrowUp') && !inputs.up) { inputs.up = true; changed = true; }
    if ((e.key === 's' || e.key === 'ArrowDown') && !inputs.down) { inputs.down = true; changed = true; }
    if ((e.key === 'a' || e.key === 'ArrowLeft') && !inputs.left) { inputs.left = true; changed = true; }
    if ((e.key === 'd' || e.key === 'ArrowRight') && !inputs.right) { inputs.right = true; changed = true; }
    if (changed) {
      e.preventDefault();
      socket.emit('input', { inputs, angle: mouseAngle });
    }
  });

  document.addEventListener('keyup', (e) => {
    if (!myId) return;
    let changed = false;
    if ((e.key === 'w' || e.key === 'ArrowUp') && inputs.up) { inputs.up = false; changed = true; }
    if ((e.key === 's' || e.key === 'ArrowDown') && inputs.down) { inputs.down = false; changed = true; }
    if ((e.key === 'a' || e.key === 'ArrowLeft') && inputs.left) { inputs.left = false; changed = true; }
    if ((e.key === 'd' || e.key === 'ArrowRight') && inputs.right) { inputs.right = false; changed = true; }
    if (changed) {
      socket.emit('input', { inputs, angle: mouseAngle });
    }
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
    shootInterval = setInterval(shoot, 150);
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
