/**
 * OmniConnect Console logic
 * Integrates Socket.io real-time backend communication, dynamic device card rendering,
 * remote device action dispatching, and dynamic SVG network line drawing.
 */

document.addEventListener("DOMContentLoaded", () => {
    
    // Connect to Flask-SocketIO Backend as console type
    const socket = io({ query: { type: 'console' } });
    
    // Core Layout Elements
    const splashScreen = document.getElementById("splash-screen");
    const appContainer = document.getElementById("app-container");
    const liveClock = document.getElementById("live-clock");
    const connectionHub = document.querySelector(".connection-hub-card");
    
    // Tab Navigation
    const navItems = document.querySelectorAll(".nav-item");
    const tabViews = document.querySelectorAll(".tab-view");
    
    // Dynamic Containers
    const deviceCardsContainer = document.getElementById("device-cards-container");
    const deviceTableBody = document.getElementById("device-table-body");
    const selectedDeviceTitle = document.getElementById("selected-device-title");
    
    // Live Feed Simulation
    const refreshFeedBtn = document.getElementById("refresh-feed-btn");
    const screenViewBox = document.getElementById("screen-view-box");
    const screenLoader = document.querySelector(".screen-loader");
    
    // Quick Controls
    const btnLock = document.getElementById("btn-lock");
    const btnScreenshot = document.getElementById("btn-screenshot");
    const btnMute = document.getElementById("btn-mute");
    const muteIcon = document.getElementById("mute-icon");
    const muteBtnText = document.getElementById("mute-btn-text");
    const btnBeep = document.getElementById("btn-beep");
    const btnSay = document.getElementById("btn-say");
    const sayTextInput = document.getElementById("say-text-input");
    const volumeSlider = document.getElementById("volume-slider");
    const volumeVal = document.getElementById("volume-val");
    
    // Clipboard Sync
    const clipboardBox = document.getElementById("clipboard-box");
    const clipboardSyncBtn = document.getElementById("clipboard-sync-btn");
    const clipBtnText = document.getElementById("clip-btn-text");
    const clipboardHubText = document.getElementById("clipboard-hub-textarea");
    const hubPushBtn = document.getElementById("hub-push-btn");
    const hubClearBtn = document.getElementById("hub-clear-btn");
    const historyList = document.querySelector(".history-list");
    
    // Terminal Session
    const terminalHistory = document.getElementById("terminal-history");
    const terminalInput = document.getElementById("terminal-input");
    const termPromptLabel = document.getElementById("term-prompt-label");

    // Device Registration Form
    const regDeviceName = document.getElementById("reg-device-name");
    const regDeviceOs = document.getElementById("reg-device-os");
    const regDeviceSubmitBtn = document.getElementById("reg-device-submit-btn");
    
    // State Tracker
    let devices = [];
    let selectedDeviceId = "vishal-mac"; // Default selection
    let isMuted = false;

    /* ==========================================================================
       1. Clock Updater
       ========================================================================== */
    function updateClock() {
        const now = new Date();
        liveClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    /* ==========================================================================
       2. SVG Connection Line Drawing (Dynamic Calculation)
       ========================================================================== */
    function drawConnectionLines() {
        const hubMac = document.getElementById("hub-mac");
        const hubWin = document.getElementById("hub-win");
        const hubTrigger = document.getElementById("hub-trigger");
        
        const pathMac = document.getElementById("path-mac");
        const pathWin = document.getElementById("path-win");
        const svgContainer = document.querySelector(".hub-connections svg");
        
        if (!hubMac || !hubWin || !hubTrigger || !svgContainer) return;
        
        const svgRect = svgContainer.getBoundingClientRect();
        const macRect = hubMac.getBoundingClientRect();
        const winRect = hubWin.getBoundingClientRect();
        const trigRect = hubTrigger.getBoundingClientRect();
        
        const x1 = (macRect.left + macRect.width / 2) - svgRect.left;
        const y1 = (macRect.top + macRect.height / 2) - svgRect.top;
        
        const x2 = (winRect.left + winRect.width / 2) - svgRect.left;
        const y2 = (winRect.top + winRect.height / 2) - svgRect.top;
        
        const cx = (trigRect.left + trigRect.width / 2) - svgRect.left;
        const cy = (trigRect.top + trigRect.height / 2) - svgRect.top;
        
        pathMac.setAttribute("d", `M ${x1} ${y1} Q ${(x1 + cx) / 2} ${cy} ${cx} ${cy}`);
        pathWin.setAttribute("d", `M ${x2} ${y2} Q ${(x2 + cx) / 2} ${cy} ${cx} ${cy}`);
    }
    
    window.addEventListener("resize", drawConnectionLines);

    /* ==========================================================================
       3. Startup Sequence Flow
       ========================================================================== */
    setTimeout(() => {
        splashScreen.classList.add("fade-out");
        appContainer.classList.remove("hidden");
        
        setTimeout(() => {
            drawConnectionLines();
            connectionHub.classList.add("animating");
            
            appendTerminalLine("SYSTEM", "Establishing secure WebSockets handshake...");
        }, 300);
    }, 2000); // 2 seconds splash screen loader

    /* ==========================================================================
       4. Navigation Tab Routing
       ========================================================================== */
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const targetTab = item.getAttribute("data-tab");
            
            navItems.forEach(i => i.classList.remove("active"));
            tabViews.forEach(v => v.classList.remove("active"));
            
            item.classList.add("active");
            document.getElementById(targetTab).classList.add("active");
            
            if (targetTab === "dashboard-view") {
                setTimeout(drawConnectionLines, 50);
            }
        });
    });

    /* ==========================================================================
       5. Dynamic Render & State management
       ========================================================================== */
    function renderDevices() {
        // Clear containers
        deviceCardsContainer.innerHTML = "";
        deviceTableBody.innerHTML = "";
        
        let macOnline = false;
        let winOnline = false;

        devices.forEach(device => {
            const isOnline = device.status === "online";
            if (device.type === "mac" && isOnline) macOnline = true;
            if (device.type === "win" && isOnline) winOnline = true;

            // 1. Render Dashboard Cards
            const card = document.createElement("div");
            card.className = `device-card ${isOnline ? 'active' : 'offline'} ${selectedDeviceId === device.id ? 'selected' : ''}`;
            card.id = `card-${device.id}`;
            
            const isMac = device.type === "mac";
            const isWin = device.type === "win";
            const isMobile = device.type === "mobile";
            
            let logoHTML = "💻";
            if (isMac) logoHTML = `<span class="device-logo"></span>`;
            else if (isWin) logoHTML = `
                <span class="device-logo-svg">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                        <path d="M0 3.449L9.75 2.1v9.45H0V3.45zM0 12.45h9.75v9.45L0 20.551v-8.1zM10.95 1.936L24 0v11.55H10.95V1.936zM10.95 12.45H24v11.55l-13.05-1.936v-9.614z"/>
                    </svg>
                </span>`;
            else if (isMobile) logoHTML = `
                <span class="device-logo-svg">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                        <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                        <line x1="12" y1="18" x2="12.01" y2="18"></line>
                    </svg>
                </span>`;

            card.innerHTML = `
                <div class="card-glow"></div>
                <div class="card-header">
                    <div class="device-info-left">
                        ${logoHTML}
                        <h3 class="device-name">${device.name}</h3>
                    </div>
                    <span class="status-pill ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                </div>
                <div class="device-stats">
                    <div class="stat-row">
                        <span class="stat-label">OS Platform</span>
                        <span class="stat-value">${device.os || (isMac ? "macOS" : isWin ? "Windows" : "Linux")}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">IP Address</span>
                        <span class="stat-value">${device.ip}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">CPU / Battery</span>
                        <span class="stat-value">${device.cpu} / ${device.battery}</span>
                    </div>
                    <div class="stat-row">
                        <span class="stat-label">Active App</span>
                        <span class="stat-value">${device.active_app || "None"}</span>
                    </div>
                </div>
            `;
            
            // Add click selector
            if (isOnline) {
                card.addEventListener("click", () => {
                    deviceCardsContainer.querySelectorAll(".device-card").forEach(c => c.classList.remove("selected"));
                    card.classList.add("selected");
                    selectedDeviceId = device.id;
                    
                    if (device.type === "mac") {
                        termPromptLabel.textContent = "vishal@macbook ~ %";
                    } else if (device.type === "win") {
                        termPromptLabel.textContent = "C:\\Users\\Vishal>";
                    } else {
                        termPromptLabel.textContent = "$";
                    }
                    
                    selectedDeviceTitle.textContent = `Control Panel: ${device.name}`;
                    appendTerminalLine("SYSTEM", `Switched control target to ${device.name}.`);
                });
            }
            
            deviceCardsContainer.appendChild(card);

            // 2. Render Device Table rows
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><strong>${device.name}</strong> ${isMac ? '(Host)' : ''}</td>
                <td>${device.ip}</td>
                <td><span class="indicator-tag ${isOnline ? 'tag-online' : 'tag-offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
                <td>${device.os || (isMac ? 'macOS' : isWin ? 'Windows' : 'Generic')}</td>
                <td>
                    <button class="table-action-btn btn-danger" onclick="alert('Device removal handled by API')">Un-Enroll</button>
                </td>
            `;
            deviceTableBody.appendChild(row);
        });

        // 3. Update connection hub animation nodes
        const hubMac = document.getElementById("hub-mac");
        const hubWin = document.getElementById("hub-win");
        
        if (macOnline) hubMac.classList.add("connected");
        else hubMac.classList.remove("connected");
        
        if (winOnline) hubWin.classList.add("connected");
        else hubWin.classList.remove("connected");
        
        // Update connection hub text
        const hubStatusText = document.querySelector(".hub-status-text");
        if (macOnline && winOnline) {
            hubStatusText.textContent = "Multi-device link active";
        } else if (macOnline || winOnline) {
            hubStatusText.textContent = "Single device connection active";
        } else {
            hubStatusText.textContent = "Handshake sync offline. Start your device agents.";
        }
        
        // Redraw lines
        drawConnectionLines();
    }

    // Connect Socket Events
    socket.on('device_list_update', (data) => {
        devices = data;
        renderDevices();
        
        // Auto select first online device if selected device went offline
        const selected = devices.find(d => d.id === selectedDeviceId);
        if (!selected || selected.status !== 'online') {
            const firstOnline = devices.find(d => d.status === 'online');
            if (firstOnline) {
                selectedDeviceId = firstOnline.id;
                selectedDeviceTitle.textContent = `Control Panel: ${firstOnline.name}`;
                renderDevices();
            }
        }
    });

    /* ==========================================================================
       6. Remote Action Dispatcher
       ========================================================================== */
    function sendRemoteAction(actionName, payload = {}) {
        const activeDevice = devices.find(d => d.id === selectedDeviceId);
        if (!activeDevice || activeDevice.status !== 'online') {
            appendTerminalLine("SYSTEM", "Error: Select an online device to control.", true);
            return;
        }
        
        socket.emit('send_action', {
            device_id: selectedDeviceId,
            action: actionName,
            payload: payload
        });
    }

    // Trigger Screen Capture
    function triggerScreenshot() {
        screenLoader.classList.remove("hidden");
        sendRemoteAction("screenshot");
    }
    
    refreshFeedBtn.addEventListener("click", triggerScreenshot);
    btnScreenshot.addEventListener("click", triggerScreenshot);

    // Mute Volume
    btnMute.addEventListener("click", () => {
        isMuted = !isMuted;
        if (isMuted) {
            muteIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
            `;
            muteBtnText.textContent = "Unmute Volume";
            sendRemoteAction("volume", { level: 0 });
        } else {
            muteIcon.innerHTML = `
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            `;
            muteBtnText.textContent = "Mute Volume";
            sendRemoteAction("volume", { level: volumeSlider.value });
        }
    });

    // Volume Slider Adjust
    volumeSlider.addEventListener("input", (e) => {
        const val = e.target.value;
        volumeVal.textContent = `${val}%`;
    });
    
    volumeSlider.addEventListener("change", (e) => {
        sendRemoteAction("volume", { level: parseInt(e.target.value) });
    });

    // Lock Display
    btnLock.addEventListener("click", () => {
        sendRemoteAction("lock");
    });

    // Warning Beep
    btnBeep.addEventListener("click", () => {
        sendRemoteAction("beep");
    });

    // TTS Speech
    btnSay.addEventListener("click", () => {
        const text = sayTextInput.value.trim();
        if (!text) return;
        sendRemoteAction("say", { text: text });
        sayTextInput.value = "";
    });

    sayTextInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") btnSay.click();
    });

    /* ==========================================================================
       7. Clipboard Synchronization
       ========================================================================== */
    function syncClipboard(content, sourceDevice) {
        if (!content.trim()) return;
        
        const historyItem = document.createElement("div");
        historyItem.classList.add("history-item");
        
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        historyItem.innerHTML = `
            <div class="history-meta">
                <span class="history-device">${sourceDevice}</span>
                <span class="history-time">${timeStr}</span>
            </div>
            <div class="history-content">${content.replace(/</g, "&lt;")}</div>
        `;
        
        if (historyList.firstChild) {
            historyList.insertBefore(historyItem, historyList.firstChild);
        } else {
            historyList.appendChild(historyItem);
        }
    }

    clipboardSyncBtn.addEventListener("click", () => {
        const text = clipboardBox.value;
        if (!text.trim()) return;
        
        clipBtnText.textContent = "Synced!";
        clipboardSyncBtn.style.backgroundColor = "var(--system-green)";
        clipboardSyncBtn.style.boxShadow = "0 0 10px rgba(48, 209, 88, 0.25)";
        
        // Send clipboard sync command
        sendRemoteAction("cmd", { command: `echo "${text}" | pbcopy` }); // macOS copy cmd
        syncClipboard(text, "Console");
        
        setTimeout(() => {
            clipBtnText.textContent = "Sync to Clipboard";
            clipboardSyncBtn.style.backgroundColor = "";
            clipboardSyncBtn.style.boxShadow = "";
        }, 1500);
    });

    hubPushBtn.addEventListener("click", () => {
        const text = clipboardHubText.value;
        if (!text.trim()) return;
        
        syncClipboard(text, "Broadcast");
        clipboardHubText.value = "";
        appendTerminalLine("CLIPBOARD", "Broadcasted clipboard contents.");
    });
    
    hubClearBtn.addEventListener("click", () => {
        clipboardHubText.value = "";
        historyList.innerHTML = `<div class="screen-placeholder">Clipboard history cleared.</div>`;
    });

    /* ==========================================================================
       8. Action Response Listeners (Backend Feedback)
       ========================================================================== */
    socket.on('console_response', (data) => {
        const { success, action, device_id, message, error, image_data, output } = data;
        
        if (device_id !== selectedDeviceId) return; // Ignore if not from selected device
        
        if (!success) {
            appendTerminalLine("SYSTEM", `Remote action failed: ${error}`, true);
            if (action === "screenshot") {
                screenLoader.classList.add("hidden");
            }
            return;
        }
        
        if (action === "screenshot") {
            screenViewBox.innerHTML = `<img src="${image_data}" alt="Captured Screen">`;
            screenLoader.classList.add("hidden");
            appendTerminalLine("SYSTEM", "Screen capture feed updated.");
        } else if (action === "cmd") {
            appendTerminalLine("SHELL", output);
        } else {
            appendTerminalLine("SYSTEM", message);
        }
    });

    /* ==========================================================================
       9. Terminal Commands Processing
       ========================================================================== */
    function appendTerminalLine(type, text, isError = false) {
        const line = document.createElement("div");
        line.classList.add("terminal-line");
        if (isError) line.classList.add("output-error");
        
        const prefix = type === "INPUT" ? "" : `[${type}] `;
        line.textContent = `${prefix}${text}`;
        
        if (type === "INPUT") line.classList.add("command-echo");
        
        terminalHistory.appendChild(line);
        terminalHistory.scrollTop = terminalHistory.scrollHeight;
    }

    terminalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const command = terminalInput.value.trim();
            if (!command) return;
            
            const promptStr = termPromptLabel.textContent;
            appendTerminalLine("INPUT", `${promptStr} ${command}`);
            terminalInput.value = "";
            
            // Execute Remote command via Socket or fall back to local
            const baseCmd = command.split(" ")[0].toLowerCase();
            if (baseCmd === "clear") {
                terminalHistory.innerHTML = "";
            } else if (baseCmd === "help") {
                appendTerminalLine("SHELL", "Commands: ls, sysinfo, lock, screenshot, volume <0-100>, say <text>, clear");
            } else {
                // Relay command as a shell execution on the remote agent
                sendRemoteAction("cmd", { command: command });
            }
        }
    });

    /* ==========================================================================
       10. Device Registration Form API Handling
       ========================================================================== */
    regDeviceSubmitBtn.addEventListener("click", () => {
        const name = regDeviceName.value.trim();
        const os = regDeviceOs.value.trim();
        
        if (!name || !os) {
            alert("Please fill in both name and OS platform fields.");
            return;
        }
        
        regDeviceSubmitBtn.disabled = true;
        regDeviceSubmitBtn.textContent = "Registering...";
        
        fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, os: os })
        })
        .then(res => res.json())
        .then(data => {
            regDeviceSubmitBtn.disabled = false;
            regDeviceSubmitBtn.textContent = "Register Device";
            
            if (data.success) {
                regDeviceName.value = "";
                regDeviceOs.value = "";
                appendTerminalLine("SYSTEM", `Registered device: ${data.device.name}. Token token created.`);
            } else {
                alert("Failed to register device.");
            }
        })
        .catch(err => {
            regDeviceSubmitBtn.disabled = false;
            regDeviceSubmitBtn.textContent = "Register Device";
            console.error(err);
            alert("Error registering device. Make sure backend is running.");
        });
    });

    /* ==========================================================================
       11. Fullscreen Live Screen Feed Overlay
       ========================================================================== */
    const fullscreenOverlay = document.getElementById("fullscreen-overlay");
    const fullscreenImg = document.getElementById("fullscreen-img");

    screenViewBox.addEventListener("click", () => {
        const activeImg = screenViewBox.querySelector("img");
        if (activeImg && activeImg.src) {
            fullscreenImg.src = activeImg.src;
            fullscreenOverlay.classList.remove("hidden");
            setTimeout(() => {
                fullscreenOverlay.classList.add("show");
            }, 10);
        }
    });

    fullscreenOverlay.addEventListener("click", (e) => {
        if (e.target === fullscreenOverlay || e.target.closest(".fullscreen-close-btn") || e.target === fullscreenImg) {
            fullscreenOverlay.classList.remove("show");
            setTimeout(() => {
                fullscreenOverlay.classList.add("hidden");
            }, 300); // 300ms transition delay matches opacity transition
        }
    });
});
