# Launch plan — aiming for traction, not vanity metrics

10,000 GitHub stars is an aspirational outcome, not something a launch can guarantee. The product must prove it reduces time spent reproducing frontend bugs.

## Before launch (weeks 1–2)

- Find at least ten TypeScript frontend engineers willing to try the tool with a throwaway project.
- Collect examples of failures and cases where GhostBug cannot reproduce a bug. Publish a transparent limitations section.
- Make the bundled red-to-green checkout demo work on Linux, macOS and Windows.
- Add a short GIF or video showing: failing UI → recording → generated test → fix → passing test.
- Ensure secrets and personally identifying information are absent from demo recordings.

## Launch day

- Headline: **Show HN: GhostBug — turn a browser bug into a Playwright regression test**.
- README first screen: one-sentence value proposition, short demo, 3-command quickstart, privacy/limitations.
- Share a genuine technical write-up: how actions and API fixtures are captured, what is *not* captured, and why the mock response remains the same when the UI is fixed.
- Share in the TypeScript, Playwright and webdev communities where permitted. Answer technical questions and acknowledge limitations promptly; avoid cross-post spam.

## Days 2–30

- Fix installation friction before adding more features.
- Label confirmed bugs, publish reproducible examples and releases.
- Invite outside contributors, keep beginner-friendly issues small.
- Ask developers whether they successfully transformed a real bug into a useful regression test — not whether they gave the repo a star.

## Signals to track

- Successful first reproduction (critical activation metric).
- Minutes from install to first passing locally replayed test.
- Returning developers and external contributions.
- Number of actionable issues and confirmed fixed bugs.
- Stars as a lagging awareness metric rather than product quality proof.

Do not buy stars, use bots, or promise support you cannot provide.
