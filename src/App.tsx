import { lazy, Suspense, useEffect, useState } from 'react';
import { GraphPlayground } from './demo/GraphPlayground';

const DebugLab = lazy(() => import('./components/graph/debug/GraphDebugHarness').then(module => ({ default: module.GraphDebugHarness })));

export default function App() {
  const [debug, setDebug] = useState(() => window.location.hash === '#debug');
  useEffect(() => {
    const onHashChange = () => setDebug(window.location.hash === '#debug');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return debug ? <Suspense fallback={<p className="demo-loading">Opening debug lab…</p>}>
    <a className="demo-back" href="#">← Playground</a>
    <DebugLab />
  </Suspense> : <GraphPlayground />;
}
