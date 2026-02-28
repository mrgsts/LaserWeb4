/**
 * FluidNC File Manager component.
 *
 * Provides a UI panel for managing files on the FluidNC controller
 * (SD card and LocalFS) via the REST API.
 *
 * Features:
 *   - List files and directories
 *   - Navigate directories
 *   - Upload files (drag-and-drop or file picker)
 *   - Download files (save to browser)
 *   - Delete files and directories
 *   - Create directories
 *   - Upload current GCode to SD
 */

import React from 'react';
import { connect } from 'react-redux';
import { PanelGroup, Panel, Button, ButtonGroup, ButtonToolbar, ProgressBar, Label, Badge, Alert } from 'react-bootstrap';
import Icon from './font-awesome';
import { TextField } from './forms';
import { setSettingsAttrs } from '../actions/settings';
import CommandHistory from './command-history';
import { sendAsFile } from '../lib/helpers';
import { prompt, confirm, alert } from './laserweb';
import {
    listSDFiles,
    listLocalFiles,
    deleteSDFile,
    deleteLocalFile,
    deleteSDDir,
    createSDDir,
    uploadToSD,
    downloadSDFile,
    downloadLocalFile,
    uploadGcodeToSD,
} from '../lib/fluidnc-http';

function formatSize(bytes) {
    let size = Number(bytes);
    if (isNaN(size) || size < 0) return ''; // directory marker or unknown
    if (size === 0) return '0 B';
    let units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

class FluidNCFiles extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            volume: 'sd',       // 'sd' or 'localfs'
            path: '/',
            files: [],
            loading: false,
            error: null,
            total: 0,
            used: 0,
            uploadProgress: -1,  // -1 = not uploading
            uploadFilename: '',
        };
        this.fileInputRef = null;
    }

    getIP() {
        return this.props.settings.connectIP || '';
    }

    getHTTPPort() {
        return this.props.settings.connectHTTPPort || '80';
    }

    /**
     * Returns the IP:port string for HTTP API calls.
     * @returns {string} e.g. "192.168.1.100:80"
     */
    getHost() {
        let ip = this.getIP();
        if (!ip) return '';
        let port = this.getHTTPPort();
        // If IP already has a port, use as-is
        if (ip.match(/:\d+$/)) return ip;
        return ip + ':' + port;
    }

    componentDidMount() {
        if (this.getIP()) {
            this.refreshFiles();
        }
    }

    componentDidUpdate(prevProps) {
        if (prevProps.settings.connectIP !== this.props.settings.connectIP && this.getIP()) {
            this.refreshFiles();
        }
    }

    refreshFiles() {
        let ip = this.getIP();
        if (!ip) {
            this.setState({ error: 'No FluidNC IP configured. Set it in Comms > Machine Connection.', files: [] });
            return;
        }

        this.setState({ loading: true, error: null });

        let host = this.getHost();
        let listFn = this.state.volume === 'sd' ? listSDFiles : listLocalFiles;
        listFn(host, this.state.path)
            .then(data => {
                let files = data.files || [];
                // Sort: directories first, then by name
                files.sort((a, b) => {
                    let aDir = a.size === -1 ? 0 : 1;
                    let bDir = b.size === -1 ? 0 : 1;
                    if (aDir !== bDir) return aDir - bDir;
                    return a.name.localeCompare(b.name);
                });
                this.setState({
                    files: files,
                    total: data.total || 0,
                    used: data.used || 0,
                    loading: false,
                });
            })
            .catch(err => {
                this.setState({ error: err.message, files: [], loading: false });
            });
    }

    navigateTo(dirname) {
        let newPath = this.state.path;
        if (newPath.endsWith('/')) {
            newPath += dirname;
        } else {
            newPath += '/' + dirname;
        }
        this.setState({ path: newPath }, () => this.refreshFiles());
    }

    navigateUp() {
        let parts = this.state.path.split('/').filter(p => p.length > 0);
        parts.pop();
        let newPath = '/' + parts.join('/');
        this.setState({ path: newPath }, () => this.refreshFiles());
    }

    navigateRoot() {
        this.setState({ path: '/' }, () => this.refreshFiles());
    }

    handleDelete(file) {
        let host = this.getHost();
        let msg = 'Delete "' + file.name + '"?';
        confirm(msg, (ok) => {
            if (!ok) return;
            let deleteFn;
            if (file.size === -1) {
                // Directory
                deleteFn = deleteSDDir(host, this.state.path, file.name);
            } else {
                deleteFn = this.state.volume === 'sd'
                    ? deleteSDFile(host, this.state.path, file.name)
                    : deleteLocalFile(host, this.state.path, file.name);
            }
            deleteFn
                .then(data => {
                    // The response contains the updated file list
                    if (data && data.files) {
                        let files = data.files || [];
                        files.sort((a, b) => {
                            let aDir = a.size === -1 ? 0 : 1;
                            let bDir = b.size === -1 ? 0 : 1;
                            if (aDir !== bDir) return aDir - bDir;
                            return a.name.localeCompare(b.name);
                        });
                        this.setState({ files, total: data.total || this.state.total, used: data.used || this.state.used });
                    } else {
                        this.refreshFiles();
                    }
                })
                .catch(() => this.refreshFiles());
        });
    }

    handleDownload(file) {
        let host = this.getHost();
        let filepath = this.state.path + (this.state.path.endsWith('/') ? '' : '/') + file.name;
        let downloadFn = this.state.volume === 'sd' ? downloadSDFile : downloadLocalFile;

        downloadFn(host, filepath)
            .then(content => {
                sendAsFile(file.name, content, 'application/octet-stream');
            })
            .catch(err => {
                CommandHistory.error('Download failed: ' + err.message);
            });
    }

    handleUploadClick() {
        if (this.fileInputRef) {
            this.fileInputRef.click();
        }
    }

    handleFileSelect(e) {
        let files = e.target.files;
        if (!files || files.length === 0) return;

        let host = this.getHost();
        if (!host) {
            CommandHistory.error('No FluidNC IP configured');
            return;
        }

        // Upload each file
        let promises = [];
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            this.setState({ uploadProgress: 0, uploadFilename: file.name });
            promises.push(
                uploadToSD(host, this.state.path, file.name, file, (progress) => {
                    this.setState({ uploadProgress: progress });
                })
            );
        }

        Promise.all(promises)
            .then(() => {
                this.setState({ uploadProgress: -1, uploadFilename: '' });
                this.refreshFiles();
            })
            .catch(err => {
                this.setState({ uploadProgress: -1, uploadFilename: '' });
                CommandHistory.error('Upload failed: ' + err.message);
                this.refreshFiles();
            });

        // Reset file input
        e.target.value = '';
    }

    handleCreateDir() {
        let host = this.getHost();
        prompt('New directory name', 'new-folder', (name) => {
            if (!name) return;
            createSDDir(host, this.state.path, name)
                .then(data => {
                    if (data && data.files) {
                        let files = data.files || [];
                        files.sort((a, b) => {
                            let aDir = a.size === -1 ? 0 : 1;
                            let bDir = b.size === -1 ? 0 : 1;
                            if (aDir !== bDir) return aDir - bDir;
                            return a.name.localeCompare(b.name);
                        });
                        this.setState({ files, total: data.total || this.state.total, used: data.used || this.state.used });
                    } else {
                        this.refreshFiles();
                    }
                })
                .catch(() => this.refreshFiles());
        });
    }

    handleUploadGcode() {
        let ip = this.getIP();
        let host = this.getHost();
        let gcode = this.props.gcode;
        if (!ip) {
            CommandHistory.error('No FluidNC IP configured. Set it in Comms > Machine Connection.');
            return;
        }
        if (!gcode || gcode.length === 0) {
            CommandHistory.error('No G-Code to upload. Generate G-Code first.');
            return;
        }

        prompt('Save GCode to FluidNC SD as', 'job.gcode', (filename) => {
            if (!filename) return;
            if (!filename.match(/\.(nc|gc|gcode)$/i)) {
                filename += '.gcode';
            }
            this.setState({ uploadProgress: 0, uploadFilename: filename });
            uploadGcodeToSD(host, filename, gcode, (progress) => {
                this.setState({ uploadProgress: progress });
            })
                .then(() => {
                    this.setState({ uploadProgress: -1, uploadFilename: '' });
                    CommandHistory.write('GCode uploaded to FluidNC SD: ' + filename, CommandHistory.SUCCESS);
                    this.refreshFiles();
                })
                .catch(err => {
                    this.setState({ uploadProgress: -1, uploadFilename: '' });
                    CommandHistory.error('Upload failed: ' + err.message);
                });
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        let files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        let host = this.getHost();
        if (!host) {
            CommandHistory.error('No FluidNC IP configured');
            return;
        }

        let promises = [];
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            this.setState({ uploadProgress: 0, uploadFilename: file.name });
            promises.push(
                uploadToSD(host, this.state.path, file.name, file, (progress) => {
                    this.setState({ uploadProgress: progress });
                })
            );
        }

        Promise.all(promises)
            .then(() => {
                this.setState({ uploadProgress: -1, uploadFilename: '' });
                this.refreshFiles();
            })
            .catch(err => {
                this.setState({ uploadProgress: -1, uploadFilename: '' });
                CommandHistory.error('Upload failed: ' + err.message);
                this.refreshFiles();
            });
    }

    setVolume(vol) {
        this.setState({ volume: vol, path: '/' }, () => this.refreshFiles());
    }

    render() {
        let { settings } = this.props;
        let ip = this.getIP();
        let { files, loading, error, path, volume, total, used, uploadProgress, uploadFilename } = this.state;
        let hasGcode = this.props.gcode && this.props.gcode.length > 0;
        let usedPercent = total > 0 ? Math.round((used / total) * 100) : 0;

        return (
            <div style={{ padding: 4, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <PanelGroup>
                    <Panel collapsible header="FluidNC File Manager" bsStyle="primary" eventKey="1" defaultExpanded={true}>

                        {/* IP display */}
                        <div style={{ marginBottom: 6 }}>
                            <small><strong>Controller:</strong> {ip || <span style={{color:'red'}}>Not configured</span>}</small>
                        </div>

                        {/* Volume selector */}
                        <ButtonGroup bsSize="xsmall" style={{ marginBottom: 6 }}>
                            <Button bsStyle={volume === 'sd' ? 'primary' : 'default'} onClick={() => this.setVolume('sd')}>
                                <Icon name="hdd-o" /> SD Card
                            </Button>
                            <Button bsStyle={volume === 'localfs' ? 'primary' : 'default'} onClick={() => this.setVolume('localfs')}>
                                <Icon name="microchip" /> LocalFS
                            </Button>
                        </ButtonGroup>

                        {/* Storage info */}
                        {total > 0 && (
                            <div style={{ marginBottom: 6 }}>
                                <small>Storage: {formatSize(used)} / {formatSize(total)} ({usedPercent}%)</small>
                                <ProgressBar now={usedPercent} bsStyle={usedPercent > 90 ? 'danger' : usedPercent > 70 ? 'warning' : 'success'} style={{ height: 6, marginBottom: 0 }} />
                            </div>
                        )}

                        {/* Path navigation */}
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                            <ButtonGroup bsSize="xsmall">
                                <Button onClick={() => this.navigateRoot()} title="Go to root"><Icon name="home" /></Button>
                                <Button onClick={() => this.navigateUp()} disabled={path === '/'} title="Go up"><Icon name="level-up" /></Button>
                                <Button onClick={() => this.refreshFiles()} title="Refresh"><Icon name="refresh" /></Button>
                            </ButtonGroup>
                            <Label bsStyle="default" style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '11px' }}>
                                {volume === 'sd' ? 'SD' : 'LocalFS'}:{path}
                            </Label>
                        </div>

                        {/* Toolbar */}
                        <ButtonToolbar style={{ marginBottom: 6 }}>
                            <ButtonGroup bsSize="xsmall">
                                <Button bsStyle="success" onClick={() => this.handleUploadClick()} title="Upload file">
                                    <Icon name="upload" /> Upload
                                </Button>
                                {volume === 'sd' && (
                                    <Button bsStyle="info" onClick={() => this.handleCreateDir()} title="Create directory">
                                        <Icon name="folder-o" /> New Dir
                                    </Button>
                                )}
                                <Button bsStyle="warning" onClick={() => this.handleUploadGcode()} disabled={!hasGcode || !ip} title="Upload current G-Code to FluidNC SD">
                                    <Icon name="cloud-upload" /> Send GCode
                                </Button>
                            </ButtonGroup>
                        </ButtonToolbar>

                        {/* Upload progress */}
                        {uploadProgress >= 0 && (
                            <div style={{ marginBottom: 6 }}>
                                <small>Uploading: {uploadFilename}</small>
                                <ProgressBar now={uploadProgress} active label={uploadProgress + '%'} style={{ height: 16, marginBottom: 0 }} />
                            </div>
                        )}

                        {/* Hidden file input */}
                        <input
                            type="file"
                            multiple
                            ref={(ref) => { this.fileInputRef = ref; }}
                            style={{ display: 'none' }}
                            onChange={(e) => this.handleFileSelect(e)}
                        />

                        {/* Error */}
                        {error && (
                            <Alert bsStyle="danger" style={{ padding: 4, marginBottom: 4, fontSize: '12px' }}>
                                {error}
                            </Alert>
                        )}

                        {/* Loading */}
                        {loading && (
                            <div style={{ textAlign: 'center', padding: 10 }}>
                                <i className="fa fa-spinner fa-spin" /> Loading...
                            </div>
                        )}

                        {/* File list */}
                        <div
                            style={{ overflowY: 'auto', maxHeight: '400px', border: '1px solid #ddd', borderRadius: 3 }}
                            onDragOver={(e) => this.handleDragOver(e)}
                            onDrop={(e) => this.handleDrop(e)}
                        >
                            <table className="table table-condensed table-hover" style={{ marginBottom: 0, fontSize: '12px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '20px' }}></th>
                                        <th>Name</th>
                                        <th style={{ width: '70px', textAlign: 'right' }}>Size</th>
                                        <th style={{ width: '70px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!loading && files.length === 0 && !error && (
                                        <tr>
                                            <td colSpan="4" style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                                                {ip ? 'Empty directory. Drag & drop files here to upload.' : 'Configure FluidNC IP in Comms to browse files.'}
                                            </td>
                                        </tr>
                                    )}
                                    {files.map((file, idx) => {
                                        let isDir = file.size === -1;
                                        return (
                                            <tr key={idx}>
                                                <td>
                                                    <Icon name={isDir ? 'folder' : 'file-o'} style={{ color: isDir ? '#f0ad4e' : '#999' }} />
                                                </td>
                                                <td>
                                                    {isDir ? (
                                                        <a href="#" onClick={(e) => { e.preventDefault(); this.navigateTo(file.name); }} style={{ fontWeight: 'bold' }}>
                                                            {file.name}
                                                        </a>
                                                    ) : (
                                                        <span>{file.name}</span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {isDir ? '' : formatSize(file.size)}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <ButtonGroup bsSize="xsmall">
                                                        {!isDir && (
                                                            <Button bsStyle="info" onClick={() => this.handleDownload(file)} title="Download">
                                                                <Icon name="download" />
                                                            </Button>
                                                        )}
                                                        <Button bsStyle="danger" onClick={() => this.handleDelete(file)} title="Delete">
                                                            <Icon name="trash" />
                                                        </Button>
                                                    </ButtonGroup>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Drag-and-drop hint */}
                        <div style={{ textAlign: 'center', color: '#999', fontSize: '11px', marginTop: 4 }}>
                            <Icon name="cloud-upload" /> Drag &amp; drop files here to upload
                        </div>

                    </Panel>
                </PanelGroup>
            </div>
        );
    }
}

FluidNCFiles = connect(
    state => ({
        settings: state.settings,
        gcode: state.gcode.content,
    })
)(FluidNCFiles);

export default FluidNCFiles;
