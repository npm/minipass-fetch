const http = require('http')
const zlib = require('minizlib')
const { multipart: Multipart } = require('parted')
const convert = require('encoding').convert

class TestServer {
  constructor () {
    this.server = http.createServer((req, res) => this.router(req, res))
    this.port = 30000 + (+process.env.TAP_CHILD_ID || 1)
    this.hostname = 'localhost'
    // node 8 default keepalive timeout is 5000ms
    // make it shorter here as we want to close server
    // quickly at the end of tests
    this.server.keepAliveTimeout = 1000
    this.server.on('error', err => console.log(err.stack))
    this.server.on('connection', socket => socket.setTimeout(1500))
  }

  start (cb) {
    this.server.listen(this.port, this.hostname, cb)
  }

  stop (cb) {
    this.server.close(cb)
  }

  router (req, res) {
    const p = req.url

    if (p === '/hello') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end('world')
    }

    if (p === '/plain') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end('text')
    }

    if (p === '/options') {
      res.statusCode = 200
      res.setHeader('Allow', 'GET, HEAD, OPTIONS')
      res.end('hello world')
    }

    if (p === '/html') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end('<html></html>')
    }

    if (p === '/json') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ name: 'value' }))
    }

    if (p === '/gzip') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'gzip')
      // eslint-disable-next-line promise/catch-or-return
      new zlib.Gzip().end('hello world').concat().then(buf => res.end(buf))
    }

    if (p === '/gzip-truncated') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'gzip')
      // eslint-disable-next-line promise/catch-or-return
      new zlib.Gzip().end('hello world').concat().then(buf =>
        res.end(buf.slice(0, buf.length - 8)))
    }

    if (p === '/deflate') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'deflate')
      // eslint-disable-next-line promise/catch-or-return
      new zlib.Deflate().end('hello world').concat().then(buf => res.end(buf))
    }

    if (p === '/brotli') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'br')
      // pre-compressed 'hello world', in-lined here so tests will run when the
      // client doesn't support brotli
      const buf = Buffer.from([
        0x0b, 0x05, 0x80, 0x68, 0x65, 0x6c, 0x6c,
        0x6f, 0x20, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x03,
      ])
      res.end(buf)
    }

    if (p === '/deflate-raw') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'deflate')
      // eslint-disable-next-line promise/catch-or-return
      new zlib.DeflateRaw().end('hello world').concat().then(buf => res.end(buf))
    }

    if (p === '/sdch') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'sdch')
      res.end('fake sdch string')
    }

    if (p === '/invalid-content-encoding') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.setHeader('Content-Encoding', 'gzip')
      res.end('fake gzip string')
    }

    if (p === '/timeout') {
      setTimeout(() => {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('text')
      }, 1000)
    }

    if (p === '/slow') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.write('test')
      setTimeout(() => res.end('test'), 1000)
    }

    if (p === '/cookie') {
      res.statusCode = 200
      res.setHeader('Set-Cookie', ['a=1', 'b=1'])
      res.end('cookie')
    }

    if (p === '/size/chunk') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      setTimeout(() => res.write('test'), 10)
      setTimeout(() => res.end('test'), 20)
    }

    if (p === '/size/long') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain')
      res.end('testtest')
    }

    if (p === '/encoding/gbk') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end(convert('<meta charset="gbk"><div>中文</div>', 'gbk'))
    }

    if (p === '/encoding/gb2312') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end(convert('<meta http-equiv="Content-Type" content="text/html; charset=gb2312">' +
        '<div>中文</div>', 'gb2312'))
    }

    if (p === '/encoding/gb2312-reverse') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.end(convert('<meta content="text/html; charset=gb2312" http-equiv="Content-Type">' +
        '<div>中文</div>', 'gb2312'))
    }

    if (p === '/encoding/shift-jis') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html; charset=Shift-JIS')
      res.end(convert('<div>日本語</div>', 'Shift_JIS'))
    }

    if (p === '/encoding/euc-jp') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/xml')
      res.end(convert('<?xml version="1.0" encoding="EUC-JP"?><title>日本語</title>', 'EUC-JP'))
    }

    if (p === '/encoding/utf8') {
      res.statusCode = 200
      res.end('中文')
    }

    if (p === '/encoding/order1') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'charset=gbk; text/plain')
      res.end(convert('中文', 'gbk'))
    }

    if (p === '/encoding/order2') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/plain; charset=gbk; qs=1')
      res.end(convert('中文', 'gbk'))
    }

    if (p === '/encoding/chunked') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.setHeader('Transfer-Encoding', 'chunked')
      res.write('a'.repeat(10))
      res.end(convert('<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS" />' +
        '<div>日本語</div>', 'Shift_JIS'))
    }

    if (p === '/encoding/invalid') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/html')
      res.setHeader('Transfer-Encoding', 'chunked')
      res.write('a'.repeat(1200))
      res.end(convert('中文', 'gbk'))
    }

    if (p === '/redirect/301') {
      res.statusCode = 301
      res.setHeader('Location', '/inspect')
      res.end()
    }

    if (p === '/redirect/302') {
      res.statusCode = 302
      res.setHeader('Location', '/inspect')
      res.end()
    }

    if (p === '/redirect/303') {
      res.statusCode = 303
      res.setHeader('Location', '/inspect')
      res.end()
    }

    if (p === '/redirect/307') {
      res.statusCode = 307
      res.setHeader('Location', '/inspect')
      res.end()
    }

    if (p === '/redirect/308') {
      res.statusCode = 308
      res.setHeader('Location', '/inspect')
      res.end()
    }

    if (p === '/redirect/chain') {
      res.statusCode = 301
      res.setHeader('Location', '/redirect/301')
      res.end()
    }

    if (p === '/redirect/no-location') {
      res.statusCode = 301
      res.end()
    }

    if (p === '/redirect/slow') {
      res.statusCode = 301
      res.setHeader('Location', '/redirect/301')
      setTimeout(() => res.end(), 1000)
    }

    if (p === '/redirect/slow-chain') {
      res.statusCode = 301
      res.setHeader('Location', '/redirect/slow')
      setTimeout(() => res.end(), 10)
    }

    if (p === '/redirect/slow-stream') {
      res.statusCode = 301
      res.setHeader('Location', '/slow')
      res.end()
    }

    if (p === '/error/400') {
      res.statusCode = 400
      res.setHeader('Content-Type', 'text/plain')
      res.end('client error')
    }

    if (p === '/error/404') {
      res.statusCode = 404
      res.setHeader('Content-Encoding', 'gzip')
      res.end()
    }

    if (p === '/error/500') {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain')
      res.end('server error')
    }

    if (p === '/error/reset') {
      res.destroy()
    }

    if (p === '/error/json') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end('invalid json')
    }

    if (p === '/no-content') {
      res.statusCode = 204
      res.end()
    }

    if (p === '/no-content/gzip') {
      res.statusCode = 204
      res.setHeader('Content-Encoding', 'gzip')
      res.end()
    }

    if (p === '/no-content/brotli') {
      res.statusCode = 204
      res.setHeader('Content-Encoding', 'br')
      res.end()
    }

    if (p === '/not-modified') {
      res.statusCode = 304
      res.end()
    }

    if (p === '/not-modified/gzip') {
      res.statusCode = 304
      res.setHeader('Content-Encoding', 'gzip')
      res.end()
    }

    if (p === '/inspect') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => res.end(JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      })))
    }

    if (p === '/multipart') {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      // the path option passed to the Multipart constructor cannot be an
      // absolute path in Windows, we set it here manually because the default
      // provided by 'parsed' is an absolute path
      // ref: https://github.com/chjj/parsed/issues/10
      const parser = new Multipart(req.headers['content-type'], { path: './' })
      let body = ''
      parser.on('part', (field, part) => body += field + '=' + part)
      parser.on('end', () => res.end(JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body,
      })))
      req.pipe(parser)
    }

    if (p === '/trailers') {
      res.statusCode = 200
      res.setHeader('Transfer-Encoding', 'chunked')
      res.setHeader('Trailer', 'X-Node-Fetch')
      res.write('Body of the response')
      res.addTrailers({ 'X-Node-Fetch': 'hello world!' })
      res.end()
    }

    if (p === '/host-redirect') {
      if (req.headers.host !== `localhost:${this.port}`) {
        res.setHeader('location', `http://localhost:${this.port}/host-redirect`)
        res.statusCode = 302
      }
      res.end(`http://${req.headers.host}/host-redirect`)
    }
  }
}

module.exports = TestServer

if (require.main === module) {
  const server = new TestServer()
  server.start(() =>
    console.log(`Server started listening at port ${server.port}`))
}
