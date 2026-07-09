// backend/utils/clauseResolver.js
import ClauseGroup from '../models/ClauseGroup.js';
import Clause from '../models/Clause.js';

/**
 * Live-resolves the full, current list of Clause documents that belong to a
 * position, by combining:
 *   1. position.assignedClauses      (ad-hoc / individually picked clauses)
 *   2. position.assignedClauseGroups (clause groups linked to the position —
 *      resolved against the GROUP'S CURRENT clause list, not a stored copy)
 *
 * This is the single source of truth used by:
 *   - the positions GET routes (for display)
 *   - contract generation (so new contracts always reflect current clauses)
 *   - the draft/pending-contract refresh cascade (so editing a clause group
 *     propagates to every position using it, and from there to any
 *     not-yet-signed contract)
 *
 * Because this re-reads ClauseGroup/Clause from the DB every time instead of
 * relying on a snapshot stored on the Position, updating a clause group's
 * clauses (add/remove/reorder) is immediately reflected everywhere this is
 * called — no migration needed going forward.
 *
 * Order: groups first (in the order they were linked to the position, and
 * within each group in the group's own stored order), then ad-hoc individual
 * clauses appended after. Duplicates (same clause appearing in two groups,
 * or in both a group and the individual list) are removed, keeping the
 * first occurrence.
 *
 * @param {Object} position - a Position document (or plain object) with
 *   assignedClauses (array of ObjectId|string) and assignedClauseGroups
 *   (array of ObjectId|string).
 * @returns {Promise<Array<Clause>>} resolved, deduplicated, ordered Clause docs
 */
/**
 * Extracts a plain id string from either a raw ObjectId/string, or an
 * already-populated Mongoose document (e.g. when the caller did
 * .populate('assignedClauses') before passing the position in here).
 * Without this, calling .toString() directly on a populated document
 * stringifies the WHOLE document (via its inspect-based toString) instead
 * of its id, which then fails as an invalid ObjectId in a later $in query.
 */
function toIdString(item) {
  if (item == null) return '';
  if (typeof item === 'string') return item;
  if (item._id) return item._id.toString(); // populated document
  return item.toString(); // raw ObjectId
}

export async function resolvePositionClauses(position) {
  const groupIds = (position.assignedClauseGroups || []).map(toIdString);
  const individualIds = (position.assignedClauses || []).map(toIdString);

  const seen = new Set();
  const orderedIds = [];

  if (groupIds.length > 0) {
    // Preserve the order groups were linked in, via $in + manual sort.
    const groups = await ClauseGroup.find({ _id: { $in: groupIds } });
    const groupsById = new Map(groups.map(g => [g._id.toString(), g]));

    groupIds.forEach(gid => {
      const group = groupsById.get(gid);
      if (!group) return; // group was deleted — silently skip, don't break the position
      (group.clauses || []).forEach(clauseId => {
        const idStr = toIdString(clauseId);
        if (!seen.has(idStr)) {
          seen.add(idStr);
          orderedIds.push(idStr);
        }
      });
    });
  }

  individualIds.forEach(idStr => {
    if (!seen.has(idStr)) {
      seen.add(idStr);
      orderedIds.push(idStr);
    }
  });

  if (orderedIds.length === 0) return [];

  const clauses = await Clause.find({ _id: { $in: orderedIds } });
  const clausesById = new Map(clauses.map(c => [c._id.toString(), c]));

  // Re-apply our intended order (Mongo's $in doesn't preserve order)
  return orderedIds
    .map(id => clausesById.get(id))
    .filter(Boolean);
}

/**
 * Rebuilds the `clauses` array of a DRAFT/PENDING Contract from a position's
 * CURRENT resolved clause list, then saves the contract if anything changed.
 * Only ever call this for unsigned contracts (DRAFT/PENDING) — signed/active/
 * past contracts must never be touched; their snapshot is the legal record.
 *
 * Unlike a simple "patch existing clauseIds' content" approach, this also
 * adds/removes clauses to match the position's current set — so if a clause
 * group gains or loses a clause, draft contracts pick that up too.
 */
export async function refreshDraftContractClauses(contract, resolvedClauses, newDuties, newDutiesNumberingStyle, newDutiesSubItems) {
  let changed = false;

  const newClauseEntries = resolvedClauses.map(c => ({
    clauseId: c._id,
    customContent: c.content
  }));

  const oldSignature = JSON.stringify(
    (contract.clauses || []).map(e => [e.clauseId?.toString(), e.customContent])
  );
  const newSignature = JSON.stringify(
    newClauseEntries.map(e => [e.clauseId.toString(), e.customContent])
  );

  if (oldSignature !== newSignature) {
    contract.clauses = newClauseEntries;
    changed = true;
  }

  if (newDuties !== undefined) {
    const dutiesChanged = JSON.stringify(contract.dutiesAndResponsibilities) !== JSON.stringify(newDuties);
    if (dutiesChanged) {
      contract.dutiesAndResponsibilities = newDuties;
      changed = true;
    }
  }

  if (newDutiesNumberingStyle !== undefined && contract.dutiesNumberingStyle !== newDutiesNumberingStyle) {
    contract.dutiesNumberingStyle = newDutiesNumberingStyle;
    changed = true;
  }

  if (newDutiesSubItems !== undefined) {
    const subItemsChanged = JSON.stringify(contract.dutiesSubItems || []) !== JSON.stringify(newDutiesSubItems || []);
    if (subItemsChanged) {
      contract.dutiesSubItems = newDutiesSubItems;
      changed = true;
    }
  }

  if (changed) {
    await contract.save();
  }

  return changed;
}

/**
 * Finds every DRAFT/PENDING contract tied to the given positionCode and
 * refreshes their clauses (and optionally duties) against the position's
 * CURRENT resolved clause list. Safe to call repeatedly — it's a no-op if
 * nothing changed.
 */
export async function cascadeRefreshDraftContractsForPosition(position) {
  const Contract = (await import('../models/Contract.js')).default;

  const resolvedClauses = await resolvePositionClauses(position);

  const unsignedContracts = await Contract.find({
    positionCode: position.positionCode,
    status: { $in: ['DRAFT', 'PENDING'] }
  });

  let refreshedCount = 0;
  for (const contract of unsignedContracts) {
    const changed = await refreshDraftContractClauses(
      contract,
      resolvedClauses,
      position.dutiesAndResponsibilities,
      position.dutiesNumberingStyle,
      position.dutiesSubItems
    );
    if (changed) refreshedCount++;
  }

  return refreshedCount;
}