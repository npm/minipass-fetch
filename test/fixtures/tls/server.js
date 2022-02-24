const https = require('https')
const { readFileSync: read } = require('fs')
const { join } = require('path')
const ca = read(join(__dirname, '/minipass-CA.pem'))
const server = https.createServer({
  key: read(join(__dirname, '/localhost.key')),
  cert: read(join(__dirname, '/localhost.crt')),
}, (q, s) => {
  s.end('ok\n' + JSON.stringify(q.headers, 0, 2) + '\n')
  server.close()
})
server.listen(8443, () => {
  https.get({
    host: 'localhost',
    path: '/hello',
    port: 8443,
    ca,
  }, res => {
    console.error(res.statusCode, res.headers)
    res.pipe(process.stdout)
  })
})
