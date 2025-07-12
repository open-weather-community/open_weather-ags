# Open-weather Automatic Ground Station (AGS) - Project Plan

## Project Overview

The Open-weather Automatic Ground Station (AGS) is an open-source hardware and software project that automatically receives weather satellite imagery from NOAA satellites (NOAA-15, NOAA-19) using Automatic Picture Transmission (APT). This project enables distributed, autonomous collection of weather data for the open-weather Public Archive.

**Note:** NOAA-18 has been removed from the default configuration as it reached end-of-life in 2024 and is no longer operational.

## Project Goals

### Primary Objectives

- Create easy-to-assemble, intuitive ground stations for weather satellite reception
- Enable distributed, automated collection of weather satellite imagery
- Provide educational entry point into radio, satellites, weather, and microcontrollers
- Contribute to open science and climate data accessibility
- Build resilient network of ground stations globally

### Design Philosophy

- **"More is less" approach** - Simplicity in operation and maintenance
- **Local computation** - Calculate satellite orbits on-device rather than relying on third-party services
- **Educational accessibility** - Serve as entry point for learning about radio, satellites, and coding
- **Open source everything** - Hardware designs, software, and documentation freely available
- **Resilient operation** - Graceful handling of failures and network issues

## Technical Architecture

### Hardware Components

- **Raspberry Pi 4** - Main computing platform
- **RTL-SDR dongle** - Software Defined Radio for satellite reception
- **LCD display (I2C)** - Status information and error messages
- **USB storage** - Configuration and data storage
- **Custom 3D-printed case** - Weather protection and mounting
- **External antenna** - V-dipole or other for satellite reception

### Software Stack

- **Runtime:** Node.js (JavaScript/ES modules)
- **Operating System:** Raspberry Pi OS (Bookworm v12)
- **Main Dependencies:**
  - `satellite.js` - Satellite orbit calculations
  - `axios` - HTTP client for API communication
  - `node-cron` - Scheduling system
  - `raspberrypi-liquid-crystal` - LCD display control
  - `geolib` - Geographic calculations
  - `luxon` - Date/time handling

### Development Environment

### Cross-Platform Development Considerations

This project is developed on a separate computer than it is intended to run on. The target deployment platform is a **Raspberry Pi**, which creates several important development considerations:

- **Hardware Dependencies:** The development machine does not have the physical hardware components that the AGS requires:

  - No LCD module connected (I2C display at address 0x27)
  - No RTL-SDR dongle for satellite reception
  - No GPIO pins for hardware interfaces
  - Different CPU architecture (likely x86/x64 vs ARM)

- **Testing Limitations:** Direct testing on the development machine is not practical since:

  - LCD display functions will fail without the actual I2C hardware
  - RTL-SDR recording functions cannot be tested without the radio hardware
  - Satellite pass calculations work but recording simulation is not possible
  - GPIO-dependent features cannot be validated

- **Development Strategy:**

  - **Modular Design:** Code is structured to allow individual module testing where possible
  - **Hardware Abstraction:** Functions that depend on Pi-specific hardware are isolated
  - **Configuration Validation:** Config loading and validation can be tested independently
  - **Logic Testing:** Satellite calculations, scheduling, and data processing can be verified
  - **Remote Deployment:** Code is deployed to actual Raspberry Pi hardware for integration testing

- **Deployment Workflow:**
  - Development and coding done on development machine
  - Version control (git) used for code synchronization
  - Testing deployment to actual Raspberry Pi for hardware validation
  - Remote debugging and logging for troubleshooting hardware-specific issues

This cross-platform development approach requires careful consideration of hardware dependencies and thorough testing on the target Raspberry Pi platform before considering any release ready for production use.

## Core Modules

#### 1. Scheduler (`scheduler.js`)

- **Purpose:** Main application orchestrator
- **Functions:**
  - System initialization and configuration loading
  - WiFi connectivity verification
  - Satellite pass scheduling and execution
  - Recording session management
  - Reboot overlap detection (2:50-3:10 AM buffer)

