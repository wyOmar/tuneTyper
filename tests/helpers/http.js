/**
 * Shared HTTP request helper for testing Express routes and servers
 */
const http = require('node:http');

/**
 * Execute an HTTP request against an Express app or running http.Server
 * @param {import('express').Application | import('node:http').Server} target
 * @param {string} urlPath
 * @param {object} [options]
 * @returns {Promise<{ statusCode: number, headers: object, body: string }>}
 */
function requestApp(target, urlPath, optionsOrHeaders = {}) {
    return new Promise((resolve, reject) => {
        let server = target;
        let isEphemeral = false;

        let method = 'GET';
        let headers = {};
        let body = undefined;

        if (optionsOrHeaders.headers || optionsOrHeaders.method || optionsOrHeaders.body || optionsOrHeaders.skipAppHeader) {
            method = optionsOrHeaders.method || 'GET';
            headers = Object.assign({}, optionsOrHeaders.headers || {});
            if (!optionsOrHeaders.skipAppHeader && !headers['x-requested-with'] && headers['x-requested-with'] !== null) {
                headers['x-requested-with'] = 'TuneTyper';
            }
            if (headers['x-requested-with'] === null) {
                delete headers['x-requested-with'];
            }
            body = optionsOrHeaders.body;
        } else {
            headers = Object.assign({ 'x-requested-with': 'TuneTyper' }, optionsOrHeaders);
        }

        const execute = (srv) => {
            const addr = srv.address();
            const port = typeof addr === 'object' && addr ? addr.port : 3000;
            const req = http.request(
                {
                    hostname: '127.0.0.1',
                    port,
                    path: urlPath,
                    method,
                    headers
                },
                (res) => {
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => {
                        if (isEphemeral) srv.close();
                        resolve({ statusCode: res.statusCode, headers: res.headers, body });
                    });
                }
            );
            req.on('error', (err) => {
                if (isEphemeral) srv.close();
                reject(err);
            });
            if (body) {
                req.write(typeof body === 'string' ? body : JSON.stringify(body));
            }
            req.end();
        };

        if (typeof target.listen === 'function' && (!target.address || !target.address())) {
            isEphemeral = true;
            server = target.listen(0, () => execute(server));
        } else {
            execute(server);
        }
    });
}

module.exports = { requestApp };
