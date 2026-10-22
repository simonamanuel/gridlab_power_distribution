"""Automated regression checks for fictional GRIDLAB study assumptions."""
import os
import pytest
from fastapi.testclient import TestClient
from server import app

client = TestClient(app)
BASE = {"loads": [120, 60, 40], "closed": [True, True, True]}

def solve(loads=None, closed=None):
    response = client.post('/api/simulate', json={
        'loads': loads if loads is not None else BASE['loads'],
        'closed': closed if closed is not None else BASE['closed'],
    })
    assert response.status_code == 200, response.text
    return response.json()

def test_baseline_power_flow():
    r = solve()
    assert r['requested_kw'] == 220
    assert r['served_kw'] == 220
    assert r['unserved_kw'] == 0
    assert 570 < r['main_voltage_v'] < 600
    assert 0 < r['transformer_loading_pct'] < 100
    assert r['losses_kw'] > 0
    assert all(f['closed'] for f in r['feeders'])

def test_isolation_preserves_other_services():
    r = solve(closed=[False, True, True])
    assert r['served_kw'] == 100
    assert r['unserved_kw'] == 120
    assert r['feeders'][0]['status'] == 'isolated'
    assert r['feeders'][0]['voltage_v'] is None
    assert r['feeders'][0]['current_a'] is None
    assert r['feeders'][1]['served_kw'] == 60
    assert r['feeders'][2]['served_kw'] == 40


def test_all_open_has_no_served_load():
    r = solve(closed=[False, False, False])
    assert r['served_kw'] == 0
    assert r['unserved_kw'] == 220
    assert all(f['status']=='isolated' for f in r['feeders'])


def test_increased_demand_increases_loading():
    low = solve(loads=[120, 60, 40])
    high = solve(loads=[200, 60, 40])
    assert high['transformer_loading_pct'] > low['transformer_loading_pct']
    assert high['main_voltage_v'] < low['main_voltage_v']


def test_three_phase_faults_have_expected_order():
    values=[]
    for i in range(3):
        res = client.post('/api/fault-study', json={'feeder_index':i, 'pickup_ka':1.0})
        assert res.status_code == 200, res.text
        fault = res.json()
        assert fault['pickup_exceeded'] is True
        assert fault['ikss_ka'] > 1.0
        values.append(fault['ikss_ka'])
    assert values[0] > values[1] > values[2]


def test_bad_inputs_rejected():
    assert client.post('/api/simulate', json={'loads':[-1, 60, 40], 'closed':[True]*3}).status_code == 422
    assert client.post('/api/simulate', json={'loads':[120, 60], 'closed':[True]*3}).status_code == 422
    assert client.post('/api/fault-study',json={'feeder_index':3}).status_code == 422


def test_rules_based_assessment():
    response=client.post('/api/assess',json={'scenario':{'loads':[120,60,40],'closed':[False,True,True]}})
    assert response.status_code == 200, response.text
    data=response.json()
    assert '120 kW' in data['summary']
    assert 'MODEL-DERIVED FACTS' in data['report']
    assert 'LIMITATIONS' in data['report']


def test_offline_copilot(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    response=client.post('/api/copilot/ask',json={
        'question':'What is the main bus voltage?',
        'scenario':BASE,
        'fault_feeder_index': None
    })
    assert response.status_code == 200, response.text
    data=response.json()
    assert data['ai_used'] is False
    assert 'Model-derived facts:' in data['answer']
