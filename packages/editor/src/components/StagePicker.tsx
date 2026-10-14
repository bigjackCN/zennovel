import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Area, Background, Placement, Project, Scene } from '@zennovel/core';
import { Engine, type SpriteState } from '@zennovel/runtime';
import { useI18n } from '../i18n';

/**
 * A big view of the stage where the writer drags instead of typing numbers:
 * either the part of the picture players click for a choice option, or the
 * spot and size of a character's picture. The stage shows what is already
 * there just before this step (background and characters), so the writer
 * works on the real picture.
 */
type Props =
  | {
      mode: 'area';
      project: Project;
      scene: Scene;
      commandId: string;
      /** The option's text, shown on the area. */
      label: string;
      initial?: Area;
      /** The other options' areas, drawn faintly for reference. */
      others: { area: Area; label: string }[];
      onDone: (area: Area) => void;
      onCancel: () => void;
    }
  | {
      mode: 'place';
      /** Heading over the stage (defaults to "drag the picture where it should stand"). */
      title?: string;
      project: Project;
      scene: Scene;
      commandId: string;
      characterId: string;
      expression: string;
      initial: Placement;
      onDone: (place: Placement) => void;
      onCancel: () => void;
    };

/** Preset positions, as the player draws them. */
const PRESET_X = { left: 0.22, center: 0.5, right: 0.78 } as const;
const PRESET_HEIGHT = 0.88;
/** Within this distance (fraction of the stage) a picture snaps to the centre line / bottom edge. */
const SNAP = 0.012;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10000) / 10000;

type Drag =
  | { kind: 'draw'; x0: number; y0: number }
  | { kind: 'move-area'; dx: number; dy: number }
  | { kind: 'resize-area'; ax: number; ay: number }
  | { kind: 'move-place'; dx: number; dy: number }
  | { kind: 'resize-place'; y0: number; h0: number };

