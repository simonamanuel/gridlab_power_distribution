# Model assumptions and limits

- Balanced three-phase, steady-state power flow based on pandapower.
- Fictional 13.8 kV supply, 500 kVA transformer, 600 V bus, and three radial feeders.
- Generic transformer impedance, feeder impedances, source short-circuit capacity, and load power factors supplied in `server.py`.
- Fault studies are simplified prospective three-phase short-circuit calculations; pickup comparisons do **not** establish selectivity, coordination, clearing time, arc-flash energy or breaker interrupting duty.
- Scripted changes in switch state are simulation only. GRIDLAB cannot control actual equipment.
- Geometry is conceptual and not a construction drawing or actual site map.
- The optional language-model feature is an explanatory assistant, not a numerical solver. The offline path runs without credentials.
- Validation tests cover specific invariants, power balance, current relationships and basic scenario behaviour. They do not independently certify the complete network.
