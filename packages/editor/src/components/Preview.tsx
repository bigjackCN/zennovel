import { useEffect, useRef, useState } from 'react';
import type { Project } from '@zennovel/core';
import { Player } from '@zennovel/runtime';
import { useI18n } from '../i18n';

type Mode = 'line' | 'scene' | 'start';

const SOUND_KEY = 'zennovel:previewSound';

/** The preview starts muted (it restarts on every edit); the writer's choice is remembered. */
function soundPreference(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

interface Props {
  project: Project;
  sceneId: string;
  /** The card being edited in this scene, if any: "play from this line" starts there. */
  commandId?: string;
}

/** Live preview using the exact same Player that exported games use. */
export function Preview({ project, sceneId, commandId }: Props) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [mode, setMode] = useState<Mode>('line');
  const [sound, setSound] = useState(soundPreference);
  // Without a card to start from, "this line" means the top of the scene.
  const effective: Mode = mode === 'line' && !commandId ? 'scene' : mode;

  const startScene = effective === 'start' ? project.startSceneId : sceneId;
  const startCommand = effective === 'line' ? commandId : undefined;

  // Create the player on the first run; afterwards push edits in, debounced so
  // typing doesn't restart the preview on every keystroke.
  useEffect(() => {
    if (!host.current) return;
    if (!player.current) {
      player.current = new Player(host.current, project, {
        startSceneId: startScene,
        startCommandId: startCommand,
        wheelRollback: 'whenFocused',
        muted: true, // the effect below applies the writer's choice
      });
      return;
    }
    const timer = window.setTimeout(() => player.current?.setProject(project, startScene, startCommand), 350);
    return () => window.clearTimeout(timer);
  }, [project, startScene, startCommand]);

  useEffect(() => {
    player.current?.setMuted(!sound);
  }, [sound]);

  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  const play = (next: Mode) => {
    setMode(next);
    const [scene, command] =
      next === 'start' ? [project.startSceneId, undefined] : [sceneId, next === 'line' ? commandId : undefined];
    player.current?.restart(scene, command);
    player.current?.focus();
  };

  return (
    <div className="preview">
      <div className="preview-stage" ref={host} />
      <div className="preview-bar">
        <button
          className={`btn small ${effective === 'line' ? 'active' : ''}`}
          disabled={!commandId}
          onClick={() => play('line')}
          title={t.preview.playLineHint}
        >
          {t.preview.playLine}
        </button>
        <button className={`btn small ${effective === 'scene' ? 'active' : ''}`} onClick={() => play('scene')}>
          {t.preview.playScene}
        </button>
        <button className={`btn small ${effective === 'start' ? 'active' : ''}`} onClick={() => play('start')}>
          {t.preview.playFromStart}
        </button>
        <span className="spacer" />
        <button
          className={`icon sound-toggle ${sound ? 'on' : ''}`}
          title={sound ? t.preview.soundOn : t.preview.soundOff}
          aria-label={sound ? t.preview.soundOn : t.preview.soundOff}
          aria-pressed={sound}
          onClick={() => {
            const next = !sound;
            setSound(next);
            try {
              localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
            } catch {
              // Not remembered; it still applies now.
            }
          }}
        >
          {sound ? '🔊' : '🔇'}
        </button>
      </div>
    </div>
  );
}
