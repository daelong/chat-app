'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { useMemberSession } from '../hooks/use-member-session';

export function AuthBoundary({ children }: { children: ReactNode }) {
  const session = useMemberSession();
  const router = useRouter();
  useEffect(() => {
    if (session.isSuccess && !session.data) router.replace('/login');
  }, [session.isSuccess, session.data, router]);
  if (session.isError && !session.data) return <main className="mx-auto max-w-md px-6 py-20">
    <p role="alert" className="mb-4 text-slate-600">{errorMessage(session.error)}</p>
    <Button onClick={() => { void session.refetch(); }} disabled={session.isFetching}>다시 확인</Button>
  </main>;
  if (!session.data) return <p className="p-8 text-slate-500" role="status">로그인 상태를 확인하고 있어요.</p>;
  return children;
}
