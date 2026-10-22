from validation import feeder_expected_current_a, assess_case, report_markdown

def test_independent_three_phase_current():
    # 100 kW, 600 V L-L, 0.90 PF => approximately 106.92 A
    assert abs(feeder_expected_current_a(100,.90,600)-106.9167)<.02

def test_baseline_power_balance_and_currents():
    case=assess_case('baseline',[120,60,40],[True,True,True])
    assert all(c['passed'] for c in case['checks']),case['checks']

def test_isolated_feeder_no_false_voltage():
    case=assess_case('isolation',[120,60,40],[False,True,True])
    assert all(c['passed'] for c in case['checks']),case['checks']

def test_report_is_reproducible_and_contains_assumptions():
    report,passed=report_markdown()
    assert passed
    assert 'Model assumptions' in report and 'Three-phase prospective' in report
