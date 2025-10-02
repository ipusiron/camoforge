// perlin.js
// Lightweight Perlin-like noise for demo purposes.
// Not a full-featured library but sufficient for pattern generation.

const Perlin = (function(){
  const p = new Uint8Array(512);
  // deterministic-ish shuffle seeded by Math.random(); for reproducible builds you can replace with fixed table
  for(let i=0;i<256;i++) p[i]=i;
  for(let i=255;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    const t = p[i]; p[i]=p[j]; p[j]=t;
  }
  for(let i=0;i<256;i++) p[256+i]=p[i];

  function fade(t){ return t*t*t*(t*(t*6-15)+10); }
  function lerp(a,b,t){ return a + t*(b-a); }
  function grad(hash,x,y){
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  return {
    noise2: function(x,y){
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);

      const aa = p[p[X] + Y];
      const ab = p[p[X] + Y + 1];
      const ba = p[p[X + 1] + Y];
      const bb = p[p[X + 1] + Y + 1];

      const u = fade(xf);
      const v = fade(yf);

      const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v); // range roughly [-1,1]
    }
  };
})();
