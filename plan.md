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

This version maintains backward compatibility while significantly improving system reliability and error recovery capabilities for production deployments.

## Version History & Critical Bug Fixes

### AGS v1.5.0 - Critical Production Issue Fixes (July 2025)

Based on production data from multiple ground stations, this version addresses critical issues that were causing system failures in the field:

#### Issues Addressed

**Production Ground Stations Affected:**
- AGS 11 (Scotland): DNS resolution and network initialization issues
- AGS 17 (New York): System freezing and hardware issues  
- AGS 18 (Seattle): Boot failures and configuration problems
- AGS 14 (Chile): "Updating passes" freeze and reboot issues
- AGS 2 (Cornwall): Network-related failures and short recordings
- AGS 21: Upload failures with EAI_AGAIN errors

**Critical Issues Fixed:**

1. **EAI_AGAIN DNS Resolution Failures** - Multiple stations experiencing DNS resolution failures
2. **"Updating Passes" Freeze** - Stations getting stuck during satellite pass calculation
3. **Network Initialization Failures** - Boot failures due to network interface detection issues
4. **Upload Failures** - EAI_AGAIN errors during file uploads to archive
5. **USB Configuration Issues** - Config file mounting and detection problems

#### Key Improvements

**1. Timeout Protection**
- **TLE Processing:** 2-minute overall timeout, 30-second per-satellite timeout
- **Network Initialization:** 90-second overall timeout with individual operation timeouts
- **Pass Updates:** 3-minute timeout protection prevents indefinite freezing
- **Uploads:** 60-second timeout with enhanced retry logic

**2. Enhanced Error Handling**
- **Network Errors:** Comprehensive detection of DNS and connectivity issues
- **Graceful Degradation:** System continues with cached data when network fails
- **Intelligent Recovery:** Automatic restart logic based on error type
- **Better User Feedback:** Clear LCD messages for different error conditions

**3. Robustness Features**
- **Cache Fallback:** Automatic use of cached TLE data when network unavailable
- **Error Classification:** Differentiate network, configuration, and system errors
- **Progressive Delays:** Escalating retry delays for persistent network issues
- **Enhanced Validation:** Improved data validation throughout the system

**4. USB Mounting Improvements**
- **Better Device Detection:** Enhanced timing for USB hardware detection
- **Label-based Mounting:** Specifically looks for "O-W" labeled partitions
- **Multiple Mount Attempts:** Tries mounting at different intervals during startup
- **Filesystem Validation:** Only attempts to mount supported filesystems

#### Files Modified

**Core System Files:**
- `tle.js` - Enhanced TLE data processing with timeout protection and cache fallback
- `network.js` - Improved network initialization with comprehensive timeout handling  
- `scheduler.js` - Added timeout protection for pass updates and intelligent error recovery
- `upload.js` - Enhanced upload reliability with better error handling and retry logic
- `config.js` - Fixed configuration flag bugs and improved backup recovery
- `start_scheduler.sh` - Enhanced USB mounting automation with better timing

**New Files:**
- `diagnose.js` - Diagnostic tool to identify common production issues
- Added `npm run diagnose` script for easy system health checks

#### Diagnostic Tool

Ground station operators can now run comprehensive diagnostics:

```bash
npm run diagnose
```

This checks for:
- DNS resolution issues (EAI_AGAIN errors)
- Network interface detection and connectivity
- USB drive mounting and configuration files
- System resources and load
- TLE cache availability and validity
- Celestrak connectivity and response times

#### Testing Recommendations

1. **Network Failure Testing:** Disconnect network during startup to test timeout handling
2. **DNS Resolution Testing:** Block DNS to test EAI_AGAIN error handling
3. **Timeout Testing:** Simulate slow network conditions to verify timeout protection
4. **Configuration Testing:** Test invalid WiFi credentials and USB detection
5. **Recovery Testing:** Verify automatic restart behavior after errors

This version maintains backward compatibility while significantly improving system reliability and error recovery capabilities for production deployments.
