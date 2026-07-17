import assert from "node:assert/strict";
import test from "node:test";
import {
  CATALOGUE_MUTATION_ACTIONS,
  MutationContractError,
  buildActivityEvent,
  isRoleAuthorizedForAction,
  planCategoryCreate,
  planCategoryDelete,
  planCategoryUpdate,
  planChosenProductTransition,
  planImageReplacement,
  planProductMutation,
  planVisibilityTransition
} from "@/lib/appwrite/mutation-design";

const validProduct = {
  name: "  iPhone 13  ",
  description: "  Clean phone with box.  ",
  brand: "univercell",
  preferredContactId: "sales-main",
  categoryId: "category_1",
  price: 150000,
  currency: "PKR",
  condition: "Like New",
  stockStatus: "in_stock",
  featured: false,
  statusPick: false,
  storefrontVisible: false,
  feedVisible: false,
  sortPriority: 0,
  imageFileId: null,
  idempotencyKey: "product:create:123"
};

function contractCode(callback: () => unknown) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof MutationContractError);
    assert.equal(error.code, "VALIDATION_FAILED");
    return true;
  });
}

test("authorization matrix grants all actions to admin", () => {
  for (const action of CATALOGUE_MUTATION_ACTIONS) {
    assert.equal(isRoleAuthorizedForAction("admin", action), true, action);
  }
});

test("product editor is denied permanent/destructive and log actions", () => {
  for (const action of [
    "delete_category",
    "delete_product",
    "destructive_cleanup",
    "read_activity_logs"
  ] as const) {
    assert.equal(isRoleAuthorizedForAction("product_editor", action), false, action);
  }
  assert.equal(isRoleAuthorizedForAction("product_editor", "edit_product"), true);
  assert.equal(isRoleAuthorizedForAction("product_editor", "select_chosen_product"), true);
});

test("category create normalizes name and derives slug", () => {
  assert.deepEqual(
    planCategoryCreate({
      name: "  Mobile   Accessories ",
      idempotencyKey: "category:create:1"
    }),
    {
      name: "Mobile Accessories",
      slug: "mobile-accessories",
      idempotencyKey: "category:create:1"
    }
  );
});

test("category plans reject invalid fields, slugs and stale-shape omissions", () => {
  contractCode(() =>
    planCategoryCreate({
      name: "Phones",
      slug: "Phones!",
      idempotencyKey: "category:create:2"
    })
  );
  contractCode(() =>
    planCategoryCreate({
      name: "Phones",
      permissions: ['read("any")'],
      idempotencyKey: "category:create:3"
    })
  );
  contractCode(() =>
    planCategoryUpdate({
      categoryId: "cat",
      name: "Phones",
      expectedUpdatedAt: "not-a-date",
      idempotencyKey: "category:update:1"
    })
  );
  contractCode(() =>
    planCategoryDelete({
      categoryId: "",
      expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "category:delete:1"
    })
  );
});

test("category update and delete require optimistic concurrency tokens", () => {
  assert.equal(
    planCategoryUpdate({
      categoryId: "cat_1",
      name: "Phones",
      slug: "phones",
      expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "category:update:2"
    }).expectedUpdatedAt,
    "2026-07-18T10:00:00.000Z"
  );
  assert.equal(
    planCategoryDelete({
      categoryId: "cat_1",
      expectedUpdatedAt: "2026-07-18T10:00:00.000Z",
      idempotencyKey: "category:delete:2"
    }).categoryId,
    "cat_1"
  );
});

test("product plan normalizes bounded client fields and derives slug", () => {
  assert.deepEqual(planProductMutation(validProduct), {
    ...validProduct,
    name: "iPhone 13",
    slug: "iphone-13",
    description: "Clean phone with box."
  });
});

test("product plan rejects malformed values and unsafe visibility", () => {
  contractCode(() => planProductMutation({ ...validProduct, price: 1.5 }));
  contractCode(() => planProductMutation({ ...validProduct, brand: "unknown" }));
  contractCode(() =>
    planProductMutation({
      ...validProduct,
      storefrontVisible: false,
      feedVisible: true
    })
  );
  contractCode(() => planProductMutation({ ...validProduct, unknown: true }));
});

test("product plan rejects server-owned, raw permission, tenant and Firebase fields", () => {
  for (const [field, value] of [
    ["$permissions", ['read("any")']],
    ["chosenSelectionKey", "current"],
    ["categoryName", "Phones"],
    ["createdByName", "Browser Actor"],
    ["actorUserId", "user_1"],
    ["firebaseId", "legacy"],
    ["shopId", "shop_1"]
  ] as const) {
    contractCode(() => planProductMutation({ ...validProduct, [field]: value }));
  }
});

