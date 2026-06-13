/* ─────────────────────────────────────────────────────────────────────────────
 * hero3d.js — decorative 3D / WebGL background layers for the landing hero.
 *
 * Non-invasive: every layer is injected as an absolutely-positioned element with
 * z-index 0 and pointer-events:none, sitting BEHIND existing content (which is
 * z-index 1+). Nothing here changes copy, colours, fonts, layout or buttons.
 *
 * Anchors (added in HomePage.tsx as invisible data attributes):
 *   [data-h3d="hero"]      hero <section>          → #1 drifting fog orbs (CSS blur)
 *   [data-h3d="dash"]      dashboard card wrapper  → #2 Three.js particle field
 *   [data-h3d="stats"]     stats strip             → #3 Three.js rising 3D bars
 *   [data-h3d="cashbars"]  cash-position bar row   → #4 CSS perspective tilt + glow
 *
 * Three.js r128 is loaded from CDN on demand for the WebGL pieces (#2, #3).
 * If the CDN is blocked, the CSS layers (#1, #4) still render.
 * ───────────────────────────────────────────────────────────────────────────── */

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

// Exact palette supplied for the animations (independent of the page's own tokens)
const ACCENT = "#C8D44E"; // primary lime
const ACCENT_HEX = 0xc8d44e;
const SURFACE = "#2A3015"; // surface olive
const SURFACE_HEX = 0x2a3015;
const WARN_RGB = "200, 81, 42"; // #C8512A warning red-orange

let threePromise = null;
function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (threePromise) return threePromise;
  threePromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = THREE_CDN;
    s.async = true;
    s.onload = () => resolve(window.THREE);
    s.onerror = () => reject(new Error("Three.js CDN failed to load"));
    document.head.appendChild(s);
  });
  return threePromise;
}

function injectStyles(add) {
  if (document.getElementById("h3d-style")) return;
  const style = document.createElement("style");
  style.id = "h3d-style";
  style.textContent = `
    @keyframes h3d-glow {
      0%, 100% { box-shadow: 0 0 0 rgba(${WARN_RGB}, 0); }
      50%      { box-shadow: 0 0 12px 2px rgba(${WARN_RGB}, 0.7); }
    }
  `;
  document.head.appendChild(style);
  add(() => style.remove());
}

/* ── #1 Hero fog orbs — large soft blurred blobs drifting on long loops ──────── */
function initFog(add) {
  const hero = document.querySelector('[data-h3d="hero"]');
  if (!hero) return;
  hero.querySelectorAll('[data-h3d-layer="fog"]').forEach(n => n.remove());

  const layer = document.createElement("div");
  layer.setAttribute("data-h3d-layer", "fog");
  Object.assign(layer.style, {
    position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none", overflow: "hidden",
  });

  const orbs = [
    { c: ACCENT,  size: 560, x: 10, y: 18, op: 0.10, ax: 60, ay: 42, dur: 13, ph: 0.0 },
    { c: SURFACE, size: 680, x: 64, y: 28, op: 0.12, ax: 52, ay: 70, dur: 16, ph: 1.5 },
    { c: ACCENT,  size: 440, x: 42, y: 60, op: 0.07, ax: 82, ay: 50, dur: 11, ph: 3.0 },
    { c: SURFACE, size: 520, x: 82, y: 72, op: 0.09, ax: 56, ay: 46, dur: 15, ph: 4.5 },
    { c: ACCENT,  size: 600, x: 22, y: 82, op: 0.06, ax: 72, ay: 60, dur: 14, ph: 2.0 },
  ];
  const els = orbs.map(o => {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", left: o.x + "%", top: o.y + "%",
      width: o.size + "px", height: o.size + "px", borderRadius: "50%",
      background: o.c, filter: "blur(80px)", opacity: String(o.op),
      mixBlendMode: "screen", transform: "translate(-50%, -50%)", willChange: "transform",
    });
    layer.appendChild(d);
    return d;
  });
  hero.appendChild(layer);

  let raf = 0, start = 0;
  const tick = (t) => {
    if (!start) start = t;
    const sec = (t - start) / 1000;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      const a = (sec / o.dur + o.ph) * Math.PI * 2;
      const dx = Math.sin(a) * o.ax;
      const dy = Math.cos(a * 0.8) * o.ay;
      els[i].style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  add(() => { cancelAnimationFrame(raf); layer.remove(); });
}

