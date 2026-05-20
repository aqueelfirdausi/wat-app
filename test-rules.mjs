import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ── Constants ────────────────────────────────────────────────────────────
const ADMIN_EMAIL    = 'aqueelfirdausi@gmail.com';
const SHOP_A_UID     = 'shop-a-uid-111';
const SHOP_B_UID     = 'shop-b-uid-222';
const SHOP_SUS_UID   = 'shop-sus-uid-333';
const SHOP_PEND_UID  = 'shop-pend-uid-444';

// ── Environment ──────────────────────────────────────────────────────────
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-wat-app',
  firestore: {
    rules: readFileSync('firestore.rules', 'utf8'),
    host: '127.0.0.1',
    port: 8080,
  },
});

// ── Context helpers ──────────────────────────────────────────────────────
const anon     = () => testEnv.unauthenticatedContext();
const admin    = () => testEnv.authenticatedContext('admin-uid', { email: ADMIN_EMAIL });
const shopA    = () => testEnv.authenticatedContext(SHOP_A_UID,    { email: 'shopa@test.com' });
const shopB    = () => testEnv.authenticatedContext(SHOP_B_UID,    { email: 'shopb@test.com' });
const shopSus  = () => testEnv.authenticatedContext(SHOP_SUS_UID,  { email: 'shopsus@test.com' });
const shopPend = () => testEnv.authenticatedContext(SHOP_PEND_UID, { email: 'shoppend@test.com' });
const stranger = () => testEnv.authenticatedContext('stranger-uid', { email: 'stranger@test.com' });

// ── Test runner ──────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(label, fn) {
  try {
    await fn();
    console.log(`  ✔ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✘ ${label}\n    ${err.message}`);
    failed++;
  }
}

// ── Seed data ────────────────────────────────────────────────────────────
await testEnv.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'tenants', SHOP_A_UID),    { uid: SHOP_A_UID,    status: 'active',    shopName: 'Shop A',    ownerEmail: 'shopa@test.com',    createdAt: new Date() });
  await setDoc(doc(db, 'tenants', SHOP_B_UID),    { uid: SHOP_B_UID,    status: 'active',    shopName: 'Shop B',    ownerEmail: 'shopb@test.com',    createdAt: new Date() });
  await setDoc(doc(db, 'tenants', SHOP_SUS_UID),  { uid: SHOP_SUS_UID,  status: 'suspended', shopName: 'Suspended', ownerEmail: 'shopsus@test.com',  createdAt: new Date() });
  await setDoc(doc(db, 'tenants', SHOP_PEND_UID), { uid: SHOP_PEND_UID, status: 'pending',   shopName: 'Pending',   ownerEmail: 'shoppend@test.com', createdAt: new Date() });

  await setDoc(doc(db, 'products', 'prod-a-1'), { shopId: SHOP_A_UID, name: 'Pixel 9',   isWholesale: false, isAvailableToday: true });
  await setDoc(doc(db, 'products', 'prod-b-1'), { shopId: SHOP_B_UID, name: 'iPhone 16', isWholesale: true, wholesalePrice: 200000, minWholesaleQty: 5, isAvailableToday: true });

  await setDoc(doc(db, 'logs', 'log-a-1'), { shopId: SHOP_A_UID, action: 'product_added', createdAt: new Date() });
  await setDoc(doc(db, 'logs', 'log-b-1'), { shopId: SHOP_B_UID, action: 'product_added', createdAt: new Date() });
});

// ── Phase A — Public reads ────────────────────────────────────────────────
console.log('\n── Phase A: Public reads ────────────────────────────────────');
await test('anon can read products',   () => assertSucceeds(getDoc(doc(anon().firestore(), 'products',   'prod-a-1'))));
await test('anon can read categories', () => assertSucceeds(getDoc(doc(anon().firestore(), 'categories', 'any-cat'))));
await test('anon can read broadcasts', () => assertSucceeds(getDoc(doc(anon().firestore(), 'broadcasts', 'any-bcast'))));

// ── Phase A — Public writes blocked ──────────────────────────────────────
console.log('\n── Phase A: Public writes blocked ───────────────────────────');
await test('anon cannot write products',     () => assertFails(setDoc(doc(anon().firestore(),     'products', 'x'), { shopId: SHOP_A_UID, name: 'x' })));
await test('stranger cannot write products', () => assertFails(setDoc(doc(stranger().firestore(), 'products', 'x'), { shopId: SHOP_A_UID, name: 'x' })));

