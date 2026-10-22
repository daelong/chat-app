import { AuthForm } from '@/features/auth/components/auth-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  const notice = google === 'cancelled' ? '구글 로그인을 취소했습니다. 다시 시도할 수 있어요.'
    : google === 'failed' ? '구글 로그인을 완료하지 못했습니다. 다시 시도해 주세요.' : undefined;
  return <AuthForm mode="login" loginNotice={notice} />;
}
