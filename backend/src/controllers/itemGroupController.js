'use strict';

const itemGroupModel = require('../models/itemGroupModel');
const { isNonEmptyString, parseId } = require('../utils/validators');

exports.list = async (_req, res, next) => {
  try {
    const rows = await itemGroupModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await itemGroupModel.search(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await itemGroupModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

async function resolveParentId(rawParentId) {
  if (rawParentId == null || rawParentId === '') return { parentId: null };
  const id = parseId(rawParentId);
  if (id === null) return { error: 'invalid_parent_id' };
  const parent = await itemGroupModel.findById(id);
  if (!parent) return { error: 'parent_not_found' };
  return { parentId: id };
}

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!isNonEmptyString(body.group_name)) return res.status(400).json({ error: 'invalid_name' });

    const { parentId, error } = await resolveParentId(body.parent_id);
    if (error) return res.status(400).json({ error });

    const { id } = await itemGroupModel.create({
      group_name: body.group_name,
      parent_id: parentId,
    });
    return res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'name_taken', message: 'An item group with that name already exists.' });
    }
    return next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const existing = await itemGroupModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    if (!isNonEmptyString(body.group_name)) return res.status(400).json({ error: 'invalid_name' });

    const { parentId, error } = await resolveParentId(body.parent_id);
    if (error) return res.status(400).json({ error });

    if (parentId !== null && parentId === id) {
      return res.status(400).json({ error: 'cannot_be_self_parent' });
    }

    await itemGroupModel.update(id, { group_name: body.group_name, parent_id: parentId });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'name_taken' });
    }
    return next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const existing = await itemGroupModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const childCount = await itemGroupModel.countChildren(id);
    if (childCount > 0) {
      return res.status(409).json({
        error: 'has_children',
        message: `Cannot delete: ${childCount} child group(s) still belong to this group.`,
      });
    }

    await itemGroupModel.remove(id);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};
