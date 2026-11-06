const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  )
export const motionTemplate = (
  headline: string,
  accent = "#f6b96d",
  duration = 6,
  audio = false,
) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;overflow:hidden;background:#143c32;font-family:Arial,sans-serif}#motion{width:864px;height:1080px;position:relative;padding:90px;color:#f6f3e9;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.orb{position:absolute;width:600px;height:600px;border-radius:50%;background:${/^#[a-fA-F0-9]{6}$/.test(accent) ? accent : "#f6b96d"};top:-200px;right:-280px}.brand{position:absolute;top:80px;letter-spacing:4px;font-size:24px}.title{font-size:96px;letter-spacing:-6px;line-height:1.05;margin:0;max-width:680px}.rule{height:8px;width:160px;background:${/^#[a-fA-F0-9]{6}$/.test(accent) ? accent : "#f6b96d"};margin:40px 0;transform-origin:left}.caption{font-size:28px;line-height:1.5}.footer{position:absolute;bottom:80px;font-size:24px}</style><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script></head>
<body><main id="motion" data-composition-id="motion" data-width="864" data-height="1080" data-duration="${duration}"><div class="orb"></div><div class="brand">CREATIVEOTTER ✳</div><h1 class="title">${escape(headline)}</h1><div class="rule"></div><div class="caption">Good ideas. Great company.</div><div class="footer">Make your next move.</div>${audio ? `<audio id="music" src="assets/music.wav" data-start="0" data-duration="${duration}" data-volume="0.25"></audio>` : ""}</main>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.fromTo('.title',{y:110,opacity:0},{y:0,opacity:1,duration:.9,ease:'power3.out'},.2).fromTo('.rule',{scaleX:0},{scaleX:1,duration:.7},.7).fromTo('.caption',{y:30,opacity:0},{y:0,opacity:1,duration:.7},1).fromTo('.footer',{opacity:0},{opacity:1,duration:.6},1.4).fromTo('.orb',{x:0,y:0,scale:.85},{x:-140,y:160,scale:1.2,duration:${duration},ease:'sine.inOut'},0);window.__timelines.motion=tl;</script></body></html>`
