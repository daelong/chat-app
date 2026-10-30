import { Inject, Injectable } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { APP_ENVIRONMENT, type Environment } from '../../config/environment';
import { invitationEmail } from './invitation-email';

@Injectable()
export class InvitationMailer {
  constructor(@Inject(APP_ENVIRONMENT) private readonly environment: Environment) {}

  mode() { return this.environment.MAIL_MODE === 'local' ? 'LOCAL' as const : this.environment.MAIL_MODE === 'smtp' ? 'SMTP' as const : 'DISABLED' as const; }

  async send(input: { to: string; roomName: string | null; inviterName: string; invitationUrl: string; expiresAt: Date }): Promise<void> {
    if (this.environment.MAIL_MODE === 'disabled') throw new Error('Email is not configured');
    const transport = createTransport({
      host: this.environment.SMTP_HOST, port: this.environment.SMTP_PORT, secure: this.environment.SMTP_SECURE,
      requireTLS: this.environment.MAIL_MODE === 'smtp' && !this.environment.SMTP_SECURE,
      ...(this.environment.SMTP_USER ? { auth: { user: this.environment.SMTP_USER, pass: this.environment.SMTP_PASSWORD } } : {}),
      connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
      disableFileAccess: true, disableUrlAccess: true,
    });
    try {
      const result = await transport.sendMail({ from: { name: 'Chat App', address: this.environment.MAIL_FROM },
        to: { address: input.to, name: '' }, ...invitationEmail(input) });
      if (!result.accepted.length) throw new Error('Recipient rejected');
    } finally { transport.close(); }
  }
}
