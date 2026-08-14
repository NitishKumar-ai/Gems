# Gems

## Live Founder Loop

The CLI does not use dotenv. In the shell:
```bash
set -a && source .env && set +a
```

- `npx tsx src/cli.ts status` — expect `github=set linear=set model=set worker_user=set`
- `npx tsx src/cli.ts run --ticket ISSUE_ID`
- Founder merges the PR. Worker stays off protected branches.
- After merge: `npx tsx src/cli.ts close --ticket ISSUE_ID --intervention false`