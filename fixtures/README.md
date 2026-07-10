# Fixtures

Fixtures are small, deterministic repositories and product-state recordings used by tests, Eden Lab, demos, and regression reports.

Each fixture must document its initial state, task, allowed capabilities, expected changes, required checks, expected terminal state, and any secret canaries. Avoid dependencies on private repositories, live services, or mutable package versions.

The first set should include three kernel scenarios and three product-contract scenarios before a real model provider is connected.
