'use strict';

/**
 * Write an audit log entry.
 *
 * @param {object} conn - mysql2 connection instance (should be within a transaction)
 * @param {object} params
 * @param {'CREATE'|'UPDATE'|'DELETE'|'GENERATE'} params.action
 * @param {string} params.entityType - e.g., 'bilty', 'user', 'freight_memo'
 * @param {number} params.entityId - ID of the affected row
 * @param {number|null} params.userId - ID of the user who performed the action
 * @param {object|null} params.changes - { field: { old: x, new: y } } for UPDATEs
 * @param {string|null} params.ip - IP address of the requester
 * @returns {Promise<void>}
 */
async function auditLog(conn, { action, entityType, entityId, userId, before, after, ip }) {
  await conn.execute(
    `INSERT INTO audit_logs
       (action, entity_type, entity_id, user_id, before_json, after_json, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      action,
      entityType,
      entityId,
      userId ?? null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      ip ?? null,
    ]
  );
}

module.exports = { auditLog };
