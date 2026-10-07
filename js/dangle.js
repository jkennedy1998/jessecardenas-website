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
//    little momentum. A click toggles selection (stroke only, multi).
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
  const HOVER_SCALE = 1.55; // only the actively hovered/dragged earring grows
  const SCALE_EASE = 10; // 1/s, ease for hover scale-up and scale-down
  const BOARD_REFERENCE_WIDTH = 780; // CSS px: the grate's full desktop width
  const BASE_DEPTH_RANGE = 9; // lower-hanging earrings render in front
  const HOVER_DEPTH = 100; // hovered earring rises above the purchase panel

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
// Colored/white silhouette stroke behind the gif (sprite alpha, see
// js/jelly-gl.js). A modest radius plus dense samples preserves a single clean
// contour instead of visibly repeating the earring image around its edge.
const STROKE_PX = 12; // px, outline radius while stroked in (frame-space)
const STROKE_EASE = 12; // 1/s, ease for stroke in/out
const STROKE_COLOR_DURATION = 0.6; // seconds, cubic ease-out to the new family color
const STROKE_TAPS_2D = 40; // outline taps in the canvas-2D fallback
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
const SWING_G = 940; // px/s^2, softened gravity -> heavy pendulum
const SWING_DAMP = 0.9; // 1/s, bleeds swing energy over a few arcs
const SWING_KICK = 0.2; // horizontal body accel -> swing coupling
const SWING_MAX = 1.1; // rad, swing clamp with inelastic bounce
const SWING_V_MAX = 1.2; // rad/s, swing velocity cap
const SWING_BREEZE = 0.05; // ambient breeze strength on the swing
const SWING_HOVER = 0.26; // rad/s, swing impulse on hover
const SWING_PICKUP = 0.44; // rad/s, swing impulse on pickup
// Contact shadow: the photo's own silhouette, blurred and tinted black,
// drawn just below the body — then masked by the grate png's alpha so the
// shadow only lands on the wire grid, never on the page background.
const SHADOW_ALPHA = 0.2; // shadow opacity (20% black)
const SHADOW_BLUR = 5; // px, sprite-space gaussian blur
const SHADOW_DROP = 7; // px, downward offset from the body
const SHADOW_PAD = 16; // sprite margin so blur + offset never clip

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
  const hexToRgb = (color) => {
    const hex = String(color || "").replace(/^#/, "");
    if (!/^[\da-f]{6}$/i.test(hex)) return [1, 1, 1];
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  };
  const rgbToCss = (rgb) => `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(", ")})`;

  // Grate board texture for shadow masking — the same file the board CSS
  // draws full-bleed; its alpha is the "shadow may land here" mask.
  const grateImg = new Image();
  grateImg.src = new URL("../assets/grate.png",
    (typeof document !== "undefined" && document.currentScript
      ? document.currentScript.src : window.location.href)).href;

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
      state.scaleTarget = state.baseScale * (state.hoverScale || HOVER_SCALE);
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
      // showcase embeds keep their fixed home; board pieces drop onto the
      // nearest node, which becomes the earring's new home
      if (!state.fixedHome) {
        state.node = nearestNode(state.x, state.y);
        state.home = nodePoint(state.node);
      }
      // Selection retains its outline only; size belongs to the hovered item.
      state.scaleTarget = state.baseScale *
        (state.hovered ? (state.hoverScale || HOVER_SCALE) : 1);
      state.strokeTarget = state.selected || state.hovered ? STROKE_PX : 0;
      if (releaseExtra) releaseExtra();
    };
    grabber.addEventListener("pointerup", release);
    grabber.addEventListener("pointercancel", release);
  }

  function baseState(dangle, board, { node = 1, scale = 0.6, length = 160 }) {
    const home = nodePoint(node) || { x: 0.5, y: 0.3 };
    const boardWidth = board.clientWidth || BOARD_REFERENCE_WIDTH;
    const boardScale = boardWidth / BOARD_REFERENCE_WIDTH;
    const initialScale = scale * boardScale;
    const state = {
      dangle, hang: board,
      home, node,
      x: home.x, y: home.y,
      designScale: scale, baseScale: initialScale,
      scale: initialScale, renderedScale: initialScale, scaleTarget: initialScale,
      length, boardWidth,
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
      state.dangle.style.zIndex = String(state.hovered
        ? HOVER_DEPTH
        : Math.round((1 - state.y) * BASE_DEPTH_RANGE));
    };
    state.effLength = length * initialScale;
    return state;
  }

  // The board changes width both at viewport breakpoints and when the shop
  // pane opens. Keep the earring's current scale state proportional to that
  // width, so its size remains physically matched to the grate wires.
  function syncBoardScale(state) {
    const boardWidth = state.hang.clientWidth;
    if (!boardWidth || boardWidth === state.boardWidth) return;
    const previousBaseScale = state.baseScale;
    const nextBaseScale = state.designScale * boardWidth / BOARD_REFERENCE_WIDTH;
    const ratio = previousBaseScale ? nextBaseScale / previousBaseScale : 1;
    state.boardWidth = boardWidth;
    state.baseScale = nextBaseScale;
    state.renderedScale *= ratio;
    state.scaleTarget *= ratio;
    state.scale = state.renderedScale;
    state.effLength = state.length * state.renderedScale;
  }

  // ---------------- jelly path: whole gif on a jiggling quad ----------------

  function createJelly(dangle, {
    node = 1, frames, scale = 0.7, length = 140, accentColor = "#261231", onSelect, onHover,
    // showcase embeds: fixed hang point, no board drop/grate shadow, and
    // optional stroke — everything else (dial, swing, corners, breeze) is
    // the same physics the board runs
    home = null, shadow = true, stroke = true, hoverScale = HOVER_SCALE,
  } = {}) {
    const canvas = dangle.querySelector("canvas.earring-jelly");
    const hitArea = dangle.querySelector(".earring-jelly-hitarea");
    const state = baseState(dangle, dangle.parentElement, { node, scale, length });

    if (home) {
      state.fixedHome = true;
      state.hoverScale = hoverScale;
      state.home = home;
      state.x = home.x;
      state.y = home.y;
    }

    // shadow canvas sits under the body canvas, same geometry; dangle.js
    // owns it because it needs per-frame state (frame index, position,
    // scale, swing) to place and mask the contact shadow. Showcase embeds
    // render straight onto the page, so they skip the grate-masked shadow.
    let shadowCanvas = null;
    if (shadow) {
      shadowCanvas = document.createElement("canvas");
      shadowCanvas.className = "earring-jelly-shadow";
      shadowCanvas.width = canvas.width;
      shadowCanvas.height = canvas.height;
      shadowCanvas.style.left = canvas.style.left;
      shadowCanvas.style.top = canvas.style.top;
      canvas.parentNode.insertBefore(shadowCanvas, canvas);
    }

    const sheet = new Image();
    // A failed sheet load must not leave the earring blank forever: every
    // draw path early-returns on a missing image with no console signal.
    // Retry a few times (cache-busted) and log each attempt so a transient
    // network/CDN hiccup during spawn is visible and self-heals.
    const sheetUrl = new URL(frames.sheet, document.location.href).href;
    let sheetRetries = 0;
    sheet.addEventListener("error", () => {
      console.error(`[dangle] earring sheet failed to load (attempt ${sheetRetries + 1}):`, sheetUrl);
      if (sheetRetries < 3) {
        sheetRetries += 1;
        setTimeout(() => {
          sheet.src = `${sheetUrl}${sheetUrl.includes("?") ? "&" : "?"}retry=${sheetRetries}`;
        }, 1000 * sheetRetries);
      }
    });
    sheet.src = sheetUrl;

    Object.assign(state, {
      canvas, hitArea, ctx: null, sheet,
      hovered: false, onHover,
      accentColor, strokeColor: "#ffffff", strokeRgb: [1, 1, 1],
      useStroke: stroke,
      strokeRgbFrom: [1, 1, 1], strokeRgbTarget: [1, 1, 1],
      strokeColorElapsed: STROKE_COLOR_DURATION, renderedStrokeColor: "#ffffff",
      shadow: shadowCanvas, shadowCtx: shadowCanvas ? shadowCanvas.getContext("2d") : null,
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

    state.syncStrokeColor = () => {
      // Selection owns the color even while hovered; only unselected hover
      // states use the temporary white outline. Color itself eases separately
      // from stroke width, so it never snaps as selection changes.
      const color = state.selected ? state.accentColor : "#ffffff";
      if (state.strokeColor === color) return;
      state.strokeColor = color;
      state.strokeRgbFrom = [...state.strokeRgb];
      state.strokeRgbTarget = hexToRgb(color);
      state.strokeColorElapsed = 0;
    };

    // WebGL bilinear-quad renderer when available, canvas-2D fallback otherwise
    state.draw = window.JellyGL
      ? window.JellyGL.create(canvas, frames)
      : null;
    if (state.draw) {
      state.ctx = null;
    } else {
      state.ctx = canvas.getContext("2d");
      if (!state.ctx) {
        // The webgl path failed after the canvas already held a webgl
        // context (e.g. shader/link failure), so getContext("2d") returns
        // null on it — that used to blank the earring forever, silently.
        // Swap in a clean canvas and continue on the 2d path.
        console.warn("[dangle] webgl unavailable at spawn — swapping to a clean 2d canvas");
        const two = document.createElement("canvas");
        two.className = canvas.className;
        two.width = canvas.width;
        two.height = canvas.height;
        two.style.left = canvas.style.left;
        two.style.top = canvas.style.top;
        canvas.replaceWith(two);
        state.canvas = two;
        state.ctx = two.getContext("2d");
      }
    }

    // Hover raises this earring and activates the one board-level info card.
    hitArea.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "mouse") return;
      if (!state.dragging && !REDUCED) {
        state.dialVel += HOVER_KICK * state.wiggleDir;
        state.swingVel += SWING_HOVER * state.wiggleDir;
        state.wiggleDir = -state.wiggleDir;
      }
      state.hovered = true;
      state.scaleTarget = state.baseScale * HOVER_SCALE;
      state.strokeTarget = STROKE_PX;
      state.syncStrokeColor();
      state.renderPivot();
      if (state.onHover) state.onHover(state);
    });
    hitArea.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse" || state.dragging) return;
      state.hovered = false;
      state.scaleTarget = state.baseScale;
      state.strokeTarget = state.selected ? STROKE_PX : 0;
      state.syncStrokeColor();
      state.renderPivot();
      if (state.onHover) state.onHover(null);
    });

    // Pickup keeps the outline alive either way. The hover card only stays up
    // for a dial swipe (the earring itself holds still, just turning through
    // its frames) — a full move-drag relocates the piece, so the card would
    // be anchored to a spot the earring is no longer at; hide it for that.
    state.onDragStart = () => {
      state.hovered = true;
      state.scaleTarget = state.baseScale * HOVER_SCALE;
      state.strokeTarget = STROKE_PX;
      state.syncStrokeColor();
      state.renderPivot();
      if (state.onHover) state.onHover(state.dragMode === "dial" ? state : null);
      if (!REDUCED) {
        state.dialVel += PICKUP_KICK * state.wiggleDir;
        state.swingVel += SWING_PICKUP * state.wiggleDir;
        state.wiggleDir = -state.wiggleDir;
      }
      state.strokeTarget = STROKE_PX;
    };

    // click toggles selection: selected pieces retain the stroke, not the size.
    // Selection truth lives in the cart (window.Shop) — components.js passes
    // opts.onSelect to route the click there and shop:change calls
    // state.setSelected to sync the visual.
    state.setSelected = (value) => {
      state.selected = value;
      state.strokeTarget = value || state.hovered ? STROKE_PX : 0;
      state.scaleTarget = state.baseScale *
        (state.hovered ? HOVER_SCALE : 1);
      state.syncStrokeColor();
    };
    state.onSelect = () => {
      state.setSelected(!state.selected);
      if (onSelect) onSelect();
    };

    attachDrag(state, hitArea, null, {
      // Lower half of the tight interaction plane = dial swipe zone; upper
      // half = grab/move. The painted canvas itself never captures input.
      modeFor: (event) => {
        const rect = hitArea.getBoundingClientRect();
        const localY = event.clientY - rect.top;
        return localY > rect.height * 0.5 ? "dial" : "move";
      },
    });

    state.update = (dt, now) => {
      syncBoardScale(state);
      const boardW = state.hang.clientWidth;

      // scale eases toward its target: up while dragged, back down when placed
      state.renderedScale += (state.scaleTarget - state.renderedScale) *
        Math.min(1, SCALE_EASE * dt);
      state.scale = state.renderedScale;
      state.effLength = state.length * state.renderedScale;

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
      const swingTransform = `rotate(${state.swing}rad)`;
      state.canvas.style.transform = swingTransform;
      state.hitArea.style.transform = swingTransform;
      // The contact shadow is composited against the stationary grate. Keep
      // its canvas planar so rotating a pendant never rotates that grid mask.
      if (state.shadow) state.shadow.style.transform = "none";

      // sequence percentage == angle percentage: one turn = the whole loop
      state.frameF = (((state.angle / TAU) * state.count) % state.count + state.count) % state.count;

      // Stroke width has its own quick physical ease, while its color takes a
      // visible 0.6s cubic ease-out: immediate movement, gentle final settle.
      if (!state.useStroke) state.strokeTarget = 0;
      state.stroke += (state.strokeTarget - state.stroke) *
        Math.min(1, STROKE_EASE * dt);
      state.strokeColorElapsed = Math.min(
        STROKE_COLOR_DURATION, state.strokeColorElapsed + dt,
      );
      const colorProgress = state.strokeColorElapsed / STROKE_COLOR_DURATION;
      const colorEase = 1 - (1 - colorProgress) ** 3;
      state.strokeRgb = state.strokeRgbFrom.map((from, index) =>
        from + (state.strokeRgbTarget[index] - from) * colorEase);
      state.renderedStrokeColor = rgbToCss(state.strokeRgb);

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
      if (state.shadow) drawShadow(state);
      state.renderPivot();
      // Same rule every frame: a dial swipe keeps the card up (the earring
      // stays put), a full move-drag hides it (the earring doesn't).
      if (state.hovered && state.onHover) {
        state.onHover(state.dragging && state.dragMode === "move" ? null : state);
      }
    };

    state.renderPivot();
    items.push({ state, update: state.update });
    return state;
  }

  function drawJelly(state) {
    // The WebGL path (jelly-gl.js) already guards its own draw() and leaves
    // the canvas blankly cleared on failure as an intermediate step, relying
    // on the swap below to repaint it via the 2D path right after. That swap
    // had no guard of its own: if it ever threw (a mid-reload sheet, a
    // second context loss landing mid-swap, canvas.getContext returning
    // null), the exception used to propagate out of state.update and the
    // earring was left stuck on that blank clear forever. Skip this one
    // frame's draw instead — whatever was already painted stays on screen —
    // and let the next frame retry rather than giving up for good.
    try {
      if (state.draw && !state.draw.failed) { state.draw(state); return; }
      if (state.draw && state.draw.failed && !state.ctx) {
        // WebGL tainted the canvas (file:// pages) — a 2D context can't be
        // created on it, so swap in a clean canvas and continue on the 2D path.
        if (!state.swapLogged) {
          state.swapLogged = true;
          console.warn("[dangle] webgl renderer failed — swapped to 2d fallback");
        }
        const two = document.createElement("canvas");
        two.className = state.canvas.className;
        two.width = state.canvas.width;
        two.height = state.canvas.height;
        two.style.left = state.canvas.style.left;
        two.style.top = state.canvas.style.top;
        state.canvas.replaceWith(two);
        state.canvas = two;
        state.ctx = two.getContext("2d");
        if (!state.ctx) {
          // Without this the swap re-ran every frame, blank, with no signal.
          console.error("[dangle] 2d fallback context unavailable — earring stays blank");
        }
      }
      drawJelly2D(state);
    } catch (err) {
      if (!state.drawErrorLogged) {
        console.error("[dangle] drawJelly failed, skipping frames until it recovers:", err);
        state.drawErrorLogged = true;
      }
    }
  }

  // Contact shadow: black blurred photo silhouette, slightly lower, then
  // masked to the grate so it only shows on the wire grid. Board-to-grate
  // mapping: the board draws grate.png at 100% 100%, so board fraction x
  // board size -> grate intrinsic pixels. The canvas also rides the dangle
  // origin (node point) and its CSS scale, so the source rect follows.
  function drawShadow(state) {
    const { canvas, shadowCtx: ctx, fw, fh, pad } = state;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.sheet.complete || !state.sheet.naturalWidth) return;
    if (!grateImg.complete || !grateImg.naturalWidth) return;
    const index = ((Math.floor(state.frameF) % state.count) + state.count) % state.count;
    const sprite = buildShadowSprite(state, index);
    ctx.globalAlpha = SHADOW_ALPHA;
    ctx.drawImage(sprite, pad - SHADOW_PAD, pad - SHADOW_PAD + SHADOW_DROP);
    const boardW = state.hang.clientWidth;
    const boardH = state.hang.clientHeight;
    const gx = grateImg.naturalWidth / boardW;
    const gy = grateImg.naturalHeight / boardH;
    const sx = (state.x * boardW - state.renderedScale * (fw / 2 + pad)) * gx;
    const sy = (state.y * boardH - state.renderedScale * pad) * gy;
    const sw = canvas.width * state.renderedScale * gx;
    const sh = canvas.height * state.renderedScale * gy;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(grateImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }

  // Cached black blurred frame sprites (photo alpha), small two-slot cache
  // matching buildSilhouette's eviction style.
  function buildShadowSprite(state, index) {
    if (!state.shadowSprites) state.shadowSprites = new Map();
    let entry = state.shadowSprites.get(index);
    if (!entry) {
      if (state.shadowSprites.size >= 2) state.shadowSprites.clear();
      const sprite = document.createElement("canvas");
      sprite.width = state.fw + SHADOW_PAD * 2;
      sprite.height = state.fh + SHADOW_PAD * 2;
      const sctx = sprite.getContext("2d");
      const sx = (index % state.cols) * state.fw;
      const sy = Math.floor(index / state.cols) * state.fh;
      sctx.filter = `blur(${SHADOW_BLUR}px)`;
      sctx.drawImage(state.sheet, sx, sy, state.fw, state.fh,
        SHADOW_PAD, SHADOW_PAD, state.fw, state.fh);
      sctx.filter = "none";
      sctx.globalCompositeOperation = "source-in";
      sctx.fillStyle = "#000";
      sctx.fillRect(0, 0, sprite.width, sprite.height);
      entry = sprite;
      state.shadowSprites.set(index, entry);
    }
    return entry;
  }

  // Fallback: draw horizontal strips whose edges follow the warped quad —
  // an affine approximation of the bilinear corner warp, good enough for
  // these small offsets. The state-colored stroke uses the sprite's own alpha
  // as a cached silhouette, drawn around a circle under the gif.
  function drawJelly2D(state) {
    const { ctx, fw, fh, sheet, pad } = state;
    if (!ctx) return;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!sheet.complete || !sheet.naturalWidth) return;
    // Draw one exact sequence frame. Blending neighboring images makes the
    // outline read as multiple offset earrings while the dial is moving.
    const index = ((Math.floor(state.frameF) % state.count) + state.count) % state.count;
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
    }
    drawWarpedStrips(ctx, sheet, fw, sh, strips, tl, tr, bl, br, 0, 0,
      (index % state.cols) * fw, Math.floor(index / state.cols) * fh);
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

  // Cached tinted frame sprites via their alpha (source-in), small two-slot
  // cache so the crossfade can pull the floor frame and the next.
  function buildSilhouette(state, index) {
    if (!state.silhouettes || state.silhouetteColor !== state.renderedStrokeColor) {
      state.silhouettes = new Map();
      state.silhouetteColor = state.renderedStrokeColor;
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
      silCtx.fillStyle = state.renderedStrokeColor || "#ffffff";
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
      syncBoardScale(state);
      // scale eases toward its target: up while dragged, back down when placed
      state.renderedScale += (state.scaleTarget - state.renderedScale) *
        Math.min(1, SCALE_EASE * dt);
      state.scale = state.renderedScale;
      state.effLength = state.length * state.renderedScale;

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
    // Floor the frame dt: two rAF ticks can share a timestamp (hardened
    // browser builds coarsen timers), and dt = 0 poisons the physics chain
    // with NaN — vx = 0/0 = NaN, then 0 * NaN spreads it into the dial,
    // corners, and frame index of EVERY earring in the same frame. They all
    // go blank silently: NaN never throws and no GL context is lost.
    const dt = Math.min(Math.max((now - last) / 1000, 1 / 1000), 1 / 30);
    last = now;
    for (const item of items) {
      try {
        item.update(dt, now);
      } catch (err) {
        // One earring's per-frame update must never take the shared rAF
        // loop down with it — an uncaught throw here used to stop
        // requestAnimationFrame(tick) from ever being called again, which
        // froze/hid every earring on the board, not just the failing one.
        console.error("[dangle] earring update failed, disabling it:", err);
        item.update = () => {};
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Light watchdog: every ~2s, scrub NaN physics per earring and log only
  // when something was actually wrong — silent blank canvases must leave a
  // trace without spamming the console on healthy frames.
  setInterval(() => {
    for (const { state } of items) {
      const bad = !Number.isFinite(state.angle) || !Number.isFinite(state.frameF)
        || state.corners.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y));
      if (!bad) continue;
      console.warn("[dangle] NaN physics detected — scrubbing the earring back to rest");
      state.angle = 0; state.dialVel = 0; state.prevDialVel = 0;
      state.swing = 0; state.swingVel = 0;
      state.frameF = 0;
      for (const c of state.corners) { c.x = 0; c.y = 0; c.vx = 0; c.vy = 0; }
      state.prevX = state.x; state.prevVx = 0;
      state.prevY = state.y; state.prevVy = 0;
      state.pointerVelocityX = 0; state.lastPointerAx = 0;
    }
  }, 2000);

  window.addEventListener("resize", () => {
    for (const { state } of items) {
      syncBoardScale(state);
      state.renderPivot();
    }
  });

  return { create, createJelly, nodePoint, nearestNode };
})();
