/**
 * FluidNC HTTP/REST client for file management.
 *
 * FluidNC exposes:
 *   - `/upload` GET  → SD card file list / actions (delete, createdir, etc.)
 *   - `/upload` POST → Upload file to SD card
 *   - `/files`  GET  → LocalFS file list / actions
 *   - `/files`  POST → Upload file to LocalFS
 *   - GET `/sd/path/to/file` → Download from SD
 *   - GET `/localfs/path/to/file` → Download from LocalFS
 *
 * WebDAV endpoints (`/sd`, `/flash`) with PROPFIND, PUT, DELETE, etc.
 *
 * References:
 *   - http://wiki.fluidnc.com/en/support/interface/http-rest-api
 */

import CommandHistory from '../components/command-history';

/**
 * Build the base URL for a FluidNC controller.
 *
 * Strategy:
 *  - If the browser is already served from the FluidNC controller (same
 *    hostname), use relative paths (no host prefix). Same-origin requests
 *    have no CORS restrictions and no proxy is needed.
 *  - Otherwise route through /fluidnc-proxy/ which the webpack-dev-server
 *    (development mode) forwards to the controller.
 *
 * @param {string} ip - IP address (or ip:port) of controller
 * @param {string|number} [port] - HTTP port (default: 80)
 * @returns {string} e.g. "" (same-origin) or "/fluidnc-proxy/192.168.1.100:80"
 */
function baseUrl(ip, port) {
    // Strip trailing slash and protocol if present
    let host = ip.trim().replace(/\/+$/, '');
    host = host.replace(/^https?:\/\//, '');
    // Extract the bare hostname (without port) for comparison
    let bareIp = host.split(':')[0];
    // If host lacks a port, append one
    if (!host.match(/:\d+$/)) {
        let p = port ? String(port) : '80';
        host = host + ':' + p;
    }
    // Same-origin check: if the page is served from the controller, use
    // relative paths to avoid the proxy entirely (no CORS issue).
    if (typeof window !== 'undefined' && window.location && window.location.hostname === bareIp) {
        return '';
    }
    return '/fluidnc-proxy/' + host;
}

/**
 * Helper: GET request returning parsed JSON via XMLHttpRequest.
 * @param {string} url - Full URL
 * @param {string} errorPrefix - Prefix for error messages
 * @returns {Promise<object>}
 */
function fetchJSON(url, errorPrefix) {
    CommandHistory.write('FluidNC HTTP: GET ' + url, CommandHistory.INFO);
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'text';
        xhr.timeout = 10000;

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    resolve(data);
                } catch (e) {
                    var msg = 'Invalid JSON response';
                    CommandHistory.error(errorPrefix + msg);
                    reject(new Error(msg));
                }
            } else {
                var msg = 'HTTP ' + xhr.status + ': ' + xhr.statusText;
                CommandHistory.error(errorPrefix + msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = function() {
            var msg = 'Network error (check IP, port, and that FluidNC is reachable)';
            CommandHistory.error(errorPrefix + msg);
            reject(new Error(msg));
        };

        xhr.ontimeout = function() {
            var msg = 'Request timed out';
            CommandHistory.error(errorPrefix + msg);
            reject(new Error(msg));
        };

        xhr.send();
    });
}

/**
 * Helper: GET request returning text via XMLHttpRequest.
 * @param {string} url - Full URL
 * @param {string} errorPrefix - Prefix for error messages
 * @returns {Promise<string>}
 */
function fetchText(url, errorPrefix) {
    CommandHistory.write('FluidNC HTTP: GET ' + url, CommandHistory.INFO);
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'text';
        xhr.timeout = 10000;

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.responseText);
            } else {
                var msg = 'HTTP ' + xhr.status + ': ' + xhr.statusText;
                CommandHistory.error(errorPrefix + msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = function() {
            var msg = 'Network error (check IP, port, and that FluidNC is reachable)';
            CommandHistory.error(errorPrefix + msg);
            reject(new Error(msg));
        };

        xhr.ontimeout = function() {
            var msg = 'Request timed out';
            CommandHistory.error(errorPrefix + msg);
            reject(new Error(msg));
        };

        xhr.send();
    });
}

/**
 * List files on the SD card.
 * Uses the REST /upload endpoint (GET).
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Path on SD (default: '/')
 * @returns {Promise<{files: Array<{name: string, size: number}>, path: string, total: number, used: number}>}
 */
export function listSDFiles(ip, path) {
    if (path === undefined) path = '/';
    CommandHistory.write('FluidNC HTTP: Listing SD files at ' + path, CommandHistory.INFO);
    let url = baseUrl(ip) + '/upload?path=' + encodeURIComponent(path);
    return fetchJSON(url, 'FluidNC HTTP: List SD files failed: ');
}

