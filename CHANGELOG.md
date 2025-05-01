# Changelog

All notable changes to nsyte will be documented in this file.

## [0.3.0] - 2023-08-03
### Added
- Automatic detection of files that already exist online
- Improved progress tracking showing x/y files instead of server operations
- Better success reporting with separate tracking for file uploads vs. NOSTR events
- Enhanced error handling with more informative messages
- GitHub Actions workflow for automated releases
- Project renamed from nsyte to nsyte

### Fixed
- Issue with NOSTR event publishing to relays
- Problem with pre-upload file comparison
- Bug in progress reporting counting server operations as files

## [0.2.0] - 2023-07-15
### Added
- Migration from Node.js to Deno
- NIP-46 bunker support
- Parallel upload capabilities
- Progress bars and colorized terminal output

### Changed
- Complete rewrite of the upload mechanism
- Better error handling and retry logic
- Improved configuration management

## [0.1.0] - 2023-05-20
### Added
- Initial release of nsyte (formerly nsyte, Node.js version)
- Basic upload functionality
- Support for listing files
- Support for downloading files 