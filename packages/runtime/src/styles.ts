export const PLAYER_CSS = /* css */ `
.zn-root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; outline: none; user-select: none; }
.zn-stage { position: absolute; left: 50%; top: 50%; transform-origin: center; overflow: hidden; font-family: var(--zn-font); cursor: pointer; }
.zn-bg, .zn-sprites, .zn-choices, .zn-overlay { position: absolute; inset: 0; }
.zn-bg-layer { position: absolute; inset: 0; }
.zn-fade-in { animation: zn-fade 0.6s ease both; }
@keyframes zn-fade { from { opacity: 0; } to { opacity: 1; } }

.zn-sprites { pointer-events: none; }
.zn-sprite { position: absolute; bottom: 0; height: 88%; transform: translateX(-50%); display: flex; align-items: flex-end; animation: zn-fade 0.3s ease both; }
.zn-sprite img { height: 100%; width: auto; }
.zn-pos-left { left: 22%; } .zn-pos-center { left: 50%; } .zn-pos-right { left: 78%; }
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

.zn-overlay { background: #000b; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; color: #fff; cursor: default; }
.zn-overlay-title { font-size: 48px; letter-spacing: 0.3em; }
.zn-overlay-error { font-size: 26px; color: #ffb4a2; max-width: 70%; text-align: center; }
.zn-overlay button { font: inherit; font-size: 22px; padding: 10px 28px; border-radius: 999px; border: 1px solid #fff8; background: transparent; color: #fff; cursor: pointer; }
.zn-overlay button:hover { background: #ffffff22; }
`;
