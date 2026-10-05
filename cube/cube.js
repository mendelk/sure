const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** @param {unknown} value @returns {value is string} */
function validUuid(value) {
  return typeof value === "string" && uuid.test(value);
}

/** @param {unknown} value @returns {value is string[]} */
function validAccountIds(value) {
  return Array.isArray(value) && value.every((id) => validUuid(id));
}

module.exports = {
  jwt: { issuer: ["sure"], audience: "sure-cube" },
  /**
   * @param {{filters?: {member: string, operator: string, values: string[]}[]}} query
   * @param {{securityContext: {familyId: unknown, userId: unknown, accountIds: unknown}}} context
   */
  queryRewrite: (query, { securityContext }) => {
    const { familyId, userId, accountIds } = securityContext;
    if (!validUuid(familyId) || !validUuid(userId) || !validAccountIds(accountIds))
      throw new Error("A valid Sure reporting scope is required.");
    query.filters ??= [];
    query.filters.push(
      { member: "cash_flow.family_id", operator: "equals", values: [familyId] },
      {
        member: "cash_flow.account_id",
        operator: "equals",
        values: accountIds.length > 0 ? accountIds : ["00000000-0000-0000-0000-000000000000"],
      },
    );
    return query;
  },
};
