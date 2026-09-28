const { AsyncLocalStorage } = require('async_hooks');
const { models } = require('../db');

/**
 * Per-request audit context (IP + user-agent) carried via AsyncLocalStorage, so
 * every audit write picks up "who/where" automatically without threading req
 * through dozens of service signatures. The requestContext middleware seeds it.
 */
const store = new AsyncLocalStorage();

const runWithRequestContext = (ctx, fn) => store.run(ctx, fn);

/**
 * A context to fall back on when nothing has been entered for this execution.
 *
 * Several services now refuse to run without a workspace, because a
 * tenant-scoped query with no tenant is a bug rather than a whole-table read.
 * The app always has one: the request middleware sets it per call, and
 * `forEachWorkspace` sets it per background pass.
 *
 * A TEST HARNESS has neither. It calls services directly, and its setup hook
 * and its test body are separate calls from the runner — so an AsyncLocalStorage
 * context entered in the hook does not reliably reach the test. Forty-one tests
 * across seven suites were failing on a guard that was working exactly as
 * designed, with nothing wrong on the production path.
 *
 * So the harness states, once, which workspace its database IS. Nothing on the
 * request path calls this: a server that set a default would answer the next
 * tenant's request with the previous tenant's id, which is the failure this
 * whole mechanism exists to prevent.
 */
let defaultContext = null;
const setDefaultRequestContext = (ctx) => { defaultContext = ctx || null; };

const getRequestContext = () => store.getStore() || defaultContext || {};

/**
 * Record the acting user on the current request context. Called by the auth
 * middleware once the JWT is resolved, so audit writes that don't pass an
 * explicit userId still attribute the action to who actually did it.
 */
const setRequestUser = (userId) => {
  const ctx = store.getStore();
  if (ctx) ctx.userId = userId;
};

/** Bind every downstream query/audit/job spawned by this request to a workspace. */
const setRequestOrganization = (organizationId, organizationSlug = null) => {
  const ctx = store.getStore();
  if (ctx) {
    ctx.organizationId = organizationId || null;
    ctx.organizationSlug = organizationSlug || null;
  }
};

/**
 * The single audit writer. Merges actor/IP/user-agent from the current request
 * context when the caller didn't provide them, and never throws (audit must not
 * break a real request).
 */
async function createAuditLog(data) {
  try {
    if (!models.AuditLog) return;
    const ctx = getRequestContext();
    await models.AuditLog.create({
      ...data,
      userId: data.userId || ctx.userId || null,
      ipAddress: data.ipAddress || ctx.ip || null,
      userAgent: data.userAgent || ctx.userAgent || null,
      ...(models.AuditLog.rawAttributes.organizationId
        ? { organizationId: data.organizationId || ctx.organizationId || null }
        : {}),
    });
  } catch (error) {
    console.warn('Audit log failed:', error.message);
  }
}

module.exports = { runWithRequestContext, setDefaultRequestContext, getRequestContext, setRequestUser, setRequestOrganization, createAuditLog };
