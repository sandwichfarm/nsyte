# Testing in nsyte

This directory contains all tests for the nsyte project. Tests are organized using Deno's
testing framework.

## Test Structure

- **Unit Tests**: Located in `tests/unit/` - These test individual components of the application in
  isolation.
- **Integration Tests**: Located in `tests/integration/` - These test how components work together.

## Running Tests

To run all tests:

```bash
deno task test
```

Or to run specific tests:

```bash
deno test tests/unit/specific_test.ts
```

## Test Guidelines

1. All tests should be placed in the `tests/` directory, not within the source code.
2. Unit tests should have the naming convention `*_test.ts`.
3. Tests should follow the structure of using `describe()` and `it()` for better organization.
4. Use mocks for external dependencies to ensure tests are reliable and fast.

## Test Organization

The test directory structure follows the package structure in src, but within the tests directory.
For example, tests for `src/lib/secrets/mod.ts` should be in `tests/unit/secrets_test.ts` or
similar.

## Current Test Status

All tests should be passing. If you encounter failing tests, please fix the issue before submitting
a PR.
