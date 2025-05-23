---
title: Local Development Setup
description: Setting up nsyte for local development and testing
---

# Local Development Setup

This guide will help you set up nsyte for local development and testing. We'll cover setting up a development environment, configuring local relays, and testing your setup.

## Prerequisites

- [Deno](https://deno.land/) 2.0 or later
- `git` 
- `nak`
- A bunker signer (such as [Amber]())

## Development Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/sandwichfarm/nsyte.git
cd nsyte
```

2. Install dependencies
```bash
deno install
```

3. Development server
```bash 
deno task dev
```

4. Compile
```bash 
deno task compile
```

This will:
- Install the development version of nsyte
- Set up the necessary permissions
- Make the `nsyte` command available in your terminal

## Local Relay and Bunker

For local development, you'll want to set up a local relay and a bunker. This allows you to test your setup without publishing to public relays or dealing with production Bunker idiosychrocies.

### Using nak

This guide will use [nak](https://github.com/wtf-nzb/nak), please reference nak docs to install.

Start a local memory relay
```bash
nak relay 
```

Start a local bunker (for testing Bunker functionality)
```bash 
nak bunker wss://relay.nsec.app
```

Your local relay will be available at `ws://localhost:8080`.

## Testing Your Setup

1. Initialize a test project:
```bash
mkdir test-site
cd test-site
nsyte init
```

When prompted:
- Choose "NIP-49 Bunker" for testing
- Add `ws://localhost:8080` as your relay
- Skip server configuration for now

2. Create a test site:
```bash
echo "<html><body><h1>Test Site</h1></body></html>" > index.html
```

3. Upload to your local relay:
```bash
nsyte upload .
```

4. Verify the upload:
```bash
nsyte ls
```

## Development Workflow

### Running Tests

```bash
# Run all tests
deno task test

# Run tests with coverage
deno task coverage
```

### Building

```bash
# Build for current platform
deno task compile

# Build for all platforms
deno task compile:all
```

### Debugging

For debugging, you can use the `--verbose` flag with any command:

```bash
nsyte upload . --verbose
```

## Common Development Tasks

### Adding New Commands

1. Create a new command file in `src/commands/`
2. Add the command to `src/cli.ts`
3. Add tests in `tests/commands/`
4. Update documentation

### Modifying Configuration

The configuration schema is defined in `src/config.ts`. When modifying:

1. Update the schema
2. Add migration code if needed
3. Update documentation
4. Add tests

### Testing Bunker Integration

For testing bunker integration:

1. Set up a test bunker (e.g., using [nostr-bunker](https://github.com/fiatjaf/nostr-bunker))
2. Connect using the test bunker's URL
3. Test bunker commands
4. Verify authentication

## Troubleshooting

### Common Issues

1. **Permission Denied**
   - Check Deno permissions
   - Verify file permissions
   - Check relay access

2. **Connection Issues**
   - Verify relay is running
   - Check network connectivity
   - Verify relay URL format

3. **Authentication Errors**
   - Check key format
   - Verify bunker connection
   - Check configuration

### Getting Help

- Check the [GitHub Issues](https://github.com/sandwichfarm/nsyte/issues)
- Join the [Nostr channel](https://njump.me/npub1...)
- Review the [Security Guide](./security.md)

## Next Steps

- Set up [CI/CD integration](./ci-cd.md)
- Learn about [deployment options](./deployment.md)
- Review [security best practices](./security.md) 