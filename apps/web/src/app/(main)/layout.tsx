import type { ReactNode } from 'react';
import { ChatSidebar } from '@/widgets/chat-sidebar';

export default function MainLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen flex-col md:flex-row"><ChatSidebar />{children}</div>;
}
