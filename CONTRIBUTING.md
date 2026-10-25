# Contributing to GhostBug

Thank you for helping build reliable browser bug reproductions. This project is an early developer preview.

## First contribution

1. Fork the repository and open an issue describing the behavior you want to improve.
2. Install Node 22+, then run `npm install`, `npm test`, and `npm run build`.
3. Add a test or a small reproducible HTML example with each bug fix.
4. Submit a focused pull request explaining how it changes capture, redaction, or replay.

Great first issues: more robust CSS locators, a session viewer without a server, progress logging, Windows scripts, CLI UX, additional redaction test cases and browser automation fixtures.

## Security and privacy

Never commit real recorded passwords, API keys, cookies, financial data, addresses or other personally identifying information. Use synthetic fixtures only. Please read [SECURITY.md](SECURITY.md) before reporting vulnerabilities.

## Style

TypeScript strict, small modules, avoid dependencies when standard Node APIs suffice, write tests for each bug fix, update the README for user-visible flags.

## Code of conduct

Be respectful and constructive. Harassment and personal attacks are not acceptable.
