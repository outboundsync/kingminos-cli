#!/usr/bin/env node
// Writes commands.json, the CLI's command reference as data (schema
// cli.commands.v1), from the built CLI's COMMAND_REFS. Run `npm run commands:json`
// (it builds first). test/commands-json.test.ts fails when the committed file
// differs from this output; the API sync workflow regenerates it after the agent.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { commandsJsonText } = await import(path.join(ROOT, 'dist', 'kingminos.js'));

writeFileSync(path.join(ROOT, 'commands.json'), commandsJsonText());
console.log('Wrote commands.json');
