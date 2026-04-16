import type { Request, Response } from 'express';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPipelineWorkspaceDir } from '../../util/paths.js';
import { fileError } from '../../util/logger.js';

// Map a pipeline stage id to the file or directory that holds its outputs.
// Some stages write a single dated file, some a directory of files, some a
// stable JSON file that's overwritten each run. Each entry returns either:
//   { kind: 'file', path }      — single file
//   { kind: 'glob', dir, ext }  — directory with files matching extension
//   { kind: 'date-file', dir, suffix? } — pick the YYYY-MM-DD[.suffix].ext file
function resolveOutputs(stageId: string, date: string): Array<{ name: string; path: string }> {
  const root = getPipelineWorkspaceDir();
  const candidates: Array<{ name: string; path: string }> = [];

  const tryFile = (name: string, p: string) => {
    if (existsSync(p) && statSync(p).isFile()) candidates.push({ name, path: p });
  };
  const tryDir = (dir: string, exts: string[]) => {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
    for (const f of readdirSync(dir).sort()) {
      if (exts.some((e) => f.endsWith(e))) {
        candidates.push({ name: f, path: resolve(dir, f) });
      }
    }
  };

  switch (stageId) {
    case 'trend-scout':
      tryFile(`${date}.md`, resolve(root, 'trend-scout', 'predictions', `${date}.md`));
      break;
    case 'competitive-intel':
      tryFile(`${date}-daily.md`, resolve(root, 'competitive-intel', 'briefings', `${date}-daily.md`));
      tryFile(`${date}-weekly.md`, resolve(root, 'competitive-intel', 'briefings', `${date}-weekly.md`));
      break;
    case 'engagement-tracker':
      tryFile('metrics.json', resolve(root, 'engagement-tracker', 'metrics.json'));
      tryDir(resolve(root, 'engagement-tracker', 'dashboard'), ['.md', '.json']);
      break;
    case 'network-mapper':
      tryFile('contacts.json', resolve(root, 'network-mapper', 'contacts.json'));
      tryFile('contacts-active.json', resolve(root, 'network-mapper', 'contacts-active.json'));
      break;
    case 'amplification':
      tryFile(`${date}.md`, resolve(root, 'amplification', 'wins', `${date}.md`));
      break;
    case 'content-planner':
      tryFile(`${date}.md`, resolve(root, 'content-briefs', `${date}.md`));
      tryFile('pillar-tracker.json', resolve(root, 'content-planner', 'pillar-tracker.json'));
      break;
    case 'content-writer':
      tryDir(resolve(root, 'content-ready', date), ['.md']);
      break;
    default:
      // Unknown stage — return empty list
      break;
  }

  return candidates;
}

export async function handlePipelineStageFiles(req: Request, res: Response): Promise<void> {
  const stageId = req.params.stageId as string;
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  // Basic sanity-check on date so we don't path-traverse via ?date=../...
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  try {
    const outputs = resolveOutputs(stageId, date);
    const files = outputs.map((o) => {
      let content = '';
      let truncated = false;
      try {
        const buf = readFileSync(o.path, 'utf-8');
        // Cap at 200KB to avoid blowing up the UI on huge JSON dumps.
        if (buf.length > 200_000) {
          content = buf.slice(0, 200_000);
          truncated = true;
        } else {
          content = buf;
        }
      } catch (err) {
        content = `[failed to read: ${err instanceof Error ? err.message : String(err)}]`;
      }
      return { name: o.name, content, truncated };
    });
    res.json({ stageId, date, files });
  } catch (err) {
    fileError('pipeline', 'list stage files failed', { stageId, date, error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read stage files' });
  }
}
