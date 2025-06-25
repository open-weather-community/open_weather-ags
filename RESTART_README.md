# Automatic Restart System

## Overview

The Open Weather AGS now includes intelligent automatic restart functionality that eliminates the need for manual intervention after GitHub updates or critical configuration errors.

## Features

### GitHub Update Restart
- **Automatic Detection**: System detects when a GitHub update has been applied
- **User Notification**: Displays clear messages on LCD during the restart process
- **Graceful Shutdown**: Uses `shutdown -r` instead of abrupt `reboot` command
- **User Feedback**: Shows countdown and status messages

**LCD Messages Sequence:**
1. `Update complete!` / `Restarting...`
2. `Restart in 5s` / `Please wait...`
3. System restarts automatically

### Configuration Error Restart
- **Missing Config Files**: Automatically restarts when `ow-config.json` is not found
- **JSON Syntax Errors**: Restarts when configuration has invalid JSON syntax
- **Other Config Errors**: Handles general configuration loading problems
- **User Guidance**: Shows specific error messages before restart

**LCD Messages Examples:**
- `config missing!` / `check USB drive` → `will restart` / `automatically`
- `config error` / `invalid JSON` → `System restart` / `required...`
- `Restarting in` / `X seconds...` (countdown display)

### Restart Process
1. **Error Detection**: System identifies the specific problem
2. **User Notification**: Clear LCD messages explain what's happening
3. **Countdown Display**: Shows remaining time before restart
4. **Graceful Restart**: Uses proper shutdown commands with descriptive reasons
5. **System Recovery**: Automatic restart resolves most configuration issues

## Benefits

### For Users
- **No Manual Intervention**: No need to manually restart after updates
- **Clear Communication**: Always know what's happening and why
- **Faster Recovery**: System automatically recovers from common issues
- **Professional Experience**: No cryptic errors or hanging processes

### For System Reliability
- **Consistent Behavior**: Predictable response to common error conditions
- **Clean Shutdowns**: Proper shutdown procedures prevent corruption
- **Automatic Recovery**: Self-healing system reduces support burden
- **Detailed Logging**: All restart reasons are logged for troubleshooting

## Technical Implementation

### Graceful Restart Function
```javascript
async function gracefulRestart(reason, delay = 10) {
    // User notification phase
    printLCD('System restart', 'required...');
    
    // Countdown phase  
    // Visual countdown on LCD
    
    // Restart phase
    spawn('sudo', ['shutdown', '-r', '+0', `AGS restart: ${reason}`]);
}
```

### Error Handling Enhancement
- **Config Missing**: 15-second delay for USB drive insertion
- **JSON Errors**: 12-second delay for syntax correction
- **GitHub Updates**: 6-second delay for user awareness
- **Fallback**: Immediate restart if graceful restart fails

## Configuration

No configuration changes are required. The automatic restart system:
- Activates automatically for critical errors
- Uses appropriate delays for each error type  
- Provides clear user feedback throughout the process
- Logs all restart activities for debugging

## Troubleshooting

### If Restart Fails
- System will attempt fallback to immediate restart
- All restart attempts are logged to `/home/openweather/cronlog.txt`
- LCD will show error status if restart mechanism fails

### Bypass for Development
- Create `/home/openweather/bypass-version-check` to prevent GitHub updates
- This disables automatic restart from updates but preserves config error restart
- Remove file to resume normal operation

This enhancement makes the AGS system significantly more autonomous and user-friendly, eliminating the frustrating need for manual restarts after routine updates or configuration issues.
