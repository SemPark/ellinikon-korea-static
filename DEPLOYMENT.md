# Deployment

This repository has two GitHub Actions deployment channels.

## Site

`Deploy site to GitHub Pages` publishes the static website from `main`.

In GitHub, set Pages to use **GitHub Actions** as the source.

## News Worker

`Deploy news Worker` publishes `news-worker/` to Cloudflare Workers.

Required GitHub repository secret:

- `CLOUDFLARE_API_TOKEN`

The Worker still uses the existing Cloudflare secret:

- `ADMIN_PASSWORD`
