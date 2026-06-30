// FILE: cgen-main/backend/scripts/backfillClauseGroupLinks.js

/**
 * One-time backfill for the clause-group propagation fix.
 *
 * BACKGROUND: previously, assigning a clause group to a Position flattened
 * the group's clauses into Position.assignedClauses and threw away the fact
 * that a group was involved at all. So editing a clause group later never
 * reached positions that were assigned "via" that group.
 *
 * Position now has an assignedClauseGroups field. New/edited positions set
 * it correctly going forward (see routes/positions.js). This script is a
 * BEST-EFFORT heuristic to re-link EXISTING positions retroactively:
 *
 *   For each position with assignedClauses but no assignedClauseGroups yet:
 *     - Look at every ClauseGroup, largest first.
 *     - If ALL of that group's current clauses are present in the position's
 *       assignedClauses, treat the position as "assigned via that group":
 *         - add the group to assignedClauseGroups
 *         - remove those clause ids from the individual list
 *     - Whatever clause ids are left over after checking all groups stay as
 *       genuine ad-hoc individual clauses.
 *
 * LIMITATIONS (please read before running):
 *   - This can only detect a group if the position currently has ALL of that
 *     group's clauses. If, since assignment, you already added/removed
 *     clauses from the group (which is the exact bug being fixed), the
 *     position's stored set may no longer exactly match — in that case this
 *     script will NOT link it, and it will stay as individual clauses
 *     (safe — no data is lost or incorrectly changed, it's just not
 *     auto-upgraded). You'll need to re-link it manually via Position
 *     Management or the new bulk-assign endpoint.
 *   - If a position's clauses happen to be a superset of more than one group,
 *     this greedily picks groups (largest first) without overlap-checking
 *     beyond removing matched ids — review the dry-run output carefully.
 *   - NEVER touches Contract documents. Contracts already store literal
 *     clause text (customContent) snapshotted at creation time, so they are
 *     completely unaffected by anything this script does.
 *
 * Usage (dry run by default — shows what WOULD change, writes nothing):
 *   node backend/scripts/backfillClauseGroupLinks.js
 *
 * Usage (apply the changes for real):
 *   node backend/scripts/backfillClauseGroupLinks.js --apply
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import mongoose from 'mongoose';
import connectDB from '../database.js';
import Position from '../models/Position.js';
import ClauseGroup from '../models/ClauseGroup.js';

const APPLY = process.argv.includes('--apply');

await connectDB();

const groups = await ClauseGroup.find({}).lean();
// Largest groups first — gives them priority when a position's clause set
// could match more than one group.
groups.sort((a, b) => (b.clauses?.length || 0) - (a.clauses?.length || 0));

const positions = await Position.find({
  assignedClauses: { $exists: true, $ne: [] },
  $or: [{ assignedClauseGroups: { $exists: false } }, { assignedClauseGroups: { $size: 0 } }]
});

console.log(`Found ${positions.length} position(s) with individual clauses and no linked groups yet.`);
console.log(APPLY ? '\n*** APPLY MODE — changes WILL be saved ***\n' : '\n--- DRY RUN — no changes will be saved (pass --apply to save) ---\n');

let linkedCount = 0;
let untouchedCount = 0;

for (const position of positions) {
  const remaining = new Set((position.assignedClauses || []).map(id => id.toString()));
  const matchedGroupIds = [];

  for (const group of groups) {
    const groupClauseIds = (group.clauses || []).map(id => id.toString());
    if (groupClauseIds.length === 0) continue;
    const allPresent = groupClauseIds.every(id => remaining.has(id));
    if (allPresent) {
      matchedGroupIds.push(group._id);
      groupClauseIds.forEach(id => remaining.delete(id));
    }
  }

  if (matchedGroupIds.length === 0) {
    untouchedCount++;
    continue;
  }

  const matchedGroupNames = groups
    .filter(g => matchedGroupIds.some(id => id.toString() === g._id.toString()))
    .map(g => g.name);

  console.log(
    `Position ${position.positionCode} (${position.title}): ` +
    `link to group(s) [${matchedGroupNames.join(', ')}], ` +
    `${remaining.size} clause(s) stay individual`
  );

  if (APPLY) {
    position.assignedClauseGroups = matchedGroupIds;
    position.assignedClauses = [...remaining];
    await position.save();
  }

  linkedCount++;
}

console.log(`\nDone. ${linkedCount} position(s) ${APPLY ? 'linked to clause groups' : 'WOULD be linked (dry run)'}, ${untouchedCount} left untouched (no full group match found).`);
if (!APPLY) {
  console.log('Re-run with --apply to save these changes.');
}

await mongoose.disconnect();