'use client';

import dynamic from 'next/dynamic';

const NotionApp = dynamic(() => import('@/components/notion/NotionApp'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#ffffff',
      }}
    >
      <div className="boot-spinner" />
    </div>
  ),
});

export default function Home() {
  return <NotionApp />;
}
