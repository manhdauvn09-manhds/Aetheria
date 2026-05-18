// Aetheria — transactional email sender.
//
// AuthService consumes `Mailer.send(message)` for password-reset and
// email-verification flows. Two impls:
//   - consoleMailer() — no-op transport that logs to stderr. Default
//     in dev so the link prints to the API console.
//   - resendMailer({apiKey, from}) — POSTs to https://api.resend.com/emails.
//     A real Resend account is needed for production. The api key carries
//     domain authorization, so we don't manage SPF/DKIM here.

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  /** Plain-text body. We don't ship HTML for now — keep it simple. */
  readonly text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

// ── Console (dev) ────────────────────────────────────────────────────
//
// Refuses to log in production: a reset-token URL in stderr → log
// aggregator → ATO. AuthService callers should swallow the throw the
// same way they swallow ResendMailer 5xx (user can try again), so the
// effect is "password reset is unavailable until ops configures Resend"
// rather than "tokens leak silently". A loud refusal beats a quiet leak.

export const consoleMailer = (): Mailer => ({
  send(message) {
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.error(
        `[mailer:console] REFUSED in production — would have leaked to=${message.to}; configure RESEND_API_KEY`,
      );
      return Promise.reject(
        new Error(
          "consoleMailer refuses to log in production (would leak reset tokens) — set RESEND_API_KEY",
        ),
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[mailer:console] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}\n`,
    );
    return Promise.resolve();
  },
});

// ── Resend ───────────────────────────────────────────────────────────

export interface ResendOptions {
  readonly apiKey: string;
  readonly from: string;
}

export const resendMailer = (opts: ResendOptions): Mailer => ({
  async send(message) {
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: opts.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      // We deliberately don't crash the request that triggered the email —
      // log + swallow. The user can request another reset / verification.
      console.error("[mailer:resend] request failed", e);
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.error(
        `[mailer:resend] non-OK status=${res.status} body=${body.slice(0, 500)}`,
      );
    }
  },
});
