import React from 'react'
import { connect } from 'react-redux';

import { PanelGroup, Panel, Tooltip, OverlayTrigger, FormControl, InputGroup, ControlLabel, FormGroup, ButtonGroup, Label, Collapse, Badge, ButtonToolbar, Button, Glyphicon } from 'react-bootstrap';
import { Input, TextField, NumberField, ToggleField, SelectField } from './forms';
import { runStatus } from './jog.js';
import { setSettingsAttrs } from '../actions/settings';
import { setComAttrs } from '../actions/com';
import { setWorkspaceAttrs } from '../actions/workspace';
import { setGcode } from '../actions/gcode';
import CommandHistory from './command-history';

import { alert, prompt, confirm} from './laserweb';

import Icon from './font-awesome';

import io from 'socket.io-client';
import { FluidNCWebSocket } from '../lib/fluidnc-ws';
var socket, connectVia;
var serverConnected = false;
var machineConnected = false;
var fluidncWS = null;
var fluidncJobLines = [];
var fluidncJobIndex = 0;
var fluidncJobRunning = false;
var jobStartTime = -1;
var accumulatedJobTime = 0;
var playing = false;
var paused = false;
var m0 = false;
var queueEmptyCount = 0;
var laserTestOn = false;
var firmware, fVersion, fDate;
var xpos, ypos, zpos, apos;
var xOffset, yOffset, zOffset, aOffset;

const formatPorts=(data)=>{
    return data.map((item)=>{
       return { value: item.path, label:item.manufacturer? `${item.manufacturer} @ ${item.path}`: item.path };
    })
}

class Com extends React.Component {

    constructor(props) {
        super(props);
        let {comInterfaces, comPorts, comAccumulatedJobTime} = this.props.settings;
        accumulatedJobTime = comAccumulatedJobTime;
        this.state = {comInterfaces: comInterfaces, comPorts: comPorts};
    }

    getComInterfacesWithFluidNC() {
        let interfaces = this.state.comInterfaces.slice();
        if (interfaces.indexOf('FluidNC-WS') === -1) {
            interfaces.push('FluidNC-WS');
        }
        return interfaces;
    }

    componentDidMount() {
        if (!serverConnected) {
            $('#connectS').removeClass('disabled');
            $('#disconnectS').addClass('disabled');
            if (!socket && !serverConnected) {
                this.handleConnectServer();
            }
        } else {
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (!machineConnected) {
                $('#connect').removeClass('disabled');
                $('#disconnect').addClass('disabled');
            } else {
                $('#connect').addClass('disabled');
                $('#disconnect').removeClass('disabled');
            }
        }
    }

    handleConnectServer() {
        let that = this;
        let {settings, dispatch} = this.props;
        let server = settings.comServerIP;
        let protocol = settings.comServerSecure ? 'wss:' : 'ws:';
        CommandHistory.write('Connecting to Server @ ' + server, CommandHistory.INFO);
        //console.log('Connecting to Server ' + server);
        socket = io(protocol + '//' + server);

        socket.on('connect', function(data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            //socket.emit('firstLoad');
            socket.emit('getServerConfig');
            CommandHistory.write('Server connected', CommandHistory.SUCCESS);
        });

        socket.on('disconnect', function() {
            CommandHistory.error('Disconnected from Server ' + settings.comServerIP)
            //console.log('Disconnected from Server ' + settings.commServerIP);
            serverConnected = false;
            $('#connectS').removeClass('disabled');
            $('#disconnectS').addClass('disabled');
            machineConnected = false;
            $('#connect').removeClass('disabled');
            $('#disconnect').addClass('disabled');
        });

//        socket.on('open', function(data) {
//            serverConnected = true;
//            $('#connectS').addClass('disabled');
//            $('#disconnectS').removeClass('disabled');
//            // Web Socket is connected
//            //console.log('open ' + data);
//            socket.emit('getInterfaces');
//            socket.emit('getPorts');
//            CommandHistory.write('Socket opened: ' + data + '(' + socket.id + ')', CommandHistory.INFO);
//        });

        socket.on('serverConfig', function (data) {
            serverConnected = true;
            let serverVersion = data.serverVersion;
            dispatch(setSettingsAttrs({comServerVersion: serverVersion}));
            //CommandHistory.write('Server version: ' + serverVersion, CommandHistory.INFO);
            console.log('serverVersion: ' + serverVersion);
        });

        socket.on('interfaces', function(data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                let interfaces = new Array();
                for (var i = 0; i < data.length; i++) {
                    interfaces.push(data[i]);
                }
                that.setState({comInterfaces: interfaces});
                dispatch(setSettingsAttrs({comInterfaces: interfaces}));
                console.log('interfaces: ' + interfaces);
                //CommandHistory.write('interfaces: ' + interfaces);
            } else {
                CommandHistory.error('No supported interfaces found on server!')
            }
        });

