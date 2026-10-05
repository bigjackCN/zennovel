import type { Project, StoryIssue } from '@zennovel/core';
import { useI18n } from '../i18n';

interface Props {
  project: Project;
  issues: StoryIssue[];
  onSelectScene: (id: string) => void;
}

/** The story checker, in plain language. */
export function IssuesPanel({ project, issues, onSelectScene }: Props) {
  const { t } = useI18n();
  const sceneName = (id: string) => project.scenes.find((s) => s.id === id)?.name ?? id;
  return (
    <section className="issues">
      <h3>{t.issues.title}</h3>
      {issues.length === 0 ? (
        <p className="ok">{t.issues.none}</p>
      ) : (
        <ul>
          {issues.map((issue, i) => (
            <li key={i} className={issue.level}>
              <button className="link" onClick={() => onSelectScene(issue.sceneId)}>
                {sceneName(issue.sceneId)}
              </button>
              {t.issues.separator}
              {t.issues.messages[issue.code](issue.params)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
