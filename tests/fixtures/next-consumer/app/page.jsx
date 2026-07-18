'use client';

import dynamic from 'next/dynamic';

const GraphClient = dynamic(() => import('./graph-client'), {
  loading: () => <div data-testid="graph-loading">Loading graph</div>,
  ssr: false
});

export default function Page() {
  return (
    <main>
      <GraphClient />
    </main>
  );
}