        socket.on('ports', function (data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                that.setState({comPorts: data});
                dispatch(setSettingsAttrs({comPorts: data}));
                let ports = new Array();
                for (var i = 0; i < data.length; i++) {
                      ports.push(data[i].path);
                }
                //console.log('ports: ' + ports);
                //CommandHistory.write('Serial ports detected: ' + ports);
            } else {
                console.log('server sent empty serial ports list');
                CommandHistory.error('No serial ports found on server!');
            }
        });

        socket.on('activeInterface', function (data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                //set the actual interface
            }
            console.log('activeInterface: ' + data);
        });

        socket.on('activePort', function (data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                //set the actual port
            }
            console.log('activePorts: ' + data);
        });

        socket.on('activeBaudRate', function (data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                //set the actual baudrate
            }
            console.log('activeBaudrate: ' + data);
        });

        socket.on('activeIP', function (data) {
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.length > 0) {
                //set the actual machine IP
            }
            console.log('activeIP: ' + data);
        });

        socket.on('connectStatus', function (data) {
            console.log('connectStatus: ' + data);
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            if (data.indexOf('opened') >= 0) {
                machineConnected = true;
                $('#connect').addClass('disabled');
                $('#disconnect').removeClass('disabled');
                CommandHistory.write('Machine connected', CommandHistory.SUCCESS);
            }
            if (data.indexOf('Connect') >= 0) {
                machineConnected = false;
                $('#connect').removeClass('disabled');
                $('#disconnect').addClass('disabled');
                CommandHistory.error('Machine disconnected')
            }
        });

        socket.on('firmware', function (data) {
            console.log('firmware: ' + data);
            serverConnected = true;
            $('#connectS').addClass('disabled');
            $('#disconnectS').removeClass('disabled');
            machineConnected = true;
            $('#connect').addClass('disabled');
            $('#disconnect').removeClass('disabled');
            firmware = data.firmware;
            fVersion = data.version;
            fDate = data.date;
            dispatch(setComAttrs({ firmware: firmware, firmwareVersion: fVersion && fVersion.toString() }));
            CommandHistory.write('Firmware ' + firmware + ' ' + fVersion + ' detected', CommandHistory.SUCCESS);
            if (firmware === 'grbl' && parseFloat(fVersion) < 1.1) {
                CommandHistory.error('Grbl version too old -> YOU MUST INSTALL AT LEAST GRBL 1.1e')
                socket.emit('closePort', 1);
                machineConnected = false;
                //console.log('GRBL < 1.1 not supported!');
            }
        });

        socket.on('runningJob', function (data) {
            CommandHistory.write('runningJob(' + data.length + ')', CommandHistory.WARN);
            //alert(data);
            //setGcode(data);
        });

        socket.on('runningJobStatus', function (data) {
            CommandHistory.write('Server reports: ' + data, CommandHistory.STD);
            alert(data);
        });

        socket.on('runStatus', function (status) {
            //CommandHistory.write('runStatus: ' + status);
            console.log('runStatus: ' + status);
            if (status === 'running') {
                playing = true;
                paused = false;
            } else if (status === 'paused') {
                paused = true;
            } else if (status === 'm0') {
                paused = true;
                m0 = true;
            } else if (status === 'resumed') {
                paused = false;
            } else if (status === 'stopped') {
                playing = false;
                paused = false;
            } else if (status === 'finished') {
                playing = false;
                paused = false;
            } else if (status === 'alarm') {
                CommandHistory.error('ALARM!')
                //socket.emit('clearAlarm', 2);
            }
            runStatus(status);
        });

        socket.on('data', function (data) {
            serverConnected = true;
            machineConnected = true;
            if (data) {
                if (data.indexOf('<') === 0) {
                    //CommandHistory.write('statusReport: ' + data);
                    updateStatus(data);
                } else {
                    var style = CommandHistory.STD;
                    if (data.indexOf('[MSG:') === 0) {
                        style = CommandHistory.WARN;
                    } else if (data.indexOf('ALARM:') === 0) {
                        style = CommandHistory.DANGER;
                    } else if (data.indexOf('error:') === 0) {
                        style = CommandHistory.DANGER;
                    }
                    CommandHistory.write(data, style);
                }
            }
        });

        socket.on('wPos', function (wpos) {
            serverConnected = true;
            machineConnected = true;
            let {x, y, z, a} = wpos; //var pos = wpos.split(',');
            let posChanged = false;
            if (xpos !== x) {
                xpos = x;
                posChanged = true;
            }
            if (ypos !== y) {
                ypos = y;
                posChanged = true;
            }
            if (zpos !== z) {
                zpos = z;
                posChanged = true;
            }
            if (apos !== a) {
                apos = a;
                posChanged = true;
            }
            if (posChanged) {
                //CommandHistory.write('WPos: ' + xpos + ' / ' + ypos + ' / ' + zpos);
                //console.log('WPos: ' + xpos + ' / ' + ypos + ' / ' + zpos);
                $('#mX').html(xpos);
                $('#mY').html(ypos);
                $('#mZ').html(zpos);
                $('#mA').html(apos);
                dispatch(setWorkspaceAttrs({ cursorPos: [xpos, ypos, zpos] }));
            }
        });

        socket.on('wOffset', function (wOffset) {
            serverConnected = true;
            machineConnected = true;
            let {x, y, z, a} = wOffset;
                x=Number(x)
                y=Number(y)
                z=Number(z)
                a=Number(a)
              
            let posChanged = false;
            if ((xOffset !== x) && !isNaN(x)) {
                xOffset = x;
                posChanged = true;
            }
            if ((yOffset !== y) && !isNaN(y)) {
                yOffset = y;
                posChanged = true;
            }
            if ((zOffset !== z) && !isNaN(z)) {
                zOffset = z;
                posChanged = true;
            }
            if ((aOffset !== a) && !isNaN(a)) {
                aOffset = a;
                posChanged = true;
            }
            if (posChanged) {
                CommandHistory.write('Work Offset: ' + xOffset + ' / ' + yOffset + ' / ' + zOffset + ' / ' + aOffset);
                dispatch(setWorkspaceAttrs({ workOffsetX: +xOffset, workOffsetY: +yOffset }));
            }
        });

        // feed override report (from server)
        socket.on('feedOverride', function (data) {
            serverConnected = true;
            //CommandHistory.write('feedOverride: ' + data, CommandHistory.STD);
            //console.log('feedOverride ' + data);
            $('#oF').html(data.toString() + '<span class="drounitlabel"> %</span>');
        });

        // spindle override report (from server)
        socket.on('spindleOverride', function (data) {
            serverConnected = true;
            //CommandHistory.write('spindleOverride: ' + data, CommandHistory.STD);
            //console.log('spindleOverride ' + data);
            $('#oS').html(data.toString() + '<span class="drounitlabel"> %</span>');
        });

        // real feed report (from server)
        socket.on('realFeed', function (data) {
            serverConnected = true;
            //CommandHistory.write('realFeed: ' + data, CommandHistory.STD);
            //console.log('realFeed ' + data);
            //$('#mF').html(data);
        });

        // real spindle report (from server)
        socket.on('realSpindle', function (data) {
            serverConnected = true;
            //CommandHistory.write('realSpindle: ' + data, CommandHistory.STD);
            //console.log('realSpindle ' + data);
            //$('#mS').html(data);
        });

        // laserTest state
        socket.on('laserTest', function (data) {
            serverConnected = true;
            //CommandHistory.write('laserTest: ' + data, CommandHistory.STD);
            //console.log('laserTest ' + data);
            if (data > 0){
                laserTestOn = true;
                $("#lT").addClass('btn-highlight');
            } else if (data === 0) {
                laserTestOn = false;
                $('#lT').removeClass('btn-highlight');
            }
        });

        socket.on('qCount', function (data) {
            serverConnected = true;
            $('#connect').addClass('disabled');
            $('#disconnect').removeClass('disabled');
            //console.log('qCount ' + data);
            data = parseInt(data);
            $('#queueCnt').html('Queued: ' + data);
            if (playing && data === 0) {
                playing = false;
                paused = false;
                runStatus('stopped');
                $('#playicon').removeClass('fa-pause');
                $('#playicon').addClass('fa-play');

                if (jobStartTime >= 0) {
                    var jobFinishTime = new Date(Date.now());
                    var elapsedTimeMS = jobFinishTime.getTime() - jobStartTime.getTime();
                    var elapsedTime = Math.round(elapsedTimeMS / 1000);
                    CommandHistory.write("Job started at " + jobStartTime.toString(), CommandHistory.SUCCESS);
                    CommandHistory.write("Job finished at " + jobFinishTime.toString(), CommandHistory.SUCCESS);
                    CommandHistory.write("Elapsed time: " + secToHMS(elapsedTime), CommandHistory.SUCCESS);
                    jobStartTime = -1;
                    accumulatedJobTime += elapsedTime;
                    let AJT = accumulatedJobTime;
                    dispatch(setSettingsAttrs({comAccumulatedJobTime: AJT}));
                    CommandHistory.write("Total accumulated job time: " + secToHMS(AJT), CommandHistory.SUCCESS);
                }
            }
        });

        socket.on('close', function() {
            serverConnected = false;
            $('#connectS').removeClass('disabled');
            $('#disconnectS').addClass('disabled');
            machineConnected = false;
            $('#connect').removeClass('disabled');
            $('#disconnect').addClass('disabled');
            CommandHistory.error('Server connection closed')
            // websocket is closed.
            //console.log('Server connection closed');
            let serverVersion = 'not connected';
            dispatch(setSettingsAttrs({comServerVersion: serverVersion}));
        });

        socket.on('error', function (data) {
            CommandHistory.error('Server error: ' + data)
            //console.log('error: ' + data);
        });

    }

    handleDisconnectServer() {
        let { dispatch } = this.props;
        if (socket) {
            CommandHistory.write('Disconnecting from server', CommandHistory.INFO);
            socket.disconnect();
            let serverVersion = 'not connected';
            dispatch(setSettingsAttrs({comServerVersion: serverVersion}));
        }
    }

    handleConnectFluidNC() {
        let {settings, dispatch} = this.props;
        let connectIP = settings.connectIP;
        let connectWSPort = settings.connectWSPort || '81';
        if (!connectIP) {
            CommandHistory.write('Could not connect! -> please enter IP address', CommandHistory.DANGER);
            return;
        }

        // Disconnect previous FluidNC-WS connection if any
        if (fluidncWS) {
            fluidncWS.disconnect();
            fluidncWS = null;
        }

        fluidncWS = new FluidNCWebSocket({
            onConnect: () => {
                machineConnected = true;
                serverConnected = true; // We treat WS as both server+machine
                connectVia = 'FluidNC-WS';
                $('#connectS').addClass('disabled');
                $('#disconnectS').removeClass('disabled');
                $('#connect').addClass('disabled');
                $('#disconnect').removeClass('disabled');
                dispatch(setComAttrs({ serverConnected: true, machineConnected: true }));
            },
            onDisconnect: () => {
                machineConnected = false;
                serverConnected = false;
                fluidncJobRunning = false;
                fluidncJobLines = [];
                fluidncJobIndex = 0;
                $('#connectS').removeClass('disabled');
                $('#disconnectS').addClass('disabled');
                $('#connect').removeClass('disabled');
                $('#disconnect').addClass('disabled');
                dispatch(setComAttrs({ serverConnected: false, machineConnected: false }));
            },
            onFirmware: (info) => {
                firmware = info.firmware;
                fVersion = info.version;
                fDate = info.date;
                dispatch(setComAttrs({ firmware: firmware, firmwareVersion: fVersion && fVersion.toString() }));
                CommandHistory.write('Firmware ' + firmware + ' ' + fVersion + ' detected', CommandHistory.SUCCESS);
            },
            onStatusReport: (report) => {
                updateStatus(report);
            },
            onWPos: (wpos) => {
                let {x, y, z, a} = wpos;
                let posChanged = false;
                if (xpos !== x) { xpos = x; posChanged = true; }
                if (ypos !== y) { ypos = y; posChanged = true; }
                if (zpos !== z) { zpos = z; posChanged = true; }
                if (apos !== a) { apos = a; posChanged = true; }
                if (posChanged) {
                    $('#mX').html(xpos);
                    $('#mY').html(ypos);
                    $('#mZ').html(zpos);
                    $('#mA').html(apos);
                    dispatch(setWorkspaceAttrs({ cursorPos: [xpos, ypos, zpos] }));
                }
            },
            onWOffset: (wOffset) => {
                let {x, y, z, a} = wOffset;
                x = Number(x); y = Number(y); z = Number(z); a = Number(a);
                let posChanged = false;
                if ((xOffset !== x) && !isNaN(x)) { xOffset = x; posChanged = true; }
                if ((yOffset !== y) && !isNaN(y)) { yOffset = y; posChanged = true; }
                if ((zOffset !== z) && !isNaN(z)) { zOffset = z; posChanged = true; }
                if ((aOffset !== a) && !isNaN(a)) { aOffset = a; posChanged = true; }
                if (posChanged) {
                    CommandHistory.write('Work Offset: ' + xOffset + ' / ' + yOffset + ' / ' + zOffset + ' / ' + aOffset);
                    dispatch(setWorkspaceAttrs({ workOffsetX: +xOffset, workOffsetY: +yOffset }));
                }
            },
            onOk: () => {
                // If a job is running, send the next line
                if (fluidncJobRunning && fluidncJobIndex < fluidncJobLines.length) {
                    fluidncSendNextJobLine();
                } else if (fluidncJobRunning && fluidncJobIndex >= fluidncJobLines.length) {
                    // Job complete
                    fluidncJobRunning = false;
                    playing = false;
                    paused = false;
                    runStatus('finished');
                    $('#playicon').removeClass('fa-pause');
                    $('#playicon').addClass('fa-play');
                    if (jobStartTime >= 0) {
                        var jobFinishTime = new Date(Date.now());
                        var elapsedTimeMS = jobFinishTime.getTime() - jobStartTime.getTime();
                        var elapsedTime = Math.round(elapsedTimeMS / 1000);
                        CommandHistory.write('Job started at ' + jobStartTime.toString(), CommandHistory.SUCCESS);
                        CommandHistory.write('Job finished at ' + jobFinishTime.toString(), CommandHistory.SUCCESS);
                        CommandHistory.write('Elapsed time: ' + secToHMS(elapsedTime), CommandHistory.SUCCESS);
                        jobStartTime = -1;
                        accumulatedJobTime += elapsedTime;
                        let AJT = accumulatedJobTime;
                        dispatch(setSettingsAttrs({comAccumulatedJobTime: AJT}));
                        CommandHistory.write('Total accumulated job time: ' + secToHMS(AJT), CommandHistory.SUCCESS);
                    }
                }
            },
            onError: (errMsg) => {
                CommandHistory.error(errMsg);
                if (fluidncJobRunning) {
                    // Stop job on error
                    fluidncJobRunning = false;
                    playing = false;
                    paused = false;
                    runStatus('stopped');
                    $('#playicon').removeClass('fa-pause');
                    $('#playicon').addClass('fa-play');
                    CommandHistory.error('Job stopped due to error');
                }
            },
            onAlarm: (alarmMsg) => {
                CommandHistory.error(alarmMsg);
                runStatus('alarm');
                fluidncJobRunning = false;
                playing = false;
                paused = false;
            },
            onData: (line) => {
                if (line) {
                    var style = CommandHistory.STD;
                    if (line.indexOf('[MSG:') === 0) {
                        style = CommandHistory.WARN;
                    } else if (line.indexOf('ALARM:') === 0) {
                        style = CommandHistory.DANGER;
                    } else if (line.indexOf('error:') === 0) {
                        style = CommandHistory.DANGER;
                    }
                    CommandHistory.write(line, style);
                }
            },
            onQCount: (count) => {
                $('#queueCnt').html('Queued: ' + count);
            }
        });

        CommandHistory.write('Connecting Machine @ FluidNC-WS,' + connectIP + ':' + connectWSPort, CommandHistory.INFO);
        fluidncWS.connect(connectIP, parseInt(connectWSPort));
    }

    handleDisconnectFluidNC() {
        if (fluidncWS) {
            fluidncJobRunning = false;
            fluidncJobLines = [];
            fluidncJobIndex = 0;
            fluidncWS.disconnect();
            fluidncWS = null;
            machineConnected = false;
            serverConnected = false;
            $('#connectS').removeClass('disabled');
            $('#disconnectS').addClass('disabled');
            $('#connect').removeClass('disabled');
            $('#disconnect').addClass('disabled');
            CommandHistory.write('FluidNC-WS Disconnected', CommandHistory.INFO);
        }
    }

    handleConnectMachine() {
        var connectVia = this.props.settings.connectVia;
        var connectPort = this.props.settings.connectPort.trim();
        var connectBaud = this.props.settings.connectBaud;
        var connectIP = this.props.settings.connectIP;
        switch (connectVia) {
            case 'USB':
                if (!connectPort) {
                    CommandHistory.write('Could not connect! -> please select port', CommandHistory.DANGER);
                    break;
                }
                if (!connectBaud) {
                    CommandHistory.write('Could not connect! -> please select baudrate', CommandHistory.DANGER);
                    break;
                }
                CommandHistory.write('Connecting Machine @ ' + connectVia + ',' + connectPort + ',' + connectBaud + 'baud', CommandHistory.INFO);
                socket.emit('connectTo', connectVia + ',' + connectPort + ',' + connectBaud);
                break;
            case 'Telnet':
                if (!connectIP) {
                    CommandHistory.write('Could not connect! -> please enter IP address', CommandHistory.DANGER);
                    break;
                }
                CommandHistory.write('Connecting Machine @ ' + connectVia + ',' + connectIP, CommandHistory.INFO);
                socket.emit('connectTo', connectVia + ',' + connectIP);
                break;
            case 'ESP8266':
                if (!connectIP) {
                    CommandHistory.write('Could not connect! -> please enter IP address', CommandHistory.DANGER);
                    break;
                }
                CommandHistory.write('Connecting Machine @ ' + connectVia + ',' + connectIP, CommandHistory.INFO);
                socket.emit('connectTo', connectVia + ',' + connectIP);
                break;
            case 'FluidNC-WS':
                this.handleConnectFluidNC();
                break;
        }
    }

    handleDisconnectMachine() {
        var cv = this.props.settings.connectVia;
        if (cv === 'FluidNC-WS') {
            this.handleDisconnectFluidNC();
        } else {
            CommandHistory.write('Disconnecting Machine', CommandHistory.INFO);
            socket.emit('closePort');
        }
    }


    render() {
        let {settings, dispatch} = this.props;

        return (
            <div style={{paddingTop: 2}}>
                <PanelGroup>
                    <Panel collapsible header="Server Connection" bsStyle="primary" eventKey="1" defaultExpanded={false}>
                        <TextField {...{ object: settings, field: 'comServerIP', setAttrs: setSettingsAttrs, description: 'Server IP' }} />
			<div className="toggleField">
                            <ToggleField {...{ object: settings, field: 'comServerSecure', setAttrs: setSettingsAttrs, description: 'Secure connection' }} />
                        </div>
                        <ButtonGroup>
                            <Button id="connectS" bsClass="btn btn-xs btn-info" onClick={(e)=>{this.handleConnectServer(e)}}><Icon name="share" /> Connect</Button>
                            <Button id="disconnectS" bsClass="btn btn-xs btn-danger" onClick={(e)=>{this.handleDisconnectServer(e)}}><Glyphicon glyph="trash" /> Disconnect</Button>
                        </ButtonGroup>
                    </Panel>

                    <Panel collapsible header="Machine Connection" bsStyle="primary" eventKey="2" defaultExpanded={true}>
                        <SelectField {...{ object: settings, field: 'connectVia', setAttrs: setSettingsAttrs, data: this.getComInterfacesWithFluidNC(), defaultValue: '', description: 'Machine Connection', selectProps: { clearable: false } }} />
                        <Collapse in={settings.connectVia == 'USB'}>
                            <div>
                                <SelectField {...{ object: settings, field: 'connectPort', setAttrs: setSettingsAttrs, data: formatPorts(this.state.comPorts), defaultValue: '', description: 'USB / Serial Port', selectProps: { clearable: false } }} />
                                <SelectField {...{ object: settings, field: 'connectBaud', setAttrs: setSettingsAttrs, data: ['250000', '230400', '115200', '57600', '38400', '19200', '9600'], defaultValue: '115200', description: 'Baudrate', selectProps: { clearable: false } }} />
                            </div>
                        </Collapse>
                        <Collapse in={settings.connectVia != 'USB' && settings.connectVia != ''}>
                            <div>
                                <TextField {...{ object: settings, field: 'connectIP', setAttrs: setSettingsAttrs, description: 'Machine IP' }} />
                            </div>
                        </Collapse>
                        <Collapse in={settings.connectVia == 'FluidNC-WS'}>
                            <div>
                                <TextField {...{ object: settings, field: 'connectHTTPPort', setAttrs: setSettingsAttrs, description: 'HTTP Port (default: 80)' }} />
                                <TextField {...{ object: settings, field: 'connectWSPort', setAttrs: setSettingsAttrs, description: 'WebSocket Port (default: 81)' }} />
                            </div>
                        </Collapse>
                        <ButtonGroup>
                            <Button id="connect" bsClass="btn btn-xs btn-info" onClick={(e)=>{this.handleConnectMachine(e)}}><Icon name="share" /> Connect</Button>
                            <Button id="disconnect" bsClass="btn btn-xs btn-danger" onClick={(e)=>{this.handleDisconnectMachine(e)}}><Glyphicon glyph="trash" /> Disconnect</Button>
                        </ButtonGroup>
                    </Panel>
                </PanelGroup>
            </div>
        )

    }
}

