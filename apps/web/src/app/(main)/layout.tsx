import type { ReactNode } from 'react';
import { ChatSidebar } from '@/widgets/chat-sidebar';
import { AuthBoundary } from '@/features/auth/components/auth-boundary';

export default function MainLayout({ children }: { children: ReactNode }) {
  return <AuthBoundary><div className="flex min-h-screen flex-col md:flex-row"><ChatSidebar />{children}</div></AuthBoundary>;
}
