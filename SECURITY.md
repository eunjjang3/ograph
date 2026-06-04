# Security Policy

## Supported Versions

The project is pre-1.0. Security fixes target the latest public release and
the current `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for security-sensitive reports.

Use GitHub Private Vulnerability Reporting:
https://github.com/eunjjang3/ograph/security/advisories/new

Include a minimal reproduction, affected version or commit, and the impact you
believe the issue has.

This package is a client-side React canvas component. Security-sensitive areas
are expected to involve dependency supply chain issues, unsafe consumer data
rendering assumptions, denial-of-service behavior from malformed graph data,
or browser interaction edge cases.
