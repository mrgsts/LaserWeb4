/**
 * Patch lw.comm-server/server.js to add a FluidNC HTTP proxy route.
 *
 * Applied during Docker build (after npm ci) so that requests from the
 * LaserWeb frontend to /fluidnc-proxy/<host>:<port>/path are forwarded
 * to the FluidNC controller, avoiding browser CORS restrictions.
 *
 * Usage: node patches/patch-comm-server.js
 */

'use strict';

var fs = require('fs');
var path = require('path');

var serverPath = path.join(__dirname, '..', 'node_modules', 'lw.comm-server', 'server.js');
var src = fs.readFileSync(serverPath, 'utf8');

var needle = '    } else {\n        webServer.serve(req, res, function (err, result) {\n            if (err) {\n                console.error(chalk.red(\'ERROR:\'), chalk.yellow(\' webServer error:\' + req.url + \' : \'), err.message);\n            }\n        });\n    }\n});';

var replacement = '    } else if (req.url.indexOf(\'/fluidnc-proxy/\') === 0) {\n' +
    '        // FluidNC HTTP proxy — avoids CORS when app and controller are on different origins.\n' +
    '        // Request URL format: /fluidnc-proxy/<host>:<port>/actual/path?query\n' +
    '        var afterPrefix = req.url.substring(\'/fluidnc-proxy/\'.length);\n' +
    '        var slashIdx = afterPrefix.indexOf(\'/\');\n' +
    '        if (slashIdx === -1) {\n' +
    '            res.writeHead(400, {\'Content-Type\': \'text/plain\'});\n' +
    '            res.end(\'Bad proxy URL: missing path after host\');\n' +
    '            return;\n' +
    '        }\n' +
    '        var targetHost = afterPrefix.substring(0, slashIdx);\n' +
    '        var targetPath = afterPrefix.substring(slashIdx);\n' +
    '        var targetUrl = \'http://\' + targetHost + targetPath;\n' +
    '        console.log(\'FluidNC proxy: \' + req.method + \' -> \' + targetUrl);\n' +
    '        var proxyHeaders = {};\n' +
    '        if (req.headers[\'content-type\']) proxyHeaders[\'content-type\'] = req.headers[\'content-type\'];\n' +
    '        if (req.headers[\'accept\']) proxyHeaders[\'accept\'] = req.headers[\'accept\'];\n' +
    '        req.pipe(\n' +
    '            request({ url: targetUrl, method: req.method, headers: proxyHeaders })\n' +
    '                .on(\'error\', function(e) {\n' +
    '                    console.error(chalk.red(\'ERROR:\'), chalk.yellow(\' FluidNC proxy error: \'), e.message);\n' +
    '                    res.writeHead(502, {\'Content-Type\': \'text/plain\'});\n' +
    '                    res.end(\'Proxy error: \' + e.message);\n' +
    '                })\n' +
    '        ).pipe(res);\n' +
    '    } else {\n' +
    '        webServer.serve(req, res, function (err, result) {\n' +
    '            if (err) {\n' +
    '                console.error(chalk.red(\'ERROR:\'), chalk.yellow(\' webServer error:\' + req.url + \' : \'), err.message);\n' +
    '            }\n' +
    '        });\n' +
    '    }\n' +
    '});';

if (src.indexOf('/fluidnc-proxy/') !== -1) {
    console.log('patch-comm-server.js: already patched, skipping.');
    process.exit(0);
}

if (src.indexOf(needle) === -1) {
    console.error('patch-comm-server.js: ERROR — needle not found, server.js may have changed.');
    process.exit(1);
}

var patched = src.replace(needle, replacement);
fs.writeFileSync(serverPath, patched, 'utf8');
console.log('patch-comm-server.js: patched ' + serverPath + ' successfully.');