#### 2. Configuration System (`config.js`)

- **Purpose:** Dynamic configuration management with backup recovery
- **Functions:**
  - USB-based config file discovery
  - Runtime configuration loading/saving
  - Multi-mount point searching (`/media`, `/mnt`)
  - Automatic backup config creation and restoration
  - Config validation and error recovery

#### 3. Satellite Pass Prediction (`passes.js`, `tle.js`)

- **Purpose:** Calculate and manage satellite passes
- **Functions:**
  - Download Two-Line Element (TLE) data
  - Calculate satellite passes for configured location
  - Filter passes by elevation, distance, and timing
  - Select optimal passes for recording

#### 4. Recording System (`recorder.js`)

- **Purpose:** Automated satellite signal recording
- **Functions:**
  - RTL-SDR control via `rtl_fm`
  - Audio processing with SoX (downsampling, format conversion)
  - File management and timestamping
  - Signal quality optimization

#### 5. Upload System (`upload.js`)

- **Purpose:** Data transmission to public archive
- **Functions:**
  - Retry logic for failed uploads
  - Metadata packaging (location, timestamp, satellite info)
  - Progress monitoring and logging

#### 6. Display Interface (`lcd.js`)

- **Purpose:** User feedback and status display
- **Functions:**
  - Real-time status updates
  - Error message display
  - Scrolling text (marquee) for long messages
  - Next recording time display

#### 7. System Management (`disk.js`, `wifi.js`, `logger.js`)

- **Purpose:** System health and maintenance
- **Functions:**
  - Disk space monitoring and cleanup
  - WiFi connectivity management
  - Comprehensive logging with rotation

## Configuration Schema

The AGS uses a JSON configuration file (`ow-config.json`) stored on USB storage. The system automatically creates a backup file (`ow-config-backup.json`) to protect against config file corruption or disappearance:

```json
{
  "myID": 1, // Unique station identifier
  "locLat": 52.49548, // Latitude (decimal degrees)
  "locLon": 13.46843, // Longitude (decimal degrees)
  "gain": 38, // RTL-SDR gain setting
  "maxDistance": 2200000, // Maximum satellite distance (meters)
  "daysToPropagate": 1, // Days ahead to calculate passes
  "minElevation": 30, // Minimum pass elevation (degrees)
  "bufferMinutes": 0, // Recording buffer time
  "numberOfPassesPerDay": 1, // Max recordings per day
  "sampleRate": "48k", // Recording sample rate
  "downsample": true, // Enable audio downsampling
  "noaaFrequencies": {
    // Satellite frequencies
    "NOAA 19": "137.1M",
    "NOAA 15": "137.62M"
  },
  "wifiName": "network_name",
  "wifiPassword": "password",
  "auth_token": "api_token",
  "passesFile": "passes.json",
  "logFile": "log.txt",
  "rtl_fm_path": "/usr/local/bin/rtl_fm",
  "sox_path": "/usr/bin/sox"
}
```

## Data Flow Architecture

1. **Initialization**

   - Load configuration from USB storage
   - Initialize LCD display and logging
   - Verify WiFi connectivity

2. **Pass Calculation**

   - Download TLE data for NOAA satellites
   - Calculate passes for current location
   - Filter by elevation, distance, and timing constraints
   - Select best passes for recording

3. **Recording Pipeline**

   - Schedule recordings using precise timing
   - Execute RTL-SDR capture at correct frequency
   - Process audio (demodulation, filtering, downsampling)
   - Save to local storage with metadata

4. **Upload Process**

   - Package recording with metadata (location, time, satellite)
   - Upload to open-weather Public Archive API
   - Implement retry logic for network failures
   - Clean up local files after successful upload

5. **System Maintenance**
   - Monitor disk space and cleanup old recordings
   - Rotate log files to prevent storage overflow
   - Daily reboot at 3:00 AM for system refresh
   - Automatic software updates

## Technical Specifications

### Minimum Hardware Requirements

