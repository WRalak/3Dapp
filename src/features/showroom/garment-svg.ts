/**
 * Server-rendered SVG artwork for products without photography: a softly lit studio
 * backdrop, a garment silhouette in the product colour and a woven texture overlay.
 * Inputs are strictly validated — the colour is hex-only and kind/view are allow-listed.
 */
const SILHOUETTES: Record<string, string> = {
  DRESS: "M170 70 C185 60 215 60 230 70 L262 92 L250 140 C244 160 240 175 246 200 L300 520 C240 540 160 540 100 520 L154 200 C160 175 156 160 150 140 L138 92 Z",
  COAT: "M160 66 L200 90 L240 66 L292 88 L322 250 L304 256 L290 170 L292 520 L210 528 L200 150 L190 528 L108 520 L110 170 L96 256 L78 250 L108 88 Z",
  JACKET: "M160 86 L200 110 L240 86 L292 106 L326 270 L306 276 L290 190 L288 400 L112 400 L110 190 L94 276 L74 270 L108 106 Z",
  TOP: "M164 96 C180 112 220 112 236 96 L300 120 L330 196 L292 212 L276 176 L276 400 L124 400 L124 176 L108 212 L70 196 L100 120 Z",
  SHIRT: "M166 90 L200 120 L234 90 L298 114 L330 270 L304 278 L282 180 L282 420 L118 420 L118 180 L96 278 L70 270 L102 114 Z",
  KNIT: "M168 92 C182 106 218 106 232 92 L294 114 L326 300 L298 306 L278 190 L282 410 L118 410 L122 190 L102 306 L74 300 L106 114 Z",
  TROUSERS: "M130 80 L270 80 L290 520 L222 524 L200 200 L178 524 L110 520 Z",
  SKIRT: "M150 120 L250 120 L300 470 C240 486 160 486 100 470 Z",
  SHOES: "M80 380 C80 330 120 320 160 330 L230 350 C280 360 320 370 330 400 L330 420 L80 420 Z",
  BAG: "M120 220 L280 220 L300 460 L100 460 Z M160 220 C160 140 240 140 240 220",
  ACCESSORY: "M110 200 C160 160 240 160 290 200 L270 420 C220 450 180 450 130 420 Z",
};

export function renderGarmentSvg(kindRaw: string, colorRaw: string, viewRaw: string) {
  const kind = Object.hasOwn(SILHOUETTES, kindRaw) ? kindRaw : "TOP";
  const color = /^[0-9a-fA-F]{6}$/.test(colorRaw) ? `#${colorRaw}` : "#2b2a28";
  const view = ["front", "back", "detail"].includes(viewRaw) ? viewRaw : "front";
  const path = SILHOUETTES[kind]!;
  const bg = view === "back" ? "#e9e4db" : "#efebe4";

  if (view === "detail") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 533" width="400" height="533">
<defs><pattern id="w" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${color}"/><path d="M0 2h8M0 6h8" stroke="#000" stroke-opacity=".14" stroke-width="1.6"/><path d="M2 0v8M6 0v8" stroke="#fff" stroke-opacity=".08" stroke-width="1.6"/></pattern>
<radialGradient id="l" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>
<rect width="400" height="533" fill="url(#w)"/><rect width="400" height="533" fill="url(#l)"/></svg>`;
  }

  const flip = view === "back" ? ' transform="translate(400 0) scale(-1 1)"' : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 533" width="400" height="533">
<defs>
<radialGradient id="bg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#faf8f4"/><stop offset="1" stop-color="${bg}"/></radialGradient>
<linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1.5h6M0 4.5h6" stroke="#000" stroke-opacity=".06"/></pattern>
<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="400" height="533" fill="url(#bg)"/>
<ellipse cx="200" cy="505" rx="120" ry="12" fill="#000" opacity=".08" filter="url(#soft)"/>
${kind === "SHOES" || kind === "BAG" || kind === "ACCESSORY" ? "" : '<path d="M200 28 L200 58 M160 70 Q200 40 240 70" stroke="#8a8277" stroke-width="3" fill="none" stroke-linecap="round"/>'}
<g${flip}><path d="${path}" fill="${color}"/><path d="${path}" fill="url(#shade)"/><path d="${path}" fill="url(#weave)"/></g>
</svg>`;
}
