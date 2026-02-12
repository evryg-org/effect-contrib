## ⚠️ Mandatory Workflow (ALWAYS FOLLOW)

You must commt after each step of a plan, before committing ANY change, you MUST complete this checklist:

1. **Run tests**: `pnpm vitest` (single package: `pnpm --filter @evryg/{package} test`)
2. **Run build**: `pnpm build` (single package: `pnpm --filter @evryg/{package} build`)
3. **Run lint (autofix)**: `pnpm lint-fix` (single package: `pnpm lint-fix -- "packages/{package}/**/*.{ts,mjs}"`)
4. **Verify all pass** - Do NOT commit if tests fail or build breaks
5. **Audit the changes** - Ask a subagent to audit the code changes based on ./LEARNINGS.md and fix the issues
6. **Commit** with concise message (no AI mentions)

If tests fail for unrelated reasons, note it but still verify YOUR changes don't break anything.

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

Don't assume, always start by rephrasing the demand before doing anything. Then ask clarifying questions using the AskUserQuestion tool when you are unsure

## Typescript rules 
- Never use casting (x as y). If you are stuck on a type, ask the user for a solution
- Never use any. If you are stuck on a type, ask the user for a solution

## Learnings
The important code pattern we defined for this project that must be followed.
File: ./LEARNINGS.md

