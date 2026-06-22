> **Vortex DSE public verification bundle**
>
> [Proofs](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-proofs) · [Strict spec](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-spec) · [Merkle agreement](https://github.com/vasilisnasopoulos-stack/vortex-merkle-agreement)

# Vortex DSE — C-Slot Strict Admission

TLA+ specification and executable reference implementation for the **strict** C-slot admission rule used as one public Vortex DSE verification artifact.

**Author:** Vasilis Nasopoulos  
**Status:** machine-checked with TLC explicit-state model checking and executable reference scenarios (JavaScript port)  
**Scope:** C-slot admission only. Network transport, production ticker internals, finality, benchmark internals, and full end-to-end protocol composition are outside this repository.

## Why this repo exists

This repo is for readers who want a clear, bounded, executable version of the admission rule.
It is intentionally separate from the late-tolerant proof repo so visitors can compare the two variants:

- **strict** admission here: `tx.cslot = current_slot`
- **late-tolerant** admission in the proofs repo: `tx.cslot <= current_slot`

## In one line

If the transaction is not in the current slot, it is rejected.

## Position in the public verification bundle

| Repository | Role | Verification status |
|---|---|---|
| [vortex-dse-cslot-proofs](https://github.com/vasilisnasopoulos-stack/vortex-dse-cslot-proofs) | Late-tolerant C-slot admission; deductive safety proofs | TLAPS: `[]TypeInvariant`, `[]NoFutureAdmission`; all 194 obligations proved |
| **vortex-dse-cslot-spec** ← you are here | Strict C-slot admission, clock skew, Byzantine timestamp/origin spoofing, executable reference | TLC bounded checks; JavaScript reference scenarios |
| [vortex-merkle-agreement](https://github.com/vasilisnasopoulos-stack/vortex-merkle-agreement) | Per-slot input-set agreement: Freeze → Reconcile → Commit | TLC + Apalache bounded checks under declared assumptions |

## Strict vs late-tolerant admission

This repository specifies the **strict** C-slot rule:

```text
admit(tx, node) ⇔ tx.cslot = node.current_slot
```

Meaning:

- on-time transaction → admitted;
- one bucket late → permanently rejected;
- future-dated transaction → permanently rejected.

## What this is

The C-slot rule is a deterministic **local admission predicate**. It is not, by itself, consensus.

```text
C_slot(tx) = floor((T_hw - T_0) / Delta_t)
```

There is no leader, no quorum, and no voting in this admission layer.

## What you can do here

- Read the TLA+ spec.
- Run TLC on the provided configurations.
- Run the JavaScript reference scenarios.
- Compare the strict model against the late-tolerant proof repo.

## Reproduce

### TLC

Requires `tla2tools.jar`.

```sh
java -jar tla2tools.jar -workers auto \
  -config specs/Vortex_DSE_CSlot_tiny.cfg \
  specs/Vortex_DSE_CSlot.tla
```

### Reference implementation

Requires Node.js 18+ and has no dependencies.

```sh
node ref_impl/cslot_ref.mjs
```

## Suggested reviewer path

1. Start with the strict vs late-tolerant distinction above.
2. Inspect `specs/Vortex_DSE_CSlot.tla`.
3. Inspect `specs/Vortex_DSE_CSlot_Skew.tla`.
4. Run the TLC configurations and compare against `logs/`.
5. Run the JavaScript reference scenarios.
6. Continue to `vortex-dse-cslot-proofs` for deductive TLAPS safety proofs.
7. Continue to `vortex-merkle-agreement` for the agreement layer.
