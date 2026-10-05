import { useEffect, useRef, useState } from 'react';
import type { Project } from '@zennovel/core';
import { Player } from '@zennovel/runtime';
import { useI18n } from '../i18n';

/** Live preview using the exact same Player that exported games use. */
export function Preview({ project, sceneId }: { project: Project; sceneId: string }) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [fromStart, setFromStart] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    player.current = new Player(host.current, project, { startSceneId: sceneId });
    return () => {
      player.current?.destroy();
      player.current = null;
    };
    // Mount once; later edits are pushed in by the effect below.
  }, []);

  // Debounce edits so typing doesn't restart the preview on every keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      player.current?.setProject(project, fromStart ? project.startSceneId : sceneId);
    }, 350);
    return () => window.clearTimeout(t);
  }, [project, sceneId, fromStart]);

  return (
    <div className="preview">
      <div className="preview-stage" ref={host} />
      <div className="preview-bar">
        <button
          className={`btn small ${!fromStart ? 'active' : ''}`}
          onClick={() => {
            setFromStart(false);
            player.current?.restart(sceneId);
          }}
        >
          {t.preview.playScene}
        </button>
        <button
          className={`btn small ${fromStart ? 'active' : ''}`}
          onClick={() => {
            setFromStart(true);
            player.current?.restart(project.startSceneId);
          }}
        >
          {t.preview.playFromStart}
        </button>
      </div>
    </div>
  );
}
