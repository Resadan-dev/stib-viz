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

- `image-size` 0.7.5 carries two open denial-of-service advisories, GHSA-w3rx-r6r6-pgpr and
  GHSA-5p2g-fcmc-qvqq, both rated high and both without a patched release: every published
  version up to the current 2.0.2 is affected, so there is no upgrade to take. It enters the tree
  five levels down, through `@deck.gl/geo-layers`, `@luma.gl/gltf`, `@loaders.gl/textures` and
  `texture-compressor`, the last being a Node command-line tool for offline texture compression
  that has had no real release since 2019.

  It never reaches a browser. stib-viz loads no glTF model, no 3D tile and no texture image, only
  trip positions and the network GeoJSON reach deck.gl, and the built bundles were searched to
  confirm it: `texture-compressor`, `image-size` and the vulnerable parsers appear nowhere in
  `web/dist`, the bundler having dropped the branch entirely. It is a lockfile entry rather than
  shipped code. Tracked via Dependabot; it goes when loaders.gl stops depending on it.