- **Raspberry Pi 4** (2GB+ RAM recommended)
- **RTL-SDR v3 dongle** or compatible
- **16GB+ USB storage** (FAT32 formatted)
- **LCD display** (16x2, I2C interface at 0x27)
- **Antenna** (V-dipole or Yagi, tuned for 137MHz)

### Software Dependencies

- **Raspberry Pi OS** Bookworm (v12)
- **RTL-SDR tools** (`rtl_fm`)
- **SoX audio processing**
- **Node.js** (latest LTS)
- **I2C tools** for LCD communication

### Network Requirements

- **WiFi connectivity** for uploads
- **Open-weather API access** with authentication token
- **NTP synchronization** for accurate timing

### Performance Characteristics

- **Recording frequency:** 137.1-137.9 MHz
- **Sample rate:** 48 kHz (downsampled to 11.025 kHz)
- **Recording duration:** 10-15 minutes per pass
- **Upload size:** ~2-5 MB per recording
- **Power consumption:** ~5W average, ~8W during recording

## File System Structure

```
/home/openweather/open_weather-ags/
├── scheduler.js          # Main application entry point
├── config.js            # Configuration management
├── passes.js            # Satellite pass calculations
├── tle.js              # TLE data processing
├── recorder.js         # Recording system
├── upload.js           # Upload functionality
├── lcd.js              # LCD display control
├── disk.js             # Disk management
├── wifi.js             # Network connectivity
├── logger.js           # Logging system
├── package.json        # Node.js dependencies
├── install.sh          # Installation script
├── start_scheduler.sh  # Startup script
└── 3d/                 # 3D printing files
    ├── ready-to-print/
    └── design-and-archive/

/media/[usb-device]/
├── ow-config.json      # Station configuration
├── ow-config-backup.json # Automatic backup of configuration
├── passes.json         # Calculated satellite passes
├── log.txt            # System logs
└── recordings/        # Captured audio files
```

## System Integration

### Cron Jobs

```bash
# Daily reboot for system refresh
0 3 * * * /sbin/shutdown -r now

# Automatic startup
@reboot /home/openweather/open_weather-ags/start_scheduler.sh
```

### System Services

- **NetworkManager** - WiFi configuration management
- **NTP** - Time synchronization (UTC)
- **I2C** - Hardware communication for LCD

### Security Considerations

- User permissions for network configuration
- Secure API token storage
- Local file system access controls
- Regular security updates via installation script

## Testing & Quality Assurance

### Configuration Backup & Recovery System

**Issue Addressed:** Documented cases of the `ow-config.json` file spontaneously disappearing or becoming corrupted on the AGS USB drive, even after successful operation for multiple days.

**Root Causes Identified:**

- **Power Interruptions:** Daily 3 AM reboots and power outages during file writes
- **FAT32 Vulnerabilities:** No journaling, cached writes, cheap USB drive firmware
- **Unnecessary Writes:** Config file was rewritten on every startup, creating corruption opportunities
- **Non-atomic Operations:** Simple file writes vulnerable to power loss mid-operation

**Solution Implemented:**

- **Automatic Backup Creation:** Every time the primary config is successfully loaded, a backup file (`ow-config-backup.json`) is created with timestamp metadata
- **Atomic File Operations:** All config writes use atomic write-to-temp-then-rename operations to prevent corruption
- **Smart Write Detection:** Config files are only rewritten when changes are actually needed
- **Validation:** All config files are validated for required fields before use
- **Recovery Mechanism:** If the primary config is missing or corrupted, the system automatically restores from the backup
- **Multi-location Search:** System searches all USB mount points for backup configs if primary is completely missing
- **User Feedback:** LCD displays specific error messages to help users understand config issues

**Files Created:**

- `ow-config-backup.json` - Automatic backup with timestamp metadata
- `configPath.json` - Tracks the last known config location

**Recovery Process:**

1. Attempt to load primary config (`ow-config.json`)
2. If corrupted, try to restore from backup in same directory
3. If primary missing entirely, search all USB devices for any backup config
4. Restore backup to primary config location
5. Continue normal operation

### Known Issues & Limitations