// ── Phase A — Admin writes ────────────────────────────────────────────────
console.log('\n── Phase A: Admin writes ────────────────────────────────────');
await test('admin can write products',   () => assertSucceeds(setDoc(doc(admin().firestore(), 'products',   'admin-prod'),  { shopId: SHOP_A_UID, name: 'Admin Pixel', isAvailableToday: true })));
await test('admin can write broadcasts', () => assertSucceeds(setDoc(doc(admin().firestore(), 'broadcasts', 'admin-bcast'), { shopId: SHOP_A_UID, message: 'Test', sentAt: new Date() })));

// ── Phase A — Sensitive collections ──────────────────────────────────────
console.log('\n── Phase A: Sensitive collections ───────────────────────────');
await test('anon cannot read logs',     () => assertFails(getDoc(doc(anon().firestore(),     'logs', 'log-a-1'))));
await test('stranger cannot read logs', () => assertFails(getDoc(doc(stranger().firestore(), 'logs', 'log-a-1'))));
await test('admin can read logs',       () => assertSucceeds(getDoc(doc(admin().firestore(), 'logs', 'log-a-1'))));

// ── Phase A — Catch-all deny ──────────────────────────────────────────────
console.log('\n── Phase A: Catch-all deny ──────────────────────────────────');
await test('anon blocked from unknown collection', () => assertFails(getDoc(doc(anon().firestore(), 'secrets', 'anything'))));

// ── Phase B — Tenants collection ──────────────────────────────────────────
console.log('\n── Phase B: Tenants collection ──────────────────────────────');
await test('shop A can read own tenant doc',       () => assertSucceeds(getDoc(doc(shopA().firestore(), 'tenants', SHOP_A_UID))));
await test('shop A cannot read shop B tenant doc', () => assertFails(getDoc(doc(shopA().firestore(),    'tenants', SHOP_B_UID))));
await test('anon cannot read any tenant doc',      () => assertFails(getDoc(doc(anon().firestore(),     'tenants', SHOP_A_UID))));
await test('admin can read any tenant doc',        () => assertSucceeds(getDoc(doc(admin().firestore(), 'tenants', SHOP_B_UID))));

// ── Phase B — Active tenant writes own data ───────────────────────────────
console.log('\n── Phase B: Active tenant writes own data ───────────────────');
await test('shop A can write own product', () => assertSucceeds(setDoc(doc(shopA().firestore(), 'products', 'prod-a-new'), { shopId: SHOP_A_UID, name: 'New Pixel', isAvailableToday: true })));
await test('shop A can read own logs',     () => assertSucceeds(getDoc(doc(shopA().firestore(), 'logs', 'log-a-1'))));

// ── Phase B — Cross-tenant isolation ──────────────────────────────────────
console.log('\n── Phase B: Cross-tenant isolation ──────────────────────────');
await test('shop A cannot overwrite shop B product',  () => assertFails(setDoc(doc(shopA().firestore(), 'products', 'prod-b-1'), { shopId: SHOP_B_UID, name: 'Hacked', isAvailableToday: false })));
await test('shop B cannot overwrite shop A product',  () => assertFails(setDoc(doc(shopB().firestore(), 'products', 'prod-a-1'), { shopId: SHOP_A_UID, name: 'Hacked', isAvailableToday: false })));
await test('shop A cannot read shop B logs',          () => assertFails(getDoc(doc(shopA().firestore(), 'logs', 'log-b-1'))));

// ── Phase B — Suspended / pending blocked ─────────────────────────────────
console.log('\n── Phase B: Suspended / pending tenant blocked ──────────────');
await test('suspended tenant cannot write products', () => assertFails(setDoc(doc(shopSus().firestore(),  'products', 'sus-prod'),  { shopId: SHOP_SUS_UID,  name: 'Sus Product',  isAvailableToday: true })));
await test('pending tenant cannot write products',   () => assertFails(setDoc(doc(shopPend().firestore(), 'products', 'pend-prod'), { shopId: SHOP_PEND_UID, name: 'Pend Product', isAvailableToday: true })));

// ── Cleanup & summary ─────────────────────────────────────────────────────
await testEnv.cleanup();

const total = passed + failed;
console.log(`\n${'─'.repeat(54)}`);
console.log(`  ${total} tests    ${passed} passed    ${failed > 0 ? failed + ' FAILED' : 'all clear'}`);
if (failed > 0) {
  console.error('\n  Phase B rules have failures — do not commit.\n');
  process.exit(1);
} else {
  console.log('\n  Phase B rules are solid. Ready to commit.\n');
}
