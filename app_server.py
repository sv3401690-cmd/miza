import os
import json
from flask import Flask, send_from_directory, request, jsonify, redirect, url_for
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__, static_folder='.')
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=20 * 1024 * 1024)

DB_FILE = 'devices.json'

# Load devices database
def load_devices():
    if not os.path.exists(DB_FILE):
        # Default devices (PC showing offline, Mac showing offline, iPhone removed)
        default_devices = [
            {
                "id": "vishal-mac",
                "name": "Vishal's Mac",
                "type": "mac",
                "ip": "192.168.1.15",
                "status": "offline",
                "cpu": "0%",
                "battery": "Unknown",
                "active_app": "None"
            },
            {
                "id": "vishal-pc",
                "name": "Vishal's PC",
                "type": "win",
                "ip": "192.168.1.22",
                "status": "offline",
                "cpu": "0%",
                "battery": "Unknown",
                "active_app": "None"
            }
        ]
        save_devices(default_devices)
        return default_devices
    try:
        with open(DB_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return []

# Save devices database
def save_devices(devices):
    with open(DB_FILE, 'w') as f:
        json.dump(devices, f, indent=4)

# Keep track of active sockets connected as agents: {sid: device_id}
agent_sockets = {}
# Keep track of device_id to active socket: {device_id: sid}
device_active_sockets = {}

# Serve frontend static files
@app.route('/')
def index():
    user_agent = request.headers.get('User-Agent', '').lower()
    is_mobile = any(keyword in user_agent for keyword in ['mobile', 'android', 'iphone', 'ipad', 'ipod', 'phone'])
    if is_mobile and request.args.get('console') != 'true':
        return redirect(url_for('mobile'))
    return send_from_directory('.', 'index.html')

@app.route('/mobile')
def mobile():
    return send_from_directory('.', 'mobile.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

# REST API to register a device manually (for non-agent devices like phones)
@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.json
    name = data.get('name', 'New Device')
    os_platform = data.get('os', '').lower()
    
    # Auto-identify type based on OS text
    device_type = 'linux'
    if 'mac' in os_platform or 'darwin' in os_platform:
        device_type = 'mac'
    elif 'win' in os_platform:
        device_type = 'win'
    elif any(k in os_platform for k in ['ios', 'iphone', 'ipad', 'android', 'mobile']):
        device_type = 'mobile'
        
    device_id = name.lower().replace(" ", "-").replace("'", "") + "-" + str(int(os.urandom(2).hex(), 16))
    
    devices = load_devices()
    new_device = {
        "id": device_id,
        "name": name,
        "type": device_type,
        "ip": request.remote_addr,
        "status": "offline",
        "cpu": "0%",
        "battery": "Unknown",
        "active_app": "None"
    }
    devices.append(new_device)
    save_devices(devices)
    
    # Notify Web consoles
    socketio.emit('device_list_update', devices, to='console')
    
    return jsonify({"success": True, "device": new_device})

# Socket.io connection handler
@socketio.on('connect')
def handle_connect():
    client_type = request.args.get('type', 'console')
    if client_type == 'console':
        join_room('console')
        # Send initial device list
        emit('device_list_update', load_devices())
        print(f"🖥️ Web Console connected (sid: {request.sid})")

# Agent registration handler
@socketio.on('register_agent')
def handle_register_agent(data):
    device_id = data.get('device_id')
    device_name = data.get('name', 'Unknown Device')
    os_platform = data.get('os', '').lower()
    
    if not device_id:
        return
        
    # Auto-identify device type based on OS reported
    device_type = 'linux'
    if 'darwin' in os_platform or 'mac' in os_platform:
        device_type = 'mac'
    elif 'win' in os_platform:
        device_type = 'win'
    elif any(k in os_platform for k in ['ios', 'iphone', 'ipad', 'android', 'mobile']):
        device_type = 'mobile'
        
    print(f"🔌 Agent registered: {device_name} (ID: {device_id}, OS: {os_platform}, Type: {device_type})")
    
    # Map socket
    agent_sockets[request.sid] = device_id
    device_active_sockets[device_id] = request.sid
    join_room('agents')
    
    # Update device details in db
    devices = load_devices()
    device_found = False
    for dev in devices:
        if dev['id'] == device_id:
            dev['status'] = 'online'
            dev['type'] = device_type
            dev['ip'] = request.remote_addr
            dev['cpu'] = data.get('cpu', '0%')
            dev['battery'] = data.get('battery', 'Unknown')
            dev['active_app'] = data.get('active_app', 'None')
            device_found = True
            break
            
    if not device_found:
        # Auto-create if not already in DB
        devices.append({
            "id": device_id,
            "name": device_name,
            "type": device_type,
            "ip": request.remote_addr,
            "status": "online",
            "cpu": data.get('cpu', '0%'),
            "battery": data.get('battery', 'Unknown'),
            "active_app": data.get('active_app', 'None')
        })
        
    save_devices(devices)
    
    # Broadcast updated list to consoles
    socketio.emit('device_list_update', devices, to='console')

# Disconnect handler
@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in agent_sockets:
        device_id = agent_sockets.pop(request.sid)
        if device_active_sockets.get(device_id) == request.sid:
            device_active_sockets.pop(device_id)
            
        print(f"🔌 Agent disconnected (ID: {device_id})")
        
        # Mark device as offline
        devices = load_devices()
        for dev in devices:
            if dev['id'] == device_id:
                dev['status'] = 'offline'
                break
        save_devices(devices)
        
        # Broadcast update
        socketio.emit('device_list_update', devices, to='console')
    else:
        print(f"🖥️ Console disconnected (sid: {request.sid})")

# Forward control actions from Web Console to Device Agent
@socketio.on('send_action')
def handle_send_action(data):
    target_device = data.get('device_id')
    action = data.get('action')
    payload = data.get('payload', {})
    
    if target_device in device_active_sockets:
        agent_sid = device_active_sockets[target_device]
        # Relay action to the specific agent
        emit('action_trigger', {"action": action, "payload": payload}, to=agent_sid)
        print(f"⚡ Relayed action '{action}' to agent '{target_device}'")
    else:
        emit('action_response', {"success": False, "error": "Device is offline"}, to=request.sid)

# Relay responses (like screenshots, command outputs) from Agent to Console
@socketio.on('agent_response')
def handle_agent_response(data):
    # Broadcast to all consoles
    socketio.emit('console_response', data, to='console')

if __name__ == '__main__':
    # Initialize devices DB
    load_devices()
    print("=" * 60)
    print("🚀 OmniConnect Central Hub Server is starting...")
    print("📍 URL: http://localhost:3000")
    print("=" * 60)
    socketio.run(app, host='0.0.0.0', port=3000, debug=True, allow_unsafe_werkzeug=True)
