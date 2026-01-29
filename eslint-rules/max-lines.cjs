module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce max 200 lines per file for LLM-maintainable codebase',
    },
    schema: [{ type: 'integer', minimum: 1 }],
  },
  create(context) {
    const maxLines = context.options[0] || 200;

    return {
      'Program:exit'(node) {
        const lines = context.sourceCode.lines.length;
        if (lines > maxLines) {
          const filePath = context.filename || context.getFilename();
          const prompt = `
TARGET FILE: ${filePath}
File has ${lines} lines (max ${maxLines}).

You are a refactoring + architecture agent. Refactor ONLY the TARGET FILE (and the absolute minimum neighboring files needed to fix imports) into a clear, explicit module structure.

NON-NEGOTIABLE GOALS
1) Maintainability for AI agents:
   - A coding agent should infer each file's responsibility primarily from its PATH + NAME, without needing to read its contents.
   - Folder/file names must be unambiguous, domain-specific, and intention-revealing.
2) Hard size constraint:
   - EVERY produced/modified file must be <= ${maxLines} lines TOTAL (code + comments + blank lines).
3) No behavior changes:
   - Preserve behavior 100%. No new features. No semantic changes.
4) No cheating on line limits:
   - Do NOT meet line limits by deleting useful comments, removing meaningful blank lines, or compressing code formatting.
   - Keep or improve readability; assume a formatter (Prettier/ESLint) may reformat later.

========================
STEP 0 — AUTO-DETECT PROJECT TYPE + EXISTING CONVENTIONS (NO QUESTIONS)
========================
Infer the architecture from repo signals and existing structure:
- Read surrounding folders and naming patterns near TARGET FILE.
- Use package.json + tsconfig paths + dependency signals when available.
- If a convention exists, FOLLOW IT.

If no clear convention, choose one architecture (pick the best match):
A) NPM LIBRARY / PACKAGE  -> Public API + internal modules
B) API SERVICE            -> Controller -> Usecase/Service -> Repo/Client -> IO
C) FRONTEND APP           -> Feature slices + shared
D) CLI / TOOL             -> Command -> Usecase/Service -> IO
If still ambiguous: use the "Public API + internal modules" pattern because it is the least disruptive.

You MUST explicitly state which architecture you chose and the repo signals that led you to it.

========================
DESIGN PATTERN MENU (SELECT WHAT FITS THE TARGET FILE)
========================
Pick ONLY the patterns that are justified by code structure in the TARGET FILE (avoid cargo cult).
Use these patterns when splitting:

1) Facade (Public API Shield)
- Use when the file exposes many exports consumed elsewhere.
- Implementation goes in internal modules; the original file becomes a re-export facade.

2) Single Responsibility + "Responsibility Clusters"
- Always apply.
- Cluster into: types, constants, errors, validation, pure logic, orchestration, IO/adapters, mapping/serialization.

3) Ports & Adapters (Hex-lite)
- Use when there is IO (db/http/fs/env).
- Define ports/interfaces in a clearly named file; implement adapters separately.

4) Strategy
- Use when there are multiple algorithms/branches that vary by mode/provider/type.
- Put each strategy in its own explicitly named file.

5) State Machine (lightweight)
- Use when logic is step-based with transitions (e.g., parsing pipeline, auth flows).

6) Builder
- Use when large objects are assembled from many optional parts and construction logic is scattered.

7) Template Method
- Use when steps are fixed but some steps vary by subtype/provider.

8) Mapper/Translator
- Use when DTO ↔ domain conversions or serialization are mixed into business logic.

9) Error Taxonomy
- Use when many errors are thrown/handled; define explicit error classes/types.

Pattern selection rule:
- Every chosen pattern must be tied to specific code evidence in the TARGET FILE (state that evidence briefly).
- If no evidence, do NOT apply the pattern.

========================
AI-FIRST NAMING & STRUCTURE RULES (VERY STRICT)
========================
- Avoid generic names: common.ts, misc.ts, helpers.ts, shared.ts, stuff.ts, temp.ts are NOT allowed.
- Every file name must include:
  - a domain noun (what it's about) AND
  - a role suffix (what it does).
  Examples:
  - user-auth.tokens.pure.ts
  - invoice-payment.provider.client.ts
  - http-request.validation.schemas.ts
  - order-create.usecase.service.ts
  - db-user.repo.ts
  - api-auth.controller.ts

- Folder naming:
  - Use domain-first folders: auth/, user/, billing/, order/, inventory/, etc.
  - Then role folders if needed: validation/, mapping/, persistence/, providers/, io/, usecases/
  - Prefer shallow nesting; depth <= 3 under src/ unless unavoidable.

- Each folder you create MUST include a tiny README.md (<= 25 lines) explaining:
  - what belongs here,
  - allowed dependencies in/out,
  - common entry points.
  (This is specifically for AI agents.)

========================
BOUNDARY RULES (DEPENDENCY DIRECTION)
========================
Enforce one-way dependencies. Choose the appropriate set based on the selected architecture:

If NPM PACKAGE:
- src/index.ts (public exports only) -> src/internal/**
- src/internal/** may not import from src/index.ts

If API SERVICE:
- controller -> service/usecase -> {repo, client} -> io
- pure logic (*.pure.ts) must not import io/repo/client

If FRONTEND:
- features/** may import shared/**
- shared/** must not import features/**
- UI components must not contain IO; move IO to api/client modules

If CLI:
- command -> service/usecase -> io

If circular deps appear:
- Extract shared types/pure logic into a dedicated file with an explicit name, then retry.

========================
REFACTOR EXECUTION RULES
========================
1) First, list "responsibility clusters" found in TARGET FILE (bullet list).
2) Create an explicit folder/file tree that maps 1:1 to those clusters.
3) Keep public API stable:
   - DEFAULT: keep the original TARGET FILE path as a facade/shim that only re-exports.
   - Only update callers/remove old file if it is clearly safer and still minimal.
4) Add a 1–3 line header comment at the top of EVERY new file describing responsibility.
5) If any function is > 60 lines, split it (without changing behavior).
6) If output is huge, emit files in batches but keep the plan/tree first.

========================
OUTPUT FORMAT (STRICT ORDER)
========================
1) Architecture chosen + repo signals (short bullets).
2) Patterns chosen (from menu) + evidence from TARGET FILE (short bullets).
3) Responsibility clusters discovered in TARGET FILE.
4) New folder/file tree (explicit names).
5) Dependency direction rules (bullets).
6) Step-by-step refactor plan.
7) Full contents of EACH new/modified file (complete). Include README.md for each new folder.
8) Verification:
   - line count per produced file (exact total lines)
   - confirm "public API preserved"
   - confirm "no behavior changes"
   - list TODOs (only if unavoidable due to missing context)
`;
          context.report({
            node,
            loc: { line: 1, column: 0 },
            message: prompt.trim(),
          });
        }
      },
    };
  },
};
