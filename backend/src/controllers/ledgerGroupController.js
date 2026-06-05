'use strict';

const ledgerGroupModel = require('../models/ledgerGroupModel');
const { isNonEmptyString, parseId } = require('../utils/validators');

// Permanent groups are flagged with ledger_group.is_system = 1 (the 28 standard
// Tally groups). They are non-editable, non-deletable top-level parents. Every
// user-created group is a non-system CHILD of one of them.

exports.list = async (_req, res, next) => {
  try {
    const rows = await ledgerGroupModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await ledgerGroupModel.search(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await ledgerGroupModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

async function resolveParentId(rawParentId) {
  if (rawParentId == null || rawParentId === '') return { parentId: null };
  const id = parseId(rawParentId);
  if (id === null) return { error: 'invalid_parent_id' };
  const parent = await ledgerGroupModel.findById(id);
  if (!parent) return { error: 'parent_not_found' };
  return { parentId: id };
}

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!isNonEmptyString(body.group_name)) return res.status(400).json({ error: 'invalid_name' });

    const { parentId, error } = await resolveParentId(body.parent_id);
    if (error) return res.status(400).json({ error });
    // Every user-created group must be a child — a parent is required.
    if (parentId === null) return res.status(400).json({ error: 'parent_required' });

    const { id } = await ledgerGroupModel.create({
      group_name: body.group_name,
      parent_id: parentId,
    });
    return res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      // Look up the existing canonical row so the message uses its exact
      // casing (e.g. "Owner" even if the user typed "owner"). The unique
      // index on ledger_group.group_name uses case-insensitive collation,
      // so the duplicate could differ only in capitalisation.
      const existing = await ledgerGroupModel.findByName(req.body && req.body.group_name);
      const canonicalName = existing ? existing.group_name : (req.body && req.body.group_name) || '';
      return res.status(409).json({
        error: 'name_taken',
        message: `Group '${canonicalName}' already exists. Pick a different name.`,
      });
    }
    return next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const existing = await ledgerGroupModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    // The 28 permanent groups can't be renamed or re-parented.
    if (existing.is_system) {
      return res.status(409).json({
        error: 'system_group_locked',
        message: `${existing.group_name} is a permanent group and cannot be edited.`,
      });
    }

    const body = req.body || {};
    if (!isNonEmptyString(body.group_name)) return res.status(400).json({ error: 'invalid_name' });

    const { parentId, error } = await resolveParentId(body.parent_id);
    if (error) return res.status(400).json({ error });
    // User groups stay children — a parent is always required.
    if (parentId === null) return res.status(400).json({ error: 'parent_required' });

    if (parentId === id) {
      return res.status(400).json({ error: 'cannot_be_self_parent' });
    }

    await ledgerGroupModel.update(id, { group_name: body.group_name, parent_id: parentId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const existing = await ledgerGroupModel.findByName(req.body && req.body.group_name);
      const canonicalName = existing ? existing.group_name : (req.body && req.body.group_name) || '';
      return res.status(409).json({
        error: 'name_taken',
        message: `Group '${canonicalName}' already exists. Pick a different name.`,
      });
    }
    return next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const existing = await ledgerGroupModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    if (existing.is_system) {
      return res.status(409).json({
        error: 'system_group_locked',
        message: `${existing.group_name} is a permanent group and cannot be deleted.`,
      });
    }

    const childCount = await ledgerGroupModel.countChildren(id);
    if (childCount > 0) {
      return res.status(409).json({
        error: 'has_children',
        message: `Cannot delete: ${childCount} child group(s) still belong to this group.`,
      });
    }

    const refCount = await ledgerGroupModel.countReferences(id);
    if (refCount > 0) {
      return res.status(409).json({
        error: 'has_references',
        message: `Cannot delete: ${refCount} ledger(s)/vehicle(s) still use this group. Reassign them first.`,
      });
    }

    await ledgerGroupModel.remove(id);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};