/* ── #4 Cash-position chart — perspective tilt + glow pulse on warning bars ──── */
function initCashTilt(add) {
  const row = document.querySelector('[data-h3d="cashbars"]');
  if (!row) return;
  const prev = { transform: row.style.transform, transition: row.style.transition, ts: row.style.transformStyle };
  row.style.transformStyle = "preserve-3d";
  row.style.transition = "transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)";
  requestAnimationFrame(() => { row.style.transform = "perspective(800px) rotateX(8deg)"; });

  const glowed = [];
  Array.from(row.children).forEach(ch => {
    const bg = getComputedStyle(ch).backgroundColor;
    // The existing warning bars are #E24B4A = rgb(226, 75, 74)
    if (bg === "rgb(226, 75, 74)") {
      ch.style.animation = "h3d-glow 1.8s ease-in-out infinite";
      glowed.push(ch);
    }
  });

  add(() => {
    row.style.transform = prev.transform;
    row.style.transition = prev.transition;
    row.style.transformStyle = prev.ts;
    glowed.forEach(ch => { ch.style.animation = ""; });
  });
}

/* ── #2 Dashboard particle field — 300 lime points drifting slowly upward ────── */
function initParticles(THREE, add, isDisposed) {
  const anchor = document.querySelector('[data-h3d="dash"]');
  if (!anchor || isDisposed()) return;
  anchor.querySelectorAll('[data-h3d-canvas="dash"]').forEach(n => n.remove());

  // Keep the card painting above the canvas
  Array.from(anchor.children).forEach(ch => {
    if (ch.tagName !== "CANVAS") {
      if (getComputedStyle(ch).position === "static") ch.style.position = "relative";
      ch.style.zIndex = "1";
    }
  });

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-h3d-canvas", "dash");
  Object.assign(canvas.style, {
    position: "absolute", top: "-50px", left: "-50px",
    width: "calc(100% + 100px)", height: "calc(100% + 100px)",
    zIndex: "0", pointerEvents: "none",
  });
  anchor.insertBefore(canvas, anchor.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.z = 60;

  const N = 300, RANGE_X = 90, RANGE_Y = 80, RANGE_Z = 40;
  const positions = new Float32Array(N * 3);
  const speeds = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * RANGE_X;
    positions[i * 3 + 1] = (Math.random() - 0.5) * RANGE_Y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * RANGE_Z;
    speeds[i] = 0.04 + Math.random() * 0.09;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: ACCENT_HEX, size: 0.85, transparent: true, opacity: 0.3,
    sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const resize = () => {
    const r = anchor.getBoundingClientRect();
    const w = Math.max(1, r.width + 100), h = Math.max(1, r.height + 100);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  let raf = 0;
  const tick = () => {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] += speeds[i];
      if (arr[i * 3 + 1] > RANGE_Y / 2) arr[i * 3 + 1] = -RANGE_Y / 2;
    }
    geo.attributes.position.needsUpdate = true;
    points.rotation.y += 0.0006;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  add(() => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    geo.dispose(); mat.dispose(); renderer.dispose();
    canvas.remove();
  });
}

