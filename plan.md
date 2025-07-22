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

### Known Issues & Current Limitations

- **Reboot scheduling:** System reboots at 3:00 AM may conflict with long satellite passes
- **USB/WiFi interference:** Some hardware configurations experience WiFi issues when USB storage is connected
- **Network resilience:** Limited offline operation capabilities (improved with TLE caching)
- **Antenna optimization:** Performance varies significantly with antenna setup

### Troubleshooting & Diagnostics

The system includes comprehensive diagnostic tools:

**Available Diagnostic Commands:**
```bash
npm run usb-stability     # USB/WiFi interference testing and power optimization
```

**Key Diagnostic Features:**
- DNS resolution and network connectivity testing
- USB device enumeration and interference detection
- WiFi scanning and connection verification
- TLE cache validation and Celestrak connectivity
- System resource monitoring
- **WiFi connection preservation** - Avoids unnecessary disconnections on startup
- **Existing connection validation** - Verifies working connections before reconnecting

**Enhanced WiFi Management:**
- **Smart Connection Handling:** System now preserves existing WiFi connections if they're working properly
- **Reduced Startup Disruption:** No longer disconnects from working WiFi during boot process
- **Connection Verification:** Validates internet connectivity before deciding to reconnect
- **Detailed WiFi Diagnostics:** New test-wifi command provides comprehensive WiFi troubleshooting

**Enhanced WiFi Debugging:**
- Detailed network discovery logging showing all available networks
- USB device detection during WiFi operations
- Specific error classification (network not found vs authentication failed)
- Hardware status checking (rfkill, interface state)
- Connection verification with IP assignment and internet testing

**Smart Network Priority Management:**
- Network priority is only set when both ethernet and WiFi are active and ethernet has internet
- WiFi maintains default priority when it's the only working connection
- Prevents unnecessary lowering of WiFi priority when ethernet is unavailable
- Improved connection stability when operating with WiFi-only connectivity

**Common USB/WiFi Interference Solutions:**
1. Use powered USB hub to reduce Pi power load
2. Use USB 3.0 devices instead of USB 2.0 (different frequency)
3. Physically separate USB devices from WiFi antenna
4. Use shielded USB cables
5. Use 5GHz WiFi networks to avoid 2.4GHz interference

**System Recovery Features:**
- Automatic configuration backup and restoration
- TLE data caching with 7-day fallback
- Intelligent error recovery with automatic restart
- Timeout protection on all network operations
- Graceful degradation when network services fail

## Recent Improvements (July 2025)

**Network Priority Management Fix:**
- Fixed network priority logic to only set WiFi as lower priority when ethernet is actually available and working
- Prevents WiFi from being unnecessarily deprioritized when ethernet is down or unavailable
- Maintains optimal connectivity when WiFi is the primary/only connection
- Improved logging to clearly indicate when and why priority changes are made

## Previous Improvements (December 2024)

**WiFi Connection Management:**
- Enhanced connection preservation logic to avoid unnecessary disconnections
- Improved startup behavior to verify existing connections before reconnecting
- Added comprehensive WiFi diagnostic tool (`test-wifi-connection.js`)
- Reduced aggressive network interface resets that caused stability issues

**Logging System:**
- Increased log retention by 50% (from 1000 to 1500 lines)
- Extended deletion threshold to preserve more debugging information
- Maintained rotation efficiency while providing longer troubleshooting history

This system is designed for resilient, autonomous operation with comprehensive error handling and diagnostic capabilities.
