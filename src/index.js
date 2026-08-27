#!/usr/bin/env node

import { program } from 'commander';
import { botCommand } from './commands/bot.js';

program
  .name('us-visa-bot')
  .description('Automated US visa appointment rescheduling bot')
  .version('0.0.1');

// isDefault lets `node index.js -c <date>` work without the `bot` subcommand name,
// for backward compatibility. Declaring the options separately on `program` itself
// (as before) made commander enforce the root's required options even when `bot`
// was invoked explicitly, breaking `node index.js bot -c <date>`.
program
  .command('bot', { isDefault: true })
  .description('Monitor and reschedule visa appointments')
  .requiredOption('-c, --current <date>', 'current booked date')
  .option('-t, --target <date>', 'target date to stop at')
  .option('-m, --min <date>', 'minimum date acceptable')
  .option('--dry-run', 'only log what would be booked without actually booking')
  .action(botCommand);

program.parse();
