export function invitationEmail(input: { roomName: string | null; inviterName: string; invitationUrl: string; expiresAt: Date }) {
  const room = input.roomName ?? '채팅방';
  const expiry = input.expiresAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) + ' (한국 시간)';
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
  return {
    subject: `[Chat App] ${input.inviterName.replace(/[\r\n]/g, ' ')}님의 채팅방 초대`,
    text: `${input.inviterName}님이 '${room}'에 초대했습니다.\n회원가입 없이 이름만 입력하면 참여할 수 있어요.\n\n채팅방 참여하기: ${input.invitationUrl}\n\n유효기간: ${expiry}\n이 링크는 한 번만 사용할 수 있습니다. 다른 사람에게 전달하지 마세요.`,
    html: `<div lang="ko" style="font-family:Arial,sans-serif;max-width:560px;margin:32px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a"><h1 style="font-size:24px">채팅방에 초대받았어요</h1><p>${escape(input.inviterName)}님이 <strong>${escape(room)}</strong>에 초대했습니다.</p><p>회원가입 없이 이름만 입력하면 참여할 수 있어요.</p><p style="margin:32px 0"><a href="${escape(input.invitationUrl)}" style="display:inline-block;padding:14px 24px;background:#4338ca;color:#fff;text-decoration:none;border-radius:8px">채팅방 참여하기</a></p><p style="color:#64748b;font-size:13px">유효기간: ${escape(expiry)}<br>이 링크는 한 번만 사용할 수 있습니다. 다른 사람에게 전달하지 마세요.</p></div>`,
  };
}
