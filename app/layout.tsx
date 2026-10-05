import type { Metadata } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
  title: 'JEE LiveSync Classroom',
  description: 'Synchronized, distraction-free live-style YouTube classroom timetable and clock-locked player for JEE aspirants.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0b0f17] text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
