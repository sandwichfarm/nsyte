---
title: run
description: Run a resolver server that serves nsites via npub subdomains
---

# `nsyte run`

Run a resolver server that serves nsites via npub subdomains. This command starts a local server
that can resolve and serve nsites using the format `npub1234.localhost` or similar subdomain
patterns.

## Usage

```bash
nsyte run [npub] [options]
```

## Arguments

- `npub` (optional): Specific npub to launch when accessing localhost (defaults to a demo npub)

## Options

- `-p, --port <port>`: Port number to run the resolver on (default: 6798)
- `-r, --relays <relays>`: Comma-separated list of nostr relays to use
- `-k, --privatekey <nsec>`: Private key for signing operations
- `-b, --bunker <url>`: NIP-46 bunker URL for signing
- `--nbunksec <nbunksec>`: nbunksec string for authentication
- `-c, --cache-dir <dir>`: Directory to cache downloaded files
- `--no-open`: Don't automatically open browser

## Examples

### Basic Resolver

```bash
nsyte run
```

Starts the resolver on `http://localhost:6798`. Accessing localhost redirects to a demo npub. You
can access any nsite at:

- `http://npub1abc123.localhost:6798`
- `http://npub1def456.localhost:6798`

### Launch Specific npub

```bash
nsyte run npub1abc123def456ghi789
```

Starts the resolver and when you access localhost, it will redirect to the specified npub instead of
the default demo.

### Custom Port

```bash
nsyte run --port 3000
```

Serves on port 3000 instead of the default 6798.

### Custom Relays

```bash
nsyte run --relays wss://relay1.com,wss://relay2.com
```

Uses specific relays for discovering nsite events.

## How It Works

The resolver server:

1. **Subdomain Parsing**: Extracts npub from subdomain (e.g., `npub1abc123.local.dev`)
2. **Event Discovery**: Fetches nsite events (kind 34128) from configured relays
3. **File Resolution**: Maps requested paths to file hashes from events
4. **Blob Serving**: Retrieves and serves files from blossom servers
5. **Fallback Handling**: Serves fallback content for client-side routing

## Subdomain Format

The resolver expects npub subdomains in the format:

```
npub1[bech32-encoded-pubkey].[base-domain]
```

Examples:

- `npub1abc123def456.localhost:3000`
- `npub1xyz789uvw012.local.dev:6798`

## DNS Setup for Production

For production use, you'll need to configure DNS:

### Wildcard DNS

Set up a wildcard DNS record pointing to your server:

```
*.nsites.example.com → 1.2.3.4
```

### Local Development

For local testing, add entries to `/etc/hosts`:

```
127.0.0.1 npub1abc123.localhost
127.0.0.1 npub1def456.localhost
```

Or use a service like `lvh.me` which resolves all subdomains to localhost.

## Configuration

### Relay Configuration

The resolver uses relays to discover nsite events:

```bash
# Use default relays
nsyte run

# Use specific relays
nsyte run --relays wss://relay.nsite.lol,wss://relay.damus.io
```

### Blossom Server Configuration

Configure which blossom servers to use for file retrieval:

```bash
# Use default servers
nsyte run

# Use specific servers  
nsyte run --servers https://cdn.hzrd149.com,https://cdn.sovbit.host
```

## Features

### Automatic Discovery

- Discovers nsite events from relays automatically
- Caches event data for better performance
- Updates when new events are published

### File Serving

- Serves files directly from blossom servers
- Handles content types appropriately
- Supports range requests for large files

### SPA Support

- Respects fallback configuration from nsite events
- Enables client-side routing for React, Vue, etc.
- Serves index.html for unmatched routes (when configured)

### Error Handling

- Returns 404 for non-existent nsites
- Handles blossom server failures gracefully
- Provides helpful error messages

## Performance Considerations

### Caching

The resolver caches:

- Event data from relays
- File mappings
- Blossom server responses (where appropriate)

### Scaling

For production deployment:

- Use a reverse proxy (nginx, Cloudflare)
- Implement additional caching layers
- Monitor relay and blossom server performance

### Reliability

- Configure multiple relays for redundancy
- Use multiple blossom servers for failover
- Implement health checks

## Production Deployment

### Docker Example

```dockerfile
FROM denoland/deno:alpine

WORKDIR /app
COPY . .

EXPOSE 3000

CMD ["deno", "run", "--allow-net", "--allow-read", "nsyte", "run", "--host", "0.0.0.0"]
```

### systemd Service

```ini
[Unit]
Description=nsyte resolver
After=network.target

[Service]
Type=simple
User=nsyte
WorkingDirectory=/opt/nsyte
ExecStart=/usr/local/bin/nsyte run --host 0.0.0.0 --port 3000
Restart=always

[Install]
WantedBy=multi-user.target
```

### Nginx Reverse Proxy

```nginx
server {
    server_name *.nsites.example.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Monitoring

### Health Check Endpoint

The resolver typically provides a health check endpoint:

```
GET /_health
```

### Metrics

Monitor these metrics:

- Request latency
- Cache hit rates
- Relay response times
- Blossom server availability

## Troubleshooting

### Subdomain Not Resolving

1. Check DNS configuration
2. Verify npub format is correct
3. Ensure the nsite has published events

### Files Not Loading

1. Check blossom server availability
2. Verify file hashes in events
3. Test blossom servers directly

### Performance Issues

1. Check relay response times
2. Monitor blossom server latency
3. Review caching configuration

## Related Commands

- [`nsyte serve`](serve.md) - Serve local files for development
- [`nsyte deploy`](deploy.md) - Deploy files to create nsites
- [`nsyte debug`](debug.md) - Debug nsite configuration and connectivity
- [`nsyte ls`](ls.md) - List published nsite files
