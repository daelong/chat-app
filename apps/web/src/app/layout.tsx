import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = { title: 'Chat App', description: '웹과 모바일을 위한 채팅 서비스' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body><Providers>{children}</Providers></body></html>;
}