- **Reboot scheduling:** System reboots at 3:00 AM may conflict with long satellite passes
- **USB detection:** Occasional issues with USB mount detection on some Pi models
- **Network resilience:** Limited offline operation capabilities
- **Antenna optimization:** Performance varies significantly with antenna setup
- **Config persistence:** Resolved via backup system - no longer causes system failures

## Recent Bug Fixes & Improvements

### Elevation Filtering Bug Fix (2024)

**Issue Identified:** The `minElevation` configuration parameter was not being applied during satellite pass calculation, causing all passes to be processed regardless of elevation angle. This could lead to poor-quality recordings from low-elevation passes while potentially missing excellent high-elevation passes (including optimal 90-degree passes).

**Root Cause:** The `tle.js` module was calculating satellite elevations correctly but never comparing them against the configured `minElevation` threshold. The filtering logic was completely missing from the `findSatellitePasses` function.

**Solution Implemented:**

- **Enhanced Pass Detection:** Modified the elevation checking logic to only track satellite positions when elevation is above the configured minimum
- **Proper Pass Boundaries:** Passes now start and end based on elevation thresholds, not just distance constraints
- **Multiple Filtering Points:** Added elevation filtering at three critical points:
  1. During real-time elevation calculation
  2. When ending passes due to elevation drop
  3. When ending passes due to distance constraints
- **Improved Logging:** Added detailed logging to track how many passes are found and their elevation angles

**Code Changes:**

- `tle.js` - Added `minElevation` filtering in `findSatellitePasses()` function
- `tle.js` - Enhanced logging to show pass count and elevation details
- `tle.js` - Added elevation checking for all three pass-ending conditions

**Impact:**

- **Quality Improvement:** Only records satellite passes that meet minimum elevation requirements
- **90-Degree Passes:** Excellent high-elevation passes (including 90-degree overhead passes) are now properly captured and prioritized
- **Resource Efficiency:** Eliminates processing of poor-quality low-elevation passes

### Network Initialization Race Condition Fix (2025)

**Issue Identified:** Multiple ground stations in production were experiencing DNS resolution failures (`EAI_AGAIN` errors) when attempting to fetch TLE data from Celestrak. This was caused by a race condition in the network interface detection system introduced during the Ethernet/WiFi priority implementation.

**Root Cause:** The network interface detection was happening asynchronously at module load time, causing timing issues where network functions would use default interface names ('eth0', 'wlan0') before the actual interface names were detected. This led to network initialization failures, and when the system tried to fetch TLE data without proper network connectivity, DNS resolution would fail.

**Solution Implemented:**

1. **Fixed Race Condition:**

   - Replaced immediate async interface detection with on-demand detection
   - Added `ensureInterfacesDetected()` function to guarantee interface detection before use
   - Updated all network functions to properly wait for interface detection

2. **Added Network Fallback:**

   - Implemented TLE data caching system with 7-day expiration
   - Added automatic fallback to cached TLE data when network is unavailable
   - Modified scheduler to skip TLE updates when network is not available

3. **Enhanced Error Handling:**
   - Added comprehensive error handling for network failures
   - Improved cache validation to prevent corrupted cache files from causing crashes
   - Added helpful user feedback based on network status

**Code Changes:**

- `network.js` - Fixed interface detection race condition and added `ensureInterfacesDetected()`
- `tle.js` - Added TLE caching system with fallback mechanism
- `scheduler.js` - Added network-aware pass update logic with better error handling

**Impact:**

- **Reliability:** Eliminates DNS resolution failures in production deployments
- **Offline Operation:** Systems can continue operating using cached data when network is unavailable
- **User Experience:** Better error messages and status information for network issues
- **Robustness:** Improved error handling prevents system crashes from network failures
- **User Confidence:** Clear logging shows exactly which passes are being considered and why

**Configuration Usage:**

```json
{
  "minElevation": 30 // Only record passes above 30 degrees elevation
  // ... other config options
}
```

The system now properly respects the `minElevation` setting, ensuring that only viable passes are recorded while preserving the highest-quality passes for optimal weather satellite imagery capture.

