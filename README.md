# LISTEN — Snugsworth Beat Tape Store

A direct-to-fan storefront for the LISTEN beat tape. Pay what you want, instant digital delivery.

## Tech

- Landing page: plain HTML/CSS/JS (GitHub Pages)
- Payments: Stripe Checkout + Webhooks
- Email delivery: automated on successful payment
- Assets hosted on [fonk.zo.space/listen](https://fonk.zo.space/listen)

## Routes

| Path | Description |
|------|-------------|
| `/api/checkout` | POST — creates Stripe Checkout session |
| `/api/webhook` | POST — Stripe webhook handler |

## Setup

1. Add secrets in Zo Settings → Advanced:
   - `STRIPE_SECRET_KEY` — Stripe secret key
   - `STRIPE_WEBHOOK_SECRET` — from Stripe Webhooks dashboard
   - `GMAIL_USER` / `GMAIL_PASS` — SMTP for delivery emails

2. Stripe webhook endpoint: `https://fonk.zo.space/api/listen/webhook`
   - Events: `checkout.session.completed`

## Development

The API routes run on Zo Space. The static frontend can be served from GitHub Pages or any static host.

## License

MIT
