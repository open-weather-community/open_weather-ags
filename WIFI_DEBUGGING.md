# WiFi Debugging Enhancements

This document describes the enhanced WiFi debugging features added to help diagnose the USB/WiFi interference issue where WiFi works without USB but fails when USB storage is connected.

## New Features

### 1. Enhanced WiFi Logging (`wifi.js`)

**Network Name Logging:**
- Now logs the exact network name being attempted in connection logs
- Shows network name in quotes to make it clear what's being searched for
- Logs whether a password is provided or not

**Network Scanning Improvements:**
- Reports whether networks were found during scanning
- Shows total number of networks detected
- Displays first 15 networks found (increased from 10)
- Distinguishes between exact matches, case-insensitive matches, and partial matches
- Provides specific error messages when no networks are found
- Includes detailed hardware status checking (rfkill, interface status)

**Connection Attempt Logging:**
- Shows the exact nmcli command being used (with password masked)
- Provides specific error interpretation for common failure modes
- Logs connection verification steps and results
- Enhanced timeout and retry logic with better user feedback

**USB Device Detection:**
- Logs USB devices detected during WiFi connection attempts
- Specifically identifies USB storage devices
- Notes potential interference when USB storage is present

### 2. Network Wrapper Enhancements (`network.js`)

**Enhanced Error Reporting:**
- Logs the specific network name being attempted
- Provides USB device enumeration during network setup
- Warns about potential USB/WiFi interference
- Improved timeout and error handling with specific network names

### 3. New Diagnostic Tools

**USB/WiFi Interaction Test (`test-usb-wifi.js`):**
- Comprehensive test for USB/WiFi interference
- Checks USB device power consumption
- Tests concurrent USB I/O and WiFi operations
- Provides specific troubleshooting recommendations
- Can be run with: `npm run test-usb-wifi`

**Enhanced System Diagnostics (`diagnose.js`):**
- Added USB/WiFi interaction checking
- Tests WiFi scanning while USB storage is connected
- Identifies known interference patterns
- Provides hardware-specific recommendations

## Usage

### Running Diagnostics

```bash
# Run full system diagnostics (includes USB/WiFi check)
npm run diagnose

# Run specific USB/WiFi interaction test
npm run test-usb-wifi
```

### Reading Enhanced Logs

Look for these new log patterns:

**Network Connection Attempts:**
```
=== WiFi Connection Attempt Started ===
Target network: "YourNetworkName"
WiFi password provided: Yes
USB devices detected: 3
USB storage devices detected: 1
```

**Network Scanning Results:**
```
=== Network Scan Started for "YourNetworkName" ===
Total networks found: 12
Available networks (first 15): "Network1", "Network2", "YourNetworkName"...
SUCCESS: Network "YourNetworkName" found in scan (exact match)
```

**Connection Results:**
```
=== Connection Attempts Starting for "YourNetworkName" ===
Connection attempt 1/3 to "YourNetworkName"...
Using command: nmcli device wifi connect "YourNetworkName" password "***"
SUCCESS: WiFi connection to "YourNetworkName" verified successfully
```

## Troubleshooting USB/WiFi Issues

### Common Symptoms

1. **WiFi works without USB, fails with USB connected**
2. **Network scan returns no results when USB is plugged in**
3. **Connection timeouts only when USB storage is present**

### Diagnostic Steps

1. **Run the USB/WiFi test:**
   ```bash
   npm run test-usb-wifi
   ```

2. **Check for interference patterns:**
   - Note if USB storage devices are detected
   - Check if WiFi scan fails with USB connected
   - Look for "USB/WiFi interference" messages in logs

3. **Review hardware setup:**
   - Check power supply capacity (USB + WiFi can exceed Pi power budget)
   - Note physical proximity of USB devices to WiFi antenna
   - Check USB cable quality and shielding

### Solutions

**Hardware Solutions:**
1. **Use powered USB hub** - Reduces power load on Pi
2. **Try USB 3.0 devices** - Different frequency from 2.4GHz WiFi
3. **Physical separation** - Move USB devices away from WiFi antenna
4. **Shielded cables** - Reduce electromagnetic interference
5. **Different USB ports** - Some ports may have less interference

**Software Solutions:**
1. **USB power management** - Disable USB power saving
2. **WiFi channel selection** - Use 5GHz instead of 2.4GHz if available
3. **Driver updates** - Ensure latest USB and WiFi drivers

### Understanding the Issue

This is a known hardware issue affecting some Raspberry Pi setups:

- **Frequency Interference:** USB 2.0 operates at frequencies that can interfere with 2.4GHz WiFi
- **Power Competition:** USB devices and WiFi both draw power, potentially causing instability
- **Bus Contention:** USB and WiFi may compete for system bus bandwidth
- **EMI (Electromagnetic Interference):** USB cables can act as antennas interfering with WiFi

## Log Examples

### Successful Connection (No USB Interference)
```
=== WiFi Connection Attempt Started ===
Target network: "HomeNetwork"
WiFi password provided: Yes
USB devices detected: 1
USB storage devices detected: 0
...
SUCCESS: Network "HomeNetwork" found in scan (exact match)
SUCCESS: WiFi connection to "HomeNetwork" verified successfully
```

### Failed Connection (USB Interference)
```
=== WiFi Connection Attempt Started ===
Target network: "HomeNetwork" 
WiFi password provided: Yes
USB devices detected: 3
USB storage devices detected: 1
Note: USB storage can sometimes interfere with WiFi on some hardware
...
WARNING: WiFi scan returned no results - this may indicate hardware or driver issues
FAILURE: Network "HomeNetwork" not found after 3 scan attempts
This could indicate:
5. USB device interference with WiFi
```

The enhanced debugging will help identify exactly where the failure occurs and whether it's related to the USB/WiFi interference issue.