## Recent Updates & Improvements (July 2025)

### Critical Bug Fixes for Production Issues

**Issue Addressed:** Multiple ground stations experiencing DNS resolution failures, "updating passes" freeze, and network initialization failures based on production data from June-July 2025.

**Root Causes Identified:**

1. **DNS Resolution Failures (EAI_AGAIN errors):**
   - Network initialization race conditions
   - Missing timeout protection on network operations
   - Inadequate fallback mechanisms for network failures

2. **"Updating Passes" Freeze:**
   - TLE fetch operations hanging without timeout
   - No fallback to cached data when network fails
   - Insufficient error handling in satellite pass calculation

3. **Network Initialization Issues:**
   - Interface detection timing problems
   - Missing timeout protection on critical network operations
   - No graceful degradation when network services fail

4. **Upload Failures:**
   - Insufficient retry logic for network errors
   - No differentiation between network and server errors
   - Inadequate timeout handling

**Solutions Implemented:**

#### 1. Enhanced TLE Data Processing (`tle.js`)

- **Improved Network Error Handling:** Added comprehensive detection for all network error types (EAI_AGAIN, ENOTFOUND, ETIMEDOUT, ECONNRESET, etc.)
- **Proactive Cache Loading:** Load cached TLE data immediately as fallback before attempting network fetch
- **Timeout Protection:** Added 15-second timeout for TLE fetch operations with User-Agent header
- **Data Validation:** Comprehensive validation of TLE data format and content before processing
- **Individual Satellite Timeouts:** 30-second timeout protection for each satellite processing operation
- **Overall Process Timeout:** 2-minute timeout for entire TLE processing operation
- **Better Error Messages:** Specific error guidance for different failure types

#### 2. Network Initialization Improvements (`network.js`)

- **Comprehensive Timeout Protection:** 90-second overall timeout for network initialization
- **Individual Operation Timeouts:** 
  - Interface detection: 15 seconds
  - Ethernet check: 20 seconds  
  - WiFi setup: 30 seconds
  - Priority setting: 10 seconds
  - Status check: 10 seconds
- **Enhanced Error Recovery:** Graceful fallback when individual operations fail
- **Better Progress Feedback:** Clear LCD messages during each step of network initialization
- **WiFi Configuration Validation:** Check for empty or missing WiFi settings before attempting connection

#### 3. Scheduler Improvements (`scheduler.js`)

- **Pass Update Timeout:** 3-minute timeout protection for satellite pass updates
- **Enhanced Error Handling:** Specific handling for DNS failures, timeouts, and network unavailability
- **Automatic Recovery:** Intelligent restart logic based on error type:
  - DNS failures: 30-second delay restart
  - Timeouts: 20-second delay restart  
  - Network unavailable: 60-second delay restart
- **Better User Feedback:** Specific LCD messages for different error conditions
- **Graceful Degradation:** Continue operation with cached data when network fails

#### 4. Upload System Enhancements (`upload.js`)

- **Network Error Detection:** Comprehensive identification of network vs. server errors
- **Enhanced Retry Logic:** 5 retry attempts with intelligent backoff
- **Escalating Delays:** Increased delay for consecutive network errors (up to 4x base delay)
- **Timeout Protection:** 60-second timeout for upload operations
- **Client Error Handling:** Stop retrying on 4xx client errors
- **Detailed Error Reporting:** Structured error responses with error codes and network error flags

#### 5. System-Wide Robustness Improvements

- **Timeout Protection:** Added timeouts to all critical network operations
- **Error Classification:** Differentiate between network, configuration, and system errors
- **Graceful Degradation:** System continues operating with cached data when network fails
- **Enhanced Logging:** More detailed error messages and troubleshooting information
- **Automatic Recovery:** Intelligent restart logic based on error patterns
- **User Feedback:** Clear LCD messages explaining system state and issues

**Code Changes Summary:**

