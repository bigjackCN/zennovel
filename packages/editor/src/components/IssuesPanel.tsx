import type { Project, StoryIssue } from '@zennovel/core';

interface Props {
  project: Project;
  issues: StoryIssue[];
  onSelectScene: (id: string) => void;
}

/** The story checker, in plain language. */
export function IssuesPanel({ project, issues, onSelectScene }: Props) {
  const sceneName = (id: string) => project.scenes.find((s) => s.id === id)?.name ?? id;
  return (
    <section className="issues">
      <h3>Story check</h3>
      {issues.length === 0 ? (
        <p className="ok">✓ No problems found</p>
      ) : (
        <ul>
          {issues.map((issue, i) => (
            <li key={i} className={issue.level}>
              <button className="link" onClick={() => onSelectScene(issue.sceneId)}>
                {sceneName(issue.sceneId)}
              </button>
              : {issue.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
