const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] || c,
  )
export const designExample = (headline: string) => ({
  html: `<main class="poster"><div class="orb"></div><p class="eyebrow">MADE FOR YOUR NEXT BIG IDEA</p><h1>${escape(headline)}</h1><p class="caption">A little imagination.<br>A beautiful new beginning.</p><div class="badge">CreativeOtter ✳</div></main>`,
  css: `.poster{position:relative;width:100%;height:100%;background:#f1f5e9;padding:8%;display:flex;flex-direction:column;justify-content:center;overflow:hidden;color:#173e2c}.eyebrow{font-size:16px;letter-spacing:3px;z-index:1}h1{font-size:76px;line-height:1.02;letter-spacing:-4px;max-width:85%;z-index:1;margin:25px 0}.caption{font-size:26px;line-height:1.5;z-index:1}.badge{position:absolute;bottom:6%;font-size:18px;font-weight:bold}.orb{position:absolute;width:500px;height:500px;background:linear-gradient(135deg,#ffcf91,#d5e6b6);border-radius:50%;right:-120px;top:-130px;animation:float 4s ease-in-out infinite alternate}@keyframes float{from{transform:translate(0,0) scale(1)}to{transform:translate(-180px,180px) scale(.8)}}`,
})
