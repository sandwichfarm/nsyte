# Contributing to nsyte

Thank you for your interest in contributing to nsyte! We welcome contributions from the community.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nsyte.git
   cd nsyte
   ```
3. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Deno 2.0 or higher
- Git

### Running the Development Version

```bash
# Run the CLI in development mode
deno task dev

# Run tests
deno task test

# Build binaries
deno task compile
```

## Making Changes

### Code Style

- Follow the existing code style in the project
- Use TypeScript for all new code
- Ensure your code passes linting: `deno lint`
- Format your code: `deno fmt`

### Commit Messages

- Use clear and descriptive commit messages
- Start with a verb in the present tense (e.g., "Add", "Fix", "Update")
- Keep the first line under 72 characters
- Reference issues when applicable (e.g., "Fix #123")

### Testing

- Add tests for new features
- Ensure all tests pass before submitting: `deno task test`
- Update existing tests if you change functionality

## Submitting Changes

1. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request on GitHub:
   - Provide a clear description of the changes
   - Reference any related issues
   - Include screenshots for UI changes
   - Ensure all CI checks pass

3. Address review feedback:
   - Make requested changes
   - Push additional commits to your branch
   - The PR will update automatically

## Reporting Issues

- Use the GitHub issue tracker
- Search existing issues before creating a new one
- Include:
  - Clear description of the problem
  - Steps to reproduce
  - Expected vs actual behavior
  - System information (OS, Deno version)
  - Error messages or logs

## Feature Requests

- Open an issue with the "enhancement" label
- Describe the feature and its use case
- Consider how it fits with the project goals
- Be open to discussion and feedback

## Documentation

- Update documentation for any user-facing changes
- Documentation is built with MkDocs
- Source files are in the `docs/` directory
- Build locally with: `mkdocs serve`

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Assume good intentions

## Questions?

If you have questions, feel free to:

- Open an issue for discussion
- Ask in the pull request
- Contact the maintainers

Thank you for contributing to nsyte! 🚀