- `tle.js` - Enhanced network error handling, timeout protection, and cache fallback
- `network.js` - Comprehensive timeout protection and error recovery for initialization
- `scheduler.js` - Pass update timeout protection and intelligent error recovery
- `upload.js` - Enhanced retry logic and network error detection

**Impact:**

- **Reliability:** Eliminates DNS resolution failures and "updating passes" freeze issues
- **Robustness:** System continues operating even with network problems
- **User Experience:** Clear feedback about system state and issues
- **Maintenance:** Better error reporting for remote troubleshooting
- **Operational Continuity:** Cached data allows operation without network connectivity

**Testing Recommendations:**

1. **Network Failure Testing:** Disconnect network during startup to verify cache fallback
2. **DNS Resolution Testing:** Block DNS to test EAI_AGAIN error handling
3. **Timeout Testing:** Simulate slow network conditions to verify timeout protection
4. **Configuration Testing:** Test with invalid WiFi credentials to verify error handling
5. **Recovery Testing:** Verify automatic restart behavior for different error types

**Production Deployment:**

These fixes directly address the specific error patterns observed in production ground stations:
- AGS 11 (Arbroath): DNS resolution failures and network initialization issues
- AGS 17 (Acra): System freezing and display issues
- AGS 18 (Seattle): Boot failures and blank screen issues  
- AGS 14 (Valparaiso): Freezing on "updating passes"
- AGS 2 (Cornwall): Network-related upload failures
- AGS 21: Upload failures with EAI_AGAIN errors

The enhanced error handling and timeout protection should prevent these systems from getting stuck in unrecoverable states and provide clear feedback about issues for remote troubleshooting.

## Previous Updates & Improvements (June 2025)

### Version Check Bypass System

**Feature Added:** Development bypass mechanism for version checking to enable proper testing of local changes without automatic GitHub updates overwriting modifications.

**Implementation:**

- **Bypass File:** Create `/home/openweather/bypass-version-check` to skip version checking
- **Smart Integration:** Bypass only affects GitHub API calls and updates, all other startup processes continue normally
- **Clear Logging:** System logs when bypass is active for transparency
- **Easy Toggle:** Simple file creation/deletion to enable/disable bypass

**Usage:**

```bash
# Enable bypass (for testing)
touch /home/openweather/bypass-version-check

# Disable bypass (return to normal operation)
rm /home/openweather/bypass-version-check
```

**Benefits:**

- Enables safe local development and testing
- Prevents accidental overwriting of work-in-progress changes
- Maintains all other system functionality (USB mounting, dependency checks, etc.)
- Provides clear feedback in logs about bypass status

### Logger Resilience for Read-Only USB Drives

**Issue Addressed:** Application crashes when USB drives are mounted as read-only (EROFS errors) because the logger cannot write to the configured log path on the USB drive.

**Root Cause:** The logger was attempting to write directly to `config.saveDir/config.logFile` (typically `/media/openweather/O-W/log.txt`) without handling read-only file system scenarios.

**Solution Implemented:**

- **Intelligent Fallback:** Logger automatically detects when the configured log path is not writable
- **Graceful Degradation:** Falls back to a local writable directory (`/home/openweather/logs/`) when USB is read-only
- **Clear User Feedback:** Logs indicate when fallback location is being used and why
- **Test-Then-Use:** Performs write test before committing to a log location
- **Directory Creation:** Automatically creates fallback directories as needed

**Technical Implementation:**

- Added `getWritableLogPath()` method to test write permissions before use
- Fallback path: `/home/openweather/logs/log.txt` when USB is not writable
- Enhanced error handling and user messaging
- Preserves all logging functionality regardless of USB drive state

**Files Modified:**

- `logger.js` - Enhanced with fallback logic and write testing

**Impact:**

- **System Reliability:** Application no longer crashes due to read-only USB drives
- **Continuous Operation:** Logging continues even when USB storage has issues
- **Better Debugging:** Clear indication of log location changes helps troubleshooting
- **User Experience:** System continues operating smoothly regardless of USB drive state

### Enhanced Error Handling & Robustness

**Improvements Made:**

