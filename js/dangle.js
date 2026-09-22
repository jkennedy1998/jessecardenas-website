// Earring hang engine for earrings on the wire grate board.
// Owns the hardcoded grid node map (never changes — measured from
// assets/grate.png), per-earring state, and drag interaction.
//
// Two renderer paths:
// 1. createJelly  — the current path. The whole gif hangs from its
//    top-middle point at a node and is drawn to a canvas as a quad whose 4
//    corner points jiggle: pointer motion kicks each corner's velocity
//    directly (bottom corners harder than top ones) and each corner springs
//    back to rest. The frame sequence doubles as the rotation: the dial
//    angle maps onto sequence percentage (one turn = the full loop, wrapping
//    on 0 and last), so hover wiggles it, pickup wiggles it more, dragging
//    yanks it through frames, and a lower-half swipe dials it around with a
//    little momentum. A click toggles selection (stroke + scale-up, multi).
// 2. create — legacy two-piece split hang (top.png + bottom.png). Kept as a
//    fallback for entries without frames.json.
//
// The default node per earring is the hardcoded layout (entry.node in
// source/earrings/entries.js). Earrings can be dragged freely and, on
// release, snap smoothly to the nearest grid node — which becomes their new
// home (per-session; a saved user layout will later override the default).
window.Dangle = (() => {
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GRAVITY = 4200; // px/s^2, tuned for display-scale pendulums
  const DAMPING = 1.35; // 1/s, bleeds swing energy so it settles quickly
  const BREEZE = 0.18; // ambient breeze strength
  const SNAP_PULL = 13; // 1/s, fast approach + ease-out settle onto a node
  const DRAG_SCALE = 1.55; // earring scales up by this while being dragged
  const SCALE_EASE = 10; // 1/s, ease for scale-up (drag) and scale-down (place)

  // Jelly warp (whole-gif path). Just 4 corner points on the quad, each a
// small damped spring at rest. Body acceleration and pendulum angular
// acceleration kick the corners' velocities directly (bottom corners much
// harder than top ones — the bottom lags, the top barely moves) and each
// corner springs straight back. Nothing chains downward and nothing loops
// on its own: zero input means zero jiggle. WebGL renders the bilinear
// corner warp (js/jelly-gl.js); canvas-2D fallback draws strips through the
// same corner points.
const CORNER_K = 90; // 1/s^2, corner spring back to rest
const CORNER_D = 9; // 1/s, jiggle bleed (slightly underdamped -> 1-2 wobbles)
const CORNER_AX = 0.24; // horizontal accel -> corner kick (dimensionless)
const CORNER_AY = 0.15; // vertical accel -> corner bob
const CORNER_ANG = 18; // angular accel (rad/s^2) -> extra corner kick
const CORNER_WEIGHTS = [0.22, 0.22, 1, 1]; // TL, TR, BL, BR response weight
const CORNER_MAX_X = 0.09; // max corner x offset, fraction of frame width
const CORNER_MAX_Y = 0.05; // max corner y offset, fraction of frame height
const MAX_CORNER_V = 700; // px/s, corner velocity cap
// White silhouette stroke behind the gif (sprite alpha, see js/jelly-gl.js).
// The radius is a state value you drive: strokeTarget = px radius, state.stroke
// eases toward it, so in/out = grow/shrink. Defaults: stroke in on grab,
// stroke out on release.
const STROKE_PX = 5; // px, outline radius while stroked in (frame-space)
const STROKE_EASE = 12; // 1/s, ease for stroke in/out
const STROKE_TAPS_2D = 12; // outline taps in the canvas-2D fallback
// Dial: the image sequence IS the rotation. sequence percentage == angle
// percentage — one full turn (TAU) maps onto the whole frame loop, so the
// earring "rotates" by shifting frames (looping on 0 and last) instead of
// skewing the quad. The quad itself never rotates.
const TAU = Math.PI * 2;
const DIAL_K = 6; // 1/s^2, soft spring back toward the rest frame
const DIAL_DAMP = 1.8; // 1/s, bleed so a swipe coasts a moment, then settles
const DIAL_BREEZE = 0.37; // ambient breeze strength on the dial (idle shimmer)
const DIAL_KICK = 0.75; // drag acceleration -> dial coupling (see it turn)
const DIAL_DRAG = 0.3; // pointer speed while dragging -> dial follow spin
const DIAL_DRAG_EASE = 10; // 1/s, how fast the dial follows pointer speed
const DRAG_K_SCALE = 0.3; // rest-spring relax factor while dragging
const DIAL_PX_PER_RAD = 110; // lower-half swipe: screen px per radian
const DIAL_V_MAX = 15; // rad/s, dial velocity cap
const HOVER_KICK = 9; // rad/s, wiggle impulse on hover
const PICKUP_KICK = 14; // rad/s, bigger wiggle impulse on pickup
const CLICK_PX = 6; // pointer travel below which a press is a click (select)
// Pivot swing: the png itself rotates around its top-center point (where the
// hook hangs) like a real pendulum — separate from the dial (frame turn).
// Softened gravity + damping give the piece a sense of weight; horizontal
// body acceleration (drag yanks, snap-back) kicks it so the bottom lags.
const SWING_G = 470; // px/s^2, softened gravity -> slow heavy pendulum
const SWING_DAMP = 0.9; // 1/s, bleeds swing energy over a few arcs
const SWING_KICK = 0.2; // horizontal body accel -> swing coupling
const SWING_MAX = 1.1; // rad, swing clamp with inelastic bounce
const SWING_V_MAX = 1.2; // rad/s, swing velocity cap
const SWING_BREEZE = 0.05; // ambient breeze strength on the swing
const SWING_HOVER = 0.26; // rad/s, swing impulse on hover
const SWING_PICKUP = 0.44; // rad/s, swing impulse on pickup

  // Wire centerlines in assets/grate.png (px, intrinsic 1068x1084).
  const GRATE_W = 1068;
  const GRATE_H = 1084;
  const VERTICALS = [14, 145, 260, 375, 489, 602, 714, 826, 936, 1052];
  const HORIZONTALS = [12, 136, 252, 366, 480, 593, 706, 828, 943, 1064];

  // Nodes sit at the middle-center of each horizontal bar segment (between
  // adjacent vertical wires, on the horizontal wire). 1-based, row-major.
  // 10 vertical wires -> 9 gaps per row, 10 horizontal rows -> 90 nodes.
  function nodePoint(index) {
    const gaps = VERTICALS.length - 1;
    const col = (index - 1) % gaps;
    const row = Math.floor((index - 1) / gaps);
    if (row < 0 || row >= HORIZONTALS.length) return null;
    const x = ((VERTICALS[col] + VERTICALS[col + 1]) / 2) / GRATE_W;
    const y = HORIZONTALS[row] / GRATE_H;
    return { x, y };
  }

  const items = [];
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

  function nodeCount() {
    return (VERTICALS.length - 1) * HORIZONTALS.length;
  }

  // Nearest grid node to a fractional board position.
  function nearestNode(x, y) {
    let best = 1;
    let bestDist = Infinity;
    for (let index = 1; index <= nodeCount(); index += 1) {
      const point = nodePoint(index);
      const dx = point.x - x;
      const dy = point.y - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; best = index; }
    }
    return best;
  }

  // Shared: begin/end drag + scale targets. `grabber` is the element that
  // receives pointer events. opts.modeFor(event) may return "dial" to turn a
  // press into a dial swipe (angle, not position) — e.g. the lower half of
  // the earring body. A press released with almost no travel is a click and
  // toggles selection.
  function attachDrag(state, grabber, releaseExtra, opts = {}) {
    grabber.addEventListener("pointerdown", (event) => {
      state.dragging = true;
      state.dragMode = opts.modeFor ? opts.modeFor(event) : "move";
      state.dragMoved = 0;
      state.dragStart = { x: event.clientX, y: event.clientY, t: performance.now() };
      state.pointer = { x: event.clientX, y: event.clientY, t: performance.now() };
      state.pointerVelocityX = 0;
      state.scaleTarget = state.baseScale * DRAG_SCALE;
      if (state.onDragStart) state.onDragStart();
      grabber.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    grabber.addEventListener("pointermove", (event) => {
      if (!state.dragging || !state.pointer) return;
      const now = performance.now();
      const dt = Math.max((now - state.pointer.t) / 1000, 1 / 240);
      const dx = event.clientX - state.pointer.x;
      const dy = event.clientY - state.pointer.y;
      state.dragMoved += Math.abs(dx) + Math.abs(dy);
      if (state.dragMode === "dial") {
        // dial swipe: horizontal travel turns the piece through its frames
        state.angle += dx / DIAL_PX_PER_RAD;
        const instantVel = (dx / dt) / DIAL_PX_PER_RAD;
        state.dialVel = state.dialVel * 0.6 + instantVel * 0.4;
        state.pointer = { x: event.clientX, y: event.clientY, t: now };
        return;
      }
      state.x = clamp(state.x + dx / state.hang.clientWidth, 0.08, 0.92);
      state.y = clamp(state.y + dy / state.hang.clientHeight, 0.08, 0.9);
      const vx = dx / dt;
      const ax = (vx - state.pointerVelocityX) / dt;
      state.pointerVelocityX = vx;
      state.lastPointerAx = ax; // px/s^2, consumed by the renderer
      state.pointer = { x: event.clientX, y: event.clientY, t: now };
      state.renderPivot();
    });

    const release = (event) => {
      if (grabber.hasPointerCapture && grabber.hasPointerCapture(event.pointerId)) {
        grabber.releasePointerCapture(event.pointerId);
      }
      state.dragging = false;
      state.pointer = null;
      // almost no travel + short press = click: toggle selection
      const travel = state.dragStart
        ? Math.abs(event.clientX - state.dragStart.x) + Math.abs(event.clientY - state.dragStart.y)
        : Infinity;
      const brief = !state.dragStart || performance.now() - state.dragStart.t < 600;
      if (travel < CLICK_PX && brief && state.onSelect) state.onSelect();
      state.dragStart = null;
      state.dragMode = "move";
      // drop onto the nearest node; it becomes the earring's new home
      state.node = nearestNode(state.x, state.y);
      state.home = nodePoint(state.node);
      // selected earrings stay scaled up and stroked, like while dragged
      state.scaleTarget = state.baseScale * (state.selected ? DRAG_SCALE : 1);
      state.strokeTarget = state.selected ? STROKE_PX : 0;
      if (releaseExtra) releaseExtra();
    };
    grabber.addEventListener("pointerup", release);
    grabber.addEventListener("pointercancel", release);
  }

  function baseState(dangle, board, { node = 1, scale = 0.6, length = 160 }) {
    const home = nodePoint(node) || { x: 0.5, y: 0.3 };
    const state = {
      dangle, hang: board,
      home, node,
      x: home.x, y: home.y,
      scale, baseScale: scale,
      renderedScale: scale, scaleTarget: scale,
      dragging: false,
      pointer: null, pointerVelocityX: 0, lastPointerAx: 0,
      prevX: home.x, prevVx: 0,
      prevY: home.y, prevVy: 0,
      phase: Math.random() * Math.PI * 2,
    };
    state.renderPivot = () => {
      state.dangle.style.left = `${state.x * 100}%`;
      state.dangle.style.top = `${state.y * 100}%`;
      state.dangle.style.scale = String(state.renderedScale);
    };
    state.effLength = length * scale;
    return state;
  }

  // ---------------- jelly path: whole gif on a jiggling quad ----------------

  function createJelly(dangle, { node = 1, frames, scale = 0.7, length = 140 } = {}) {
    const canvas = dangle.querySelector("canvas.earring-jelly");
    const state = baseState(dangle, dangle.parentElement, { node, scale, length });

    const sheet = new Image();
    sheet.src = new URL(frames.sheet, document.location.href).href;

    Object.assign(state, {
      canvas, ctx: null, sheet,
      fw: frames.fw, fh: frames.fh, cols: frames.cols, count: frames.count,
      fps: 1000 / (frames.frameMs || 40),
      // dial state: angle (rad, unbounded) maps onto the sequence —
      // frameF = angle/TAU * count, looping on 0 and last
      angle: 0, dialVel: 0, prevDialVel: 0,
      // pivot swing: the png rotates around its top-center (the hook)
      swing: 0, swingVel: 0,
      wiggleDir: 1,
      selected: false,
      stroke: 0, strokeTarget: 0,
      pad: Math.max(0, (canvas.width - frames.fw) / 2),
      corners: CORNER_WEIGHTS.map(() => ({ x: 0, y: 0, vx: 0, vy: 0 })),
    });

    // WebGL bilinear-quad renderer when available, canvas-2D fallback otherwise
    state.draw = window.JellyGL
      ? window.JellyGL.create(canvas, frames)
      : null;
    if (state.draw) state.ctx = null;
    else state.ctx = canvas.getContext("2d");

    // hover: a gentle wiggle through the frames (mouse only)
    canvas.addEventListener("pointerenter", (event) => {
      if (state.dragging || REDUCED || event.pointerType !== "mouse") return;
      state.dialVel += HOVER_KICK * state.wiggleDir;
      state.swingVel += SWING_HOVER * state.wiggleDir;
      state.wiggleDir = -state.wiggleDir;
    });

    // pickup: wiggle a little more; stroke in while grabbed
    state.onDragStart = () => {
      if (!REDUCED) {
        state.dialVel += PICKUP_KICK * state.wiggleDir;
        state.swingVel += SWING_PICKUP * state.wiggleDir;
        state.wiggleDir = -state.wiggleDir;
      }
      state.strokeTarget = STROKE_PX;
    };

    // click (toggle selection): stroke in + scale up while selected
    state.onSelect = () => {
      state.selected = !state.selected;
      state.strokeTarget = state.selected ? STROKE_PX : 0;
      state.scaleTarget = state.baseScale *
        (state.selected ? DRAG_SCALE : 1);
    };

    attachDrag(state, canvas, null, {
      // lower half of the body = dial swipe zone; upper half = grab/move
      modeFor: (event) => {
        const rect = canvas.getBoundingClientRect();
        const localY = event.clientY - rect.top;
        return localY > rect.height * 0.5 ? "dial" : "move";
      },
    });

    state.update = (dt, now) => {
      const boardW = state.hang.clientWidth;

      // scale eases toward its target: up while dragged, back down when placed
      state.renderedScale += (state.scaleTarget - state.renderedScale) *
        Math.min(1, SCALE_EASE * dt);
      state.scale = state.renderedScale;

      // body acceleration (px/s^2) from position deltas — captures both
      // pointer-driven motion and the snap-back motion
      const vx = (state.x - state.prevX) / dt;
      const ax = (vx - state.prevVx) / dt;
      state.prevX = state.x;
      state.prevVx = vx;
      const axPx = ax * boardW;
      const vy = (state.y - state.prevY) / dt;
      const ay = (vy - state.prevVy) / dt;
      state.prevY = state.y;
      state.prevVy = vy;
      const ayPx = ay * state.hang.clientHeight;

      if (!state.dragging) {
        // smooth snap onto the current node: fast approach, ease-out settle
        state.x += (state.home.x - state.x) * Math.min(1, SNAP_PULL * dt);
        state.y += (state.home.y - state.y) * Math.min(1, SNAP_PULL * dt);
      }

      // dial dynamics: the sequence IS the rotation. angle drifts freely
      // (full turns wrap the frames 0..last..0) with a little momentum from
      // swipes and drag yanks; a soft spring settles it back onto the rest
      // frame so it always comes home. While dragging the spring relaxes and
      // the dial follows the pointer's horizontal speed, so moving the piece
      // around visibly spins it through its frames.
      const springK = state.dragging ? DIAL_K * DRAG_K_SCALE : DIAL_K;
      state.dialVel += (-springK * Math.sin(state.angle)) * dt;
      state.dialVel -= state.dialVel * DIAL_DAMP * dt;
      state.dialVel += -(axPx / state.effLength) * Math.cos(state.angle) * dt * DIAL_KICK;
      if (state.dragging && state.pointer) {
        // follow the pointer's horizontal speed (sign flips spin it back);
        // a still pointer lets damping bleed the spin to a stop
        const follow = -(state.pointerVelocityX / state.effLength) * DIAL_DRAG;
        state.dialVel += (follow - state.dialVel) *
          Math.min(1, DIAL_DRAG_EASE * dt);
      } else if (!REDUCED && !state.dragging) {
        // faint ambient breeze on the dial so it never looks frozen
        state.dialVel += Math.sin(now / 1000 + state.phase) * DIAL_BREEZE * dt;
      }
      state.dialVel = clamp(state.dialVel, -DIAL_V_MAX, DIAL_V_MAX);
      state.angle += state.dialVel * dt;
      const dialAcc = (state.dialVel - state.prevDialVel) / dt;
      state.prevDialVel = state.dialVel;

      // pivot swing: pendulum around the hook (png top-center). Horizontal
      // body acceleration drives it (the bottom lags the yank — also active
      // while dragging, since axPx captures pointer motion), softened
      // gravity swings it back, damping bleeds it out over a few arcs.
      if (!REDUCED) {
        state.swingVel += Math.sin(now / 1000 * 0.7 + state.phase) *
          SWING_BREEZE * dt;
      }
      state.swingVel += -(SWING_G / state.effLength) *
        Math.sin(state.swing) * dt;
      state.swingVel += -(axPx / state.effLength) *
        Math.cos(state.swing) * dt * SWING_KICK;
      state.swingVel -= state.swingVel * SWING_DAMP * dt;
      state.swingVel = clamp(state.swingVel, -SWING_V_MAX, SWING_V_MAX);
      state.swing += state.swingVel * dt;
      if (state.swing > SWING_MAX) {
        state.swing = SWING_MAX; state.swingVel *= -0.35;
      } else if (state.swing < -SWING_MAX) {
        state.swing = -SWING_MAX; state.swingVel *= -0.35;
      }
      // CSS transform-origin is 50% 0 (the hook point), so this rotates the
      // png around the hang point; WebGL/canvas render inside is untouched
      state.canvas.style.transform = `rotate(${state.swing}rad)`;

      // sequence percentage == angle percentage: one turn = the whole loop
      state.frameF = (((state.angle / TAU) * state.count) % state.count + state.count) % state.count;

      // stroke eases toward its target: grows while grabbed, shrinks on release
      state.stroke += (state.strokeTarget - state.stroke) *
        Math.min(1, STROKE_EASE * dt);

      // quad corner jiggle: acceleration kicks corner velocity (inertia:
      // the corner lags the yank), the spring pulls it straight back. No
      // coupling between corners — all four answer the same kick at once,
      // weighted so the bottom moves and the top barely does.
      const maxX = state.fw * CORNER_MAX_X;
      const maxY = state.fh * CORNER_MAX_Y;
      const damp = Math.exp(-CORNER_D * dt);
      for (let i = 0; i < 4; i += 1) {
        const corner = state.corners[i];
        const w = CORNER_WEIGHTS[i];
        corner.vx += (-axPx * CORNER_AX - dialAcc * CORNER_ANG) * w * dt;
        corner.vy += -ayPx * CORNER_AY * w * dt;
        corner.vx -= corner.x * CORNER_K * dt;
        corner.vy -= corner.y * CORNER_K * dt;
        corner.vx *= damp;
        corner.vy *= damp;
        corner.vx = clamp(corner.vx, -MAX_CORNER_V, MAX_CORNER_V);
        corner.vy = clamp(corner.vy, -MAX_CORNER_V, MAX_CORNER_V);
        corner.x += corner.vx * dt;
        corner.y += corner.vy * dt;
        // inelastic bounds: slamming the limit must not store energy
        if (corner.x > maxX) { corner.x = maxX; corner.vx *= -0.25; }
        else if (corner.x < -maxX) { corner.x = -maxX; corner.vx *= -0.25; }
        if (corner.y > maxY) { corner.y = maxY; corner.vy *= -0.25; }
        else if (corner.y < -maxY) { corner.y = -maxY; corner.vy *= -0.25; }
      }

      // the frames used to play linearly while dragging; now the dial owns
      // them — drag yanks kick the dial above, so the piece turns as you move it

      drawJelly(state);
      state.renderPivot();
    };

    state.renderPivot();
    items.push({ state, update: state.update });
    return state;
  }

  function drawJelly(state) {
    if (state.draw) { state.draw(state); return; }
    drawJelly2D(state);
  }

  // Fallback: draw horizontal strips whose edges follow the warped quad —
  // an affine approximation of the bilinear corner warp, good enough for
  // these small offsets. The white stroke uses the sprite's own alpha as a
  // cached silhouette, drawn around a circle under the gif.
  function drawJelly2D(state) {
    const { ctx, fw, fh, sheet, pad } = state;
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!sheet.complete || !sheet.naturalWidth) return;
    const index = ((Math.floor(state.frameF) % state.count) + state.count) % state.count;
    const next = (index + 1) % state.count;
    const frameMix = ((state.frameF % 1) + 1) % 1;
    const [tl, tr, bl, br] = state.corners;
    const strips = 8;
    const sh = fh / strips;
    const stroke = state.stroke || 0;

    // whole-quad rotation around the hang point (frame top-middle, shifted
    // into the padded canvas) — now always 0; the frame sequence owned by the
    // dial IS the rotation
    ctx.save();
    ctx.translate(fw / 2 + pad, pad);
    ctx.rotate(state.quadAngle || 0);
    if (stroke > 0.4) {
      const silhouette = buildSilhouette(state, index);
      for (let t = 0; t < STROKE_TAPS_2D; t += 1) {
        const a = (t / STROKE_TAPS_2D) * Math.PI * 2;
        drawWarpedStrips(ctx, silhouette, fw, sh, strips, tl, tr, bl, br,
          Math.cos(a) * stroke, Math.sin(a) * stroke, 0, 0);
      }
      // second silhouette crossfaded in, matching the blended body frames
      const silhouetteB = buildSilhouette(state, next);
      ctx.globalAlpha = frameMix;
      for (let t = 0; t < STROKE_TAPS_2D; t += 1) {
        const a = (t / STROKE_TAPS_2D) * Math.PI * 2;
        drawWarpedStrips(ctx, silhouetteB, fw, sh, strips, tl, tr, bl, br,
          Math.cos(a) * stroke, Math.sin(a) * stroke, 0, 0);
      }
      ctx.globalAlpha = 1;
    }
    drawWarpedStrips(ctx, sheet, fw, sh, strips, tl, tr, bl, br, 0, 0,
      (index % state.cols) * fw, Math.floor(index / state.cols) * fh);
    ctx.globalAlpha = frameMix;
    drawWarpedStrips(ctx, sheet, fw, sh, strips, tl, tr, bl, br, 0, 0,
      (next % state.cols) * fw, Math.floor(next / state.cols) * fh);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // One warped image (src rect -> bilinearly corner-warped strips).
  function drawWarpedStrips(ctx, img, fw, sh, strips, tl, tr, bl, br,
      ox, oy, srcX, srcY) {
    const fh = sh * strips;
    for (let i = 0; i < strips; i += 1) {
      const v0 = i / strips;
      const v1 = (i + 1) / strips;
      // left/right edge x and y interpolated down the warped quad
      const x0l = -fw / 2 + tl.x + (bl.x - tl.x) * v0;
      const x0r = fw / 2 + tr.x + (br.x - tr.x) * v0;
      const x1l = -fw / 2 + tl.x + (bl.x - tl.x) * v1;
      const x1r = fw / 2 + tr.x + (br.x - tr.x) * v1;
      const y0 = v0 * fh + tl.y + (bl.y - tl.y) * v0;
      const y1 = v1 * fh + tl.y + (bl.y - tl.y) * v1;
      const y0r = v0 * fh + tr.y + (br.y - tr.y) * v0;
      // affine map of the source strip onto the (nearly) warped quad cell
      ctx.save();
      ctx.transform((x0r - x0l) / fw, (y0r - y0) / fw,
        (x1l - x0l) / sh, (y1 - y0) / sh, x0l + ox, y0 + oy);
      ctx.drawImage(img, srcX, srcY + i * sh, fw, sh, 0, 0, fw, sh + 0.6);
      ctx.restore();
    }
  }

  // Cached white-tinted frame sprites via their alpha (source-in), small
  // two-slot cache so the crossfade can pull the floor frame and the next.
  function buildSilhouette(state, index) {
    if (!state.silhouettes) {
      state.silhouettes = new Map();
    }
    let entry = state.silhouettes.get(index);
    if (!entry) {
      if (state.silhouettes.size >= 2) state.silhouettes.clear();
      const canvas = document.createElement("canvas");
      canvas.width = state.fw;
      canvas.height = state.fh;
      const silCtx = canvas.getContext("2d");
      const { fw, fh, sheet, cols } = state;
      const sx = (index % cols) * fw;
      const sy = Math.floor(index / cols) * fh;
      silCtx.drawImage(sheet, sx, sy, fw, fh, 0, 0, fw, fh);
      silCtx.globalCompositeOperation = "source-in";
      silCtx.fillStyle = "#ffffff";
      silCtx.fillRect(0, 0, fw, fh);
      entry = canvas;
      state.silhouettes.set(index, entry);
    }
    return entry;
  }

  // ---------------- legacy path: two-piece split hang ----------------

  function create(dangle, { node = 1, scale = 0.6, length = 160 } = {}) {
    const swing = dangle.querySelector(".earring-pendant-swing");
    const hook = dangle.querySelector(".earring-piece-top");
    const state = baseState(dangle, dangle.parentElement, { node, scale, length });

    Object.assign(state, {
      swing, hook,
      angle: 0, velocity: 0,
    });

    attachDrag(state, hook, null);

    state.update = (dt, now) => {
      // scale eases toward its target: up while dragged, back down when placed
      state.renderedScale += (state.scaleTarget - state.renderedScale) *
        Math.min(1, SCALE_EASE * dt);
      state.scale = state.renderedScale;

      if (!state.dragging) {
        // smooth snap onto the current node: fast approach, ease-out settle
        state.x += (state.home.x - state.x) * Math.min(1, SNAP_PULL * dt);
        state.y += (state.home.y - state.y) * Math.min(1, SNAP_PULL * dt);

        const settled = Math.abs(state.angle) < 0.02 && Math.abs(state.velocity) < 0.02;
        if (!REDUCED && settled) {
          // faint ambient breeze so it never looks frozen
          state.velocity += Math.sin(now / 1000 + state.phase) * BREEZE * dt;
        }
        state.velocity += (-(GRAVITY / state.effLength) * Math.sin(state.angle)) * dt;
        state.velocity -= state.velocity * DAMPING * dt;
      }
      state.angle += state.velocity * dt;
      if (state.angle > 1.1) { state.angle = 1.1; state.velocity *= -0.35; }
      if (state.angle < -1.1) { state.angle = -1.1; state.velocity *= -0.35; }
      state.swing.style.transform = `rotate(${state.angle}rad)`;
      state.renderPivot();
    };

    state.renderPivot();
    items.push({ state, update: state.update });
    return state;
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    for (const item of items) item.update(dt, now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.addEventListener("resize", () => {
    for (const { state } of items) state.renderPivot();
  });

  return { create, createJelly, nodePoint, nearestNode };
})();
