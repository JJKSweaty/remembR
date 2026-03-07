#!/usr/bin/env python3
"""
HTTP client to send commands to the ESP32-S3 Pan/Tilt controller.
Replace ESP32_IP with the IP address shown in the serial monitor.
"""

import requests

# CHANGE THIS to your ESP32's IP address (shown in serial monitor)
ESP32_IP = "192.168.1.135"  # UPDATE THIS!
ESP32_PORT = 8080

def send_command(endpoint, params=None):
    """Send an HTTP POST command to the ESP32"""
    url = f"http://{ESP32_IP}:{ESP32_PORT}{endpoint}"
    
    try:
        print(f"Sending POST to {url}")
        if params:
            print(f"  Parameters: {params}")
        
        response = requests.post(url, params=params, timeout=5)
        
        print(f"Response: {response.status_code} - {response.text}")
        return response.text
        
    except requests.exceptions.ConnectionError:
        print("Connection failed - is the ESP32 running and connected?")
        return None
    except requests.exceptions.Timeout:
        print("Request timed out")
        return None
    except Exception as e:
        print(f"Error: {e}")
        return None

# Example usage
if __name__ == "__main__":
    print("ESP32 Pan/Tilt Controller - HTTP Test Client")
    print("=" * 50)
    print(f"ESP32 URL: http://{ESP32_IP}:{ESP32_PORT}")
    print()
    
    # Interactive mode
    print("Available commands:")
    print("  sweep         - Execute pan/tilt sweep")
    print("  center        - Center both servos")
    print("  pan <us>      - Set pan position (e.g., pan 1500)")
    print("  tilt <us>     - Set tilt position (e.g., tilt 600)")
    print("  status        - Get device status")
    print()
    
    while True:
        try:
            cmd = input("Enter command (or 'quit' to exit): ").strip()
            if cmd.lower() == 'quit':
                break
            
            if not cmd:
                continue
                
            parts = cmd.split()
            command = parts[0].lower()
            
            if command == 'sweep':
                send_command('/sweep')
            elif command == 'center':
                send_command('/center')
            elif command == 'pan' and len(parts) > 1:
                send_command('/pan', {'us': parts[1]})
            elif command == 'tilt' and len(parts) > 1:
                send_command('/tilt', {'us': parts[1]})
            elif command == 'status':
                response = requests.get(f"http://{ESP32_IP}:{ESP32_PORT}/status", timeout=5)
                print(f"Status: {response.json()}")
            else:
                print("Unknown command or missing parameter")
            
            print()
        except KeyboardInterrupt:
            print("\nExiting...")
            break
