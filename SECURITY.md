# Security policy

## Scope

`stib-viz` is a static website and an offline data pipeline. It stores no user data, has no
backend, no accounts and no cookies. It reads public open data from the Belgian Mobility portal
and publishes pre-computed files.

The published site sends a strict Content-Security-Policy and the usual hardening headers from
`web/public/_headers`; a Playwright test applies that policy to the preview so a change that would
break under it is caught before deployment.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, rather than opening a public issue.

This is a personal, single-maintainer project: there is no guaranteed response time, but reports
are read and taken seriously.

## What is in scope

- Dependency vulnerabilities reachable from the published site.
- Supply-chain issues in the build or deployment workflows.
- Anything that would let a third party alter the published data or site content.

## What is not in scope

- The accuracy or availability of STIB-MIVB open data itself. Report those to the data publisher.
- Denial of service against third-party services the site links to (map tiles, data portal).

## Known accepted risk

- `image-size` (transitive dependency of `@deck.gl/geo-layers`, via its glTF and texture
  loaders) has an open denial-of-service advisory with no patched version available as of
  September 2026. stib-viz never loads glTF models, 3D tiles or texture images — only trip
  positions and the network GeoJSON reach deck.gl — so this code path is never invoked. Tracked
  via Dependabot; will be bumped once a fix is published.