/* ── #3 Stats strip — 3D bars rise (cubic ease, staggered) on scroll-in ──────── */
function initStatsBars(THREE, add, isDisposed) {
  const anchor = document.querySelector('[data-h3d="stats"]');
  if (!anchor || isDisposed()) return;
  anchor.querySelectorAll('[data-h3d-canvas="stats"]').forEach(n => n.remove());

  const prevPos = anchor.style.position, prevOv = anchor.style.overflow;
  if (getComputedStyle(anchor).position === "static") anchor.style.position = "relative";
  anchor.style.overflow = "hidden";
  Array.from(anchor.children).forEach(ch => {
    if (ch.tagName !== "CANVAS") {
      if (getComputedStyle(ch).position === "static") ch.style.position = "relative";
      ch.style.zIndex = "1";
    }
  });

  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-h3d-canvas", "stats");
  Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", zIndex: "0", pointerEvents: "none" });
  anchor.insertBefore(canvas, anchor.firstChild);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 4, 0.1, 100);
  camera.position.set(0, 3.4, 11);
  camera.lookAt(0, 1.1, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 9, 6);
  scene.add(dir);

  // Olive floor
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(15, 0.3, 4),
    new THREE.MeshStandardMaterial({ color: SURFACE_HEX, transparent: true, opacity: 0.5, roughness: 0.9 }),
  );
  floor.position.y = -0.15;
  scene.add(floor);

  // Four lime bars
  const heights = [2.4, 3.2, 2.0, 3.9];
  const bars = heights.map((h, i) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1, 1.5),
      new THREE.MeshStandardMaterial({ color: ACCENT_HEX, transparent: true, opacity: 0.92, emissive: 0x2a3410, emissiveIntensity: 0.45, roughness: 0.5 }),
    );
    mesh.position.x = -5.4 + i * 3.6;
    mesh.scale.y = 0.0001;
    mesh.position.y = 0;
    mesh.userData.target = h;
    scene.add(mesh);
    return mesh;
  });

  const resize = () => {
    const r = anchor.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  let triggered = false, startTime = 0;
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !triggered) { triggered = true; startTime = performance.now(); }
  }, { threshold: 0.3 });
  io.observe(anchor);

  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const STAGGER = 200, DUR = 1200;
  let raf = 0;
  const tick = (now) => {
    if (triggered) {
      for (let i = 0; i < bars.length; i++) {
        const local = now - startTime - i * STAGGER;
        const p = Math.max(0, Math.min(1, local / DUR));
        const h = bars[i].userData.target * easeOutCubic(p);
        bars[i].scale.y = Math.max(0.0001, h);
        bars[i].position.y = h / 2;
      }
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  add(() => {
    cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener("resize", resize);
    renderer.dispose();
    canvas.remove();
    anchor.style.position = prevPos;
    anchor.style.overflow = prevOv;
  });
}

/* ── Shared helpers for section-wide decorations ─────────────────────────────── */
function hexA(hex, a) {
  const h = hex.replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
}

// Insert a decorative layer/canvas as the first child, behind existing content.
function mountBehind(anchor, layer) {
  if (getComputedStyle(anchor).position === "static") anchor.style.position = "relative";
  Object.assign(layer.style, { position: "absolute", inset: "0", zIndex: "0", pointerEvents: "none", overflow: "hidden" });
  // Lift existing content above the decorative layer so it's never obscured.
  Array.from(anchor.children).forEach(ch => {
    if (ch === layer || ch.nodeType !== 1) return;
    if (getComputedStyle(ch).position === "static") ch.style.position = "relative";
    if (!ch.style.zIndex) ch.style.zIndex = "1";
  });
  anchor.insertBefore(layer, anchor.firstChild);
}

/* Drifting blurred glow orbs — for dark sections (screen blend). */
function mountOrbs(anchor, add, count = 3) {
  anchor.querySelectorAll('[data-h3d-layer="deco-orbs"]').forEach(n => n.remove());
  const layer = document.createElement("div");
  layer.setAttribute("data-h3d-layer", "deco-orbs");
  const palette = ["#C8D44E", "#8A9E2A", "#2A3015"];
  const orbs = Array.from({ length: count }, (_, i) => ({
    c: palette[i % palette.length],
    size: 280 + (i * 97) % 220, x: (i * 43 + 12) % 86, y: (i * 57 + 10) % 76,
    op: 0.06 + (i % 3) * 0.02, ax: 38 + (i * 17) % 46, ay: 30 + (i * 23) % 44,
    dur: 12 + (i * 3) % 6, ph: i * 1.4,
  }));
  const els = orbs.map(o => {
    const d = document.createElement("div");
    Object.assign(d.style, {
      position: "absolute", left: o.x + "%", top: o.y + "%", width: o.size + "px", height: o.size + "px",
      borderRadius: "50%", background: o.c, filter: "blur(70px)", opacity: String(o.op),
      mixBlendMode: "screen", transform: "translate(-50%, -50%)", willChange: "transform",
    });
    layer.appendChild(d); return d;
  });
  mountBehind(anchor, layer);
  let raf = 0, start = 0;
  const tick = (t) => {
    if (!start) start = t;
    const s = (t - start) / 1000;
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i], a = (s / o.dur + o.ph) * Math.PI * 2;
      els[i].style.transform = `translate(calc(-50% + ${Math.sin(a) * o.ax}px), calc(-50% + ${Math.cos(a * 0.8) * o.ay}px))`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  add(() => { cancelAnimationFrame(raf); layer.remove(); });
}

/* Floating wireframe shapes rotating in 3D perspective — light or dark sections. */
function mountShapes(anchor, add, tone = "light", count = 7) {
  anchor.querySelectorAll('[data-h3d-layer="deco-shapes"]').forEach(n => n.remove());
  const layer = document.createElement("div");
  layer.setAttribute("data-h3d-layer", "deco-shapes");
  layer.style.perspective = "700px";
  const colors = ["#8A9E2A", "#C8D44E"];
  const alpha = tone === "dark" ? 0.5 : 0.3;
  const shapes = Array.from({ length: count }, (_, i) => {
    const kind = i % 3; // 0 square · 1 diamond · 2 ring
    const size = 30 + (i * 19) % 64;
    const color = colors[i % colors.length];
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "absolute", left: ((i * 41 + 8) % 86) + "%", top: ((i * 29 + 7) % 78) + "%",
      width: size + "px", height: size + "px", border: `1.5px solid ${hexA(color, alpha)}`,
      borderRadius: kind === 2 ? "50%" : "5px", transformStyle: "preserve-3d", willChange: "transform",
    });
    layer.appendChild(el);
    return { el, baseZ: kind === 1 ? 45 : 0, rx: 0.2 + (i % 3) * 0.14, ry: 0.24 + (i % 4) * 0.11,
      sp: 7 + (i * 5) % 9, ph: i * 0.7, ax: 16 + (i * 7) % 22, ay: 12 + (i * 9) % 18, dur: 10 + (i * 3) % 8 };
  });
  mountBehind(anchor, layer);
  let raf = 0, start = 0;
  const tick = (t) => {
    if (!start) start = t;
    const s = (t - start) / 1000;
    for (const sh of shapes) {
      const rotX = (s * (360 / sh.sp) * sh.rx) % 360;
      const rotY = (s * (360 / sh.sp) * sh.ry) % 360;
      const a = (s / sh.dur + sh.ph) * Math.PI * 2;
      const dx = Math.sin(a) * sh.ax, dy = Math.cos(a * 0.9) * sh.ay;
      sh.el.style.transform = `translate3d(calc(-50% + ${dx}px), calc(-50% + ${dy}px), 0) rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${sh.baseZ}deg)`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  add(() => { cancelAnimationFrame(raf); layer.remove(); });
}

/* Rotating wireframe icosahedron (Three.js) — centrepiece for the final CTA. */
function mountWire(THREE, anchor, add, isDisposed) {
  if (!anchor || isDisposed()) return;
  anchor.querySelectorAll('[data-h3d-canvas="wire"]').forEach(n => n.remove());
  const canvas = document.createElement("canvas");
  canvas.setAttribute("data-h3d-canvas", "wire");
  canvas.style.width = "100%"; canvas.style.height = "100%";
  mountBehind(anchor, canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.z = 5;
  const geo = new THREE.IcosahedronGeometry(2.1, 1);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: ACCENT_HEX, transparent: true, opacity: 0.26 }));
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 0), new THREE.MeshBasicMaterial({ color: ACCENT_HEX, transparent: true, opacity: 0.05 }));
  scene.add(wire); scene.add(inner);
  const resize = () => {
    const r = anchor.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  };
  resize(); window.addEventListener("resize", resize);
  let raf = 0;
  const tick = () => {
    wire.rotation.x += 0.0015; wire.rotation.y += 0.0022;
    inner.rotation.x -= 0.001; inner.rotation.y -= 0.0016;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  add(() => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); geo.dispose(); renderer.dispose(); canvas.remove(); });
}