function secToHMS(sec) {
    let hours = Math.floor(sec / 3600);
    let minutes = Math.floor(sec / 60) % 60;
    if (minutes < 10) {
        minutes = '0' + minutes;
    }
    let seconds = sec % 60;
    if (seconds < 10) {
        seconds = '0' + seconds;
    }
    return hours + ':' + minutes + ':' + seconds;
}

/**
 * Send the next line of a FluidNC-WS job.
 * Called after receiving 'ok' from the controller.
 */
function fluidncSendNextJobLine() {
    while (fluidncJobIndex < fluidncJobLines.length) {
        let line = fluidncJobLines[fluidncJobIndex].trim();
        fluidncJobIndex++;
        // Update queue count display
        let remaining = fluidncJobLines.length - fluidncJobIndex;
        $('#queueCnt').html('Queued: ' + remaining);
        if (line.length === 0 || line.startsWith(';') || line.startsWith('(')) {
            // Skip empty lines and comments
            continue;
        }
        // Strip inline comments
        let commentIdx = line.indexOf(';');
        if (commentIdx > 0) line = line.substring(0, commentIdx).trim();
        if (line.length > 0) {
            fluidncWS.sendLine(line);
            return;
        }
    }
    // No more lines — job done (will trigger via onOk when last ok arrives)
}

