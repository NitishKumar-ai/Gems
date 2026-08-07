@AGENTS.md

## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-08-07
- MCP registered: yes (user scope, `✓ Connected`)
- Embeddings: **disabled** — brain was initialized with `--no-embedding`
- Artifacts sync: `full` → https://github.com/NitishKumar-ai/gstack-artifacts-friday (private)
- Artifacts source: `gstack-artifacts-friday`, federated, 56 pages / 198 chunks
- Current repo policy: read-write
- Imported: 7 markdown pages, 29 chunks (markdown strategy — docs only, not source symbols)

### Multi-device notes
- The artifacts remote uses **HTTPS**, not the SSH form `gstack-artifacts-init` writes by default.
  This machine has no SSH key registered on GitHub, so the SSH remote would fail on every push.
- On a new machine: copy `~/.gstack-artifacts-remote.txt` over, run `gstack-artifacts-init`, then
  set the remote to HTTPS if that machine also lacks an SSH key.
- The gbrain source reads a detached worktree at `~/.gstack-brain-worktree`, which does **not**
  advance on its own as new artifacts are committed. Run `/sync-gbrain` to refresh it, or the
  search index silently goes stale.
- The brain database itself is local PGLite and does **not** sync across machines. Only the
  artifacts repo does. A genuinely shared brain needs a Postgres/Supabase engine or a remote MCP.

**Search guidance is deliberately omitted.** The usual `## GBrain Search Guidance` block tells the
agent to prefer `gbrain search` over Grep for semantic questions. That advice is wrong on this
machine: with embeddings disabled, `gbrain search` is lexical only. A natural-language query
("how does the plugin avoid leaking prompts") returns no results, while Grep would have found it.

Use Grep here. Revisit after setting an embedding provider:

```
gbrain config set embedding_model voyage:voyage-code-3
gbrain config set embedding_dimensions 1024
```

Needs `VOYAGE_API_KEY` (or `OPENAI_API_KEY` with the matching model). Neither is set on this
machine. Re-running `/setup-gbrain` after that will re-evaluate and write the guidance block.