- **USB Mount Resilience:** Better handling of USB drives that mount read-only
- **Startup Script Cleanup:** Removed duplicate code sections that caused confusion
- **Configuration Recovery:** Enhanced backup and recovery mechanisms
- **Network Tolerance:** Improved handling of network connectivity issues during startup

**System Reliability Enhancements:**

- More graceful handling of hardware failures
- Better error messages and user feedback
- Improved log file management and rotation
- Enhanced debugging capabilities for remote troubleshooting

### LCD Display Management Improvement

**Issue Addressed:** The "WIFI ACTIVE" message with full IP address was taking over the LCD display, interfering with normal AGS operation and status messages.

**Root Cause:** The `displayNetworkStatus()` function in `network.js` was displaying network status with IP address both during initialization and every 5 minutes during network monitoring, overriding the main AGS status display.

**Solution Implemented:**

- **Removed LCD Output:** Modified `displayNetworkStatus()` to only log network status to console, not display on LCD
- **Simplified Display Logic:** AGS READY message already indicates network connection type (wifi/ethernet)
- **Preserved Monitoring:** Network monitoring continues but no longer interferes with LCD display
- **Better User Experience:** LCD now shows appropriate AGS status messages instead of being hijacked by network details

**Technical Changes:**

- `network.js` - Removed `printLCD()` calls from `displayNetworkStatus()` function
- Network status still logged to console for debugging
- Network monitoring continues to function normally without LCD interference

**Impact:**

- **Cleaner Display:** LCD shows relevant AGS status instead of network details
- **Improved Operation:** Users can see recording schedules and system status properly
- **Simplified Design:** Follows "more is less" philosophy - network status shown in AGS READY message
- **Better UX:** No more LCD takeover interrupting normal system status display

**Files Modified:**

- `network.js` - Updated `displayNetworkStatus()` function to remove LCD output

## Development Testing Features

### Bypass Version Check System

The bypass version check feature is specifically designed for development and testing scenarios:

**When to Use:**

- Testing local code changes
- Debugging specific issues
- Validating new features before release
- Preventing automatic updates during development work

**How It Works:**

1. System checks for `/home/openweather/bypass-version-check` file on startup
2. If file exists, skips GitHub API calls and update process
3. Continues with all other startup procedures (USB mounting, dependency checks, app launch)
4. Logs bypass status for transparency

**Safety Features:**

- Only affects version checking, not core functionality
- Easy to enable/disable with simple file operations
- Clear logging indicates when bypass is active
- No configuration changes required

This feature ensures developers can work safely without worrying about their changes being overwritten by automatic updates, while maintaining all the normal system startup and operation procedures.

## Dependencies & External Services

### Critical Dependencies

- **open-weather Public Archive API** - `https://open-weather.community/wp-json/ow/v1/ground-stations`
- **TLE data sources** - Satellite orbital element updates
- **NPM registry** - JavaScript package dependencies
- **Raspberry Pi OS repositories** - System package updates

### Hardware Suppliers

- **RTL-SDR dongles** - Various suppliers (RTL-SDR.com, NooElec, etc.)
- **Raspberry Pi** - Official distributors
- **LCD displays** - Generic I2C 16x2 displays
- **3D printing** - PLA filament, standard FDM printers

## Troubleshooting Guide

### AGS Diagnostic Tool

A new diagnostic tool (`diagnose.js`) has been created to help troubleshoot the specific issues found in production systems:

```bash
# Run diagnostic tool
npm run diagnose
# or
node diagnose.js
```

The diagnostic tool checks for:
- DNS resolution issues (EAI_AGAIN errors)
- Network interface detection
- USB drive mounting and configuration files
- System resources and load
- TLE cache availability
- Celestrak connectivity

### Common Issues & Solutions

#### "Updating Passes" Freeze

**Symptoms:** LCD display shows "updating passes" and system becomes unresponsive
**Causes:** Network timeout during TLE data fetch, DNS resolution failures
**Solutions:**

