## graphify — Knowledge Graph (ALWAYS check first)

This project has a pre-built knowledge graph at `graphify-out/`.

**Before searching or grepping the codebase**, consult the graph:

1. **Read `graphify-out/GRAPH_REPORT.md` first** — it contains god nodes, community structure, and module relationships. This gives you a map of the codebase before you start exploring.
2. **If `graphify-out/wiki/index.md` exists**, navigate the wiki instead of reading raw source files — it provides structured summaries of each module and their interactions.
3. **Use grep/glob as a second step** — only after consulting the graph, to find specific implementation details the graph doesn't cover.

After modifying code files, rebuild the graph:
```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
