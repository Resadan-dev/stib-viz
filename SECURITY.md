# Security policy

## Scope

`stib-viz` is a static website and an offline data pipeline. It stores no user data, has no
backend, no accounts and no cookies. It reads public open data from the Belgian Mobility portal
and publishes pre-computed files.

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
