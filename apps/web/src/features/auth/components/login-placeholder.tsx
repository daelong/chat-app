import Link from 'next/link';

export function LoginPlaceholder() {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
    <h1 className="text-2xl font-bold">로그인</h1>
    <p className="my-5 leading-7 text-slate-600">로그인 화면의 경로가 준비되었습니다. 회원가입과 인증 기능은 아직 구현 전입니다.</p>
    <Link href="/chats" className="text-indigo-700 underline">시작 화면으로 돌아가기</Link>
  </main>;
}
