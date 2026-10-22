"""Independent electrical sanity checks and reproducible Markdown validation report.

Run: python3 validation.py
These checks establish mathematical consistency, not real-world design compliance.
"""
from __future__ import annotations
import argparse
import math
from datetime import datetime, timezone
from pathlib import Path
from server import simulate, fault_study, Scenario, FaultStudy, FEEDERS

ROOT = Path(__file__).resolve().parent
S3 = math.sqrt(3.0)

def feeder_expected_current_a(p_kw: float, pf: float, voltage_v: float) -> float:
    """Balanced sinusoidal three-phase: P = sqrt(3) * VLL * IL * PF."""
    return p_kw * 1000 / (S3 * voltage_v * pf)

def assess_case(name: str, loads: list[float], closed: list[bool]) -> dict:
    data = simulate(Scenario(loads=loads, closed=closed))
    checks=[]
    def record(title: str, actual: float, expected: float, abs_tolerance: float, unit: str):
        error=abs(actual-expected)
        checks.append(dict(name=title, actual=actual, expected=expected,
            error=error, tolerance=abs_tolerance, unit=unit, passed=error<=abs_tolerance))
    # An independent application of power conservation, not a pandapower-specific result field.
    record('Real-power balance: grid supply = served load + losses',
        data['utility_supply_kw'],data['served_kw']+data['losses_kw'],0.05,'kW')
    record('Demand partition: requested = served + unserved',
        data['requested_kw'],data['served_kw']+data['unserved_kw'],1e-8,'kW')
    for feeder, config in zip(data['feeders'],FEEDERS):
        if feeder['closed']:
            current = feeder_expected_current_a(feeder['served_kw'],config['pf'],feeder['voltage_v'])
            # Line current includes a simple pi-model and may have a small discrepancy with load current.
            record(f"{feeder['id']} current (three-phase power identity)",
                feeder['current_a'],current,max(0.5,0.01*current),'A')
        else:
            checks.append(dict(name=f"{feeder['id']} open feeder reports no voltage/current",
                actual=1.0 if feeder['voltage_v'] is None and feeder['current_a'] is None else 0.0,
                expected=1.0,error=0.0 if feeder['voltage_v'] is None and feeder['current_a'] is None else 1.0,
                tolerance=0.0, unit='boolean', passed=feeder['voltage_v'] is None and feeder['current_a'] is None))
    return {'name':name,'scenario':data,'checks':checks}

def report_markdown() -> tuple[str,bool]:
    cases=[assess_case('Baseline: all feeders energized',[120,60,40],[True,True,True]),
           assess_case('Manufacturing isolated',[120,60,40],[False,True,True]),
           assess_case('Elevated manufacturing demand',[200,60,40],[True,True,True])]
    faults=[fault_study(FaultStudy(feeder_index=i,pickup_ka=1.0)) for i in range(3)]
    ordered=all(faults[i]['ikss_ka']>faults[i+1]['ikss_ka'] for i in range(2))
    passed=all(c['passed'] for case in cases for c in case['checks']) and ordered
    lines=['# GRIDLAB v1.7 — Engineering Validation Report','',
      f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",'',
      '**Status:** '+('All included consistency checks passed.' if passed else 'One or more checks failed; investigate before relying on results.'),'',
      '## Scope','',
      'Educational, fictional 13.8 kV / 600 V three-phase radial industrial network, 500 kVA transformer, three feeders. '
      'Numerical load-flow results were produced by pandapower and checked against separately coded analytical equations. '
      'This report is not an independent certified design review, commissioning test, or protection coordination study.','',
      '## Model assumptions','',
      '- Utility: 13.8 kV, 1.0 pu; prospective maximum three-phase source fault level 250 MVA, R/X=0.1.',
      '- Transformer: 500 kVA; 13.8/0.6 kV; short-circuit voltage 6%; resistive component 1%; iron loss 1 kW; no-load current 0.2%.',
      '- Feeders: 0.20 km / 0.35 km / 0.50 km; R=0.12 Ω/km, X=0.08 Ω/km, assumed conductor current limits 300/200/150 A.',
      '- Loads: constant PQ at power factors 0.85 / 0.95 / 0.98, with positive inductive reactive power.',
      '- Positive-sequence balanced, steady-state power flow; network geometry is conceptual and not to scale.','',
      '## Analytical equations','',
      '- Balanced real power: `P = sqrt(3) × V_LL × I_L × PF`.',
      '- Expected current: `I_L = P / (sqrt(3) × V_LL × PF)`.',
      '- Real-power balance: `P_source ≈ P_served + P_losses`.',
      '- Demand accounting: `P_requested = P_served + P_unserved`.','']
    for case in cases:
        r=case['scenario'];lines += [f"## {case['name']}",'',
          f"- Requested: **{r['requested_kw']:.1f} kW**; served: **{r['served_kw']:.1f} kW**; unserved: **{r['unserved_kw']:.1f} kW**.",
          f"- BUS-01 voltage: **{r['main_voltage_v']:.2f} V**; TX-01 loading: **{r['transformer_loading_pct']:.2f}%**.",
          f"- Utility supply: **{r['utility_supply_kw']:.3f} kW**; modelled losses: **{r['losses_kw']:.3f} kW**.",'',
          '| Check | Simulated | Analytical | Absolute difference | Tolerance | Result |',
          '|---|---:|---:|---:|---:|---|']
        for c in case['checks']:
            lines.append(f"| {c['name']} | {c['actual']:.4f} {c['unit']} | {c['expected']:.4f} {c['unit']} | {c['error']:.4f} | {c['tolerance']:.4f} | {'PASS' if c['passed'] else '**FAIL**'} |")
        lines.append('')
    lines += ['## Three-phase prospective fault currents','',
        '| Feeder | Length (km) | Initial symmetrical RMS fault current (kA) |',
        '|---|---:|---:|']
    for feeder,fault in zip(FEEDERS,faults):
        lines.append(f"| {feeder['id']} | {feeder['km']:.2f} | {fault['ikss_ka']:.4f} |")
    lines += ['',f"**Feeder-length ordering check:** {'PASS' if ordered else '**FAIL**'} (shorter modelled feeder has higher prospective fault current).",'',
      'These IEC 60909-based study results are **not** independently reproduced by the simple current formula above. '
      'A separate impedance-equivalent short-circuit verification is needed to validate their absolute magnitudes.','',
      '## Limitations and next engineering work','',
      '- Validate transformer and line data against manufacturer and conductor datasheets before any design decision.',
      '- Complete minimum fault scenarios, earth-fault models, relay time-current coordination, and breaker interrupting-duty assessments.',
      '- Review voltage limits and equipment selection under applicable engineering codes and utility requirements.',
      '- Check motor starting, load growth, harmonics, unbalance, and operational contingencies.',
      '- These checks evaluate internal numerical consistency, not full physical model accuracy or safety.','']
    return '\n'.join(lines),passed

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default='reports/engineering_validation.md')
    args=parser.parse_args();doc,passed=report_markdown()
    path=ROOT/args.output;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(doc,encoding='utf-8')
    print(f'Validation report: {path}');print('RESULT:', 'PASS' if passed else 'FAIL')
    if not passed: raise SystemExit(1)

if __name__=='__main__':main()
