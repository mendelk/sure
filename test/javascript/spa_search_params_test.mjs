import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSpaSearch,
  stringifySpaSearch,
} from "../../app/javascript/spa/search-params.ts";

test("quoted amount deep links preserve quotes for the transaction API", () => {
  const search = parseSpaSearch("?page=1&search=%2214.03%22");
  assert.equal(search.search, '"14.03"');
  assert.equal(search.page, 1);
});

test("legacy Rails search links preserve quoted amounts", () => {
  const params = new URLSearchParams({ "q[search]": '"-14.03"' });
  assert.equal(parseSpaSearch(`?${params}`)["q[search]"], '"-14.03"');
});

test("JSON-looking text remains literal through navigation and reload", () => {
  for (const term of ['"14.03"', "14.03", "0014", "true", "null", '["Coffee"]', "A&B + 50%", ""]) {
    const query = stringifySpaSearch({ page: 2, search: term });
    assert.equal(new URLSearchParams(query).get("search"), term);
    assert.equal(parseSpaSearch(query).search, term);
  }
});

test("structured filters survive alongside literal searches", () => {
  const filters = {
    page: 2,
    search: '"14.03"',
    categories: ["Food & Drink", "Groceries"],
    types: ["expense"],
    filter_order: ["types:expense", "categories:Food & Drink", "categories:Groceries"],
    amount: 14.03,
    amount_operator: "equal",
    uncategorized: true,
  };
  assert.deepEqual({ ...parseSpaSearch(stringifySpaSearch(filters)) }, filters);
});

test("clearing search removes it from the URL", () => {
  const query = stringifySpaSearch({ search: undefined, page: 1 });
  assert.equal(new URLSearchParams(query).has("search"), false);
  assert.deepEqual({ ...parseSpaSearch(query) }, { page: 1 });
  assert.equal(stringifySpaSearch({}), "");
});
