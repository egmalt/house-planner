# Security Policy

## Supported versions

Security fixes go into the latest release on the `main` branch. Self-hosted installations should update to it; see [updating](docs/guide/en/deploy.md#updating).

| Version | Supported |
|---|---|
| 0.1.x | yes |

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately through GitHub: **Security → Report a vulnerability** on this repository, or directly at <https://github.com/egmalt/house-planner/security/advisories/new>. If you cannot use GitHub, email [hello@homedesignsai.pro](mailto:hello@homedesignsai.pro) with "Security" in the subject.

Include what you can: the affected file or endpoint, steps to reproduce, the impact you see, and a suggested fix if you have one. Reports in English or Russian are fine.

You can expect an acknowledgement within 7 days and a status update after the issue is assessed. Once a fix is released, the advisory is published with credit to the reporter, unless you prefer to stay anonymous.

## Scope

In scope: the PHP API in `public/api/` (authentication, the login cookie, CSRF protection, storage access, the setup wizard, the Petrovich cart proxy), the `.htaccess` rules that close `storage/`, `data/` and `plans/`, the Docker image, the deploy and plan scripts in `scripts/`, and the frontend.

Out of scope: misconfiguration of a particular hosting (for example, nginx without the equivalent of the `.htaccess` rules), the PHP built-in server used for local development, attacks that need the planner password, and third-party services (petrovich.ru, imagery tiles).

## Hardening a deployment

- Serve the site over HTTPS only; the login cookie gets the `Secure` flag on HTTPS.
- Keep the storage folder outside the web root (`../storage`) when the hosting allows it.
- Set `HOUSE_SETUP_KEY`, or in Docker `HOUSE_PASSWORD`, so nobody else can run the setup wizard before you.
- Use a long password: there is one password per installation, and the login endpoint only slows down guessing with a 1-second delay.
- On nginx, deny `/storage`, `/data`, `/plans` and `/api/_*` yourself, see [deploy.md](docs/guide/en/deploy.md#nginx).
