# NIP-89 App Handler

nsyte supports NIP-89 handler announcements, allowing your nsite to be discovered as a
viewer/handler for specific Nostr event types.

## What is NIP-89?

NIP-89 (Recommended Application Handlers) provides a way for applications to announce what event
kinds they can handle. This enables cross-client discovery - when users encounter an unknown event
type in their Nostr client, the client can find and suggest applications that can display that event
type.

### Event Kinds

- **Kind 31990**: Handler information event - Published by applications to announce their
  capabilities
- **Kind 31989**: Recommendation event - Published by users to recommend an app for handling
  specific event kinds

## How nsyte Uses NIP-89

When enabled, nsyte will publish a kind 31990 event announcing that your nsite can handle/display
specific event kinds. Other Nostr clients can then suggest your nsite when users encounter those
event types.

## Configuration

Add the `appHandler` configuration to your `.nsite/config.json`:

```json
{
  "appHandler": {
    "enabled": true,
    "kinds": [1, 30023, 30311],
    "name": "My Event Viewer",
    "description": "A custom viewer for various Nostr events",
    "platforms": {
      "web": {
        "patterns": [
          { "url": "https://myapp.com/e/<bech32>", "entities": ["nevent", "note"] },
          { "url": "https://myapp.com/a/<bech32>", "entities": ["naddr"] },
          { "url": "https://myapp.com/p/<bech32>", "entities": ["nprofile", "npub"] }
        ]
      },
      "android": "com.example.myapp",
      "ios": "myapp://",
      "macos": "myapp://",
      "windows": "myapp.exe",
      "linux": "myapp"
    }
  }
}
```

### Configuration Options

- `enabled` (boolean): Whether to publish the handler announcement
- `kinds` (number[]): Array of event kind numbers this nsite can handle
- `name` (string, optional): Display name for your handler
- `description` (string, optional): Description of what your handler does
- `platforms` (object, optional): Platform-specific handler configurations
  - `web.patterns` (array, optional): Custom URL patterns for handling entities
    - `url`: Full URL pattern (e.g., `https://example.com/e/<bech32>`)
    - `entities`: Supported entity types (e.g., `nevent`, `naddr`, `nprofile`)
  - `android` (string, optional): Android app intent URL or package name
  - `ios` (string, optional): iOS app URL scheme or universal link
  - `macos` (string, optional): macOS app URL scheme or bundle identifier
  - `windows` (string, optional): Windows app protocol or executable path
  - `linux` (string, optional): Linux app command or desktop file

## Command Line Usage

You can also publish handler announcements via command line:

```bash
# Publish handler announcement with command line options
nsyte deploy ./site --app-handler --handler-kinds "1,30023,30311"

# Or use the config file
nsyte deploy ./site --app-handler
```

## Common Event Kinds

Here are some common event kinds you might want to handle:

- `1`: Short text notes
- `30023`: Long-form content articles
- `30311`: Live events/streams
- `1063`: File metadata
- `30078`: Application-specific data
- `31337`: Audio tracks (Zapstr)

## Example Use Cases

### 1. Blog Viewer

```json
{
  "appHandler": {
    "enabled": true,
    "kinds": [30023],
    "name": "My Blog",
    "description": "A beautiful reader for long-form content"
  }
}
```

### 2. Media Gallery

```json
{
  "appHandler": {
    "enabled": true,
    "kinds": [1063, 1, 6],
    "name": "Media Gallery",
    "description": "View images and media files"
  }
}
```

### 3. Event Archive

```json
{
  "appHandler": {
    "enabled": true,
    "kinds": [1, 6, 7, 30023],
    "name": "Nostr Archive",
    "description": "Archive viewer for various event types"
  }
}
```

## How It Works

1. When you upload with handler announcement enabled, nsyte creates a kind 31990 event
2. This event includes:
   - The event kinds your nsite can handle (`k` tags)
   - Platform-specific handlers (web, android, ios, etc.)
   - Web URLs with placeholders for bech32-encoded entities
   - Optional metadata about your handler
3. The event is published to your configured relays
4. Other Nostr clients can query for these handler events and suggest your nsite

## Gateway URLs

The handler announcement uses your configured gateway hostname (default: `nsite.lol`) to construct
URLs following the NIP-89 pattern:

### Default Patterns

- `https://<your-npub>.nsite.lol/e/<bech32>` - For event entities (nevent)
- `https://<your-npub>.nsite.lol/a/<bech32>` - For addressable entities (naddr)
- `https://<your-npub>.nsite.lol/p/<bech32>` - For profile entities (nprofile)

### Custom Patterns

You can define custom URL patterns in your configuration to match your application's routing. These
must be full URLs:

```json
{
  "appHandler": {
    "platforms": {
      "web": {
        "patterns": [
          { "url": "https://myapp.com/events/<bech32>", "entities": ["nevent"] },
          { "url": "https://myapp.com/articles/<bech32>", "entities": ["naddr"] },
          { "url": "https://myapp.com/users/<bech32>", "entities": ["nprofile", "npub"] }
        ]
      }
    }
  }
}
```

Where `<bech32>` will be replaced by the client with the actual bech32-encoded entity.

## Best Practices

1. Only announce event kinds your nsite actually handles
2. Provide clear name and description for better discovery
3. Test that your nsite properly handles the announced event types
4. Consider which bech32 entity types you support (nevent, naddr, note)

## Permissions

The handler announcement (kind 31990) is automatically included in the NIP-46 permissions when using
a bunker for signing.