/**
 * List files on LocalFS.
 * Uses the REST /files endpoint (GET).
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Path on LocalFS (default: '/')
 * @returns {Promise<{files: Array<{name: string, size: number}>, path: string, total: number, used: number}>}
 */
export function listLocalFiles(ip, path) {
    if (path === undefined) path = '/';
    CommandHistory.write('FluidNC HTTP: Listing LocalFS files at ' + path, CommandHistory.INFO);
    let url = baseUrl(ip) + '/files?path=' + encodeURIComponent(path);
    return fetchJSON(url, 'FluidNC HTTP: List local files failed: ');
}

/**
 * Delete a file on the SD card.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Folder path
 * @param {string} filename - File to delete
 * @returns {Promise<object>}
 */
export function deleteSDFile(ip, path, filename) {
    CommandHistory.write('FluidNC HTTP: Deleting SD file ' + path + filename, CommandHistory.INFO);
    let url = baseUrl(ip) + '/upload?path=' + encodeURIComponent(path) +
              '&filename=' + encodeURIComponent(filename) +
              '&action=delete';
    return fetchJSON(url, 'FluidNC HTTP: Delete failed: ')
        .then(function(data) {
            CommandHistory.write('FluidNC: Deleted ' + filename, CommandHistory.SUCCESS);
            return data;
        });
}

/**
 * Delete a file on LocalFS.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Folder path
 * @param {string} filename - File to delete
 * @returns {Promise<object>}
 */
export function deleteLocalFile(ip, path, filename) {
    CommandHistory.write('FluidNC HTTP: Deleting LocalFS file ' + path + filename, CommandHistory.INFO);
    let url = baseUrl(ip) + '/files?path=' + encodeURIComponent(path) +
              '&filename=' + encodeURIComponent(filename) +
              '&action=delete';
    return fetchJSON(url, 'FluidNC HTTP: Delete failed: ')
        .then(function(data) {
            CommandHistory.write('FluidNC: Deleted ' + filename, CommandHistory.SUCCESS);
            return data;
        });
}

/**
 * Delete a directory recursively on the SD card.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Parent folder path
 * @param {string} dirname - Directory to delete
 * @returns {Promise<object>}
 */
export function deleteSDDir(ip, path, dirname) {
    CommandHistory.write('FluidNC HTTP: Deleting SD directory ' + path + dirname, CommandHistory.INFO);
    let url = baseUrl(ip) + '/upload?path=' + encodeURIComponent(path) +
              '&filename=' + encodeURIComponent(dirname) +
              '&action=deletedir';
    return fetchJSON(url, 'FluidNC HTTP: Delete dir failed: ')
        .then(function(data) {
            CommandHistory.write('FluidNC: Deleted directory ' + dirname, CommandHistory.SUCCESS);
            return data;
        });
}

/**
 * Create a directory on the SD card.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Parent folder path
 * @param {string} dirname - New directory name
 * @returns {Promise<object>}
 */
export function createSDDir(ip, path, dirname) {
    CommandHistory.write('FluidNC HTTP: Creating SD directory ' + path + dirname, CommandHistory.INFO);
    let url = baseUrl(ip) + '/upload?path=' + encodeURIComponent(path) +
              '&filename=' + encodeURIComponent(dirname) +
              '&action=createdir';
    return fetchJSON(url, 'FluidNC HTTP: Create dir failed: ')
        .then(function(data) {
            CommandHistory.write('FluidNC: Created directory ' + dirname, CommandHistory.SUCCESS);
            return data;
        });
}

/**
 * Upload a file to the SD card.
 * Uses POST /upload multipart form data.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Destination path on SD (e.g., '/')
 * @param {string} filename - Destination filename
 * @param {string|Blob} content - File content
 * @param {function} [onProgress] - Progress callback (0-100)
 * @returns {Promise<void>}
 */
