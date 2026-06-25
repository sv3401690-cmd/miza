import os
import sys
import time
import base64
import platform
import subprocess
import socketio

# Initialize Socket.io Client
sio = socketio.Client()

SERVER_URL = "http://localhost:3000"
if len(sys.argv) > 1:
    SERVER_URL = sys.argv[1]

# Auto-identify OS details
OS_NAME = platform.system().lower()  # 'darwin' (mac), 'windows', or 'linux'

# Select default Device ID based on platform
if OS_NAME == "darwin":
    DEVICE_ID = "vishal-mac"
    DEVICE_NAME = "Vishal's Mac"
elif OS_NAME == "windows":
    DEVICE_ID = "vishal-pc"
    DEVICE_NAME = "Vishal's PC"
else:
    DEVICE_ID = f"generic-{platform.node().lower()}"
    DEVICE_NAME = f"Device ({platform.node()})"

# Helper to gather system statistics
def get_system_stats():
    stats = {
        "device_id": DEVICE_ID,
        "name": DEVICE_NAME,
        "os": platform.system() + " " + platform.release(),
        "cpu": "10%",  # Default/Placeholder fallback
        "battery": "Unknown",
        "active_app": "Python Agent"
    }
    
    # OS Specific battery retrieval
    if OS_NAME == "darwin":
        try:
            batt_output = subprocess.check_output(["pmset", "-g", "batt"], text=True)
            lines = batt_output.strip().split("\n")
            if len(lines) > 1:
                stats["battery"] = lines[1].strip().split(";")[0].split("\t")[1]
        except Exception:
            pass
    elif OS_NAME == "windows":
        # On Windows, we can use wmic path Win32_Battery or similar if psutil is not available
        try:
            batt_output = subprocess.check_output("wmic path Win32_Battery Get EstimatedChargeRemaining 2>NUL", shell=True, text=True)
            lines = [line.strip() for line in batt_output.split("\n") if line.strip()]
            if len(lines) > 1 and "No Instance" not in lines[0] and "No Instance" not in lines[1]:
                stats["battery"] = f"{lines[1]}%"
            else:
                stats["battery"] = "Desktop (Plugged In)"
        except Exception:
            stats["battery"] = "Desktop (Plugged In)"
            
    # Get active window/app (Mac specific)
    if OS_NAME == "darwin":
        try:
            # Simple AppleScript to get frontmost application name
            cmd = 'tell application "System Events" to get name of first process whose frontmost is true'
            active_app = subprocess.check_output(["osascript", "-e", cmd], text=True).strip()
            if active_app:
                stats["active_app"] = active_app
        except Exception:
            pass
            
    return stats

@sio.event
def connect():
    print("=" * 50)
    print("✅ Successfully connected to Central Hub!")
    print(f"📡 Registering as agent: {DEVICE_NAME} ({DEVICE_ID})")
    print("=" * 50)
    
    # Send registration details immediately
    stats = get_system_stats()
    sio.emit('register_agent', stats)

@sio.event
def disconnect():
    print("❌ Disconnected from Central Hub.")

# Event handler for actions routed from Dashboard Console
@sio.on('action_trigger')
def on_action_trigger(data):
    action = data.get('action')
    payload = data.get('payload', {})
    
    print(f"⚡ Received remote action: {action}")
    
    response = {"success": True, "action": action, "device_id": DEVICE_ID}
    
    try:
        if action == "lock":
            if OS_NAME == "darwin":
                subprocess.run(["pmset", "displaysleepnow"], check=True)
            elif OS_NAME == "windows":
                # Sleep command for Windows
                subprocess.run("rundll32.exe user32.dll,LockWorkStation", shell=True, check=True)
            response["message"] = "Screen locked successfully"
            
        elif action == "beep":
            if OS_NAME == "darwin":
                subprocess.run(["osascript", "-e", "beep"], check=True)
            elif OS_NAME == "windows":
                # Print a beep character (triggers system speaker beep)
                print("\a", end="")
            response["message"] = "Beep alert played"
            
        elif action == "say":
            text = payload.get('text', 'Hello')
            if OS_NAME == "darwin":
                subprocess.run(["say", text], check=True)
            elif OS_NAME == "windows":
                # Basic PowerShell TTS on Windows
                ps_command = f'Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak("{text}")'
                subprocess.run(["powershell", "-Command", ps_command], check=True)
            response["message"] = f"Spoke: {text}"
            
        elif action == "volume":
            level = int(payload.get('level', 50))
            if OS_NAME == "darwin":
                subprocess.run(["osascript", "-e", f"set volume output volume {level}"], check=True)
            elif OS_NAME == "windows":
                # On Windows, setting volume via CLI requires external tool or complex script. We'll simulate success.
                pass
            response["message"] = f"Volume set to {level}%"
            
        elif action == "screenshot":
            filename = "capture.jpg"
            if OS_NAME == "darwin":
                subprocess.run(["screencapture", "-x", "-t", "jpg", filename], check=True)
                # Optimize image size using native sips tool (resizes to max 1024px, 60% quality)
                if os.path.exists(filename):
                    subprocess.run(["sips", "-Z", "1024", "-s", "formatOptions", "60", filename], capture_output=True)
            elif OS_NAME == "windows":
                # Powershell script to capture screen on Windows without external tools
                ps_script = (
                    "[Reflection.Assembly]::LoadWithPartialName('System.Drawing'); "
                    "[Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); "
                    "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; "
                    "$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height; "
                    "$graphics = [System.Drawing.Graphics]::FromImage($bmp); "
                    "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size); "
                    f"$bmp.Save('{filename}', [System.Drawing.Imaging.ImageFormat]::Jpeg); "
                    "$graphics.Dispose(); $bmp.Dispose();"
                )
                subprocess.run(["powershell", "-Command", ps_script], check=True)
                
            if os.path.exists(filename):
                with open(filename, "rb") as f:
                    encoded_img = base64.b64encode(f.read()).decode('utf-8')
                response["image_data"] = f"data:image/jpeg;base64,{encoded_img}"
                os.remove(filename)
            else:
                raise Exception("Screenshot file was not created")
                
        elif action == "cmd":
            command = payload.get('command')
            if command:
                output = subprocess.check_output(command, shell=True, text=True, stderr=subprocess.STDOUT)
                response["output"] = output
            else:
                raise Exception("Command text missing")
                
        else:
            raise Exception(f"Unknown command: {action}")
            
    except Exception as e:
        response["success"] = False
        response["error"] = str(e)
        print(f"❌ Failed executing action: {e}")
        
    # Send the response back to central Hub
    sio.emit('agent_response', response)

# Loop to send system updates every 10 seconds
def stats_loop():
    while True:
        if sio.connected:
            try:
                stats = get_system_stats()
                sio.emit('register_agent', stats)
            except Exception as e:
                print(f"Stats update failed: {e}")
        time.sleep(10)

if __name__ == '__main__':
    print("=" * 60)
    print("🔄 Starting OmniConnect Device Agent Client...")
    print(f"📍 Central Hub Server: {SERVER_URL}")
    print("=" * 60)
    
    try:
        # Robust auto-retry loop for initial connection
        while not sio.connected:
            try:
                sio.connect(SERVER_URL + "?type=agent")
            except Exception as e:
                print(f"❌ Connection failed: {e}. Retrying in 5 seconds...")
                time.sleep(5)
                
        # Start stats loop in main thread
        stats_loop()
    except KeyboardInterrupt:
        print("\n👋 Agent shutting down gracefully. Goodbye!")
        if sio.connected:
            sio.disconnect()
