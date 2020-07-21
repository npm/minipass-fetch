const https = require('https')
const {readFileSync: read} = require('fs')
const ca = read(__dirname + '/minipass-CA.pem')
const server = https.createServer({
  key: read(__dirname + '/localhost.key'),
  cert: read(__dirname + '/localhost.crt'),
}, (q,s) => {
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
