# Vortex DSE Architecture & Formal Specs

> **Slice notice:** this document sketches the **full research stack** for orientation.
> **This repository publishes only the admission slice** (`Vortex_DSE_CSlot.tla`,
> `Vortex_DSE_CSlot_Skew.tla`). Layers shown below that are not in this repo are
> either another [public slice](https://github.com/vasilisnasopoulos-stack/blob/main/SLICES.md)
> or **private / not on GitHub**. Nothing in this file implies every box is
> machine-checked in the public bundle.

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              VORTEX DSE CONSENSUS (Per Slot)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 1: ADMISSION (C-slot strict gate)                        │
│  ═══════════════════════════════════════                        │
│                                                                  │
│  Producer stamps message with current_slot (own clock)          │
│  Node checks: msg.cslot == node.current_slot ? YES → admit      │
│                                              NO  → reject        │
│                                                                  │
│  ┌────────────���────────────────────────────────────────────┐   │
│  │ ✓ Temporal admission (not TTL)                          │   │
│  │ ✓ Deterministic per-node (no consensus)                │   │
│  │ ✓ **Formally verified under clock skew**              │   │
│  │ ✓ Byzantine origin spoofing: THIS SPEC (Skew variant)  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Spec: vortex-dse-cslot-spec/                                  │
│  Status: 8.08M states, 0 errors (TLC + Apalache)               │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 2: FREEZE (close admission window)                       │
│  ══════════════════════���═════════════════                       │
│                                                                  │
│  Each node stops admitting → moves to "frozen" phase            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Freeze-ordering barrier:                                │   │
│  │ Node cannot freeze while holding unprocessed delivered │   │
│  │ messages (ensures fairness + liveness)                │   │
│  │ (Implemented in AE layer: vortex-merkle-agreement)     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 3: RECONCILE (agreement via Merkle union)                │
│  ══════════════════════════════════════════════                 │
│                                                                  │
│  All nodes exchange their admitted sets → UNION                 │
│  Merkle roots verified → all agree on same set                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ **Loss Recovery:** If any node admitted msg, ALL will  │   │
│  │ commit it (single-witness recovery via union)          │   │
│  │                                                         │   │
│  │ ✓ Under bounded packet loss (≤ MaxDrops)              │   │
│  │ ✓ **Formally verified: 0 errors in 2.8M+ states**     │   │
│  │ (Separate layer: vortex-loss-recoverability)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PHASE 4: COMMIT (slot-final agreed set)                        │
│  ══════════════════════════════════════════                     │
│                                                                  │
│  All nodes have identical committed_set[n]                      │
│  → Slot closes, execution proceeds                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ **Cross-slot exactly-once:** No message ever admitted  │   │
│  │ twice across multiple slots (even under replay)        │   │
│  │                                                         │   │
│  │ ✓ Via cumulative committed_ids history per node       │   │
│  │ ✓ **Formally verified: 0 errors in 2.8M+ states**     │   │
│  │ (Separate layer: vortex-loss-recoverability)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Refinement Chain (Layered Verification)

```
                    BASELINE (ideal network)
                             ↓
         ┌────────────────────────────────────┐
         │  Vortex_DSE_CSlot_AE.tla           │
         │  Merkle Agreement (per-slot)       │
         │  - No losses, all messages deliver │
         │  - 6 safety invariants ✓           │
         │  - 2 liveness properties ✓         │
         │  Status: 79.6K states, 0 errors    │
         └────────────────────────────────────┘
                             ↓ [REFINEMENT]
                    (add explicit delivery layer)
                             ↓
         ┌────────────────────────────────────┐
         │  Vortex_DSE_CSlot_AE_Lossy.tla     │
         │  Loss Recoverability               │
         │  - Bounded packet loss (MaxDrops)  │
         │  - per-node delivered[n] tracking  │
         │  - 8 safety invariants ✓           │
         │  - 3 liveness properties ✓         │
         │  Status: 1.59M states, 0 errors    │
         └────────────────────────────────────┘
                             ↓ [COMPOSITION]
                    (add cross-slot memory)
                             ↓
         ┌────────────────────────────────────┐
         │ Vortex_DSE_CSlot_AE_ExactlyOnce    │
         │ Cross-Slot Exactly-Once            │
         │ - Cumulative committed_ids[n]      │
         │ - No re-admission across slots     │
         │ - 12 safety invariants ✓           │
         │ - 3 liveness properties ✓          │
         │ Status: 2.78M states, 0 errors     │
         └────────────────────────────────────┘
```

---

## Key Safety Properties Proven

### **C-Slot Strict Admission (This Module)**
```
∀ nodes n, messages m:
  admit(m, n) ⟹ m.cslot = current_slot[n]
  (A message is admitted IFF its slot stamp matches node's current slot)
```
**✓ Proven in Vortex_DSE_CSlot.tla:** 8.08M states (baseline)
**✓ Under Byzantine spoofing in Vortex_DSE_CSlot_Skew.tla:** 96K states

---

### **Exactly-Once Per Node (Per-Slot)**
```
∀ nodes n, messages m, slots k:
  admit_count[n][m][k] ≤ 1
  (Each node admits each message at most once per slot)
```
**✓ Proven in Vortex_DSE_CSlot.tla:** 8.08M states

---

### **Per-Slot Agreement (Merkle Agreement)**
```
∀ nodes n1, n2:
  IF n1.committed AND n2.committed
  THEN n1.committed_set = n2.committed_set
```
**✓ Proven in Vortex_DSE_CSlot_AE.tla:** 79.6K states (companion spec)

---

### **Single-Witness Loss Recovery**
```
∀ messages m:
  IF (∃ node n: m ∈ n.processed)
  THEN (∀ nodes n': n'.committed ⟹ m ∈ n'.committed_set)
```
**✓ Proven in Vortex_DSE_CSlot_AE_Lossy.tla:** 1.59M states (companion spec)

---

### **Cross-Slot Exactly-Once**
```
∀ nodes n, messages m:
  admit_count[n][m] ≤ 1 (across ENTIRE run)
```
**✓ Proven in Vortex_DSE_CSlot_AE_ExactlyOnce.tla:** 2.78M states (companion spec)

---

## Formal Methods Used

| Tool | Role | Coverage | Result |
|------|------|----------|--------|
| **TLC** (explicit-state) | Main verification | Safety + liveness | 0 errors in M+ states |
| **Apalache** (symbolic SMT) | Independent confirmation | Safety invariants | 0 errors (independent path) |
| **Reference impl** (JavaScript) | Executable spec validation | Unit tests | 10/10 test scenarios |

---

## Model-Checking Results Summary

### C-Slot Admission (Core, This Module)

| Spec | Config | Constants | States (Gen/Distinct) | Depth | Result |
|------|--------|-----------|----------------------|-------|--------|
| Vortex_DSE_CSlot.tla | `*_tiny.cfg` (safety) | 2 nodes, 2 msgs, MaxSlot=4 | 8,084,795 / 608,477 | 23 | **✓ 0 errors** |
| Vortex_DSE_CSlot.tla | `*_liveness.cfg` | 2 nodes, 1 msg, MaxSlot=2 | 2,672 / 453 | 12 | **✓ 0 errors** |

### Byzantine Variant (Clock Skew + Origin Spoofing)

| Spec | Config | Constants | States (Gen/Distinct) | Depth | Result |
|------|--------|-----------|----------------------|-------|--------|
| Vortex_DSE_CSlot_Skew.tla | `*_tiny.cfg` (Byzantine) | 2 nodes, 1 msg, MaxSlot=2, MaxSkew=1 | 96,481 / 10,099 | 17 | **✓ 0 errors** |

### Merkle Agreement (Baseline, Companion Spec)

| Spec | Config | Constants | States (Gen/Distinct) | Depth | Result |
|------|--------|-----------|----------------------|-------|--------|
| Vortex_DSE_CSlot_AE.tla | `*_tiny.cfg` (safety) | 2 nodes, 2 msgs, MaxSlot=2 | 79,601 / 10,000 | 23 | **✓ 0 errors** |
| Vortex_DSE_CSlot_AE.tla | `*_liveness.cfg` | 2 nodes, 1 msg, MaxSlot=1 | 426 / 120 | 12 | **✓ 0 errors** |

### Loss Recoverability (Lossy Refinement, Companion Spec)

| Spec | Config | Constants | States (Gen/Distinct) | Depth | Result |
|------|--------|-----------|----------------------|-------|--------|
| Vortex_DSE_CSlot_AE_Lossy.tla | `*_tiny.cfg` (safety) | 2 nodes, 2 msgs, MaxSlot=2, MaxDrops=2 | 1,593,693 / 167,943 | 31 | **✓ 0 errors** |
| Vortex_DSE_CSlot_AE_Lossy.tla | `*_liveness.cfg` | 2 nodes, 1 msg, MaxSlot=1, MaxDrops=1 | 1,910 / 490 | 16 | **✓ 0 errors** |

### Cross-Slot Exactly-Once (Composition, Companion Spec)

| Spec | Config | Constants | States (Gen/Distinct) | Depth | Result |
|------|--------|-----------|----------------------|-------|--------|
| Vortex_DSE_CSlot_AE_ExactlyOnce.tla | `*_safety.cfg` | 2 nodes, 2 msgs, MaxSlot=2, MaxDrops=1 | 2,788,068 / 297,615 | 31 | **✓ 0 errors** |
| Vortex_DSE_CSlot_AE_ExactlyOnce.tla | `*_liveness.cfg` | 2 nodes, 1 msg, MaxSlot=1, MaxDrops=1 | 2,412 / 626 | 17 | **✓ 0 errors** |

---

## Scope: What's Proven, What's Not

### ✅ IN THIS MODULE (Vortex_DSE_CSlot.tla)

- Temporal (not consensus-based) admission rule
- Strict slot matching (m.cslot = current_slot)
- Exactly-once per node, per slot
- Deterministic (no randomness), per-node local gate
- Crash/rejoin via persistent snapshot (mmap)
- Liveness: eventual tick progress, eventual rejoin

### ✅ PROVEN IN VARIANT (Vortex_DSE_CSlot_Skew.tla)

- **Byzantine origin spoofing resistance:**
  - Per-node clock with bounded skew (< Δt/2)
  - Adversary can spoof both timestamp AND sender identity
  - 6 invariants hold, 96K states, 0 errors
  - Complements baseline admission rule

### ✅ PROVEN IN COMPANION SPECS

- **Merkle Agreement** (vortex-merkle-agreement): Per-slot agreement under ideal network
- **Loss Recoverability** (vortex-loss-recoverability): Single-witness recovery under bounded packet loss
- **Cross-Slot Exactly-Once** (vortex-loss-recoverability): No re-admission across slots

### ❌ OUT OF SCOPE (Acknowledged, Separate Modules)

- Agreement Extension (AE) phase details (freeze/reconcile/commit) → vortex-merkle-agreement
- Packet loss tolerance → vortex-loss-recoverability
- Network layer protocol
- Production implementation
- Benchmark harness

---

## Environmental Assumptions (Declared)

These are kept **out** of the formal spec (as operational envelopes)
but are critical to validity:

| Assumption | What It Says | Why It Matters | Where Verified |
|-----------|--------------|----------------|-----------------|
| **A1** | Clock skew < Δt/2 | Justifies global slot counter (Skew model otherwise) | All specs + Skew variant |
| **A2** | Freeze barrier ⊆ residual slot | AE completes in time | Implicit in spec structure |
| **A3** | Reconcile completeness under bounded loss | MaxDrops budget sufficient | vortex-loss-recoverability |
| **A4** | All-live during AE phase | No crash/rejoin during agreement | Delegated to core recovery module |

---

## Repository Structure

```
vasilisnasopoulos-stack/

├── vortex-dse-cslot-spec/                  [THIS REPO]
│   │   [CORE: C-slot admission + Byzantine variant]
│   ├── specs/
│   │   ├── Vortex_DSE_CSlot.tla (390 lines, baseline)
│   │   ├── Vortex_DSE_CSlot_Skew.tla (Byzantine origin spoofing)
│   │   └── *.cfg (model checker configs)
│   ├── ref_impl/
│   │   └── cslot_ref.mjs (JavaScript executable, 10/10 ✓)
│   ├── logs/ (TLC output)
│   ├── README.md
│   ├── STATUS.md (8.08M states verified)
│   ├── ARCHITECTURE.md (this file)
│   └── run_*.sh (TLC + Apalache harnesses)
│
├── vortex-merkle-agreement/
│   │   [BASELINE: Per-slot agreement, ideal network]
│   ├── Vortex_DSE_CSlot_AE.tla (370 lines, 6 safety + 2 liveness invariants)
│   ├── MC_Vortex_DSE_CSlot_AE.tla (model checker harness)
│   ├── *.cfg (configurations)
│   ├── logs/ (TLC output)
│   ├── README.md (full explanation, assumptions A1-A4)
│   ├── STATUS.md (79.6K states verified)
│   ├── ARCHITECTURE.md
│   └── run_*.sh
│
└── vortex-loss-recoverability/
    │   [LOSSY REFINEMENT + COMPOSITION: Loss recovery + cross-slot dedup]
    ├── Vortex_DSE_CSlot_AE_Lossy.tla (370 lines, adds delivery layer)
    ├── Vortex_DSE_CSlot_AE_ExactlyOnce.tla (368 lines, composes lossy+dedup)
    ├── MC_Vortex_DSE_CSlot_AE_Lossy.tla (harness)
    ├── MC_Vortex_DSE_CSlot_AE_ExactlyOnce.tla (harness)
    ├── *.cfg (safety + liveness configs)
    ├── logs/ (TLC output)
    ├── README.md (full explanation, composition gap)
    ├── STATUS.md (1.59M + 2.78M states verified)
    ├── ARCHITECTURE.md
    └── run_*.sh
```

---

## Quick Start: Reproducing Results

### TLC (explicit-state model checker)
```bash
cd vortex-dse-cslot-spec

# C-Slot Admission (safety)
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_tiny.cfg \
  specs/Vortex_DSE_CSlot.tla
# Expected: 8,084,795 states, 0 errors (~2 min)

# Byzantine variant (clock skew + origin spoofing)
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_Skew_tiny.cfg \
  specs/Vortex_DSE_CSlot_Skew.tla
# Expected: 96,481 states, 0 errors (~1 min)
```

### Apalache (symbolic SMT-based checker)
```bash
cd vortex-dse-cslot-spec
APALACHE_BIN=/path/to/apalache-mc ./run_apalache.sh
# Expected: "NoError" (symbolic verification, ~30s)
```

### Reference Implementation (JavaScript)
```bash
cd vortex-dse-cslot-spec
node ref_impl/cslot_ref.mjs
# Expected: "10/10 scenarios passed"
```

---

## Citation

```bibtex
@misc{nasopoulos2026vortexdse,
  author       = {Nasopoulos, Vasilis},
  title        = {Vortex DSE Formal Specifications: 
                  Temporal Admission Under Clock Skew + 
                  Loss Recovery via Merkle Union + 
                  Cross-Slot Exactly-Once Deduplication},
  year         = {2026},
  howpublished = {\url{https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-spec}},
  note         = {Companion specs: vortex-merkle-agreement, vortex-loss-recoverability}
}
```

---

## Highlights

🔷 **Novel Aspects:**
- Temporal (not consensus-based) admission rule verified under Byzantine + clock skew
- Formal proof of single-witness loss recovery via Reconcile union
- Composition of per-slot agreement + cross-slot dedup in one verified system
- Double-checked: TLC (explicit) + Apalache (symbolic) independently agree

🔷 **Scale:**
- 8.08M+ states explored exhaustively (baseline)
- 96K+ states (Byzantine variant)
- 2.78M+ states (full composition chain)
- 21 safety invariants proven across all specs
- 8 liveness properties proven
- 0 counterexamples

🔷 **Reproducibility:**
- All scripts included + documented
- Bounds/constants explicit in *.cfg files
- Reference implementation matches spec (10/10 scenarios)
- Both checkers agree independently
- Assumptions (A1-A4) declared and justified
