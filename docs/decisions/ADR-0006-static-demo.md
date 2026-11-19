# ADR-0006: Static, serverless demo

Status: accepted

## Context
Reviewers should be able to open the demo in a minute, without accounts, keys or a backend. A demo that needs setup is often not opened.

## Decision
Run the runtime, the assistant and the data in the browser. State lives in memory with a localStorage copy and a reset button. When a fresh store loads, the weekly assistant runs once for each company, so the demo opens on Monday morning with decisions and drafts waiting. The viewer is fixed as the head of government affairs for the selected company. Build as a static bundle with relative asset paths, deployable to GitHub Pages under any repository name.

## Consequences
- Zero setup for reviewers; no secrets in the repository; no network calls.
- The runtime must be pure TypeScript with no server or DOM dependencies, which also makes it easy to test.
- No real multi-user behavior, authentication or durable storage. The security model says so explicitly.
- The analyst role exists in the model and the tests but not on screen.
