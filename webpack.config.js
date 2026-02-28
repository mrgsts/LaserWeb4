var webpack = require('webpack');
var path = require('path');
var http = require('http');
var url = require('url');

var src_path = path.resolve('./src');
var dist_path = path.resolve('./dist');

module.exports = {
    context: src_path,
    entry: [
        'webpack-dev-server/client?http://0.0.0.0:8080', 'webpack/hot/only-dev-server', 'babel-polyfill', './index.js'
    ],
    output: {
        path: dist_path,
        filename: 'index.js'
    },
    module: {
        loaders: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
                query: {
                    presets: ['react'],
                    plugins: ['transform-es2015-destructuring', 'transform-es2015-parameters', 'transform-object-rest-spread', 'transform-es2015-modules-commonjs', 'react-hot-loader/babel']
                }
            }, {
                test: /\.css$/,
                loader: 'style-loader!css-loader'
            }, {
                test: /\.png$/,
                loader: 'url-loader?limit=100000'
            }, {
                test: /\.jpg$/,
                loader: 'file-loader'
            }, {
                test: /\.(woff|woff2)(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url-loader?limit=10000&mimetype=application/font-woff'
            }, {
                test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url-loader?limit=10000&mimetype=application/octet-stream'
            }, {
                test: /\.eot(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'file-loader'
            }, {
                test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
                loader: 'url-loader?limit=10000&mimetype=image/svg+xml'
            }, {
                test: /\.json$/,
                loader: 'json-loader'
            }, {
                test: /\.swf$/,
                loader: "file-loader?name=[path][name].[ext]"
            }, {
                test: require.resolve('snapsvg'),
                loader: 'imports-loader?this=>window,fix=>module.exports=0'
            },
        ]
    },
    plugins: [
        new webpack.ProvidePlugin({$: 'jquery', jQuery: 'jquery'}),
        new webpack.HotModuleReplacementPlugin(),
    ],
    devServer: {
        contentBase: dist_path,
        inline: false,
        hot: true,
        host: 'localhost', // originally 0.0.0.0
        before: function(app) {
            // Dynamic proxy for FluidNC HTTP API to avoid CORS.
            // Client sends:  /fluidnc-proxy/<host>:<port>/actual/path?query
            // Proxy forwards: http://<host>:<port>/actual/path?query
            app.use(function(req, res, next) {
                var prefix = '/fluidnc-proxy/';
                if (req.url.indexOf(prefix) !== 0) {
                    return next();
                }

                var afterPrefix = req.url.substring(prefix.length);
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
            });
        }
    },
    devtool: 'source-map'
};
