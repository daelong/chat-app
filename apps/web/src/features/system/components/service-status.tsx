'use client';

import { Button } from '@/components/ui/button';
import { useServiceStatus } from '../hooks/use-service-status';

export function ServiceStatus() {
  const { api, database, socketStatus } = useServiceStatus();
  const rows = [
    { label: 'API 서버', value: api.isPending ? '확인 중' : api.isError ? '연결 안 됨' : '연결됨', ok: api.isSuccess },
    { label: '데이터베이스', value: database.isPending ? '확인 중' : database.isError ? '연결 안 됨' : '연결됨', ok: database.isSuccess },
    { label: '실시간 연결', value: socketStatus === 'checking' ? '확인 중' : socketStatus === 'connected' ? '연결됨' : '연결 안 됨', ok: socketStatus === 'connected' },
  ];
  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6" aria-label="서비스 연결 상태">
      <dl className="space-y-3 text-sm" aria-live="polite">
        {rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-8">
          <dt className="text-slate-600">{row.label}</dt>
          <dd className={row.ok ? 'text-emerald-700' : 'text-slate-500'}>{row.value}</dd>
        </div>)}
      </dl>
      <Button className="mt-6 w-full" disabled={api.isFetching || database.isFetching}
        onClick={() => { void api.refetch(); void database.refetch(); }}>서버 상태 다시 확인</Button>
    </section>
  );
}
