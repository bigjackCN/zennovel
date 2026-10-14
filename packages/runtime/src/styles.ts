export const PLAYER_CSS = /* css */ `
.zn-root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; outline: none; user-select: none; }
.zn-stage { position: absolute; left: 50%; top: 50%; transform-origin: center; overflow: hidden; font-family: var(--zn-font); cursor: pointer; }
.zn-bg, .zn-sprites, .zn-choices, .zn-overlay { position: absolute; inset: 0; }
.zn-bg-layer { position: absolute; inset: 0; }
.zn-fade-in { animation: zn-fade 0.6s ease both; }
@keyframes zn-fade { from { opacity: 0; } to { opacity: 1; } }

.zn-sprites { pointer-events: none; z-index: 0; } /* a layer of its own: sprite order stays inside it */
.zn-sprite {
  position: absolute; bottom: 0; height: 88%; transform: translateX(-50%); display: flex; align-items: flex-end;
  animation: zn-fade 0.3s ease both; transition: left 0.45s ease, bottom 0.45s ease, height 0.45s ease;
}
.zn-sprite img { height: 100%; width: auto; }
.zn-pos-left { left: 22%; } .zn-pos-center { left: 50%; } .zn-pos-right { left: 78%; }
.zn-sprite-in { animation: zn-fade 0.35s ease both; }
.zn-sprite-out { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); animation: zn-fade-out 0.35s ease both; }
.zn-leaving { animation: zn-fade-out 0.35s ease both; }
@keyframes zn-fade-out { from { opacity: 1; } to { opacity: 0; } }
.zn-sprite-placeholder { width: 240px; height: 70%; border: 4px dashed #fff8; border-radius: 120px 120px 12px 12px; background: #ffffff22; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28px; }

.zn-dialogue {
  position: absolute; left: var(--zn-dlg-margin); right: var(--zn-dlg-margin); bottom: var(--zn-dlg-margin);
  height: var(--zn-dlg-height); box-sizing: border-box; padding: var(--zn-dlg-padding);
  background: var(--zn-dlg-bg); color: var(--zn-dlg-color); border-radius: var(--zn-dlg-radius);
  font-size: var(--zn-dlg-size); line-height: 1.6; box-shadow: 0 10px 30px #0005;
}
.zn-nameplate {
  position: absolute; top: 0; left: var(--zn-dlg-padding); transform: translateY(-60%);
  padding: 6px 22px; border-radius: 999px; background: var(--zn-name-bg); color: var(--zn-name-color);
  font-size: var(--zn-name-size); font-weight: 600; box-shadow: 0 4px 12px #0004;
}
.zn-text { white-space: pre-wrap; }

.zn-choices { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; pointer-events: none; padding-bottom: 12%; }
.zn-choice {
  pointer-events: auto; min-width: 46%; padding: 16px 32px; border: none; cursor: pointer;
  background: var(--zn-choice-bg); color: var(--zn-choice-color); border-radius: var(--zn-choice-radius);
  font: inherit; font-size: 26px; transition: background 0.15s, transform 0.15s;
}
.zn-choice:hover, .zn-choice:focus-visible { background: var(--zn-choice-hover); transform: scale(1.02); outline: none; }

/* Darkness, lit only around the pointer; things that glow sit above it. */
.zn-dark {
  position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.8s ease;
  background:
    radial-gradient(circle at var(--zn-lx, 50%) var(--zn-ly, 50%), rgba(255, 226, 170, 0.12) 0, rgba(255, 226, 170, 0) var(--zn-lr, 0px)),
    radial-gradient(circle at var(--zn-lx, 50%) var(--zn-ly, 50%), rgba(3, 5, 12, 0) 0, rgba(3, 5, 12, 0) calc(var(--zn-lr, 0px) * 0.45), rgba(3, 5, 12, var(--zn-dl, 0.85)) var(--zn-lr, 0px));
}
.zn-dark.zn-on { opacity: 1; }
.zn-dark.zn-flicker { animation: zn-flicker 2.6s steps(1, end) infinite; }
@keyframes zn-flicker {
  0%, 100% { opacity: 1; } 6% { opacity: 0.35; } 8% { opacity: 1; } 31% { opacity: 1; } 33% { opacity: 0.5; }
  34% { opacity: 1; } 36% { opacity: 0.25; } 39% { opacity: 1; } 71% { opacity: 1; } 73% { opacity: 0.6; } 76% { opacity: 1; }
}
.zn-glow { mix-blend-mode: screen; }
.zn-is-dark, .zn-is-dark .zn-hotspot { touch-action: none; cursor: none; }
.zn-is-dark .zn-hotspot::before { animation: none; }
.zn-is-dark .zn-hotspot-label { opacity: 0; }
.zn-is-dark .zn-hotspot:hover, .zn-is-dark .zn-hotspot.zn-lit { box-shadow: none; }
.zn-is-dark .zn-hotspot:hover::before, .zn-is-dark .zn-hotspot.zn-lit::before { opacity: 0.3; border-width: 1px; }
.zn-is-dark .zn-hotspot.zn-lit .zn-hotspot-label, .zn-is-dark .zn-hotspot:hover .zn-hotspot-label { opacity: 1; }

/* A choice's time limit: a bar along the top that runs out. */
.zn-countdown {
  position: absolute; left: 0; right: 0; top: 0; height: 6px; pointer-events: none;
  background: linear-gradient(90deg, var(--zn-choice-hover) calc(var(--zn-left, 1) * 100%), transparent 0);
}

/* Variables shown on screen (a battery, a countdown). */
.zn-vars { position: absolute; inset: 0; pointer-events: none; }
.zn-vars-corner { position: absolute; top: 22px; display: grid; gap: 10px; }
.zn-vars-corner.zn-left { left: 26px; justify-items: start; }
.zn-vars-corner.zn-right { right: 90px; justify-items: end; }
.zn-var {
  display: flex; align-items: center; gap: 10px; padding: 7px 14px; border-radius: 10px;
  background: #0009; color: #fff; font-size: 20px; font-variant-numeric: tabular-nums; backdrop-filter: blur(4px);
}
.zn-var-name { opacity: 0.8; font-size: 17px; }
.zn-var-track { width: 120px; height: 12px; border-radius: 3px; border: 2px solid #fffc; padding: 1px; box-sizing: content-box; }
.zn-var-fill { display: block; height: 100%; background: #9be37a; border-radius: 1px; transition: width 0.3s linear; }
.zn-var.zn-low .zn-var-fill { background: #ff6b5a; }
.zn-var-timer .zn-var-value { font-size: 26px; font-weight: 600; letter-spacing: 0.04em; }
.zn-var-timer.zn-low .zn-var-value { color: #ff6b5a; }

/* Held options: a little bar fills while the light rests on them. */
.zn-hold-bar {
  position: absolute; left: 0; bottom: -10px; height: 4px; width: 0; border-radius: 2px;
  background: var(--zn-choice-hover); pointer-events: none;
}

/* Choices made by clicking part of the picture. */
.zn-hotspots { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.zn-hotspot {
  pointer-events: auto; position: absolute; padding: 0; border: none; border-radius: 14px; background: transparent;
  cursor: pointer; font: inherit; transition: box-shadow 0.3s ease;
}
.zn-hotspot::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; border: 2px solid #fff;
  opacity: 0; animation: zn-hint 4s ease-in-out 1.2s infinite;
}
.zn-hotspot:hover, .zn-hotspot:focus-visible { z-index: 1; outline: none; box-shadow: 0 0 0 4000px #0000008c; }
.zn-hotspot:hover::before, .zn-hotspot:focus-visible::before { animation: none; opacity: 0.85; }
@keyframes zn-hint { 0%, 70%, 100% { opacity: 0; } 82% { opacity: 0.45; } }
.zn-hotspot-label {
  position: absolute; left: 50%; top: calc(100% + 12px); transform: translateX(-50%); white-space: nowrap;
  padding: 8px 20px; border-radius: 999px; background: var(--zn-choice-bg); color: var(--zn-choice-color);
  font-size: 24px; pointer-events: none; opacity: 0; transition: opacity 0.2s ease;
}
.zn-hotspot-label.zn-above { top: auto; bottom: calc(100% + 12px); }
.zn-hotspot:hover .zn-hotspot-label, .zn-hotspot:focus-visible .zn-hotspot-label { opacity: 1; }
@media (hover: none) { .zn-hotspot-label { opacity: 0.92; } }
.zn-caption {
  position: absolute; left: 50%; top: 32px; transform: translateX(-50%); max-width: 80%; text-align: center;
  padding: 10px 28px; border-radius: 999px; background: var(--zn-dlg-bg); color: var(--zn-dlg-color);
  font-size: var(--zn-dlg-size); line-height: 1.5; pointer-events: none; animation: zn-fade 0.4s ease both;
}

.zn-overlay { background: #000b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; color: #fff; cursor: default; }
.zn-overlay-title { font-size: 48px; letter-spacing: 0.3em; }
.zn-overlay-error { font-size: 26px; color: #ffb4a2; max-width: 70%; text-align: center; }
.zn-overlay button { font: inherit; font-size: 22px; padding: 10px 28px; border-radius: 999px; border: 1px solid #fff8; background: transparent; color: #fff; cursor: pointer; }
.zn-overlay button:hover { background: #ffffff22; }

/* ---- Exported games: HUD, title screen, menus ---- */
.zn-hud { position: absolute; inset: 0; pointer-events: none; }
.zn-menu-button {
  pointer-events: auto; position: absolute; top: 18px; right: 18px; width: 52px; height: 52px; border-radius: 50%;
  border: none; background: #0006; color: #fff; font-size: 26px; cursor: pointer; transition: background 0.15s;
}
.zn-menu-button:hover, .zn-menu-button:focus-visible { background: #000a; outline: none; }
.zn-ui { position: absolute; inset: 0; cursor: default; color: #fff; }
.zn-btn {
  font: inherit; font-size: 24px; padding: 12px 34px; min-width: 300px; border-radius: 999px; cursor: pointer;
  border: 1px solid #ffffff55; background: #00000066; color: #fff; transition: background 0.15s, border-color 0.15s;
}
.zn-btn:hover, .zn-btn:focus-visible { background: var(--zn-choice-hover); border-color: transparent; outline: none; }
.zn-title { position: absolute; inset: 0; display: grid; place-items: center; }
.zn-title::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, #0003 0%, #000a 100%); }
.zn-title-inner { position: relative; display: grid; justify-items: center; gap: 18px; text-align: center; padding: 0 80px; }
.zn-title-name { margin: 0; font-size: 72px; font-weight: 700; letter-spacing: 0.06em; text-shadow: 0 4px 24px #000a; }
.zn-title-author { margin: -6px 0 26px; font-size: 22px; opacity: 0.8; }
.zn-title-buttons { display: grid; gap: 14px; }
.zn-backdrop {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: #0b0b12e8; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
}
.zn-panel { display: grid; gap: 20px; justify-items: center; width: 860px; max-height: 640px; }
.zn-panel-title { margin: 0; font-size: 34px; font-weight: 600; letter-spacing: 0.1em; }
.zn-menu-list { display: grid; gap: 14px; }
.zn-note { margin: 0; font-size: 22px; opacity: 0.8; text-align: center; }
.zn-row { display: flex; gap: 16px; }
.zn-row .zn-btn { min-width: 220px; }
.zn-close { min-width: 200px; }
.zn-slots { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; }
.zn-slot {
  font: inherit; display: grid; gap: 4px; text-align: left; padding: 14px 20px; border-radius: 14px; cursor: pointer;
  background: #1c1c26; border: 1px solid #ffffff26; color: #fff; min-height: 104px; align-content: start;
}
.zn-slot:hover:not(:disabled), .zn-slot:focus-visible { background: #2a2a38; border-color: var(--zn-choice-hover); outline: none; }
.zn-slot:disabled { opacity: 0.45; cursor: default; }
.zn-slot-name { font-size: 20px; font-weight: 600; }
.zn-slot-date { font-size: 16px; opacity: 0.7; }
.zn-slot-empty { font-size: 18px; opacity: 0.6; }
.zn-slot-text { font-size: 17px; opacity: 0.9; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.zn-history { width: 100%; max-height: 470px; overflow-y: auto; display: grid; gap: 14px; padding-right: 10px; user-select: text; }
.zn-history-line { display: grid; grid-template-columns: 150px 1fr; gap: 16px; font-size: 22px; line-height: 1.5; }
.zn-history-who { font-weight: 600; text-align: right; }
.zn-history-text { white-space: pre-wrap; }
.zn-toast {
  position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); padding: 10px 26px; border-radius: 999px;
  background: #000c; color: #fff; font-size: 20px;
}
.zn-toast-top { bottom: auto; top: 40px; animation: zn-fade 0.3s ease both; }

.zn-settings { display: grid; gap: 22px; width: 620px; }
.zn-setting { display: grid; grid-template-columns: 180px 1fr 70px; align-items: center; gap: 18px; font-size: 22px; }
.zn-setting-value { text-align: right; opacity: 0.8; font-variant-numeric: tabular-nums; }
.zn-check { width: 26px; height: 26px; justify-self: start; accent-color: var(--zn-choice-hover, #c8553d); }
.zn-range { width: 100%; accent-color: var(--zn-choice-hover); height: 28px; cursor: pointer; }
.zn-audio-music, .zn-audio-sfx { display: none; }
`;