export function uploadToSD(ip, path, filename, content, onProgress) {
    CommandHistory.write('FluidNC HTTP: Uploading ' + filename + ' to SD:' + path, CommandHistory.INFO);
    return new Promise((resolve, reject) => {
        let formData = new FormData();
        // FluidNC expects the path in the form as /sd/path/filename
        let fullPath = '/sd' + (path.startsWith('/') ? '' : '/') + path +
                       (path.endsWith('/') ? '' : '/') + filename;

        let blob;
        if (content instanceof Blob) {
            blob = content;
        } else {
            blob = new Blob([content], { type: 'application/octet-stream' });
        }

        formData.append('path', path);
        formData.append(fullPath, blob, filename);

        let xhr = new XMLHttpRequest();
        xhr.open('POST', baseUrl(ip) + '/upload', true);

        if (onProgress) {
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
        }

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                CommandHistory.write('FluidNC: Uploaded ' + filename + ' to SD', CommandHistory.SUCCESS);
                resolve();
            } else {
                let msg = 'HTTP ' + xhr.status + ': ' + xhr.statusText;
                CommandHistory.error('FluidNC HTTP: Upload failed: ' + msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = function() {
            CommandHistory.error('FluidNC HTTP: Upload network error');
            reject(new Error('Network error'));
        };

        xhr.send(formData);
    });
}

/**
 * Upload a file to LocalFS.
 * Uses POST /files multipart form data.
 *
 * @param {string} ip - Controller IP
 * @param {string} path - Destination path
 * @param {string} filename - Destination filename
 * @param {string|Blob} content - File content
 * @param {function} [onProgress] - Progress callback (0-100)
 * @returns {Promise<void>}
 */
export function uploadToLocal(ip, path, filename, content, onProgress) {
    CommandHistory.write('FluidNC HTTP: Uploading ' + filename + ' to LocalFS:' + path, CommandHistory.INFO);
    return new Promise((resolve, reject) => {
        let formData = new FormData();
        let fullPath = '/localfs' + (path.startsWith('/') ? '' : '/') + path +
                       (path.endsWith('/') ? '' : '/') + filename;

        let blob;
        if (content instanceof Blob) {
            blob = content;
        } else {
            blob = new Blob([content], { type: 'application/octet-stream' });
        }

        formData.append('path', path);
        formData.append(fullPath, blob, filename);

        let xhr = new XMLHttpRequest();
        xhr.open('POST', baseUrl(ip) + '/files', true);

        if (onProgress) {
            xhr.upload.onprogress = function(e) {
                if (e.lengthComputable) {
                    onProgress(Math.round((e.loaded / e.total) * 100));
                }
            };
        }

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                CommandHistory.write('FluidNC: Uploaded ' + filename + ' to LocalFS', CommandHistory.SUCCESS);
                resolve();
            } else {
                let msg = 'HTTP ' + xhr.status + ': ' + xhr.statusText;
                CommandHistory.error('FluidNC HTTP: Upload failed: ' + msg);
                reject(new Error(msg));
            }
        };

        xhr.onerror = function() {
            CommandHistory.error('FluidNC HTTP: Upload network error');
            reject(new Error('Network error'));
        };

        xhr.send(formData);
    });
}

/**
 * Download a file from the SD card.
 *
 * @param {string} ip - Controller IP
 * @param {string} filepath - Full file path on SD (e.g., '/myfile.gcode')
 * @returns {Promise<string>} File content as text
 */
export function downloadSDFile(ip, filepath) {
    CommandHistory.write('FluidNC HTTP: Downloading SD:' + filepath, CommandHistory.INFO);
    let cleanPath = filepath.startsWith('/') ? filepath : '/' + filepath;
    let url = baseUrl(ip) + '/sd' + cleanPath;
    return fetchText(url, 'FluidNC HTTP: Download failed: ')
        .then(function(text) {
            CommandHistory.write('FluidNC: Downloaded ' + filepath, CommandHistory.SUCCESS);
            return text;
        });
}

/**
 * Download a file from LocalFS.
 *
 * @param {string} ip - Controller IP
 * @param {string} filepath - Full file path (e.g., '/config.yaml')
 * @returns {Promise<string>} File content as text
 */
export function downloadLocalFile(ip, filepath) {
    CommandHistory.write('FluidNC HTTP: Downloading LocalFS:' + filepath, CommandHistory.INFO);
    let cleanPath = filepath.startsWith('/') ? filepath : '/' + filepath;
    let url = baseUrl(ip) + '/localfs' + cleanPath;
    return fetchText(url, 'FluidNC HTTP: Download failed: ')
        .then(function(text) {
            CommandHistory.write('FluidNC: Downloaded ' + filepath, CommandHistory.SUCCESS);
            return text;
        });
}

/**
 * Send a command to FluidNC via HTTP.
 *
 * @param {string} ip - Controller IP
 * @param {string} command - GCode or $ command
 * @returns {Promise<string>} Response text
 */
export function sendCommand(ip, command) {
    CommandHistory.write('FluidNC HTTP: Command: ' + command, CommandHistory.INFO);
    let url = baseUrl(ip) + '/command?plain=' + encodeURIComponent(command);
    return fetchText(url, 'FluidNC HTTP: Command failed: ');
}

/**
 * Upload current GCode to FluidNC SD card via HTTP.
 * Convenience function for the common case.
 *
 * @param {string} ip - Controller IP address
 * @param {string} filename - Filename to save as (e.g., 'job.gcode')
 * @param {string} gcodeContent - GCode text content
 * @param {function} [onProgress] - Progress callback (0-100)
 * @returns {Promise<void>}
 */
export function uploadGcodeToSD(ip, filename, gcodeContent, onProgress) {
    return uploadToSD(ip, '/', filename, gcodeContent, onProgress);
}
