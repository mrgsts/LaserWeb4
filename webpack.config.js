var webpack = require('webpack');
var path = require('path');
var http = require('http');

var src_path = path.resolve('./src');
var dist_path = path.resolve('./dist');

module.exports = {
    mode: 'development',
    context: src_path,
    entry: ['@babel/polyfill', './index.js'],
    output: {
        path: dist_path,
        filename: 'index.js'
    },
    resolve: {
        alias: {
            // react-rnd@4.x depends on @bokuweb/react-draggable-custom, a fork of
            // react-draggable v2.x that uses React.PropTypes (removed in React 16).
            // Redirect to a compat shim that injects prop-types first.
            '@bokuweb/react-draggable-custom': path.resolve(__dirname, 'src/compat/react-draggable-custom-compat.js'),
        },
        fallback: {
            // Emscripten-compiled web-cam-cpp references fs/path but doesn't use them in browser
            "fs": false,
            "path": false
        }
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                // Exclude node_modules except `marked`, which ships modern class-field
                // syntax in its UMD build and needs to be transpiled by Babel 7.
                exclude: function(modulePath) {
                    return /node_modules/.test(modulePath) &&
                           !/node_modules[/\\]marked/.test(modulePath);
                },
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-react'],
                        plugins: [
                            '@babel/plugin-transform-destructuring',
                            '@babel/plugin-transform-parameters',
                            '@babel/plugin-proposal-object-rest-spread',
                            '@babel/plugin-transform-modules-commonjs',
                            '@babel/plugin-proposal-class-properties',
                            '@babel/plugin-transform-private-methods',
                            '@babel/plugin-transform-optional-chaining',
                            'react-hot-loader/babel'
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.png$/,
                type: 'asset',
                parser: { dataUrlCondition: { maxSize: 100000 } }
            },
            {
                test: /\.jpg$/,
                type: 'asset/resource'
            },
            {
                test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
                type: 'asset',
                parser: { dataUrlCondition: { maxSize: 10000 } }
            },
            {
                test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
                type: 'asset',
                parser: { dataUrlCondition: { maxSize: 10000 } }
            },
            {
                test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
                type: 'asset/resource'
            },
            {
                test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                type: 'asset',
                parser: { dataUrlCondition: { maxSize: 10000 } }
            },
            {
                test: /\.swf$/,
                type: 'asset/resource'
            },
            {
                // Markdown files loaded as raw text (replaces raw-loader)
                test: /\.md$/,
                type: 'asset/source'
            },
            {
                test: require.resolve('snapsvg'),
                loader: 'imports-loader',
                options: {
                    wrapper: 'window',
                    additionalCode: 'var fix = module.exports = 0;'
                }
            },
            {
                // web-cam-cpp is an Emscripten (asm.js) module that declares
                // `var Module` as a local variable inside the webpack module factory.
                // It never assigns to `window.Module` or `globalThis.Module` itself.
                //
                // Strategy (NO wrapper – additionalCode must be in the SAME scope as
                // the Emscripten `var Module` so there is no IIFE shadowing):
                //
                //   imports-loader prepends additionalCode in the webpack module factory
                //   scope (same scope as Emscripten code):
                //     var Module = globalThis.__webCamCppModule = {};
                //   Then Emscripten's own `var Module;` is a re-declaration in the same
                //   scope (hoisted; doesn't re-initialize). Its `if(!Module)` guard is
                //   truthy (already {}), so Emscripten populates THAT SAME object with
                //   ccall/_malloc/etc.  When the factory finishes, `__webCamCppModule`
                //   is the fully-initialized C++ Module.
                //
                //   cam.js does:
                //     require('web-cam-cpp');   // execute the factory (synchronous)
                //     const Module = globalThis.__webCamCppModule;
                //   Works in main thread (globalThis === window) and Web Workers
                //   (globalThis === self) without any IIFE/scope complications.
                test: require.resolve('web-cam-cpp'),
                loader: 'imports-loader',
                options: {
                    additionalCode: 'var Module = globalThis.__webCamCppModule = {};'
                }
            },
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({$: 'jquery', jQuery: 'jquery'}),
    ],
    devServer: {
        static: {
            directory: dist_path,
        },
        hot: true,
        host: 'localhost',
        setupMiddlewares: function(middlewares, devServer) {
            // Dynamic proxy for FluidNC HTTP API to avoid CORS.
            // Client sends:  /fluidnc-proxy/<host>:<port>/actual/path?query
            // Proxy forwards: http://<host>:<port>/actual/path?query
            middlewares.unshift({
                name: 'fluidnc-proxy',
                path: '/fluidnc-proxy/',
                middleware: function(req, res, next) {
                    var prefix = '/fluidnc-proxy/';
                    var fullUrl = req.originalUrl || req.url;
                    if (fullUrl.indexOf(prefix) !== 0) {
                        return next();
                    }

                    var afterPrefix = fullUrl.substring(prefix.length);
                    var slashIdx = afterPrefix.indexOf('/');
                    if (slashIdx === -1) {
                        res.writeHead(400, {'Content-Type': 'text/plain'});
                        res.end('Bad proxy URL: missing path after host');
                        return;
                    }
                    var targetHost = afterPrefix.substring(0, slashIdx);
                    var targetPath = afterPrefix.substring(slashIdx);
                    var parts = targetHost.split(':');
                    var hostname = parts[0];
                    var port = parts[1] ? parseInt(parts[1]) : 80;

                    console.log('FluidNC proxy: ' + req.method + ' -> http://' + targetHost + targetPath);

                    var options = {
                        hostname: hostname,
                        port: port,
                        path: targetPath,
                        method: req.method,
                        headers: {}
                    };
                    // Copy only safe headers
                    if (req.headers['content-type']) options.headers['content-type'] = req.headers['content-type'];
                    if (req.headers['content-length']) options.headers['content-length'] = req.headers['content-length'];
                    if (req.headers['accept']) options.headers['accept'] = req.headers['accept'];

                    var proxyReq = http.request(options, function(proxyRes) {
                        // Add CORS headers to the proxied response
                        var headers = Object.assign({}, proxyRes.headers, {
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.writeHead(proxyRes.statusCode, headers);
                        proxyRes.pipe(res, { end: true });
                    });

                    proxyReq.on('error', function(e) {
                        console.error('FluidNC proxy error:', e.message);
                        res.writeHead(502, {'Content-Type': 'text/plain'});
                        res.end('Proxy error: ' + e.message);
                    });

                    req.pipe(proxyReq, { end: true });
                }
            });
            return middlewares;
        }
    },
    devtool: 'source-map'
};
