import { useEffect, useState } from 'react';
import { ProjectList } from './components/ProjectList';
import { Editor } from './components/Editor';

/** Tiny hash router: "#/" = project list, "#/p/<id>" = editor. */
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  const match = /^#\/p\/([\w-]+)/.exec(hash);
  return match ? <Editor key={match[1]} projectId={match[1]!} /> : <ProjectList />;
}
