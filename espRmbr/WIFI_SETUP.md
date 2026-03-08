# WiFi Setup Guide for Pan/Tilt Controller

## Quick Start

### 1. Flash the Firmware
Use the ESP-IDF extension to flash your device, or use the terminal in a PowerShell with ESP-IDF environment:
```powershell
idf.py flash monitor
```

### 2. Get Your Device's IP Address
Once the device boots, watch the serial monitor. You'll see:
```
========================================
WiFi Connected! IP Address: 192.168.1.xxx
TCP Server listening on port 8080
========================================
```

**Write down this IP address!**

### 3. Test the Connection

#### Option A: Use Python Test Client
1. Edit `test_client.py` and change the IP address:
   ```python
   ESP32_IP = "192.168.1.xxx"  # Use your device's IP
   ```

2. Run the client:
   ```bash
   python test_client.py
   ```

3. Send commands interactively

#### Option B: Use Telnet
```bash
telnet 192.168.1.xxx 8080
```
Then type commands like:
- `SWEEP`
- `CENTER`
- `PANUS:1500`

#### Option C: Use Python Socket Directly
```python
import socket

ESP32_IP = "192.168.1.xxx"
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect((ESP32_IP, 8080))
sock.sendall(b"SWEEP\n")
response = sock.recv(1024)
print(response.decode())
sock.close()
```

## Available Commands

| Command | Description | Example |
|---------|-------------|---------|
| `SWEEP` | Execute full pan/tilt sweep pattern | `SWEEP` |
| `CENTER` | Move both servos to center position | `CENTER` |
| `PANUS:<value>` | Set pan position in microseconds | `PANUS:1500` |
| `TILTUS:<value>` | Set tilt position in microseconds | `TILTUS:600` |
| `TESTPAN` | Test pan servo full range | `TESTPAN` |
| `TESTTILT` | Test tilt servo full range | `TESTTILT` |
| `HELP` | Show available commands | `HELP` |

## Network Details

- **Protocol**: TCP
- **Port**: 8080
- **IP Address**: Assigned by your router via DHCP
- **WiFi SSID**: Koshy (as configured in code)
- **Command Format**: Commands are text strings ending with newline (`\n`)
- **Response**: Each command returns `OK` or acknowledgment

## Integration with Your Software

Your software should:

1. **Connect** to `ESP32_IP:8080` using TCP socket
2. **Send** the command string followed by newline: `"SWEEP\n"`
3. **Receive** the response: `"OK\n"`
4. **Close** connection or keep alive for multiple commands

### Example Integration Code

```python
import socket

class PanTiltController:
    def __init__(self, ip, port=8080):
        self.ip = ip
        self.port = port
    
    def send_command(self, cmd):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((self.ip, self.port))
        sock.sendall((cmd + "\n").encode())
        response = sock.recv(1024).decode().strip()
        sock.close()
        return response
    
    def sweep(self):
        return self.send_command("SWEEP")
    
    def center(self):
        return self.send_command("CENTER")

# Usage
controller = PanTiltController("192.168.1.xxx")
controller.sweep()  # Execute sweep pattern
```

## Troubleshooting

### Can't see IP address
- Check serial monitor is working
- Verify WiFi credentials in code are correct
- Ensure your router is working

### Connection refused
- Verify you're using the correct IP address
- Check device is powered and running
- Ensure you're on the same network

### Commands not working
- Ensure commands end with newline (`\n`)
- Check command spelling (case-sensitive)
- Look at serial monitor for error messages

## Files Modified

- `main/main.c` - Added WiFi and TCP server functionality
- `main/CMakeLists.txt` - Added required ESP-IDF components
- `test_client.py` - Created test client for easy testing
