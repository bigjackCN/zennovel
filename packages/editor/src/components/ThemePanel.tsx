import { defaultTheme, type Theme } from '@zennovel/core';

interface Props {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

/** Hex colour for <input type=color>; falls back when the value is rgba(). */
function toHex(css: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(css) ? css : fallback;
}

function rgbaFrom(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function alphaOf(css: string): number {
  const m = /rgba\([^)]*,\s*([\d.]+)\)/.exec(css);
  return m ? Number(m[1]) : 1;
}

function hexOfRgba(css: string, fallback: string): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
  if (!m) return toHex(css, fallback);
  return '#' + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('');
}

export function ThemePanel({ theme, onChange }: Props) {
  const d = theme.dialogue;
  const setDialogue = (patch: Partial<Theme['dialogue']>) => onChange({ ...theme, dialogue: { ...d, ...patch } });
  const bgHex = hexOfRgba(d.background, '#141623');
  const bgAlpha = alphaOf(d.background);

  return (
    <div className="theme-panel">
      <h3>Dialogue box</h3>
      <label>
        Background
        <input type="color" value={bgHex} onChange={(e) => setDialogue({ background: rgbaFrom(e.target.value, bgAlpha) })} />
      </label>
      <label>
        Opacity
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={bgAlpha}
          onChange={(e) => setDialogue({ background: rgbaFrom(bgHex, Number(e.target.value)) })}
        />
      </label>
      <label>
        Text color
        <input type="color" value={toHex(d.textColor, '#f4f1ea')} onChange={(e) => setDialogue({ textColor: e.target.value })} />
      </label>
      <label>
        <span>
          Font size <span className="muted">{d.fontSize}px</span>
        </span>
        <input type="range" min={16} max={40} value={d.fontSize} onChange={(e) => setDialogue({ fontSize: Number(e.target.value) })} />
      </label>
      <label>
        <span>
          Corner radius <span className="muted">{d.borderRadius}px</span>
        </span>
        <input type="range" min={0} max={40} value={d.borderRadius} onChange={(e) => setDialogue({ borderRadius: Number(e.target.value) })} />
      </label>
      <label>
        <span>
          Height <span className="muted">{Math.round(d.height * 100)}%</span>
        </span>
        <input type="range" min={0.15} max={0.5} step={0.01} value={d.height} onChange={(e) => setDialogue({ height: Number(e.target.value) })} />
      </label>

      <h3>Text</h3>
      <label>
        <span>
          Typing speed <span className="muted">{theme.textSpeed === 0 ? 'Instant' : `${theme.textSpeed} chars/sec`}</span>
        </span>
        <input type="range" min={0} max={120} step={5} value={theme.textSpeed} onChange={(e) => onChange({ ...theme, textSpeed: Number(e.target.value) })} />
      </label>

      <h3>Choice buttons</h3>
      <label>
        Hover color
        <input
          type="color"
          value={hexOfRgba(theme.choice.hoverBackground, '#c8553d')}
          onChange={(e) => onChange({ ...theme, choice: { ...theme.choice, hoverBackground: e.target.value } })}
        />
      </label>

      <button className="btn small" onClick={() => onChange(structuredClone(defaultTheme))}>
        Reset to default
      </button>
    </div>
  );
}