export function StagePicker(props: Props) {
  const { t } = useI18n();
  const { project, scene, commandId } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<Area | undefined>(props.mode === 'area' ? props.initial : undefined);
  const [place, setPlace] = useState<Placement>(props.mode === 'place' ? props.initial : { x: 0.5, y: 1, height: 1 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [snapped, setSnapped] = useState({ x: false, y: false });

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const stage = useMemo(() => new Engine(project).stageAt(scene.id, commandId), [project, scene.id, commandId]);
  const { width: W, height: H } = project.meta.resolution;
  const assetSrc = (id: string | undefined) => (id ? project.assets.find((a) => a.id === id)?.src : undefined);
  const spriteSrc = (characterId: string, expression: string) =>
    assetSrc(project.characters.find((c) => c.id === characterId)?.sprites[expression]);

  /** Pointer position as a fraction of the stage. */
  const at = (e: ReactPointerEvent) => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height };
  };

  const start = (e: ReactPointerEvent, next: Drag) => {
    e.preventDefault();
    e.stopPropagation();
    stageRef.current!.setPointerCapture(e.pointerId);
    setDrag(next);
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = at(e);
    if (drag.kind === 'draw' || drag.kind === 'resize-area') {
      const ax = drag.kind === 'draw' ? drag.x0 : drag.ax;
      const ay = drag.kind === 'draw' ? drag.y0 : drag.ay;
      const x = clamp(p.x, 0, 1);
      const y = clamp(p.y, 0, 1);
      setArea({ x: Math.min(ax, x), y: Math.min(ay, y), width: Math.abs(x - ax), height: Math.abs(y - ay) });
    } else if (drag.kind === 'move-area' && area) {
      setArea({
        ...area,
        x: clamp(p.x - drag.dx, 0, 1 - area.width),
        y: clamp(p.y - drag.dy, 0, 1 - area.height),
      });
    } else if (drag.kind === 'move-place') {
      let x = clamp(p.x - drag.dx, -0.5, 1.5);
      let y = clamp(p.y - drag.dy, 0, 2);
      const sx = Math.abs(x - 0.5) < SNAP;
      const sy = Math.abs(y - 1) < SNAP;
      if (sx) x = 0.5;
      if (sy) y = 1;
      setSnapped({ x: sx, y: sy });
      setPlace({ ...place, x, y });
    } else if (drag.kind === 'resize-place') {
      // The bottom edge stays put: dragging up makes the picture taller.
      setPlace({ ...place, height: clamp(drag.h0 + (drag.y0 - p.y), 0.05, 4) });
    }
  };

  const onUp = () => {
    if (drag?.kind === 'draw' && area && (area.width < 0.01 || area.height < 0.01)) {
      setArea(props.mode === 'area' ? props.initial : undefined); // a click, not a drag
    }
    setDrag(null);
    setSnapped({ x: false, y: false });
  };

  const finish = () => {
    if (props.mode === 'area') {
      if (area)
        props.onDone({ x: round(area.x), y: round(area.y), width: round(area.width), height: round(area.height) });
      else props.onCancel();
    } else {
      props.onDone({ x: round(place.x), y: round(place.y), height: round(place.height) });
    }
    dialogRef.current?.close();
  };
  const cancel = () => {
    props.onCancel();
    dialogRef.current?.close();
  };

  const pct = (v: number) => `${v * 100}%`;
  const areaStyle = (a: Area): CSSProperties => ({
    left: pct(a.x),
    top: pct(a.y),
    width: pct(a.width),
    height: pct(a.height),
  });
  const spriteStyle = (sp: { place?: Placement; position?: keyof typeof PRESET_X }): CSSProperties => {
    const p = sp.place ?? { x: PRESET_X[sp.position ?? 'center'], y: 1, height: PRESET_HEIGHT };
    return { left: pct(p.x), bottom: pct(1 - p.y), height: pct(p.height) };
  };

  const background = (bg: Background | null): CSSProperties => {
    if (!bg) return {};
    if (bg.kind === 'color') return { background: bg.value };
    const src = assetSrc(bg.assetId);
    return src ? { backgroundImage: `url("${src}")` } : {};
  };

  const context = stage.sprites.filter(
    (sp: SpriteState) => props.mode === 'area' || sp.characterId !== props.characterId,
  );
  const placedSrc = props.mode === 'place' ? spriteSrc(props.characterId, props.expression) : undefined;

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog stage-picker"
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
    >
      <p className="stage-picker-title">
        {props.mode === 'area' ? t.picker.areaTitle : (props.title ?? t.picker.placeTitle)}
      </p>
      <div
        ref={stageRef}
        className={`stage-picker-stage${props.mode === 'area' ? ' drawing' : ''}`}
        style={{ aspectRatio: `${W} / ${H}`, ...background(stage.background) }}
        onPointerDown={(e) => {
          if (props.mode !== 'area') return;
          const p = at(e);
          start(e, { kind: 'draw', x0: clamp(p.x, 0, 1), y0: clamp(p.y, 0, 1) });
          setArea({ x: p.x, y: p.y, width: 0, height: 0 });
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {!stage.background && <div className="stage-picker-empty">{t.picker.noBackground}</div>}
        {context.map((sp) => {
          const src = spriteSrc(sp.characterId, sp.expression);
          return src ? (
            <img
              key={sp.characterId}
              className={`stage-picker-sprite${props.mode === 'place' ? ' context' : ''}`}
              src={src}
              alt=""
              draggable={false}
              style={spriteStyle(sp)}
            />
          ) : null;
        })}

        {props.mode === 'area' && (
          <>
            {props.others.map((o, i) => (
              <div key={i} className="stage-picker-area other" style={areaStyle(o.area)}>
                <span>{o.label}</span>
              </div>
            ))}
            {area && (
              <div
                className="stage-picker-area current"
                style={areaStyle(area)}
                onPointerDown={(e) => {
                  const p = at(e);
                  start(e, { kind: 'move-area', dx: p.x - area.x, dy: p.y - area.y });
                }}
              >
                <span>{props.label}</span>
                {(
                  [
                    ['nw', area.x + area.width, area.y + area.height],
                    ['ne', area.x, area.y + area.height],
                    ['sw', area.x + area.width, area.y],
                    ['se', area.x, area.y],
                  ] as const
                ).map(([corner, ax, ay]) => (
                  <i
                    key={corner}
                    className={`handle ${corner}`}
                    onPointerDown={(e) => start(e, { kind: 'resize-area', ax, ay })}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {props.mode === 'place' && (
          <div
            className="stage-picker-placed"
            style={spriteStyle({ place })}
            onPointerDown={(e) => {
              const p = at(e);
              start(e, { kind: 'move-place', dx: p.x - place.x, dy: p.y - place.y });
            }}
          >
            {placedSrc ? (
              <img src={placedSrc} alt="" draggable={false} />
            ) : (
              <div className="stage-picker-missing">?</div>
            )}
            <i
              className="handle ne"
              title={t.picker.resize}
              onPointerDown={(e) => start(e, { kind: 'resize-place', y0: at(e).y, h0: place.height })}
            />
          </div>
        )}
        {snapped.x && <div className="stage-picker-guide vertical" />}
        {snapped.y && <div className="stage-picker-guide horizontal" />}
      </div>
      <div className="stage-picker-bar">
        {props.mode === 'place' && (
          <button type="button" className="btn small" onClick={() => setPlace({ x: 0.5, y: 1, height: 1 })}>
            {t.picker.fill}
          </button>
        )}
        <span className="muted stage-picker-hint">
          {props.mode === 'area' ? t.picker.areaHint : t.picker.placeHint}
        </span>
        <button type="button" className="btn" onClick={cancel}>
          {t.dialog.cancel}
        </button>
        <button type="button" className="btn primary" disabled={props.mode === 'area' && !area} onClick={finish}>
          {t.picker.done}
        </button>
      </div>
    </dialog>
  );
}
