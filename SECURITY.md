# Security policy

This is an experimental developer tool, not a security product. **GhostBug's redaction is best-effort and cannot guarantee anonymity.** Captured API responses, URLs, CSS selectors and test fixtures may contain secrets or personal data.

- Do not upload real `session.json` files to public issues unless thoroughly reviewed and sanitized.
- Never run a generated test against production; it may trigger mutating operations.
- The built-in `replay` command intentionally refuses remote hosts.
- Avoid recording third-party services without permission.

For security issues, privately contact the repository maintainers using GitHub's **Report a vulnerability** mechanism after publishing the repository and enabling private vulnerability reporting. Do not post exploitation details publicly before maintainers have a chance to respond.

No private contact address is configured for this unpublished starter repository.
