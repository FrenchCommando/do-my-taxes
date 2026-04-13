# Test Scenarios

Scenario fixtures are imported from [taxes1040](https://github.com/FrenchCommando/taxes1040) (`tests/scenarios/2025/`).

To update after changes in the Python repo:

```bash
cp -r /path/to/taxes1040/tests/scenarios/2025/* tests/scenarios/
```

Then run `npm test` to verify the TS computation still matches.