/* Interactive 3D tilt — cards follow the cursor in perspective. Hover devices only. */
function initTilt(add) {
  if (!(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches)) return;
  const cards = Array.from(document.querySelectorAll("[data-h3d-tilt]"));
  const TILT = 6; // max degrees each axis
  const bound = [];
  cards.forEach(card => {
    let prevTransition = "";
    const onEnter = () => {
      prevTransition = card.style.transition;
      card.style.transition = "transform 0.1s ease-out";
      card.style.willChange = "transform";
      card.style.transformStyle = "preserve-3d";
    };
    const onMove = (e) => {
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const ry = px * 2 * TILT;
      const rx = -py * 2 * TILT;
      card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(10px)`;
    };
    const onLeave = () => {
      card.style.transition = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
      card.style.transform = "";
      window.setTimeout(() => { card.style.transition = prevTransition; }, 520);
    };
    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerleave", onLeave);
    bound.push([card, onEnter, onMove, onLeave]);
  });
  add(() => bound.forEach(([c, en, mv, lv]) => {
    c.removeEventListener("pointerenter", en);
    c.removeEventListener("pointermove", mv);
    c.removeEventListener("pointerleave", lv);
    c.style.transform = "";
  }));
}

// Apply CSS decorations to every tagged section.
function mountSections(add) {
  document.querySelectorAll("[data-h3d-deco]").forEach(el => {
    const v = el.getAttribute("data-h3d-deco");
    if (v === "orbs") mountOrbs(el, add, 3);
    else if (v === "shapes-light") mountShapes(el, add, "light", 7);
    else if (v === "shapes-dark") mountShapes(el, add, "dark", 7);
  });
}

export function initHero3D() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  // Respect reduced-motion: add nothing at all.
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const cleanups = [];
  const add = (fn) => cleanups.push(fn);
  let disposed = false;
  const isDisposed = () => disposed;

  injectStyles(add);
  initFog(add);
  initCashTilt(add);
  mountSections(add);   // CSS 3D decorations across every tagged section
  initTilt(add);        // interactive 3D tilt on content cards

  loadThree()
    .then((THREE) => {
      if (disposed || !THREE) return;
      initParticles(THREE, add, isDisposed);
      initStatsBars(THREE, add, isDisposed);
      document.querySelectorAll('[data-h3d-deco="wire"]').forEach(el => mountWire(THREE, el, add, isDisposed));
    })
    .catch(() => { /* CDN blocked — CSS layers remain active */ });

  return () => {
    disposed = true;
    cleanups.forEach((fn) => { try { fn(); } catch (_e) { /* ignore */ } });
    cleanups.length = 0;
  };
}
