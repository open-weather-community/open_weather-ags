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

### Core Modules

#### 1. Scheduler (`scheduler.js`)
- **Purpose:** Main application orchestrator
- **Functions:**
  - System initialization and configuration loading
  - WiFi connectivity verification
  - Satellite pass scheduling and execution
  - Recording session management
  - Reboot overlap detection (2:50-3:10 AM buffer)

#### 2. Configuration System (`config.js`)
- **Purpose:** Dynamic configuration management
- **Functions:**
  - USB-based config file discovery
  - Runtime configuration loading/saving
  - Multi-mount point searching (`/media`, `/mnt`)

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

The AGS uses a JSON configuration file (`ow-config.json`) stored on USB storage:

```json
{
  "myID": 1,                    // Unique station identifier
  "locLat": 52.49548,          // Latitude (decimal degrees)
  "locLon": 13.46843,          // Longitude (decimal degrees)  
  "gain": 38,                  // RTL-SDR gain setting
  "maxDistance": 2200000,      // Maximum satellite distance (meters)
  "daysToPropagate": 1,        // Days ahead to calculate passes
  "minElevation": 30,          // Minimum pass elevation (degrees)
  "bufferMinutes": 0,          // Recording buffer time
  "numberOfPassesPerDay": 1,   // Max recordings per day
  "sampleRate": "48k",         // Recording sample rate
  "downsample": true,          // Enable audio downsampling
  "noaaFrequencies": {         // Satellite frequencies
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

### Known Issues & Limitations
- **Reboot scheduling:** System reboots at 3:00 AM may conflict with long satellite passes
- **USB detection:** Occasional issues with USB mount detection on some Pi models
- **Network resilience:** Limited offline operation capabilities
- **Antenna optimization:** Performance varies significantly with antenna setup

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
