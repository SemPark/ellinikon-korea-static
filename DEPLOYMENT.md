# Deployment

This repository deploys the static site through GitHub Pages.

## Site

GitHub Pages publishes the website from the root of the `main` branch.

The published artifact includes:

- `index.html`
- `admin.html`
- `assets/`
- `css/`
- `js/`
- `data/`

## News Management

News items are stored in `data/news.json`.

The admin page updates that file through the GitHub Contents API. Use a GitHub token with read/write contents access to this repository.
