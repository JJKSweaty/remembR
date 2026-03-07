# Troubleshooting

Common issues and solutions for remembR.

## Camera Issues

### Finding the correct USB camera device

```bash
v4l2-ctl --list-devices
```

Look for your USB webcam (e.g., "Brio 100"). The device is typically `/dev/video0` or `/dev/video2`. Ignore the RPi ISP entries (`/dev/video20`+).

To override auto-detection:
```bash
./run.sh --camera /dev/video2
```

### Camera permission denied

```bash
# Add your user to the video group
sudo usermod -a -G video $USER
# Log out and back in for it to take effect
```

### Camera in use by another process

```bash
# Check what's using the camera
fuser /dev/video0
# Kill the process if needed
```

## Hailo Issues

### "Hailo pipeline not available"

The Hailo venv must be activated. The `run.sh` script does this automatically, but for manual runs:

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
cd ~/Desktop/remembR
export PYTHONPATH="$HOME/hailo-rpi5-examples:$(pwd)"
python3 -m src.main
```

### "hailo-apps-infra not found"

Install it inside the Hailo venv:

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
pip install hailo-apps-infra
```

### Test Hailo detection separately

```bash
cd ~/hailo-rpi5-examples
source setup_env.sh
python basic_pipelines/detection.py --input /dev/video0
```

If this works but remembR doesn't, the issue is in the remembR integration, not Hailo itself.

### Monitor Hailo hardware

```bash
# Real-time device monitor
hailortcli monitor

# Or enable monitoring via environment variable
export HAILO_MONITOR=1
./run.sh
```

### Hailo device not found

```bash
# Check if the PCIe device is detected
hailortcli fw-control identify

# Check kernel driver
lsmod | grep hailo

# Check systemd service
sudo systemctl status hailort
```

## Performance Issues

### Video is choppy / high latency

1. **Lower resolution**: Edit `config/app_config.yaml`, change camera width/height to 640x480
2. **Check CPU load**: Run `htop` in another terminal
3. The Hailo callback should stay lightweight - remembR's design ensures heavy work is off the callback path
4. **Check thermal throttling**: `vcgencmd measure_temp`

### High CPU usage

The memory worker thread processes detections asynchronously. If the detection queue is backing up:
- Increase `debounce_window` in config to reduce processing frequency
- Lower `confidence_threshold` to reduce the number of tracked objects
- Check `data/logs/remembr.log` for processing bottlenecks

### Memory usage growing

- Object memory is bounded to `max_objects` (default 500)
- History per object is bounded to `max_history_per_object` (default 50)
- Snapshots are cleaned up when exceeding `max_count` (default 200)
- Check with: `curl http://localhost:8000/status`

## Network Issues

### Tailscale not connected

```bash
tailscale status
# If stopped:
sudo tailscale up
```

See `docs/tailscale_setup.md` for detailed setup.

### Phone can't connect

1. Both devices must be on the same Tailscale tailnet
2. Check `./run.sh --tailscale-check` for connection URLs
3. Verify port 8000 is accessible: `curl http://<tailscale-ip>:8000/health`
4. If using UFW firewall: `sudo ufw allow 8000/tcp`

### WebSocket disconnects frequently

- Implement ping/pong (send `{"type":"ping"}` every 30s)
- Implement auto-reconnect with 3s delay
- Check Pi for network interruptions: `tailscale status`

## Server Issues

### "Address already in use"

Another process is using port 8000:

```bash
# Find the process
lsof -i :8000
# Kill it
kill <PID>
# Or use a different port
./run.sh --port 9000
```

### API returns empty objects

- Check that the Hailo pipeline is running: `curl http://localhost:8000/health`
- If `pipeline_running` is false, check Hailo setup above
- Objects need time to accumulate - wait a few seconds after starting
- Check that allowed labels include what you're looking for: `config/app_config.yaml`

### Memory store not persisting

- Check `data/memory_store.json` exists and is being updated
- Check file permissions on the `data/` directory
- Force a save: `curl -X POST http://localhost:8000/command -H "Content-Type: application/json" -d '{"command":"force_persist"}'`

## Logging

### Enable verbose logging

```bash
./run.sh --log-level DEBUG
```

### Check log file

```bash
tail -f data/logs/remembr.log
```

### Log locations

- Console: stdout (visible in terminal)
- File: `data/logs/remembr.log` (rotating, max 10MB, 3 backups)