/**
 * Check if currently using FluidNC-WS direct connection.
 */
function isFluidNCWS() {
    return connectVia === 'FluidNC-WS' && fluidncWS && fluidncWS.isConnected();
}

function updateStatus(data) {
    // Smoothieware: <Idle,MPos:49.5756,279.7644,-15.0000,WPos:0.0000,0.0000,0.0000>
    // till GRBL v0.9: <Idle,MPos:0.000,0.000,0.000,WPos:0.000,0.000,0.000>
    // since GRBL v1.1: <Idle|WPos:0.000,0.000,0.000|Bf:15,128|FS:0,0|Pn:S|WCO:0.000,0.000,0.000> (when $10=2)

    // Extract state
    var state = data.substring(data.indexOf('<') + 1, data.search(/(,|\|)/));
    if (state === 'Alarm') {
        $("#machineStatus").removeClass('badge-ok');
        $("#machineStatus").addClass('badge-notify');
        $("#machineStatus").removeClass('badge-warn');
        $("#machineStatus").removeClass('badge-busy');
        $('#stopBtn .icon-top-text').html('clear');
        $('#stopBtn .icon-bot-text').html('alarm');
        $('#stopIcon').removeClass('fa-stop');
        $('#stopIcon').addClass('fa-unlock');
//        if ($('#alarmmodal').is(':visible')) {
//            // Nothing, its already open
//        } else {
//            //$('#alarmmodal').modal('show');
//        }
    } else if (state === 'Home') {
        $("#machineStatus").removeClass('badge-ok');
        $("#machineStatus").removeClass('badge-notify');
        $("#machineStatus").removeClass('badge-warn');
        $("#machineStatus").addClass('badge-busy');
        $('#stopBtn .icon-top-text').html('abort');
        $('#stopBtn .icon-bot-text').html('job');
        $('#stopIcon').removeClass('fa-unlock');
        $('#stopIcon').addClass('fa-stop');
//        if ($('#alarmmodal').is(':visible')) {
//            $('#alarmmodal').modal('hide');
//        }
    } else if (state === 'Hold') {
        $("#machineStatus").removeClass('badge-ok');
        $("#machineStatus").removeClass('badge-notify');
        $("#machineStatus").addClass('badge-warn');
        $("#machineStatus").removeClass('badge-busy');
        $('#stopBtn .icon-top-text').html('abort');
        $('#stopBtn .icon-bot-text').html('job');
        $('#stopIcon').removeClass('fa-unlock');
        $('#stopIcon').addClass('fa-stop');
        //$('#playBtn .icon-top-text').html('resume');
//        if ($('#alarmmodal').is(':visible')) {
//            $('#alarmmodal').modal('hide');
//        }
    } else if (state === 'Idle') {
        $("#machineStatus").addClass('badge-ok');
        $("#machineStatus").removeClass('badge-notify');
        $("#machineStatus").removeClass('badge-warn');
        $("#machineStatus").removeClass('badge-busy');
        $('#stopBtn .icon-top-text').html('abort');
        $('#stopBtn .icon-bot-text').html('job');
        $('#stopIcon').removeClass('fa-unlock');
        $('#stopIcon').addClass('fa-stop');
        //$('#playBtn .icon-top-text').html('run');
//        if ($('#alarmmodal').is(':visible')) {
//            $('#alarmmodal').modal('hide');
//        }
    } else if (state === 'Run') {
        $("#machineStatus").removeClass('badge-ok');
        $("#machineStatus").removeClass('badge-notify');
        $("#machineStatus").removeClass('badge-warn');
        $("#machineStatus").addClass('badge-busy');
        $('#stopBtn .icon-top-text').html('abort');
        $('#stopBtn .icon-bot-text').html('job');
        $('#stopIcon').removeClass('fa-unlock');
        $('#stopIcon').addClass('fa-stop');
        //$('#playBtn .icon-top-text').html('pause');
//        if ($('#alarmmodal').is(':visible')) {
//            $('#alarmmodal').modal('hide');
//        }
    }
    $('#machineStatus').html(state);
}


