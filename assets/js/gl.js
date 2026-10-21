/* ==========================================================================
   ENCLAVE® — Hero WebGL : noyau chiffré entouré de trois anneaux (raymarching)
   ========================================================================== */
(function () {
  'use strict';

  const VERT = `
    attribute vec2 p;
    void main(){ gl_Position = vec4(p, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform vec2 uShift;
    uniform float uScale;
    uniform float uScroll;

    mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    float sdTorus(vec3 p, vec2 t){ vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }

    vec2 map(vec3 p){
      float t = uTime;
      p /= uScale;
      p.xz *= rot(uMouse.x * .55 + uScroll * 1.4);
      p.yz *= rot(-uMouse.y * .4 + uScroll * .6);

      vec3 c = p; c.xy *= rot(t * .2);
      float disp = sin(c.x * 5. + t * 1.1) * sin(c.y * 5. + t * .9) * sin(c.z * 5. + t * 1.3);
      vec2 res = vec2(length(p) - (.56 + disp * .03), 0.);

      vec3 a = p; a.yz *= rot(t * .42); a.xy *= rot(.35);
      float ra = sdTorus(a, vec2(.92, .032));
      if (ra < res.x) res = vec2(ra, 1.);

      vec3 b = p; b.xz *= rot(t * .3); b.xy *= rot(1.25 + t * .21);
      float rb = sdTorus(b, vec2(1.16, .024));
      if (rb < res.x) res = vec2(rb, 2.);

      vec3 d = p; d.yz *= rot(1.1 - t * .27); d.xz *= rot(t * .17);
      float rd = sdTorus(d, vec2(1.38, .018));
      if (rd < res.x) res = vec2(rd, 3.);

      res.x *= uScale;
      return res;
    }

    vec3 calcN(vec3 p){
      const vec2 k = vec2(1., -1.);
      const float h = .0009;
      return normalize(
        k.xyy * map(p + k.xyy * h).x + k.yyx * map(p + k.yyx * h).x +
        k.yxy * map(p + k.yxy * h).x + k.xxx * map(p + k.xxx * h).x);
    }

    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main(){
      vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
      vec2 q = uv - uShift;

      vec3 ro = vec3(0., 0., 5.5);
      vec3 rd = normalize(vec3(q, -1.6));

      vec3 bg = vec3(.043, .039, .035);
      bg += vec3(.62, .46, .24) * .2 * exp(-2.3 * length(q - vec2(.04, .06)));
      bg += vec3(.84, .70, .44) * .03 * exp(-2.6 * length(q + vec2(.25, .3)));

      float t = 0.;
      vec2 h = vec2(0.);
      float glowC = 0., glowL = 0.;
      bool hit = false;
      for (int i = 0; i < 90; i++) {
        vec3 p = ro + rd * t;
        h = map(p);
        if (h.y < .5) glowC += .0028 / (.014 + h.x * h.x);
        else if (h.y < 1.5) glowL += .0007 / (.003 + h.x * h.x);
        if (h.x < .0012) { hit = true; break; }
        t += h.x * .92;
        if (t > 9.) break;
      }

      vec3 col = bg;
      if (hit) {
        vec3 p = ro + rd * t;
        vec3 n = calcN(p);
        vec3 v = -rd;
        vec3 l = normalize(vec3(.5, .8, .6));
        float dif = clamp(dot(n, l), 0., 1.);
        float ndv = clamp(dot(n, v), 0., 1.);
        float fre = pow(1. - ndv, 3.);
        float rim = pow(1. - ndv, 5.);
        float spe = pow(clamp(dot(reflect(-l, n), v), 0., 1.), 48.);

        if (h.y < .5) {
          vec3 deep = vec3(.05, .04, .03);
          vec3 mid  = vec3(.36, .27, .15);
          vec3 base = mix(deep, mid, .5 + .5 * n.y);
          vec3 irid = vec3(1., .84, .58) * (.6 + .4 * cos(6.2831 * fre * 1.15 + uTime * .25));
          col = base * (.25 + .75 * dif) + irid * fre * .55 + vec3(.95, .80, .52) * rim * .9 + vec3(1., .95, .85) * spe * .8;
        } else if (h.y < 1.5) {
          col = vec3(.84, .68, .40) * (.45 + .65 * dif) + vec3(1., .93, .78) * fre * .35 + vec3(1., .95, .85) * spe;
        } else {
          vec3 lav = vec3(.93, .89, .82);
          col = lav * (.14 + .5 * dif) + lav * fre * .45 + spe * .9;
        }
        col = mix(col, bg, smoothstep(4.5, 8., t) * .5);
      }

      col += vec3(.78, .58, .30) * glowC * .045;
      col += vec3(.90, .74, .45) * glowL * .012;

      col *= 1. - .38 * dot(uv * .85, uv * .85);
      col += (hash(gl_FragCoord.xy + fract(uTime) * 91.) - .5) * .028;
      col = pow(col, vec3(.95));
      gl_FragColor = vec4(col, 1.);
    }
  `;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('[ENCLAVE] shader', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function init(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) return null;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ['uRes', 'uTime', 'uMouse', 'uShift', 'uScale', 'uScroll'].forEach((n) => (u[n] = gl.getUniformLocation(prog, n)));

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const state = { mx: 0, my: 0, tx: 0, ty: 0, scroll: 0, visible: true, quality: 1, frames: 0, acc: 0, raf: 0, last: 0, time: 0 };

    function layout() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const mobile = w < 760;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.25) * state.quality;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      const aspect = w / h;
      if (mobile || aspect < 1) {
        gl.uniform2f(u.uShift, 0, .25);
        gl.uniform1f(u.uScale, .66);
      } else {
        gl.uniform2f(u.uShift, Math.min(.44, aspect * .27), .07);
        gl.uniform1f(u.uScale, .86);
      }
      if (reduce) drawStill();
    }

    function drawStill() {
      gl.uniform1f(u.uTime, 4);
      gl.uniform2f(u.uMouse, 0, 0);
      gl.uniform1f(u.uScroll, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function frame(now) {
      state.raf = requestAnimationFrame(frame);
      if (!state.visible) { state.last = now; return; }
      const dt = state.last ? Math.min(now - state.last, 50) : 16;
      state.last = now;
      state.time += dt / 1000;

      // Qualité adaptative : on baisse la résolution si l'appareil peine.
      if (state.frames < 90) {
        state.frames++;
        if (state.frames > 20) state.acc += dt;
        if (state.frames === 90 && state.acc / 70 > 24 && state.quality > .6) {
          state.quality = .62;
          layout();
        }
      }

      state.mx += (state.tx - state.mx) * .05;
      state.my += (state.ty - state.my) * .05;
      gl.uniform1f(u.uTime, state.time);
      gl.uniform2f(u.uMouse, state.mx, state.my);
      gl.uniform1f(u.uScroll, state.scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    layout();
    window.addEventListener('resize', layout, { passive: true });
    window.addEventListener('pointermove', (e) => {
      state.tx = (e.clientX / window.innerWidth) * 2 - 1;
      state.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    new IntersectionObserver(([entry]) => { state.visible = entry.isIntersecting; }).observe(canvas);

    if (!reduce) state.raf = requestAnimationFrame(frame);

    return {
      setScroll(v) { state.scroll = v; },
    };
  }

  window.EnclaveGL = { init };
})();
