/**
 * FluidNC WebSocket client for direct browser-to-controller communication.
 *
 * FluidNC exposes a WebSocket on port 81 (default) that accepts raw GRBL
 * commands (line-oriented) and single-character realtime commands.
 * Responses follow the standard GRBL v1.1 protocol.
 *
 * References:
 *   - http://wiki.fluidnc.com/en/support/interface/websockets
 *   - https://github.com/gnea/grbl/wiki/Grbl-v1.1-Interface
 *   - https://github.com/luc-github/ESP3D-WEBUI  (app.js startSocket)
 */

import CommandHistory from '../components/command-history';

const RECONNECT_DELAY_MS = 3000;
const STATUS_POLL_MS = 250;

/**
 * FluidNCWebSocket manages a native WebSocket connection to a FluidNC
 * controller. It emits parsed events through callback functions.
 */
export class FluidNCWebSocket {
    /**
     * @param {object} callbacks - Event callbacks
     * @param {function} callbacks.onConnect - Called when connection is established
     * @param {function} callbacks.onDisconnect - Called when connection is lost
     * @param {function} callbacks.onData - Called with each line of data received
     * @param {function} callbacks.onFirmware - Called with firmware info { firmware, version, date }
     * @param {function} callbacks.onStatusReport - Called with parsed status report string
     * @param {function} callbacks.onWPos - Called with { x, y, z, a } work position
     * @param {function} callbacks.onWOffset - Called with { x, y, z, a } work coordinate offset
     * @param {function} callbacks.onOk - Called when 'ok' response received
     * @param {function} callbacks.onError - Called with error message
     * @param {function} callbacks.onAlarm - Called with alarm message
     * @param {function} callbacks.onQCount - Called with queue count
     */
    constructor(callbacks) {
        this.callbacks = callbacks || {};
        this.ws = null;
        this.connected = false;
        this.buffer = '';
        this.statusPollInterval = null;
        this.reconnectTimeout = null;
        this.shouldReconnect = false;
        this.url = '';
        this.queueCount = 0;
        this.pendingCommands = 0;
        this.maxPending = 15; // GRBL planner buffer size
    }

    /**
     * Connect to FluidNC WebSocket.
     * @param {string} ip - IP address of the FluidNC controller
     * @param {number} port - WebSocket port (default 81)
     */
    connect(ip, port = 81) {
        this.url = `ws://${ip}:${port}`;
        this.shouldReconnect = true;
        this._doConnect();
    }

