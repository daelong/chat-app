import type { Metadata } from 'next';
import { InvitationEntry } from '@/features/invitations/components/invitation-entry';

export const metadata: Metadata = { title: '채팅방 초대 · Chat App', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default function InvitePage() { return <InvitationEntry />; }
