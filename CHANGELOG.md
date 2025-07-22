# Changelog

All notable changes to the Open-Weather AGS project will be documented in this file.

## [Unreleased] - Code Cleanup & Documentation Improvements

### Added
- **JSDoc documentation** - Added comprehensive function documentation across core modules
- **Utility module** (`utils.js`) - Centralized common helper functions
- **Constants module** (`constants.js`) - System-wide configuration constants
- **Enhanced configuration validation** - Better validation with specific error messages
- **Improved README** - Comprehensive documentation with development guidelines

### Improved
- **Error handling** - Consistent error handling patterns across modules
- **Code organization** - Reduced duplication and improved maintainability
- **Validation** - Enhanced config validation with range checking
- **Documentation** - Updated plan.md and README with current system state

### Removed
- **Unnecessary dependencies** - Cleaned up package.json dependencies
- **Deprecated diagnostic scripts** - Removed references to non-existent npm scripts
- **Code duplication** - Moved common functions to utility modules

### Fixed
- **Package.json cleanup** - Removed unnecessary and duplicate dependencies
- **Documentation consistency** - Aligned docs with actual codebase functionality
- **Error message clarity** - More specific validation and error messages

### Technical Improvements
- **Modular architecture** - Better separation of concerns
- **Type safety** - Enhanced validation for configuration parameters
- **Developer experience** - Better documentation and code organization
- **Maintainability** - Reduced technical debt and improved code quality

## [1.4.2b3] - 2025-07-22

### Added
- Comprehensive JSDoc documentation across all modules
- `utils.js` module with centralized utility functions
- `constants.js` module for system-wide configuration constants
- `validate-system.js` script for pre-flight system checks
- Quiet network monitoring with condensed logging

### Fixed
- Configuration validation now accepts `myID: 0` with warning (for placeholder configs)
- Network monitoring reduced from 3 verbose log lines every 10 minutes to 1 condensed line every 30 minutes
- Removed duplicate network status functions
- Enhanced error handling and validation throughout codebase

### Changed
- Updated `package.json` to remove built-in Node.js modules from dependencies
- Network monitoring interval increased from 10 to 30 minutes for reduced log noise
- Improved configuration backup and recovery system
- Enhanced validation with detailed error messages

### Removed
- References to non-existent npm scripts from documentation
- Unnecessary verbose logging during network monitoring
- Redundant dependency declarations

---

### Development Notes

This changelog follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format.

**Version format**: `MAJOR.MINOR.PATCH[PRERELEASE]`
- **MAJOR**: Breaking changes
- **MINOR**: New features, backwards compatible
- **PATCH**: Bug fixes, backwards compatible  
- **PRERELEASE**: Beta versions (e.g., `b1`, `b2`, `rc1`)