export function runCommand(gcode) {
    if (isFluidNCWS()) {
        if (gcode) {
            fluidncWS.sendLine(gcode);
            return true;
        }
        return false;
    }
    if (serverConnected) {
        if (machineConnected){
            if (gcode) {
                //CommandHistory.write('Running Command', CommandHistory.INFO);
                //console.log('runCommand', gcode);
                socket.emit('runCommand', gcode);
                return true;
            }
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
    return false;
}

export function runJob(job) {
    if (isFluidNCWS()) {
        if (job.length > 0) {
            CommandHistory.write('Running Job via FluidNC-WS', CommandHistory.INFO);
            playing = true;
            fluidncJobRunning = true;
            fluidncJobLines = job.split('\n');
            fluidncJobIndex = 0;
            runStatus('running');
            $('#playicon').removeClass('fa-play');
            $('#playicon').addClass('fa-pause');
            jobStartTime = new Date(Date.now());
            // Send the first line to kick off the flow
            fluidncSendNextJobLine();
        } else {
            CommandHistory.error('Job empty!')
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            if (job.length > 0) {
                CommandHistory.write('Running Job', CommandHistory.INFO);
                playing = true;
                runStatus('running');
                $('#playicon').removeClass('fa-play');
                $('#playicon').addClass('fa-pause');
                jobStartTime = new Date(Date.now());
                socket.emit('runJob', job);
            } else {
                CommandHistory.error('Job empty!')
            }
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function pauseJob() {
    console.log('pauseJob');
    if (isFluidNCWS()) {
        paused = true;
        fluidncJobRunning = false; // Stop sending lines
        runStatus('paused');
        $('#playicon').removeClass('fa-pause');
        $('#playicon').addClass('fa-play');
        fluidncWS.sendRealtime('!'); // GRBL feed hold
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            paused = true;
            runStatus('paused');
            $('#playicon').removeClass('fa-pause');
            $('#playicon').addClass('fa-play');
            socket.emit('pause');
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function resumeJob() {
    console.log('resumeJob');
    if (isFluidNCWS()) {
        paused = false;
        m0 = false;
        fluidncJobRunning = true; // Resume sending lines
        runStatus('running');
        $('#playicon').removeClass('fa-play');
        $('#playicon').addClass('fa-pause');
        fluidncWS.sendRealtime('~'); // GRBL cycle start / resume
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            paused = false;
            m0 = false;
            runStatus('running');
            $('#playicon').removeClass('fa-play');
            $('#playicon').addClass('fa-pause');
            socket.emit('resume');
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function abortJob() {
    console.log('abortJob');
    if (isFluidNCWS()) {
        CommandHistory.write('Aborting job', CommandHistory.INFO);
        playing = false;
        paused = false;
        m0 = false;
        fluidncJobRunning = false;
        fluidncJobLines = [];
        fluidncJobIndex = 0;
        runStatus('stopped');
        $('#playicon').removeClass('fa-pause');
        $('#playicon').addClass('fa-play');
        fluidncWS.sendRealtime('\x18'); // Ctrl-X soft reset
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Aborting job', CommandHistory.INFO);
            playing = false;
            paused = false;
            m0 = false;
            runStatus('stopped');
            $('#playicon').removeClass('fa-pause');
            $('#playicon').addClass('fa-play');
            socket.emit('stop');
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function clearAlarm(method) {
    console.log('clearAlarm');
    if (isFluidNCWS()) {
        CommandHistory.write('Resetting alarm', CommandHistory.INFO);
        if (method === 2) {
            fluidncWS.sendLine('$H'); // Home
        } else {
            fluidncWS.sendLine('$X'); // Kill alarm lock
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Resetting alarm', CommandHistory.INFO);
            socket.emit('clearAlarm', method);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function setZero(axis) {
    if (isFluidNCWS()) {
        CommandHistory.write('Set ' + axis + ' Axis zero', CommandHistory.INFO);
        if (axis === 'all') {
            fluidncWS.sendLine('G10 L20 P1 X0 Y0 Z0');
        } else {
            fluidncWS.sendLine('G10 L20 P1 ' + axis + '0');
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Set ' + axis + ' Axis zero', CommandHistory.INFO);
            socket.emit('setZero', axis);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function gotoZero(axis) {
    if (isFluidNCWS()) {
        CommandHistory.write('Goto ' + axis + ' zero', CommandHistory.INFO);
        if (axis === 'all') {
            fluidncWS.sendLine('G0 X0 Y0 Z0');
        } else {
            fluidncWS.sendLine('G0 ' + axis + '0');
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Goto ' + axis + ' zero', CommandHistory.INFO);
            socket.emit('gotoZero', axis);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function setPosition(data) {
    if (isFluidNCWS()) {
        CommandHistory.write('Set position to ' + JSON.stringify(data), CommandHistory.INFO);
        let cmd = 'G10 L20 P1';
        if (data.x !== undefined) cmd += ' X' + data.x;
        if (data.y !== undefined) cmd += ' Y' + data.y;
        if (data.z !== undefined) cmd += ' Z' + data.z;
        if (data.a !== undefined) cmd += ' A' + data.a;
        fluidncWS.sendLine(cmd);
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Set position to ' + JSON.stringify(data), CommandHistory.INFO);
            socket.emit('setPosition', data);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function home(axis) {
    if (isFluidNCWS()) {
        CommandHistory.write('Home ' + axis, CommandHistory.INFO);
        if (axis === 'all') {
            fluidncWS.sendLine('$H');
        } else {
            fluidncWS.sendLine('$H' + axis);
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Home ' + axis, CommandHistory.INFO);
            socket.emit('home', axis);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function probe(axis, offset) {
    if (isFluidNCWS()) {
        CommandHistory.write('Probe ' + axis + ' (Offset:' + offset + ')', CommandHistory.INFO);
        fluidncWS.sendLine('G38.2 ' + axis + '-50 F100');
        if (offset) {
            // After probe, set WCO with offset
            fluidncWS.sendLine('G10 L20 P1 ' + axis + offset);
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.write('Probe ' + axis + ' (Offset:' + offset + ')', CommandHistory.INFO);
            socket.emit('probe', {axis: axis, offset: offset});
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function laserTest(power, duration, maxS) {
    if (isFluidNCWS()) {
        console.log('laserTest(' + power + ', ' + duration + ', ' + maxS + ')');
        let sValue = Math.round((power / 100) * maxS);
        fluidncWS.sendLine('G1 F1 S' + sValue);
        if (duration > 0) {
            laserTestOn = true;
            $('#lT').addClass('btn-highlight');
            setTimeout(() => {
                fluidncWS.sendLine('M5 S0');
                laserTestOn = false;
                $('#lT').removeClass('btn-highlight');
            }, duration);
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            console.log('laserTest(' + power + ', ' + duration + ', ' + maxS + ')');
            socket.emit('laserTest', power + ',' + duration + ',' + maxS);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function jog(axis, dist, feed) {
    if (isFluidNCWS()) {
        fluidncWS.sendLine('$J=G91 ' + axis + dist + ' F' + feed);
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            //console.log('jog(' + axis + ',' + dist + ',' + feed + ')');
            socket.emit('jog', axis + ',' + dist + ',' + feed);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function jogTo(x, y, z, mode, feed) {
    if (isFluidNCWS()) {
        let modeStr = (mode === 'G90') ? 'G90' : 'G91';
        let cmd = '$J=' + modeStr;
        if (x !== undefined && x !== null) cmd += ' X' + x;
        if (y !== undefined && y !== null) cmd += ' Y' + y;
        if (z !== undefined && z !== null) cmd += ' Z' + z;
        cmd += ' F' + feed;
        fluidncWS.sendLine(cmd);
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            //console.log('jog(' + axis + ',' + dist + ',' + feed + ')');
            socket.emit('jogTo', {x: x, y: y, z: z, mode: mode, feed: feed});
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function feedOverride(step) {
    if (isFluidNCWS()) {
        console.log('feedOverride ' + step);
        // GRBL realtime feed override commands
        if (step === 1) fluidncWS.sendRealtime('\x91');       // +10%
        else if (step === -1) fluidncWS.sendRealtime('\x92');  // -10%
        else if (step === 10) fluidncWS.sendRealtime('\x91');  // +10%
        else if (step === -10) fluidncWS.sendRealtime('\x92'); // -10%
        else if (step === 0) fluidncWS.sendRealtime('\x90');   // Reset to 100%
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            console.log('feedOverride ' + step);
            socket.emit('feedOverride', step);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function spindleOverride(step) {
    if (isFluidNCWS()) {
        console.log('spindleOverride ' + step);
        // GRBL realtime spindle override commands
        if (step === 1) fluidncWS.sendRealtime('\x9C');       // +10%
        else if (step === -1) fluidncWS.sendRealtime('\x9D');  // -10%
        else if (step === 10) fluidncWS.sendRealtime('\x9C');  // +10%
        else if (step === -10) fluidncWS.sendRealtime('\x9D'); // -10%
        else if (step === 0) fluidncWS.sendRealtime('\x99');   // Reset to 100%
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            console.log('spindleOverride ' + step);
            socket.emit('spindleOverride', step);
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function resetMachine() {
    if (isFluidNCWS()) {
        CommandHistory.error('Resetting Machine');
        fluidncJobRunning = false;
        fluidncJobLines = [];
        fluidncJobIndex = 0;
        playing = false;
        paused = false;
        fluidncWS.sendRealtime('\x18'); // Ctrl-X soft reset
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            CommandHistory.error('Resetting Machine')
            socket.emit('resetMachine');
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

export function playpauseMachine() {
    if (isFluidNCWS()) {
        if (playing === true) {
            if (paused === true) {
                // Resume
                paused = false;
                fluidncJobRunning = true;
                runStatus('running');
                $('#playicon').removeClass('fa-play');
                $('#playicon').addClass('fa-pause');
                fluidncWS.sendRealtime('~');
            } else {
                // Pause
                paused = true;
                fluidncJobRunning = false;
                runStatus('paused');
                $('#playicon').removeClass('fa-pause');
                $('#playicon').addClass('fa-play');
                fluidncWS.sendRealtime('!');
            }
        } else {
            playGcode();
        }
        return;
    }
    if (serverConnected) {
        if (machineConnected){
            if (playing === true) {
                if (paused === true) {
                    // unpause
                    var laseroncmd = document.getElementById('laseron').value;
                    if (laseroncmd.length === 0) {
                        laseroncmd = 0;
                    }
                    socket.emit('resume', laseroncmd);
                    paused = false;
                    runStatus('running');
                    $('#playicon').removeClass('fa-play');
                    $('#playicon').addClass('fa-pause');
                    // end ifPaused
                } else {
                    // pause
                    var laseroffcmd = document.getElementById('laseroff').value;
                    if (laseroffcmd.length === 0) {
                        laseroffcmd = 0;
                    }
                    socket.emit('pause', laseroffcmd);
                    paused = true;
                    runStatus('paused');
                    $('#playicon').removeClass('fa-pause');
                    $('#playicon').addClass('fa-play');
                }
                // end isPlaying
            } else {
                playGcode();
            }
            // end isConnected
        } else {
            CommandHistory.error('Machine is not connected!')
        }
    } else {
        CommandHistory.error('Server is not connected!')
    }
}

Com = connect(
    state => ({ com: state.com, settings: state.settings, comInterfaces: state.comInterfaces, comPorts: state.comPorts, documents: state.documents, gcode: state.gcode.content })
)(Com);

export default Com
