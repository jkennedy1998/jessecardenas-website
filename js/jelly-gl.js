// WebGL renderer for the jelly earring.
// Draws the whole frame as one quad whose 4 corner points carry small
// offsets (a bilinear warp), plus the whole quad rotates around the pivot
// (gif top-middle). The canvas is padded around the frame so a tinted
// silhouette stroke (the sprite's own alpha, densely sampled around a circle
// of state.stroke radius) can grow outside the gif without clipping.
//
// window.JellyGL.create(canvas, frames) -> draw(state) | null
// state must expose: corners [{x, y} x4], quadAngle (whole-quad rotation; the
// frame sequence itself is owned by the dial in js/dangle.js), stroke,
// strokeRgb, frameF, fw, fh, cols, count, sheet
window.JellyGL = (() => {
  const MESH = 8; // grid subdivisions per side; smooths the bilinear warp
  const TAPS = 32;
  const TAP_DIRS = Array.from({ length: TAPS }, (_, i) => {
    const angle = (i / TAPS) * Math.PI * 2;
    return [Math.cos(angle), Math.sin(angle)];
  });

  const VERT = `
    precision highp float;
    attribute vec2 aUv;
    uniform vec2 uCorners[4];
    uniform vec2 uOffset;
    uniform vec2 uPad;
    uniform vec2 uCanvas;
    uniform float uAngle;
    uniform float uFw;
    uniform float uFh;
    uniform vec2 uFrameOrigin;
    uniform vec2 uSheetSize;
    varying vec2 vUv;
    void main() {
      // bilinear warp: corners are TL, TR, BL, BR offsets from rest
      float u = aUv.x;
      float v = aUv.y;
      vec2 c0 = vec2(-uFw * 0.5, 0.0) + uCorners[0];
      vec2 c1 = vec2( uFw * 0.5, 0.0) + uCorners[1];
      vec2 c2 = vec2(-uFw * 0.5, uFh) + uCorners[2];
      vec2 c3 = vec2( uFw * 0.5, uFh) + uCorners[3];
      vec2 p = mix(mix(c0, c1, u), mix(c2, c3, u), v);
      float c = cos(uAngle);
      float s = sin(uAngle);
      p = mat2(c, s, -s, c) * p;
      p += uOffset;
      p += uPad;
      vUv = (uFrameOrigin + aUv * vec2(uFw, uFh)) / uSheetSize;
      gl_Position = vec4(p.x / (uCanvas.x * 0.5), 1.0 - 2.0 * p.y / uCanvas.y, 0.0, 1.0);
    }
  `;

  const FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uWhite;
    uniform vec3 uStrokeColor;
    void main() {
      // Every dial index is drawn as one complete image; there is no
      // interpolation with its neighboring sequence frame.
      vec4 t = texture2D(uTex, vUv);
      // The outline uses a binary alpha cutout, so its repeated silhouette
      // passes union into an opaque contour rather than translucent texture.
      // Alpha-dilation rationale: https://stackoverflow.com/questions/69946718/variable-width-outline-effect-around-a-texture-in-2d
      float outlineAlpha = t.a > 0.08 ? 1.0 : 0.0;
      float alpha = mix(t.a, outlineAlpha, uWhite);
      gl_FragColor = vec4(mix(t.rgb, uStrokeColor, uWhite), alpha);
    }
  `;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("jelly-gl shader:", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function create(canvas, frames) {
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true }) ||
               canvas.getContext("experimental-webgl", { alpha: true, antialias: true });
    if (!gl) return null;

    const vert = compile(gl, gl.VERTEX_SHADER, VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vert || !frag) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("jelly-gl link:", gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);

    const n = MESH;
    const uvs = [];
    for (let r = 0; r <= n; r += 1) {
      for (let c = 0; c <= n; c += 1) uvs.push(c / n, r / n);
    }
    const indices = [];
    const stride = n + 1;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const a = r * stride + c;
        indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(program, "aUv");
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const u = (name) => gl.getUniformLocation(program, name);
    const loc = {
      corners: u("uCorners"), angle: u("uAngle"), offset: u("uOffset"),
      white: u("uWhite"), strokeColor: u("uStrokeColor"),
      pad: u("uPad"), canvasSize: u("uCanvas"),
      fw: u("uFw"), fh: u("uFh"), frameOrigin: u("uFrameOrigin"),
      sheetSize: u("uSheetSize"), tex: u("uTex"),
    };
    gl.uniform1f(loc.fw, frames.fw);
    gl.uniform1f(loc.fh, frames.fh);
    gl.uniform1i(loc.tex, 0);
    // transparent margin around the frame (canvas is bigger than the frame)
    const pad = Math.max(0, (canvas.width - frames.fw) / 2);
    gl.uniform2f(loc.pad, pad, pad);
    gl.uniform2f(loc.canvasSize, canvas.width, canvas.height);

    const texture = gl.createTexture();
    let uploaded = false;

    function uploadTexture(sheet) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
      // sheet is non-power-of-two: clamp + linear, no mipmaps
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      uploaded = true;
    }

    const cornerBuf = new Float32Array(8);

    // draw(state): state.corners [{x,y} x4] (TL, TR, BL, BR, px offsets),
    // state.angle, state.stroke (outline radius px; 0 = none), state.frameF,
    // state.cols, state.count, state.fw, state.fh, state.sheet
    const draw = function draw(state) {
      // file:// pages taint WebGL textures (cross-origin image data); a throw
      // here would kill the shared rAF loop every frame, so mark the renderer
      // failed and let dangle.js fall back to the canvas-2D path instead.
      try {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const sheet = state.sheet;
        if (!sheet.complete || !sheet.naturalWidth) return;
      if (!uploaded) uploadTexture(sheet);

      // The dial may be fractional, but rendering always clips to one exact
      // sequence image. This keeps the moving colored contour crisp.
      const frameF = ((state.frameF % state.count) + state.count) % state.count;
      const index = Math.floor(frameF);
      gl.uniform2f(loc.frameOrigin,
        (index % state.cols) * state.fw,
        Math.floor(index / state.cols) * state.fh);
      gl.uniform2f(loc.sheetSize, sheet.naturalWidth, sheet.naturalHeight);
      for (let i = 0; i < 4; i += 1) {
        cornerBuf[i * 2] = state.corners[i].x;
        cornerBuf[i * 2 + 1] = state.corners[i].y;
      }
      gl.uniform2fv(loc.corners, cornerBuf);
      gl.uniform1f(loc.angle, state.quadAngle || 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      // Render the alpha-only silhouette under the exact source image.
      const stroke = state.stroke || 0;
      if (stroke > 0.4) {
        gl.uniform3fv(loc.strokeColor, state.strokeRgb || [1, 1, 1]);
        gl.uniform1f(loc.white, 1);
        for (let i = 0; i < TAPS; i += 1) {
          gl.uniform2f(loc.offset, TAP_DIRS[i][0] * stroke, TAP_DIRS[i][1] * stroke);
          gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        gl.uniform2f(loc.offset, 0, 0);
        gl.uniform1f(loc.white, 0);
      }
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
      } catch (err) {
        draw.failed = true;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    };
    draw.failed = false;
    return draw;
  }

  return { create, MESH };
})();