    _doConnect() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) { /* ignore */ }
        }

        CommandHistory.write('FluidNC-WS: Connecting to ' + this.url, CommandHistory.INFO);

        try {
            this.ws = new WebSocket(this.url, ['arduino']);
        } catch (e) {
            CommandHistory.error('FluidNC-WS: Failed to create WebSocket: ' + e.message);
            this._scheduleReconnect();
            return;
        }

        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.connected = true;
            this.buffer = '';
            this.pendingCommands = 0;
            CommandHistory.write('FluidNC-WS: Connected', CommandHistory.SUCCESS);

            if (this.callbacks.onConnect) this.callbacks.onConnect();

            // Start polling for status reports
            this._startStatusPolling();

            // Query firmware version
            this.send('$I\n');
        };

        this.ws.onclose = () => {
            let wasConnected = this.connected;
            this.connected = false;
            this._stopStatusPolling();

            if (wasConnected) {
                CommandHistory.error('FluidNC-WS: Disconnected');
            }
            if (this.callbacks.onDisconnect) this.callbacks.onDisconnect();

            this._scheduleReconnect();
        };

        this.ws.onerror = (e) => {
            CommandHistory.error('FluidNC-WS: WebSocket error');
            console.log('FluidNC-WS error', e);
        };

        this.ws.onmessage = (e) => {
            let data = '';
            if (e.data instanceof ArrayBuffer) {
                let bytes = new Uint8Array(e.data);
                for (let i = 0; i < bytes.length; i++) {
                    data += String.fromCharCode(bytes[i]);
                }
            } else {
                data = e.data;
            }
            this._processData(data);
        };
    }

    _scheduleReconnect() {
        if (this.shouldReconnect && !this.reconnectTimeout) {
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectTimeout = null;
                if (this.shouldReconnect) {
                    this._doConnect();
                }
            }, RECONNECT_DELAY_MS);
        }
    }

    /**
     * Disconnect from FluidNC.
     */
    disconnect() {
        this.shouldReconnect = false;
        this._stopStatusPolling();
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) { /* ignore */ }
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Send a raw string to FluidNC. For line commands, include '\n' at the end.
     * For realtime commands (?, !, ~, 0x18), send without line terminator.
     * @param {string} data - Data to send
     */
    send(data) {
        if (this.ws && this.connected) {
            try {
                // Log sent commands (skip status polls '?' to avoid spam)
                let trimmed = data.replace(/\n$/, '');
                if (trimmed !== '?') {
                    CommandHistory.write('WS >> ' + trimmed, CommandHistory.INFO);
                }
                this.ws.send(data);
                return true;
            } catch (e) {
                CommandHistory.error('FluidNC-WS: Send error: ' + e.message);
                return false;
            }
        }
        return false;
    }

    /**
     * Send a GCode line command.
     * @param {string} cmd - GCode command (without newline)
     */
    sendLine(cmd) {
        if (cmd && this.send(cmd + '\n')) {
            this.pendingCommands++;
            return true;
        }
        return false;
    }

    /**
     * Send realtime command (single character, no line terminator).
     * @param {string} char - Single realtime character
     */
    sendRealtime(char) {
        return this.send(char);
    }

    /**
     * Request a status report from GRBL.
     */
    requestStatus() {
        this.send('?');
    }

    _startStatusPolling() {
        this._stopStatusPolling();
        this.statusPollInterval = setInterval(() => {
            if (this.connected) {
                this.requestStatus();
            }
        }, STATUS_POLL_MS);
    }

    _stopStatusPolling() {
        if (this.statusPollInterval) {
            clearInterval(this.statusPollInterval);
            this.statusPollInterval = null;
        }
    }

    /**
     * Process incoming data from the WebSocket, splitting into lines.
     */
    _processData(data) {
        this.buffer += data;
        let lines = this.buffer.split(/\r?\n/);
        // Keep the last incomplete line in the buffer
        this.buffer = lines.pop() || '';

        for (let line of lines) {
            line = line.trim();
            if (line.length === 0) continue;
            this._processLine(line);
        }
    }

    /**
     * Process a complete line from FluidNC.
     */
    _processLine(line) {
        // GRBL status report: <Idle|WPos:0.000,0.000,0.000|...>
        if (line.startsWith('<') && line.endsWith('>')) {
            this._parseStatusReport(line);
            if (this.callbacks.onStatusReport) this.callbacks.onStatusReport(line);
            return;
        }

        // Ok response
        if (line === 'ok') {
            if (this.pendingCommands > 0) this.pendingCommands--;
            CommandHistory.write('WS << ok', CommandHistory.SUCCESS);
            if (this.callbacks.onOk) this.callbacks.onOk();
            return;
        }

        // Error response
        if (line.startsWith('error:')) {
            if (this.pendingCommands > 0) this.pendingCommands--;
            if (this.callbacks.onError) this.callbacks.onError(line);
            CommandHistory.error(line);
            return;
        }

        // Alarm
        if (line.startsWith('ALARM:')) {
            if (this.callbacks.onAlarm) this.callbacks.onAlarm(line);
            CommandHistory.error(line);
            return;
        }

        // Firmware info: [VER:...] or [OPT:...]
        if (line.startsWith('[VER:')) {
            this._parseFirmwareVersion(line);
            return;
        }

        // MSG
        if (line.startsWith('[MSG:')) {
            let msg = line.substring(5, line.length - 1);
            CommandHistory.write(msg, CommandHistory.WARN);
            if (this.callbacks.onData) this.callbacks.onData(line);
            return;
        }

        // Welcome message: Grbl 1.1f or FluidNC v3.x
        if (line.startsWith('Grbl ') || line.startsWith('FluidNC')) {
            this._parseFirmwareFromWelcome(line);
        }

        // Ignore FluidNC client connect/disconnect notifications (spam on each ping)
        if (line.match(/^App (dis)?connected!/)) {
            return;
        }

        // Log and forward all other data
        CommandHistory.write('WS << ' + line);
        if (this.callbacks.onData) this.callbacks.onData(line);
    }

    /**
     * Parse GRBL v1.1 status report.
     * Format: <State|WPos:x,y,z|WCO:x,y,z|FS:f,s|...>
     * or:     <State|MPos:x,y,z|WCO:x,y,z|FS:f,s|...>
     */
    _parseStatusReport(report) {
        let inner = report.substring(1, report.length - 1);
        let parts = inner.split('|');

        if (parts.length < 1) return;

        let state = parts[0];

        let wpos = null;
        let mpos = null;
        let wco = null;
        let fs = null;
        let ov = null;

        for (let i = 1; i < parts.length; i++) {
            let [key, val] = parts[i].split(':');
            if (!val) continue;
            let coords = val.split(',').map(Number);

            switch (key) {
                case 'WPos':
                    wpos = { x: coords[0], y: coords[1], z: coords[2] || 0, a: coords[3] || 0 };
                    break;
                case 'MPos':
                    mpos = { x: coords[0], y: coords[1], z: coords[2] || 0, a: coords[3] || 0 };
                    break;
                case 'WCO':
                    wco = { x: coords[0], y: coords[1], z: coords[2] || 0, a: coords[3] || 0 };
                    break;
                case 'FS':
                case 'F':
                    fs = { feed: coords[0], spindle: coords[1] || 0 };
                    break;
                case 'Ov':
                    ov = { feed: coords[0], rapid: coords[1], spindle: coords[2] };
                    break;
                case 'Bf':
                    // Buffer state: Bf:plannerAvail,rxAvail
                    this.queueCount = coords[0];
                    if (this.callbacks.onQCount) this.callbacks.onQCount(coords[0]);
                    break;
            }
        }

        // Compute WPos from MPos + WCO if needed
        if (!wpos && mpos && wco) {
            wpos = {
                x: mpos.x - wco.x,
                y: mpos.y - wco.y,
                z: mpos.z - wco.z,
                a: mpos.a - wco.a,
            };
        }

        // If we have WCO, report it as work offset
        if (wco) {
            if (this.callbacks.onWOffset) this.callbacks.onWOffset(wco);
        }

        // Report work position
        if (wpos) {
            if (this.callbacks.onWPos) this.callbacks.onWPos(wpos);
        }

        // Report state for runStatus
        if (this.callbacks.onStatusReport) {
            // Map GRBL states to LaserWeb runStatus states
            let lwState = state.toLowerCase();
            if (lwState.startsWith('hold')) lwState = 'paused';
            else if (lwState === 'run') lwState = 'running';
            else if (lwState === 'alarm') lwState = 'alarm';
            else if (lwState === 'idle') lwState = 'idle';
            else if (lwState === 'home') lwState = 'home';
        }
    }

    /**
     * Parse firmware version from [VER:...] response.
     */
    _parseFirmwareVersion(line) {
        // [VER:1.1f.20170801:] or [VER:FluidNC v3.7.14:]
        let inner = line.substring(5, line.length - 1);
        let parts = inner.split(':');
        let version = parts[0] || '';

        let firmware = 'grbl';
        let fVersion = version;
        let fDate = '';

        if (version.startsWith('FluidNC')) {
            firmware = 'grbl';
            let match = version.match(/v?([\d.]+)/);
            fVersion = match ? match[1] : version;
        } else {
            let vParts = version.split('.');
            if (vParts.length >= 2) {
                fVersion = vParts[0] + '.' + vParts[1];
            }
            if (parts[1]) fDate = parts[1];
        }

        CommandHistory.write('FluidNC-WS: Firmware ' + firmware + ' ' + fVersion, CommandHistory.SUCCESS);

        if (this.callbacks.onFirmware) {
            this.callbacks.onFirmware({ firmware, version: fVersion, date: fDate });
        }
    }

    /**
     * Parse firmware from welcome message like "Grbl 1.1f" or "FluidNC v3.7.14".
     */
    _parseFirmwareFromWelcome(line) {
        let firmware = 'grbl';
        let fVersion = '';
        let fDate = '';

        if (line.startsWith('FluidNC')) {
            let match = line.match(/FluidNC\s+v?([\d.]+)/);
            fVersion = match ? match[1] : '';
        } else {
            let match = line.match(/Grbl\s+([\d.]+\w*)/);
            fVersion = match ? match[1] : '';
        }

        CommandHistory.write('FluidNC-WS: Firmware detected: ' + line, CommandHistory.SUCCESS);

        if (this.callbacks.onFirmware) {
            this.callbacks.onFirmware({ firmware, version: fVersion, date: fDate });
        }
    }

    /**
     * Check if connected.
     * @returns {boolean}
     */
    isConnected() {
        return this.connected;
    }
}

export default FluidNCWebSocket;
