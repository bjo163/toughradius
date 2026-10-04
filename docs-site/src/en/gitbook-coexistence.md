# Handbook Publishing

> Bahasa Indonesia: [Versi Indonesia](../id/gitbook-coexistence.md)

This handbook is maintained in `docs-site/src/` and published to the repository's
GitHub Pages project site: <https://bjo163.github.io/mwx-isp/>. The repository
workflow is `.github/workflows/pages.yml`; it builds the mdBook sources and
deploys the result. It does not set a custom domain.

The repository also contains a `.gitbook.yaml` configuration that can be used by
an external GitBook integration. This file alone does not confirm that GitBook
publishing is connected or active. Older `toughradius.net` destinations belong
to the previous branding and may be managed outside this repository. The
current canonical handbook URL is the GitHub Pages URL above.

## Source and navigation

Both mdBook and a configured GitBook integration can read the same source files:
the landing page is `docs-site/src/introduction.md`, and the navigation is
`docs-site/src/SUMMARY.md`. mdBook settings live in `docs-site/book.toml`; GitBook
settings live in `.gitbook.yaml`. Keep the English and Indonesian chapters aligned
when changing the handbook.

## Language toggle

The mdBook output adds an EN / ID switch via
`docs-site/assets/lang-toggle.{js,css}`. It links matching filenames under
`src/en/` and `src/id/`. GitBook readers can use the same language sections in
the sidebar and the chapter links.

## Build and validation

Run `mdbook build docs-site` to build the static site into `docs-site/book/`, or
`mdbook serve docs-site` to preview it locally. GitHub Actions builds and deploys
the handbook when `docs-site/**` changes on `main`.
