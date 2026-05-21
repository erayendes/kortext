#!/usr/bin/env node
const cmd = process.argv[2] ?? 'help';

const messages = {
  help: 'kortext v3 — commands: start, mcp, status, doctor (Phase 7 — not implemented yet)',
  start: 'kortext start: backend + dashboard runtime (Phase 7 placeholder)',
  mcp: 'kortext mcp: MCP server stdio (Phase 5 placeholder)',
  status: 'kortext status: runtime status (Phase 7 placeholder)',
  doctor: 'kortext doctor: diagnostics (Phase 7 placeholder)',
};

const out = messages[cmd] ?? `unknown command: ${cmd}\n${messages.help}`;
console.log(out);
