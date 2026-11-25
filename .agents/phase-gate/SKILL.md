---
name: phase-gate
description: Runs end-of-phase typechecks, unit tests, security audit delegation, and generates a concise verification report before advancing to the next build phase.
---

# Skill: Phase Gate Verification

Run this checklist at the end of every build phase in @docs/BUILD_PLAN.md:

1. Run `npm run typecheck` and `npm test`. Fix any failures before reporting.
2. Invoke the `security-auditor` subagent on files changed in this phase.
3. Check that @docs/ARCHITECTURE.md and @docs/BUILD_PLAN.md reflect any completed items or contract changes.
4. Output a short **Phase Gate Report**:
   - Files created/modified
   - Typecheck & test counts (pass/fail)
   - Security audit verdict (0 critical/high issues required)
   - Ready for next phase? (Yes/No + blockers)›