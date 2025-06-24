# Network Management Documentation

## Overview

The Open Weather Ground Station now includes comprehensive network management that prioritizes ethernet connections over WiFi and displays the current connection status on the LCD screen.

## Features

### Automatic Interface Detection
- Automatically detects ethernet interfaces (eth0, enp*, enx*, etc.)
- Automatically detects WiFi interfaces (wlan0, wlp*, etc.)
- Works across different Linux distributions and hardware configurations

### Connection Priority
1. **Ethernet (Highest Priority)**: Checked first and preferred when available
2. **WiFi (Fallback)**: Used when ethernet is not available or not working
3. **Automatic Failover**: Switches between connections as needed

### LCD Status Display
- Shows current connection type (ETHERNET/WIFI)
- Displays IP address (last two octets for space)
- Updates status every 5 minutes by default
- Shows "NO NETWORK" when no connections are available

### Internet Connectivity Verification
- Tests actual internet connectivity, not just interface status
- Uses ping to Google DNS (8.8.8.8) to verify connectivity
- Distinguishes between local network access and internet access

## Network Status Messages

### LCD Display Messages
- `ETHERNET ACTIVE` / `IP: xxx.xxx` - Ethernet connected with internet
- `WIFI ACTIVE` / `IP: xxx.xxx` - WiFi connected with internet  
- `ETHERNET: Local only` - Ethernet connected but no internet
- `WIFI: Local only` - WiFi connected but no internet
- `NO NETWORK` / `CHECK CABLES` - No active connections

### Console Log Messages
- Interface detection logs show which hardware interfaces were found
- Connection status logs show IP addresses and connectivity results
- Error logs provide troubleshooting information

## Configuration

### WiFi Configuration
WiFi settings are configured in the `ow-config.json` file:

```json
{
  "wifiName": "YourNetworkName",
  "wifiPassword": "YourPassword",
  ...other settings...
}
```

### Ethernet Configuration
Ethernet connections use DHCP by default and require no configuration. The system will:
- Automatically detect ethernet interfaces
- Obtain IP address via DHCP
- Set routing priority to prefer ethernet

## Usage

### Automatic Startup
Network initialization is built into the main scheduler. When you run:
```bash
node scheduler.js
```

The system will automatically:
1. Check for ethernet connection
2. Fall back to WiFi if needed
3. Display status on LCD
4. Start network monitoring

### Manual Network Testing
You can test network functionality independently:

```bash
# Test network detection and status
node test-network.js

# Test without LCD dependencies (development)
node test-network-minimal.js

# Start network system standalone
node start-network.js
```

### Network Monitoring
The system includes automatic network monitoring that:
- Updates LCD display every 5 minutes (configurable)
- Logs network status changes
- Handles connection failures gracefully

## Troubleshooting

### Common Issues

#### "Interface not found" errors
- **Cause**: Network interface names vary between systems
- **Solution**: The system auto-detects interfaces, but you can check available interfaces with:
  ```bash
  ip link show
  ```

#### Ethernet not taking priority
- **Cause**: NetworkManager or systemd-networkd may override routing
- **Solution**: The system attempts to set connection priorities automatically

#### WiFi connection fails
- **Cause**: Incorrect credentials or network issues
- **Solution**: 
  1. Verify WiFi credentials in config file
  2. Check WiFi signal strength
  3. Ensure network is broadcasting SSID

#### No internet despite connection
- **Cause**: DNS or routing issues
- **Solution**: The system distinguishes between local and internet connectivity

### Manual Network Commands

Check interface status:
```bash
ip link show                    # Show all interfaces
ip addr show                    # Show IP addresses
ip route show                   # Show routing table
```

Test connectivity:
```bash
ping -c 3 8.8.8.8              # Test internet connectivity
ping -c 3 192.168.1.1          # Test local gateway
```

NetworkManager commands:
```bash
nmcli device status             # Show device status
nmcli connection show           # Show connections
nmcli device wifi list          # Show available WiFi networks
```

## Network Monitoring API

The network module provides several functions for monitoring:

```javascript
const { 
  getNetworkStatus, 
  displayNetworkStatus, 
  getMyIP,
  checkEthernetConnection 
} = require('./network');

// Get detailed network status
const status = await getNetworkStatus();

// Display current status on LCD
await displayNetworkStatus();

// Get current IP address
const ip = await getMyIP();

// Check ethernet specifically
const ethStatus = await checkEthernetConnection();
```

## Network Status Object Structure

```javascript
{
  ethernet: {
    connected: true/false,
    ip: "192.168.1.100",
    internet: true/false,
    reason: "success" | "interface_down" | "no_ip" | "no_internet"
  },
  wifi: {
    connected: true/false,
    ip: "192.168.1.101", 
    internet: true/false,
    reason: "success" | "interface_down" | "no_ip" | "no_internet"
  },
  primary: "ethernet" | "wifi" | null,
  ip: "192.168.1.100"  // IP of primary connection
}
```

## Integration with Existing System

The network management integrates seamlessly with the existing system:

- **Scheduler**: Uses network module for initialization
- **Upload**: Can use `getMyIP()` function for IP detection
- **LCD**: Automatically shows network status
- **Logging**: Network events are logged for debugging

## Files Modified/Added

### New Files
- `network.js` - Main network management module
- `start-network.js` - Standalone network startup script
- `test-network.js` - Network functionality tests
- `test-network-minimal.js` - Basic network tests

### Modified Files
- `scheduler.js` - Updated to use new network management
- `lcd.js` - Added fallback for missing hardware

### Configuration
- No changes to config file format required
- WiFi settings remain the same
- Ethernet works automatically via DHCP
