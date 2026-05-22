// Vortex DSE — C-slot reference implementation in JavaScript.
//
// This is a direct executable port of the TLA+ spec
// `specs/Vortex_DSE_CSlot.tla`. Each method here mirrors one action
// in the spec. Running this file executes 10 deterministic scenarios
// and reports pass/fail.
//
// Purpose: bridge step toward code-to-spec refinement. The production
// implementation can later be cross-checked against the same scenarios.

class CSlotSystem {
  constructor(nodeIds) {
    this.slot = 0;
    this.network = []; // {id, cslot}
    this.nodes = {};
    for (const id of nodeIds) {
      this.nodes[id] = {
        processed: new Set(),
        persisted: new Set(),
        up: true,
      };
    }
  }

  // Submit: sender stamps current slot. Maps to spec action Submit(id).
  submit(id) {
    if (this.network.some((m) => m.id === id)) {
      throw new Error(`submit: id ${id} already in network`);
    }
    for (const n of Object.values(this.nodes)) {
      if (n.processed.has(id)) {
        throw new Error(`submit: id ${id} already processed somewhere`);
      }
    }
    this.network.push({ id, cslot: this.slot });
  }

  // Adversarial inject with arbitrary cslot. Maps to DuplicateInject.
  inject(id, fakeCslot) {
    this.network.push({ id, cslot: fakeCslot });
  }

  // Tick advances the global slot by 1. Maps to spec action Tick.
  tick() {
    this.slot++;
  }

  // Process(n, m): strict C-slot admission. The HEART of the spec.
  // Returns { accepted: bool, reason: string }.
  process(nodeId, msg) {
    const n = this.nodes[nodeId];
    if (!n) throw new Error(`unknown node ${nodeId}`);
    if (!n.up) return { accepted: false, reason: "down" };
    if (n.processed.has(msg.id)) {
      return { accepted: false, reason: "duplicate" };
    }
    if (msg.cslot < this.slot) {
      return { accepted: false, reason: "late" };
    }
    if (msg.cslot > this.slot) {
      return { accepted: false, reason: "future" };
    }
    n.processed.add(msg.id);
    return { accepted: true, reason: "ok" };
  }

  // Crash: lose volatile state, persistent snapshot survives.
  crash(nodeId) {
    const n = this.nodes[nodeId];
    n.persisted = new Set(n.processed);
    n.processed = new Set();
    n.up = false;
  }

  // Rejoin: recover from persistent snapshot.
  rejoin(nodeId) {
    const n = this.nodes[nodeId];
    n.processed = new Set(n.persisted);
    n.up = true;
  }
}

// ---------------------------- SCENARIOS ----------------------------

const scenarios = [];

function S(name, desc, fn) {
  scenarios.push({ name, desc, fn });
}

S("S1_ontime", "On-time delivery (m.cslot = current_slot) → accepted", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  const r = sys.process("n1", sys.network[0]);
  return r.accepted === true && r.reason === "ok";
});

S("S2_one_slot_late", "Delivery 1 slot late → REJECTED (permanent)", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1"); // cslot=0
  sys.tick();        // slot=1, tx is now 1 slot late
  const r = sys.process("n1", sys.network[0]);
  return r.accepted === false && r.reason === "late";
});

S("S3_future_dated", "Future-dated injection (m.cslot > current_slot) → REJECTED", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.inject("tx1", 5); // current slot = 0
  const r = sys.process("n1", sys.network[0]);
  return r.accepted === false && r.reason === "future";
});

S("S4_duplicate_same_node", "Same tx, same node, twice → second REJECTED (exactly-once)", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  const r1 = sys.process("n1", sys.network[0]);
  const r2 = sys.process("n1", sys.network[0]);
  return r1.accepted === true && r2.accepted === false && r2.reason === "duplicate";
});

S("S5_same_slot_two_nodes", "Same tx, different nodes, same slot → BOTH accepted (per-node exactly-once)", () => {
  const sys = new CSlotSystem(["n1", "n2"]);
  sys.submit("tx1");
  const r1 = sys.process("n1", sys.network[0]);
  const r2 = sys.process("n2", sys.network[0]);
  return r1.accepted && r2.accepted;
});

S("S6_crash_rejoin_preserves", "Crash + Rejoin restores processed set from persistent snapshot", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  sys.process("n1", sys.network[0]);
  sys.crash("n1");
  const downOk =
    sys.nodes.n1.processed.size === 0 &&
    sys.nodes.n1.persisted.has("tx1") &&
    !sys.nodes.n1.up;
  sys.rejoin("n1");
  const upOk = sys.nodes.n1.processed.has("tx1") && sys.nodes.n1.up;
  return downOk && upOk;
});

S("S7_no_double_after_rejoin", "After rejoin, replay of same tx → REJECTED (no double-process)", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  sys.process("n1", sys.network[0]);
  sys.crash("n1");
  sys.rejoin("n1");
  const r = sys.process("n1", sys.network[0]);
  return r.accepted === false && r.reason === "duplicate";
});

S("S8_replay_past_cslot", "Adversary replays tx with past cslot → REJECTED (late)", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  sys.process("n1", sys.network[0]);
  sys.tick(); sys.tick();
  sys.inject("tx_replay", 0); // attacker forges old timestamp
  const r = sys.process("n1", sys.network[1]);
  return r.accepted === false && r.reason === "late";
});

S("S9_future_injection_waits_then_admits",
  "Injection cslot=k while slot<k; when slot reaches k → ADMITS (legitimate delayed delivery, not exploit)",
  () => {
    const sys = new CSlotSystem(["n1"]);
    sys.inject("tx1", 2);
    const r1 = sys.process("n1", sys.network[0]);
    const earlyRej = r1.accepted === false && r1.reason === "future";
    sys.tick(); sys.tick();
    const r2 = sys.process("n1", sys.network[0]);
    return earlyRej && r2.accepted === true;
  });

S("S10_down_node_rejects", "Crashed node rejects all incoming until rejoin", () => {
  const sys = new CSlotSystem(["n1"]);
  sys.submit("tx1");
  sys.crash("n1");
  const r = sys.process("n1", sys.network[0]);
  return r.accepted === false && r.reason === "down";
});

// ---------------------------- RUNNER ----------------------------

let pass = 0;
let fail = 0;
const results = [];

for (const { name, desc, fn } of scenarios) {
  let ok = false;
  let err = null;
  try {
    ok = fn() === true;
  } catch (e) {
    err = e;
  }
  if (ok) {
    pass++;
    results.push(`PASS  ${name.padEnd(40)}  ${desc}`);
  } else {
    fail++;
    const tail = err ? ` -- THREW: ${err.message}` : "";
    results.push(`FAIL  ${name.padEnd(40)}  ${desc}${tail}`);
  }
}

console.log("=".repeat(110));
console.log("Vortex DSE  C-slot reference implementation  scenario suite");
console.log("=".repeat(110));
for (const line of results) console.log(line);
console.log("-".repeat(110));
console.log(`${pass}/${scenarios.length} scenarios passed, ${fail} failed`);
console.log("=".repeat(110));

process.exit(fail > 0 ? 1 : 0);
