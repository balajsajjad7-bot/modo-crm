"use client";
// Plasma background (WebGL2 via OGL), adapted for a full-screen CRM backdrop:
// renders at reduced resolution and ~30 fps so office PCs stay smooth, tracks the mouse on the whole window,
// changes colour without restarting, and draws one still frame for people who prefer reduced motion.
import { useEffect, useRef } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";

const hexToRgb = (hex) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [1, 0.42, 0.21];
};

const vertex = `#version 300 es
precision highp float;
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uCustomColor;
uniform float uUseCustomColor;
uniform float uSpeed;
uniform float uDirection;
uniform float uScale;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseInteractive;
out vec4 fragColor;

void mainImage(out vec4 o, vec2 C) {
  vec2 center = iResolution.xy * 0.5;
  C = (C - center) / uScale + center;
  vec2 mouseOffset = (uMouse - center) * 0.0002;
  C += mouseOffset * length(C - center) * step(0.5, uMouseInteractive);
  float i, d, z, T = iTime * uSpeed * uDirection;
  vec3 O, p, S;
  for (vec2 r = iResolution.xy, Q; ++i < 60.; O += o.w/d*o.xyz) {
    p = z*normalize(vec3(C-.5*r,r.y));
    p.z -= 4.;
    S = p;
    d = p.y-T;
    p.x += .4*(1.+p.y)*sin(d + p.x*0.1)*cos(.34*d + p.x*0.05);
    Q = p.xz *= mat2(cos(p.y+vec4(0,11,33,0)-T));
    z+= d = abs(sqrt(length(Q*Q)) - .25*(5.+S.y))/3.+8e-4;
    o = 1.+sin(S.y+p.z*.5+S.z-length(S-p)+vec4(2,1,0,8));
  }
  o.xyz = tanh(O/1e4);
}
bool finite1(float x){ return !(isnan(x) || isinf(x)); }
vec3 sanitize(vec3 c){ return vec3(finite1(c.r)?c.r:0.0, finite1(c.g)?c.g:0.0, finite1(c.b)?c.b:0.0); }
void main() {
  vec4 o = vec4(0.0);
  mainImage(o, gl_FragCoord.xy);
  vec3 rgb = sanitize(o.rgb);
  float intensity = (rgb.r + rgb.g + rgb.b) / 3.0;
  vec3 customColor = intensity * uCustomColor;
  vec3 finalColor = mix(rgb, customColor, step(0.5, uUseCustomColor));
  float alpha = length(rgb) * uOpacity;
  fragColor = vec4(finalColor, alpha);
}`;

export default function Plasma({ color = "#ff6b35", speed = 1, direction = "forward", scale = 1, opacity = 1, mouseInteractive = true, quality = 0.5, fps = 30, onFail }) {
  const ref = useRef(null);
  const prog = useRef(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let renderer;
    try { renderer = new Renderer({ webgl: 2, alpha: true, antialias: false, dpr: Math.min(window.devicePixelRatio || 1, 2) * quality }); }
    catch { onFail?.(); return; }
    const gl = renderer.gl;
    if (!gl || !(gl instanceof WebGL2RenderingContext)) { onFail?.(); return; }
    const canvas = gl.canvas;
    Object.assign(canvas.style, { display: "block", width: "100%", height: "100%" });
    el.appendChild(canvas);

    let program;
    try {
      program = new Program(gl, { vertex, fragment, transparent: true, uniforms: {
        iTime: { value: 0 }, iResolution: { value: new Float32Array([1, 1]) },
        uCustomColor: { value: new Float32Array(hexToRgb(color)) }, uUseCustomColor: { value: color ? 1 : 0 },
        uSpeed: { value: speed * 0.4 }, uDirection: { value: direction === "reverse" ? -1 : 1 }, uScale: { value: scale },
        uOpacity: { value: opacity }, uMouse: { value: new Float32Array([0, 0]) }, uMouseInteractive: { value: mouseInteractive ? 1 : 0 },
      } });
    } catch { el.removeChild(canvas); onFail?.(); return; }
    prog.current = program;
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const setSize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(Math.max(1, Math.floor(r.width)), Math.max(1, Math.floor(r.height)));
      const res = program.uniforms.iResolution.value; res[0] = gl.drawingBufferWidth; res[1] = gl.drawingBufferHeight;
    };
    const ro = new ResizeObserver(setSize); ro.observe(el); setSize();

    // If the graphics driver resets (sleep, low memory, too many tabs), stop and fall back to the CSS aurora
    // instead of leaving a frozen/black page.
    let lost = false, raf = 0;
    const onLost = (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); onFail?.(); };
    canvas.addEventListener("webglcontextlost", onLost, false);

    // Mouse anywhere on the page gently bends the plasma (the layer itself sits behind the UI).
    const onMove = (e) => {
      const r = el.getBoundingClientRect(); const k = gl.drawingBufferWidth / Math.max(1, r.width);
      const m = program.uniforms.uMouse.value; m[0] = (e.clientX - r.left) * k; m[1] = (r.height - (e.clientY - r.top)) * k;
    };
    if (mouseInteractive) window.addEventListener("pointermove", onMove, { passive: true });

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let last = 0; const t0 = performance.now(), frame = 1000 / fps;
    const loop = (t) => {
      if (lost) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return; // don't burn the GPU in a background tab
      if (t - last < frame) return; last = t;
      let time = (t - t0) * 0.001;
      if (direction === "pingpong") { const seg = time % 20; time = seg > 10 ? 20 - seg : seg; }
      program.uniforms.iTime.value = time;
      try { renderer.render({ scene: mesh }); } catch { lost = true; cancelAnimationFrame(raf); onFail?.(); }
    };
    if (still) { program.uniforms.iTime.value = 6; renderer.render({ scene: mesh }); }
    else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); canvas.removeEventListener("webglcontextlost", onLost);
      window.removeEventListener("pointermove", onMove);
      try { el.removeChild(canvas); } catch {}
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      prog.current = null;
    };
  }, [speed, direction, scale, mouseInteractive, quality, fps]); // eslint-disable-line

  // Colour and opacity change live, without rebuilding WebGL.
  useEffect(() => { if (prog.current) { prog.current.uniforms.uCustomColor.value.set(hexToRgb(color)); prog.current.uniforms.uUseCustomColor.value = color ? 1 : 0; } }, [color]);
  useEffect(() => { if (prog.current) prog.current.uniforms.uOpacity.value = opacity; }, [opacity]);

  return <div ref={ref} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }} />;
}