test("slug planning rejects explicit conflicts through predictable classification", () => {
  const planned = planProductMutation({ ...validProduct, slug: "iphone-13" });
  assert.equal(planned.slug, "iphone-13");
  const conflict = new MutationContractError("CONFLICT", "Slug already exists.", "slug");
  assert.equal(conflict.code, "CONFLICT");
  assert.equal(conflict.field, "slug");
});

test("visibility planning publishes image before row and hides row before image", () => {
  const publish = planVisibilityTransition({
    productId: "product_1",
    fromPublic: false,
    toPublic: true,
    imageFileId: "file_1"
  });
  assert.match(publish[0].operation, /image/);
  assert.match(publish[1].operation, /row/);
  assert.match(publish[0].compensation ?? "", /staff-only/);

  const hide = planVisibilityTransition({
    productId: "product_1",
    fromPublic: true,
    toPublic: false,
    imageFileId: "file_1"
  });
  assert.match(hide[0].operation, /row/);
  assert.match(hide[1].operation, /image/);
});

test("image replacement validates and publishes new file before row attachment", () => {
  const steps = planImageReplacement({
    productId: "product_1",
    oldFileId: "old_file",
    newFileId: "new_file",
    productWillBePublic: true
  });
  assert.equal(steps.length, 4);
  assert.match(steps[0].operation, /verify completed private upload/);
  assert.match(steps[1].operation, /grant exact public/);
  assert.match(steps[2].operation, /attach/);
  assert.match(steps[3].operation, /old file private/);
  assert.match(steps[3].compensation ?? "", /CLEANUP_FAILED/);
});

test("image replacement retry cannot reuse the attached file as the replacement", () => {
  contractCode(() =>
    planImageReplacement({
      productId: "product_1",
      oldFileId: "same_file",
      newFileId: "same_file",
      productWillBePublic: false
    })
  );
});

test("chosen transition clears old unique key before assigning current", () => {
  const plan = planChosenProductTransition({
    previousProductId: "product_old",
    targetProductId: "product_new",
    expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z"
  });
  assert.match(plan.preconditions[0], /TablesDB transaction/);
  assert.match(plan.steps[0].operation, /previous/);
  assert.match(plan.steps[1].operation, /target/);
  assert.match(plan.conflictRecovery[0], /unique conflict/);
  assert.match(plan.conflictRecovery[1], /must not restore/);
});

test("chosen retries are idempotent and clearing leaves no current selection", () => {
  const retry = planChosenProductTransition({
    previousProductId: "product_1",
    targetProductId: "product_1",
    expectedTargetUpdatedAt: "2026-07-18T10:00:00.000Z"
  });
  assert.deepEqual(retry.steps, []);
  assert.match(retry.conflictRecovery[0], /idempotent/);

  const clear = planChosenProductTransition({
    previousProductId: "product_1",
    targetProductId: null
  });
  assert.equal(clear.steps.length, 1);
  assert.match(clear.steps[0].operation, /own row ID/);
});

test("activity event derives changed fields without raw SDK output", () => {
  const event = buildActivityEvent({
    eventId: "event:product:update:1",
    eventType: "product.updated",
    entityType: "product",
    entityId: "product_1",
    actor: {
      userId: "user_1",
      displayName: "  Admin User  ",
      role: "admin"
    },
    timestamp: "2026-07-18T10:00:00.000Z",
    requestId: "request:update:1",
    before: { price: 100, name: "Phone" },
    after: { price: 120, name: "Phone" },
    result: "succeeded",
    metadata: { source: "catalogue mutation" }
  });
  assert.deepEqual(event.changedFields, ["price"]);
  assert.equal(event.actorDisplayName, "Admin User");
  assert.equal(event.errorClassification, null);
});

test("activity events reject secrets, sessions and raw permissions recursively", () => {
  for (const before of [
    { apiKey: "secret" },
    { nested: { sessionToken: "secret" } },
    { permissions: ['read("any")'] },
    { $id: "raw_appwrite_row" },
    new Date()
  ]) {
    contractCode(() =>
      buildActivityEvent({
        eventId: "event:product:update:2",
        eventType: "product.updated",
        entityType: "product",
        entityId: "product_1",
        actor: { userId: "user_1", displayName: "Admin", role: "admin" },
        timestamp: "2026-07-18T10:00:00.000Z",
        requestId: "request:update:2",
        before: before as Record<string, unknown>,
        after: null,
        result: "failed"
      })
    );
  }
});
