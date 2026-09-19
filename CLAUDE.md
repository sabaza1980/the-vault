# The Vault — working conventions

## Commits

Commits are authored by Sherif. Do **not** add a `Co-Authored-By:` trailer, and
do not mention an assistant, a model or a tool anywhere in the subject or body.

Keep the `Claude-Session:` trailer. It is a private link back to the session
that produced the change, so the reasoning behind a commit stays findable.

    fix: short summary, imperative mood

    Why the change was needed, and what it does. Wrapped at 72 characters.

    Claude-Session: https://claude.ai/code/session_...

The same applies to pull request descriptions.
