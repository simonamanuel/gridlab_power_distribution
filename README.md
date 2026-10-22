# GRIDLAB — Power Distribution Simulation

I built GRIDLAB to learn more about power systems by making something I could actually interact with. It started with a Python model of a transformer and a load. I then added three feeders, switch controls, a 3D site view, and simple fault studies.

The network is fictional: a 13.8 kV utility supply, a 500 kVA transformer, a 600 V distribution bus, and manufacturing, commercial, and EV charging loads. The equipment values are examples, not real utility data.

## What it does

- Runs balanced three-phase power-flow calculations with **pandapower**.
- Lets you adjust loads and open or close individual feeder switches.
- Shows bus voltage, feeder current, transformer loading and real-power losses alongside a clickable 3D site.
- Calculates an example prospective three-phase short-circuit current and uses an assumed pickup threshold for a *simplified* trip demonstration.
- Includes an event history, engineering notes and a project assistant. The assistant works offline; a language-model API is optional.
- Generates a reproducible Markdown validation report.

## Screenshots

Screenshots of the app will go in `assets/` after I capture the final demo. See [assets/README.md](assets/README.md).

## Built with

Python, pandapower, FastAPI, pandas, pytest, JavaScript and Three.js.

## Run locally (macOS / Linux)

Requires Python 3 and an internet connection to load Three.js from the CDN.

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
python3 -m uvicorn server:app --reload
```

Open http://127.0.0.1:8000.

If port 8000 is already taken, stop the previous server or add `--port 8001` and open that port instead.

## Tests and report

```bash
python3 -m pytest -v
python3 validation.py
```

The second command writes `reports/engineering_validation.md`, which is generated locally and intentionally not committed by default. The student edition's original validation run passed 12 automated tests; rerun them whenever changing the model.

## Short demo

See [docs/demo_script.md](docs/demo_script.md) for a suggested 2–3 minute walkthrough.

## What this model does *not* do

This is a personal learning project, not an engineering design tool approved for actual installations. It uses hypothetical equipment values, simplified radial feeders, and idealized protection decisions. It does not implement fully coordinated relays, actual switching hardware, or time-domain fault transients. See [model assumptions](docs/model_assumptions.md).

## Next things I want to try

- Test the model against published reference networks.
- Add more feeders and transformers.
- Explore relay time-current curves and protection coordination.
- Improve the 3D equipment models and camera controls.

## API key (optional)

The app runs without an API key. To use its optional online assistant, set `OPENAI_API_KEY` as an environment variable on your own computer. Never commit it to Git. Any online assistant request may send the question and simulated network data to the provider.
