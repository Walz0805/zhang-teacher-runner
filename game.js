(() => {
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const stageWrap = document.getElementById('stageWrap');

  const startPanel = document.getElementById('startPanel');
  const gameOverPanel = document.getElementById('gameOverPanel');
  const finalScore = document.getElementById('finalScore');
  const startBtn = document.getElementById('startBtn');
  const againBtn = document.getElementById('againBtn');
  const restartBtn = document.getElementById('restartBtn');
  const mobileControls = document.getElementById('mobileControls');
  const jumpBtn = document.getElementById('jumpBtn');
  const duckBtn = document.getElementById('duckBtn');
  const boostBtn = document.getElementById('boostBtn');
  const bgm = document.getElementById('bgm');
  const failAudio = document.getElementById('failAudio');
  const boostAudio = document.getElementById('boostAudio');

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 430;

  const STATE = {
    READY: 'ready',
    RUNNING: 'running',
    GAME_OVER: 'game_over',
  };

  function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
  }

  const assets = {
    bg: loadImage('assets/images/background.png'),
    title: loadImage('assets/images/title_logo.png'),
    qiaolezi: loadImage('assets/images/qiaolezi.png'),
    sprite: loadImage('assets/images/sprite_can.png'),
    npc: loadImage('assets/images/civil_excavator.png'),
    brick: loadImage('assets/images/brick.png'),
    lips: loadImage('assets/images/power_lips.png'),
    player: {
      idle: loadImage('assets/images/player_idle.png'),
      run1: loadImage('assets/images/player_run1.png'),
      run2: loadImage('assets/images/player_run2.png'),
      jump: loadImage('assets/images/player_jump.png'),
      fall: loadImage('assets/images/player_fall.png'),
      duck: loadImage('assets/images/player_duck.png'),
    }
  };

  const game = {
    state: STATE.READY,
    lastTime: 0,
    distance: 0,
    baseSpeed: 320,
    speed: 320,
    difficultyLevel: 1,
    spawnTimer: 0,
    score: 0,
    best: Number(localStorage.getItem('zt_best_score') || 0),
    obstacles: [],
    particles: [],
    boosting: false,
    boostBlend: 0,
    boostHintPulse: 0,
    invincibleTimer: 0,
    invincibleFlash: 0,
    npcCooldown: 0,
    lipsCooldown: 0,
    sparkleTimer: 0,
    overlayFlash: 0,
  };

  const player = {
    x: 150,
    y: GROUND_Y - 90,
    w: 68,
    standH: 90,
    crouchH: 54,
    h: 90,
    vy: 0,
    grounded: true,
    crouching: false,
  };

  const keys = new Set();

  const input = {
    duckHeld: false,
    boostHeld: false,
  };

  function updateMobileControlsVisibility() {
    if (!mobileControls) return;
    const shouldShow = game.state === STATE.RUNNING;
    mobileControls.classList.toggle('controls-hidden', !shouldShow);
  }

  function safePlay(audio) {
    if (!audio) return;
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  function safeStop(audio) {
    if (!audio) return;
    audio.pause();
    try { audio.currentTime = 0; } catch (_) {}
  }

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function hasActiveType(type) {
    return game.obstacles.some(ob => !ob.remove && ob.type === type);
  }

  function resetGame() {
    game.state = STATE.RUNNING;
    game.lastTime = performance.now();
    game.distance = 0;
    game.baseSpeed = 320;
    game.speed = 320;
    game.difficultyLevel = 1;
    game.spawnTimer = 1.0;
    game.score = 0;
    game.obstacles = [];
    game.particles = [];
    game.boosting = false;
    game.boostBlend = 0;
    game.boostHintPulse = 0;
    game.invincibleTimer = 0;
    game.invincibleFlash = 0;
    game.npcCooldown = 1.2;
    game.lipsCooldown = 3.8;
    game.sparkleTimer = 0;
    game.overlayFlash = 0;
    input.duckHeld = false;
    input.boostHeld = false;

    player.y = GROUND_Y - player.standH;
    player.vy = 0;
    player.grounded = true;
    player.crouching = false;
    player.h = player.standH;

    startPanel.classList.add('hidden');
    gameOverPanel.classList.add('hidden');
    updateMobileControlsVisibility();

    safeStop(boostAudio);
    safeStop(failAudio);
    bgm.currentTime = 0;
    bgm.volume = 0.22;
    safePlay(bgm);

    requestAnimationFrame(loop);
  }

  function endGame(reason) {
    if (game.state !== STATE.RUNNING) return;
    game.state = STATE.GAME_OVER;

    game.best = Math.max(game.best, game.score);
    localStorage.setItem('zt_best_score', String(game.best));

    safeStop(boostAudio);
    bgm.pause();
    failAudio.volume = 1.0;
    failAudio.currentTime = 0;
    safePlay(failAudio);

    finalScore.innerHTML = `分数：<b>${game.score}</b>｜最高分：<b>${game.best}</b><br>撞到了：<b>${reason}</b>`;
    gameOverPanel.classList.add('hidden');
    void gameOverPanel.offsetWidth;
    gameOverPanel.classList.remove('hidden');
    updateMobileControlsVisibility();
  }

  function activateInvincible() {
    game.invincibleTimer = 5;
    game.invincibleFlash = 1.2;
    game.overlayFlash = 0.35;
    createBurst(player.x + 30, player.y + player.h * 0.5, 22, '#d946ef', '#f5d0fe');
  }

  function jump() {
    if (game.state === STATE.READY) {
      resetGame();
      return;
    }
    if (game.state !== STATE.RUNNING) return;
    if (player.grounded) {
      player.vy = -920;
      player.grounded = false;
      player.crouching = false;
      createDust(player.x + 18, GROUND_Y, 8);
    }
  }

  function setCrouch(value) {
    if (game.state !== STATE.RUNNING) return;
    if (!player.grounded) return;
    player.crouching = value;
  }

  function setBoosting(value) {
    if (game.state !== STATE.RUNNING) return;
    if (game.boosting === value) return;
    game.boosting = value;
    if (value) {
      // 开始加速时播放一次 2.MP3 作为加速语音；不再循环播放。
      boostAudio.volume = 0.9;
      try { boostAudio.currentTime = 0; } catch (_) {}
      safePlay(boostAudio);
    }
  }

  function getPlayerBox() {
    return {
      x: player.x + 10,
      y: player.y + 10,
      w: player.w - 20,
      h: Math.max(10, player.h - 12),
    };
  }

  function chooseSpawnType() {
    const r = Math.random();
    if (r < 0.44) return 'qiaolezi';
    if (r < 0.88) return 'sprite';
    if (r < 0.94) return 'lips';
    return 'npc';
  }

  function spawnObstacle() {
    let type = chooseSpawnType();
    const worldX = game.distance + W + rand(55, 200);

    if (type === 'npc' && (hasActiveType('npc') || game.npcCooldown > 0)) {
      type = Math.random() < 0.5 ? 'qiaolezi' : 'sprite';
    }
    if (type === 'lips' && (hasActiveType('lips') || game.lipsCooldown > 0)) {
      type = Math.random() < 0.5 ? 'qiaolezi' : 'sprite';
    }

    if (type === 'qiaolezi') {
      game.obstacles.push({
        type,
        label: '巧乐兹',
        worldX,
        y: GROUND_Y - 88,
        w: 50,
        h: 88,
      });
    } else if (type === 'sprite') {
      game.obstacles.push({
        type,
        label: '雪碧',
        worldX,
        // 雪碧是“头顶横向障碍”：站着会撞，蹲下才能过。
        y: GROUND_Y - 112,
        w: 118,
        h: 58,
      });
    } else if (type === 'lips') {
      game.lipsCooldown = 6.5;
      game.obstacles.push({
        type,
        label: '紫色嘴唇',
        worldX,
        y: GROUND_Y - 102,
        w: 62,
        h: 62,
        baseY: GROUND_Y - 102,
        bob: rand(0, Math.PI * 2),
      });
    } else {
      game.npcCooldown = 7.5;
      game.obstacles.push({
        type,
        label: '土木专业大学生',
        phase: 'approach',
        worldX,
        y: GROUND_Y - 70,
        w: 126,
        h: 70,
        thrown: false,
        smokeTimer: 0,
      });
    }
  }

  function spawnBrick(targetWorldX) {
    // 土木学生把砖头扔到张老师前方：先从空中落下，落地后变成地面障碍物。
    game.obstacles.push({
      type: 'brick',
      label: '砖头',
      phase: 'falling',
      worldX: targetWorldX,
      y: GROUND_Y - 190,
      targetY: GROUND_Y - 34,
      w: 48,
      h: 34,
      vy: 0,
      spin: 0,
      warningTimer: 0.9,
    });
  }

  function createDust(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      const maxLife = rand(0.25, 0.52);
      game.particles.push({
        kind: 'dust',
        x,
        y,
        vx: rand(-90, 30),
        vy: rand(-180, -40),
        life: maxLife,
        maxLife,
        size: rand(3, 8),
      });
    }
  }

  function createBurst(x, y, n, colorA = '#ffffff', colorB = '#fde68a') {
    for (let i = 0; i < n; i += 1) {
      const maxLife = rand(0.3, 0.8);
      game.particles.push({
        kind: 'spark',
        x,
        y,
        vx: rand(-180, 180),
        vy: rand(-210, 120),
        life: maxLife,
        maxLife,
        size: rand(2, 5),
        color: Math.random() < 0.5 ? colorA : colorB,
      });
    }
  }

  function isHarmful(type) {
    return type === 'qiaolezi' || type === 'sprite' || type === 'npc' || type === 'brick';
  }

  function update(dt) {
    const scorePressure = Math.min(330, game.score * 0.05);
    game.baseSpeed = Math.min(710, game.baseSpeed + (3.8 + game.score / 2600) * dt + scorePressure * 0.012 * dt);
    game.difficultyLevel = 1 + Math.floor(game.score / 350);
    game.boostHintPulse += dt * 6;
    game.npcCooldown = Math.max(0, game.npcCooldown - dt);
    game.lipsCooldown = Math.max(0, game.lipsCooldown - dt);
    game.invincibleTimer = Math.max(0, game.invincibleTimer - dt);
    game.invincibleFlash = Math.max(0, game.invincibleFlash - dt);
    game.overlayFlash = Math.max(0, game.overlayFlash - dt);

    const boostTarget = game.boosting ? 1 : 0;
    game.boostBlend += (boostTarget - game.boostBlend) * Math.min(1, dt * 5.5);
    const boostExtra = 190 * game.boostBlend;
    const targetSpeed = game.baseSpeed + boostExtra;
    game.speed += (targetSpeed - game.speed) * Math.min(1, dt * 5.8);

    game.distance += game.speed * dt;
    game.score = Math.floor(game.distance / 12);

    const wantsCrouch = keys.has('ArrowDown') || keys.has('KeyS') || input.duckHeld;
    setCrouch(wantsCrouch);

    if (!player.grounded || player.vy !== 0) {
      const gravity = player.vy < 0 ? 2200 : 3500;
      player.vy += gravity * dt;
      player.y += player.vy * dt;
    }

    const targetH = player.crouching && player.grounded ? player.crouchH : player.standH;
    player.h += (targetH - player.h) * 0.38;
    if (Math.abs(player.h - targetH) < 0.5) player.h = targetH;

    if (player.grounded) {
      player.y = GROUND_Y - player.h;
    }

    if (player.y + player.h >= GROUND_Y) {
      const wasAir = !player.grounded;
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.grounded = true;
      if (wasAir) createDust(player.x + 20, GROUND_Y, 5);
    } else {
      player.grounded = false;
    }

    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnObstacle();
      game.spawnTimer = Math.max(0.88, rand(1.22, 1.92) - Math.min(0.28, game.score / 3600));
    }

    const playerWorldX = game.distance + player.x;

    for (const ob of game.obstacles) {
      if (ob.type === 'npc') {
        const screenX = ob.worldX - game.distance;
        if (ob.phase === 'approach' && screenX + ob.w < player.x - 6) {
          ob.phase = 'chase';
          ob.worldX = playerWorldX - ob.w - 46;
          ob.smokeTimer = 0.16;
        }

        if (ob.phase === 'chase') {
          ob.worldX += game.speed * 0.84 * dt;
          ob.smokeTimer -= dt;
          if (ob.smokeTimer <= 0) {
            createDust(ob.worldX - game.distance + 18, GROUND_Y - 2, 2);
            ob.smokeTimer = 0.16;
          }

          const chaseScreenX = ob.worldX - game.distance;
          if (!ob.thrown && chaseScreenX + ob.w < -10) {
            ob.thrown = true;
            // 砖头落在张老师前方一段距离，成为必须跳过去的地面障碍。
            spawnBrick(game.distance + player.x + rand(560, 740));
            ob.remove = true;
          }
        }
      }

      if (ob.type === 'brick') {
        ob.spin += dt * 10;
        if (ob.phase === 'falling') {
          ob.vy += 900 * dt;
          ob.y += ob.vy * dt;
          ob.warningTimer = Math.max(0, ob.warningTimer - dt);
          if (ob.y >= ob.targetY) {
            ob.y = ob.targetY;
            ob.vy = 0;
            ob.phase = 'landed';
            createDust(ob.worldX - game.distance + ob.w / 2, GROUND_Y - 2, 8);
          }
        }
      }

      if (ob.type === 'lips') {
        ob.bob += dt * 4.5;
        ob.y = ob.baseY + Math.sin(ob.bob) * 8;
      }
    }

    if (game.invincibleTimer > 0) {
      game.sparkleTimer -= dt;
      if (game.sparkleTimer <= 0) {
        createBurst(player.x + rand(10, 55), player.y + rand(8, player.h - 6), 4, '#ffffff', '#f0abfc');
        game.sparkleTimer = 0.12;
      }
    }

    for (const p of game.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.kind === 'dust' ? 580 * dt : 180 * dt;
    }
    game.particles = game.particles.filter(p => p.life > 0);

    const box = getPlayerBox();
    for (const ob of game.obstacles) {
      if (ob.remove) continue;
      const rect = obstacleBox(ob);
      if (!rect) continue;
      if (!hit(box, rect)) continue;

      if (ob.type === 'lips') {
        ob.remove = true;
        activateInvincible();
        continue;
      }

      if (isHarmful(ob.type)) {
        if (game.invincibleTimer > 0) {
          ob.remove = true;
          createBurst(rect.x + rect.w / 2, rect.y + rect.h / 2, 10, '#fde68a', '#ffffff');
          continue;
        }
        endGame(ob.label);
        return;
      }
    }

    game.obstacles = game.obstacles.filter(ob => {
      const screenX = ob.worldX - game.distance;
      if (ob.remove) return false;
      if (ob.type === 'brick') return screenX + ob.w > -180 && screenX < W + 180;
      return screenX + ob.w > -240;
    });
  }

  function obstacleBox(ob) {
    const screenX = ob.worldX - game.distance;
    if (ob.type === 'qiaolezi') {
      return { x: screenX + 7, y: ob.y + 5, w: ob.w - 14, h: ob.h - 8 };
    }
    if (ob.type === 'sprite') {
      // 碰撞箱向下扩展：不下蹲会撞到，蹲下后角色高度降低才能安全通过。
      return { x: screenX + 10, y: ob.y + 4, w: ob.w - 20, h: ob.h - 8 };
    }
    if (ob.type === 'npc') {
      return { x: screenX + 16, y: ob.y + 18, w: ob.w - 40, h: ob.h - 26 };
    }
    if (ob.type === 'brick') {
      // 砖头落地前也有碰撞，但落地后主要作为地面障碍，需要跳过去。
      return { x: screenX + 4, y: ob.y + 4, w: ob.w - 8, h: ob.h - 8 };
    }
    if (ob.type === 'lips') {
      return { x: screenX + 6, y: ob.y + 8, w: ob.w - 12, h: ob.h - 16 };
    }
    return null;
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function loop(now) {
    if (game.state !== STATE.RUNNING) return;
    const dt = Math.min(0.033, (now - game.lastTime) / 1000 || 0);
    game.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (game.boostBlend > 0.03) drawSpeedLines();
    drawParticles();
    for (const ob of game.obstacles) drawObstacle(ob);
    drawPlayer();
    drawHud();
    if (game.overlayFlash > 0) {
      ctx.fillStyle = `rgba(217, 70, 239, ${game.overlayFlash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawBackground() {
    const bg = assets.bg;
    if (bg.complete && bg.naturalWidth) {
      const drawH = H;
      const scale = drawH / bg.naturalHeight;
      const drawW = bg.naturalWidth * scale;
      const offset = -((game.distance * 0.35) % drawW);
      for (let x = offset; x < W + drawW; x += drawW) {
        ctx.drawImage(bg, x, 0, drawW, drawH);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#9ee7ff');
      grad.addColorStop(0.62, '#e8f8ff');
      grad.addColorStop(1, '#cbf0c0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillRect(0, GROUND_Y - 1, W, 3);
  }

  function drawSpeedLines() {
    ctx.save();
    ctx.globalAlpha = 0.12 * game.boostBlend;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i += 1) {
      const y = 80 + i * 44 + Math.sin(game.boostHintPulse + i) * 5;
      ctx.beginPath();
      ctx.moveTo(W - 30 - i * 18, y);
      ctx.lineTo(W - 210 - i * 18, y + 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const drawH = player.h;
    const y = player.y;
    const airHeight = Math.max(0, GROUND_Y - (y + drawH));
    const shadowScale = Math.max(0.42, 1 - airHeight / 180);

    ctx.save();
    ctx.globalAlpha = Math.max(0.08, 0.22 - airHeight / 900);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2, GROUND_Y + 4, (player.crouching ? 30 : 24) * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (game.invincibleTimer > 0) {
      const pulse = 0.75 + Math.sin(game.boostHintPulse * 1.6) * 0.14;
      ctx.save();
      const glow = ctx.createRadialGradient(player.x + 34, y + drawH / 2, 10, player.x + 34, y + drawH / 2, 58);
      glow.addColorStop(0, `rgba(255,255,255,${0.22 * pulse})`);
      glow.addColorStop(0.55, `rgba(217,70,239,${0.22 * pulse})`);
      glow.addColorStop(1, 'rgba(217,70,239,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(player.x + 34, y + drawH / 2, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    let frame = assets.player.idle;
    if (!player.grounded) {
      frame = player.vy < 0 ? assets.player.jump : assets.player.fall;
    } else if (player.crouching) {
      frame = assets.player.duck;
    } else if (game.state === STATE.RUNNING) {
      frame = (Math.floor(game.distance / 28) % 2 === 0) ? assets.player.run1 : assets.player.run2;
    }

    ctx.save();
    if (game.invincibleTimer > 0 && Math.sin(game.boostHintPulse * 9) > 0.55) {
      ctx.globalAlpha = 0.84;
    }
    if (frame.complete && frame.naturalWidth) {
      const scale = drawH / frame.naturalHeight;
      const drawW = frame.naturalWidth * scale;
      ctx.drawImage(frame, player.x - 2, y - 2, drawW, drawH + 2);
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(player.x, y, player.w, drawH);
    }
    ctx.restore();
  }

  function drawObstacle(ob) {
    const x = ob.worldX - game.distance;
    if (ob.type === 'qiaolezi') drawImageObject(assets.qiaolezi, x, ob.y, ob.w, ob.h);
    if (ob.type === 'sprite') drawImageObject(assets.sprite, x, ob.y, ob.w, ob.h);
    if (ob.type === 'npc') drawNpc(x, ob.y, ob.w, ob.h, ob.phase);
    if (ob.type === 'brick') drawBrick(x, ob.y, ob.w, ob.h, ob.spin, ob);
    if (ob.type === 'lips') drawLips(x, ob.y, ob.w, ob.h);
  }

  function drawImageObject(img, x, y, w, h, shadowAlpha = 0.18) {
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h + 4, w * 0.45, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.fillStyle = '#999';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawNpc(x, y, w, h, phase) {
    drawImageObject(assets.npc, x, y - 8, w, h + 10, 0.2);

    ctx.save();
    ctx.font = 'bold 20px Microsoft YaHei';
    ctx.textAlign = 'left';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    const hintX = Math.max(10, Math.min(W - 260, x - 12));
    ctx.strokeText('土木学生（不能让他碰到你）！', hintX, y - 20);
    ctx.fillStyle = '#dc2626';
    ctx.fillText('土木学生（不能让他碰到你）！', hintX, y - 20);
    if (phase === 'chase') {
      ctx.font = 'bold 18px Microsoft YaHei';
      ctx.strokeText('他开始追你了！', hintX + 20, y - 44);
      ctx.fillText('他开始追你了！', hintX + 20, y - 44);
    }
    ctx.restore();
  }

  function drawBrick(x, y, w, h, spin, ob = null) {
    if (ob && ob.phase === 'falling') {
      const markerX = ob.worldX - game.distance + w / 2;
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(game.boostHintPulse * 4) * 0.18;
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 16px Microsoft YaHei';
      ctx.textAlign = 'center';
      ctx.fillText('砖头落点！', markerX, GROUND_Y - 44);
      ctx.strokeStyle = 'rgba(220,38,38,0.45)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(markerX, GROUND_Y - 38);
      ctx.lineTo(markerX, GROUND_Y - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, GROUND_Y + 3, w * 0.42, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(spin * 0.45);
    if (assets.brick.complete && assets.brick.naturalWidth) {
      ctx.drawImage(assets.brick, -w / 2, -h / 2, w, h);
    } else {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    ctx.restore();
  }

  function drawLips(x, y, w, h) {
    const pulse = 0.9 + Math.sin(game.boostHintPulse * 2.2 + x * 0.01) * 0.05;
    ctx.save();
    const glow = ctx.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.85);
    glow.addColorStop(0, 'rgba(255,255,255,0.28)');
    glow.addColorStop(0.55, 'rgba(217,70,239,0.25)');
    glow.addColorStop(1, 'rgba(217,70,239,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, w * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawImageObject(assets.lips, x, y, w * pulse, h * pulse, 0.12);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 14px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.fillText('无敌', x + w / 2, y - 6);
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(92, 64, 51, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color || '#fff';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size / 2, -1, p.size, 2);
        ctx.fillRect(-1, -p.size / 2, 2, p.size);
        ctx.restore();
      }
    }
  }

  function drawHud() {
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    roundRect(18, 18, 332, 104, 18);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 24px Microsoft YaHei';
    ctx.textAlign = 'left';
    ctx.fillText(`分数 ${game.score}`, 38, 52);
    ctx.font = '16px Microsoft YaHei';
    ctx.fillText(`最高 ${game.best}`, 40, 80);
    ctx.fillText(`速度 ${Math.round(game.speed)}｜难度 Lv.${game.difficultyLevel}`, 40, 104);

    ctx.fillStyle = 'rgba(17,24,39,0.78)';
    ctx.font = 'bold 17px Microsoft YaHei';
    ctx.textAlign = 'right';
    ctx.fillText('巧乐兹=跳｜雪碧=蹲｜挖掘机/砖头=跳', W - 22, 36);

    if (game.invincibleTimer > 0) {
      const ratio = game.invincibleTimer / 5;
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      roundRect(W - 260, 48, 224, 52, 14);
      ctx.fill();
      ctx.fillStyle = '#f3e8ff';
      roundRect(W - 242, 73, 186, 12, 8);
      ctx.fill();
      ctx.fillStyle = '#d946ef';
      roundRect(W - 242, 73, 186 * ratio, 12, 8);
      ctx.fill();
      ctx.fillStyle = '#86198f';
      ctx.font = 'bold 16px Microsoft YaHei';
      ctx.textAlign = 'center';
      ctx.fillText(`无敌中 ${game.invincibleTimer.toFixed(1)}s`, W - 148, 67);
    } else if (game.boosting || game.boostBlend > 0.05) {
      const alpha = 0.75 + Math.sin(game.boostHintPulse) * 0.12;
      ctx.fillStyle = `rgba(220,38,38,${alpha})`;
      ctx.font = 'bold 28px Microsoft YaHei';
      ctx.textAlign = 'center';
      ctx.fillText('加速中！', W / 2, 52);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.76)';
      roundRect(W - 255, 48, 220, 38, 14);
      ctx.fill();
      ctx.fillStyle = '#dc2626';
      ctx.font = 'bold 16px Microsoft YaHei';
      ctx.textAlign = 'center';
      ctx.fillText('长按画面或按 Shift 可以加速', W - 145, 73);
    }
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function drawReadyScreen() {
    drawBackground();
    drawPlayer();
    drawHud();
  }

  document.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      jump();
    }
    if (['ArrowDown', 'KeyS'].includes(e.code)) {
      e.preventDefault();
      setCrouch(true);
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setBoosting(true);
    }
    if (e.code === 'Enter' && game.state !== STATE.RUNNING) {
      resetGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (['ArrowDown', 'KeyS'].includes(e.code)) {
      setCrouch(false);
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setBoosting(false);
    }
  });

  startBtn.addEventListener('click', resetGame);
  againBtn.addEventListener('click', resetGame);
  restartBtn.addEventListener('click', resetGame);

  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (e.currentTarget && e.pointerId !== undefined && e.currentTarget.setPointerCapture) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    }
    jump();
  });
  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    jump();
  }, { passive: false });

  // 手机端下蹲按钮：使用独立 input.duckHeld 状态，避免被键盘状态覆盖。
  const duckStart = (e) => {
    if (e) {
      e.preventDefault();
      if (e.currentTarget && e.pointerId !== undefined && e.currentTarget.setPointerCapture) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
    input.duckHeld = true;
    setCrouch(true);
  };

  const duckEnd = (e) => {
    if (e) {
      e.preventDefault();
      if (e.currentTarget && e.pointerId !== undefined && e.currentTarget.releasePointerCapture) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }
    input.duckHeld = false;
    setCrouch(false);
  };

  duckBtn.addEventListener('pointerdown', duckStart);
  duckBtn.addEventListener('pointerup', duckEnd);
  duckBtn.addEventListener('pointercancel', duckEnd);
  duckBtn.addEventListener('lostpointercapture', duckEnd);

  duckBtn.addEventListener('touchstart', duckStart, { passive: false });
  duckBtn.addEventListener('touchend', duckEnd, { passive: false });
  duckBtn.addEventListener('touchcancel', duckEnd, { passive: false });

  const boostButtonStart = (e) => {
    if (e) {
      e.preventDefault();
      if (e.currentTarget && e.pointerId !== undefined && e.currentTarget.setPointerCapture) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
      }
    }
    input.boostHeld = true;
    setBoosting(true);
  };

  const boostButtonEnd = (e) => {
    if (e) {
      e.preventDefault();
      if (e.currentTarget && e.pointerId !== undefined && e.currentTarget.releasePointerCapture) {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    }
    input.boostHeld = false;
    setBoosting(false);
  };

  if (boostBtn) {
    boostBtn.addEventListener('pointerdown', boostButtonStart);
    boostBtn.addEventListener('pointerup', boostButtonEnd);
    boostBtn.addEventListener('pointercancel', boostButtonEnd);
    boostBtn.addEventListener('lostpointercapture', boostButtonEnd);

    boostBtn.addEventListener('touchstart', boostButtonStart, { passive: false });
    boostBtn.addEventListener('touchend', boostButtonEnd, { passive: false });
    boostBtn.addEventListener('touchcancel', boostButtonEnd, { passive: false });
  }

  const boostDown = (e) => {
    if (e.target.closest('.panel') || e.target.closest('.mobile-controls')) return;
    if (game.state === STATE.RUNNING) {
      e.preventDefault();
      setBoosting(true);
    }
  };
  const boostUp = () => setBoosting(false);

  stageWrap.addEventListener('pointerdown', boostDown);
  stageWrap.addEventListener('pointerup', boostUp);
  stageWrap.addEventListener('pointercancel', boostUp);
  stageWrap.addEventListener('pointerleave', boostUp);
  window.addEventListener('blur', () => {
    input.duckHeld = false;
    input.boostHeld = false;
    setBoosting(false);
    setCrouch(false);
  });

  updateMobileControlsVisibility();
  drawReadyScreen();
})();
