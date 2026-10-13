import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { walkCommands, type Project, type StoryIssue } from '@zennovel/core';
import { actions } from '../state/projectActions';
import { autoLayout, layoutScenes, mapEdges, NODE_H, NODE_W, type MapEdge, type Point } from '../state/mapLayout';
import type { EditFn } from './EditorApi';
import { useI18n } from '../i18n';

const PAD = 48;
const GRID = 10;
/** Pointer movement below this is a click, not a drag. */
const DRAG_THRESHOLD = 4;

interface Props {
  project: Project;
  selectedId: string;
  issues: StoryIssue[];
  onEdit: EditFn;
  onOpenScene: (sceneId: string) => void;
}

interface Drag {
  id: string;
  pointerX: number;
  pointerY: number;
  start: Point;
  at: Point;
  moved: boolean;
}

const snap = (v: number) => Math.round(v / GRID) * GRID;
const truncate = (s: string, n: number) =>
  Array.from(s).length > n
    ? Array.from(s)
        .slice(0, n - 1)
        .join('') + '…'
    : s;

/** Cubic Bézier for an edge, plus the point to put its label on. */
function edgeGeometry(from: Point, to: Point, selfLoop: boolean): { d: string; label: Point } {
  if (selfLoop) {
    const x = from.x + NODE_W;
    const y = from.y;
    return {
      d: `M ${x - 30} ${y} C ${x - 20} ${y - 60}, ${x + 50} ${y - 40}, ${x} ${y + 16}`,
      label: { x: x + 10, y: y - 40 },
    };
  }
  const s = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
  const e = { x: to.x, y: to.y + NODE_H / 2 };
  // Forward edges get a gentle S-curve; backward ones swing out wider.
  const bend = Math.max(60, Math.abs(e.x - s.x) / 2);
  const c1 = { x: s.x + bend, y: s.y };
  const c2 = { x: e.x - bend, y: e.y };
  return {
    d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`,
    label: { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 },
  };
}

/**
 * The story as a flowchart: one box per scene, arrows for jumps and choice
 * options. Drag boxes to arrange them (saved with the project), click one to
 * edit that scene.
 */
export function StoryMap({ project, selectedId, issues, onEdit, onOpenScene }: Props) {
  const { t } = useI18n();
  const layout = useMemo(() => layoutScenes(project), [project]);
  const edges = useMemo(() => mapEdges(project), [project]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const pos = (id: string): Point => (drag?.id === id ? drag.at : layout[id]!);
  const all = project.scenes.map((s) => pos(s.id));
  const minX = Math.min(...all.map((p) => p.x)) - PAD;
  const minY = Math.min(...all.map((p) => p.y)) - PAD - 40; // room for self-loop arrows
  const width = Math.max(...all.map((p) => p.x)) + NODE_W + PAD - minX;
  const height = Math.max(...all.map((p) => p.y)) + NODE_H + PAD - minY;

  const errorScenes = new Set(issues.filter((i) => i.level === 'error').map((i) => i.sceneId));
  const lineCount = (id: string) => {
    let n = 0;
    walkCommands(project.scenes.find((s) => s.id === id)!.commands, (c) => c.type === 'say' && n++);
    return n;
  };

  // Several options between the same two scenes: spread their labels out.
  const labelIndex = new Map<string, number>();
  const labelSlot = (e: MapEdge) => {
    const key = `${e.from}>${e.to}`;
    const n = labelIndex.get(key) ?? 0;
    labelIndex.set(key, n + 1);
    return n;
  };

  function onPointerDown(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const start = layout[id]!;
    setDrag({ id, pointerX: e.clientX, pointerY: e.clientY, start, at: start, moved: false });
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    // The map is scaled to fit the panel: convert screen pixels to map units.
    const scale = (svgRef.current?.getBoundingClientRect().width || width) / width;
    const dx = (e.clientX - drag.pointerX) / scale;
    const dy = (e.clientY - drag.pointerY) / scale;
    const moved = drag.moved || Math.hypot(dx, dy) > DRAG_THRESHOLD;
    setDrag({ ...drag, moved, at: { x: snap(drag.start.x + dx), y: snap(drag.start.y + dy) } });
  }

  function onPointerUp() {
    if (!drag) return;
    const { id, moved, at } = drag;
    setDrag(null);
    if (!moved) return onOpenScene(id);
    // Pin every scene the first time the map is arranged by hand, so the others don't jump around.
    const unsaved = project.scenes.some((s) => !s.position);
    onEdit((p) => actions.setScenePositions(p, unsaved ? { ...layout, [id]: at } : { [id]: at }));
  }

  return (
    <section className="manager story-map">
      <div className="manager-head">
        <h2>{t.map.title}</h2>
        <button className="btn" onClick={() => onEdit((p) => actions.setScenePositions(p, autoLayout(p)))}>
          {t.map.autoArrange}
        </button>
      </div>
      <p className="hint">{t.map.hint}</p>
      <div className="map-legend">
        <span className="legend-jump">{t.map.jump}</span>
        <span className="legend-choice">{t.map.choice}</span>
      </div>
      <div className="map-scroll">
        <svg
          ref={svgRef}
          // Shrink to fit the panel, but not below half size (then the panel scrolls).
          style={{ width: '100%', maxWidth: width, minWidth: width / 2, height: 'auto' }}
          viewBox={`${minX} ${minY} ${width} ${height}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          role="img"
          aria-label={t.map.title}
        >
          <defs>
            {(['jump', 'choice'] as const).map((kind) => (
              <marker
                key={kind}
                id={`arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={`map-arrow-${kind}`} />
              </marker>
            ))}
          </defs>

          {edges.map((e, i) => {
            const g = edgeGeometry(pos(e.from), pos(e.to), e.from === e.to);
            const slot = e.label ? labelSlot(e) : 0;
            const label = e.label ? truncate(e.label, 14) : '';
            return (
              <g key={i} className={`map-edge map-edge-${e.kind}`}>
                <path d={g.d} markerEnd={`url(#arrow-${e.kind})`} />
                {label && (
                  <g transform={`translate(${g.label.x}, ${g.label.y + slot * 22})`}>
                    <rect x={-label.length * 6.5 - 8} y={-11} width={label.length * 13 + 16} height={22} rx={11} />
                    <text textAnchor="middle" dy="4">
                      {label}
                    </text>
                    <title>{e.label}</title>
                  </g>
                )}
              </g>
            );
          })}

          {project.scenes.map((s) => {
            const p = pos(s.id);
            const classes = [
              'map-node',
              s.id === selectedId && 'selected',
              s.id === project.startSceneId && 'start',
              drag?.id === s.id && drag.moved && 'dragging',
            ];
            return (
              <g
                key={s.id}
                className={classes.filter(Boolean).join(' ')}
                transform={`translate(${p.x}, ${p.y})`}
                onPointerDown={(e) => onPointerDown(e, s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onOpenScene(s.id);
                }}
                tabIndex={0}
                role="button"
                aria-label={s.name || t.scenes.untitled}
                data-scene-id={s.id}
              >
                <rect width={NODE_W} height={NODE_H} rx={12} />
                <text x={14} y={26} className="map-node-name">
                  {project.startSceneId === s.id ? '★ ' : ''}
                  {truncate(s.name || t.scenes.untitled, 13)}
                </text>
                <text x={14} y={47} className="map-node-meta">
                  {t.map.lines(lineCount(s.id))}
                </text>
                {errorScenes.has(s.id) && <circle cx={NODE_W - 14} cy={14} r={5} className="map-node-error" />}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