1. **Immediate Fix:** Restart the system - improved timeout handling should prevent freeze
2. **Check Network:** Run diagnostic tool to verify DNS and Celestrak connectivity
3. **Verify Cache:** System should automatically use cached TLE data if network fails
4. **Monitor Logs:** Check logs for specific error messages (EAI_AGAIN, ENOTFOUND, timeout)

#### DNS Resolution Failures (EAI_AGAIN Errors)

**Symptoms:** "EAI_AGAIN celestrak.org" or "ENOTFOUND" errors in logs
**Causes:** Network configuration issues, DNS server problems, interface detection timing
**Solutions:**

1. **Run Diagnostic:** `npm run diagnose` to check DNS resolution
2. **Check Network Config:** Verify WiFi credentials and network settings in config
3. **Restart Network:** `sudo systemctl restart NetworkManager`
4. **Check DNS:** `nslookup celestrak.org` to verify DNS resolution
5. **System Restart:** Automatic restart logic should handle persistent DNS issues

#### Network Initialization Failures

**Symptoms:** "No network connections available" messages, boot failures
**Solutions:**

1. **Check Connections:** Verify ethernet cable or WiFi adapter
2. **Interface Detection:** System now has improved interface detection with timeouts
3. **Configuration:** Ensure WiFi name and password are correct in config
4. **Diagnostic Tool:** Run diagnostic to check interface detection

**Symptoms:** Application logs show "EROFS: read-only file system" errors
**Cause:** USB drive mounted as read-only due to corruption or hardware issues
**Solution:**

- System automatically falls back to local log storage in `/home/openweather/logs/`
- Check USB drive health and reformat if necessary
- Monitor system logs to confirm fallback logging is working

#### Configuration File Problems

**Symptoms:** "Config missing!" or "config error" displayed on LCD
**Solutions:**

1. Check for backup config file (`ow-config-backup.json`) on USB drive
2. System automatically attempts restoration from backup
3. If no backup available, create new `ow-config.json` file on USB drive
4. Verify USB drive is properly mounted and accessible

#### Version Update Issues During Development

**Symptoms:** Local changes being overwritten by automatic updates
**Solution:** Use development bypass feature:

```bash
# Create bypass file to prevent updates
touch /home/openweather/bypass-version-check

# Remove bypass file to resume normal updates
rm /home/openweather/bypass-version-check
```

#### Network Connectivity Problems

**Symptoms:** "No Network" displayed, uploads failing
**Solutions:**

1. Check WiFi configuration in `ow-config.json`
2. Verify network credentials and connectivity
3. System continues operation without network (local recording)
4. Network monitoring provides automatic reconnection

#### Hardware Detection Issues

**Symptoms:** LCD shows garbled text, RTL-SDR not found
**Solutions:**

1. Check I2C connections for LCD (address 0x27)
2. Verify RTL-SDR dongle is connected and recognized (`lsusb`)
3. Ensure proper permissions for hardware access
4. Check system logs for specific hardware error messages

### Log File Locations

**Primary Log Locations:**

- USB Drive: `/media/openweather/O-W/log.txt` (when writable)
- Fallback: `/home/openweather/logs/log.txt` (when USB read-only)
- System Log: `/home/openweather/cronlog.txt` (startup and system events)

**Checking Log Status:**

```bash
# Check current log file being used
tail -f /home/openweather/cronlog.txt

# Check application logs (may be on USB or local)
tail -f /home/openweather/logs/log.txt
tail -f /media/openweather/O-W/log.txt
```

### Development & Testing

#### Testing Local Changes

1. Create bypass file: `touch /home/openweather/bypass-version-check`
2. Make your code changes
3. Restart the system or run scheduler manually
4. Monitor logs to ensure bypass is active
5. Remove bypass file when testing complete

#### Debugging Hardware Issues

1. Check hardware connections and power
2. Review system logs for specific error messages
3. Test individual components (LCD, RTL-SDR, USB) separately
4. Use fallback logging to maintain debugging capability

#### Configuration Testing

1. Backup current config before making changes
2. Test configuration validation with invalid settings
3. Verify backup restoration functionality
4. Check USB mount points and accessibility
