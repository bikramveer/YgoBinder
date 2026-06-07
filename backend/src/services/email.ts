import { Resend } from 'resend';

const resend = new Resend(process.env.EMAIL_API_KEY);

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'YgoBinder <noreply@yourdomain.com>',
    to,
    subject: 'Your YgoBinder verification code',
    html: `
      <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto; padding: 24px;">
        <h2 style="margin-top: 0;">Verify your email</h2>
        <p>Enter this code in the YgoBinder app to activate your account:</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center;
                    padding: 24px; background: #f4f4f5; border-radius: 8px; margin: 24px 0;">
          ${code}
        </div>
        <p style="color: #71717a; font-size: 14px; margin: 0;">
          This code expires in 10 minutes. If you didn't create a YgoBinder account, you can safely ignore this email.
        </p>
      </div>
    `,
  });
}
