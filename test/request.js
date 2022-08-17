'use strict'
const t = require('tap')
const Request = require('../lib/request.js')
const stringToArrayBuffer = require('string-to-arraybuffer')
const Minipass = require('minipass')
const base = 'http://localhost:12345/'
const FormData = require('form-data')
const { AbortController } = require('abortcontroller-polyfill/dist/abortcontroller')
const Blob = require('../lib/blob.js')
const http = require('http')
const { URL } = require('url')

t.Test.prototype.addAssert('contain', 2, function (list, key, m, e) {
  m = m || 'expected item to be contained in list'
  e.found = list
  e.wanted = key
  return this.ok(list.indexOf(key) !== -1, m, e)
})
t.Test.prototype.addAssert('notContain', 2, function (list, key, m, e) {
  m = m || 'expected item to not be contained in list'
  e.found = list
  e.wanted = key
  return this.notOk(list.indexOf(key) !== -1, m, e)
})

t.test('should have attributes conforming to Web IDL', t => {
  const req = new Request({ href: 'https://github.com/' })
  t.equal(req.url, 'https://github.com/')
  t.equal(String(req), '[object Request]')
  const enumerableProperties = []
  for (const property in req) {
    enumerableProperties.push(property)
  }
  for (const toCheck of [
    'body', 'bodyUsed', 'arrayBuffer', 'blob', 'json', 'text',
    'method', 'url', 'headers', 'redirect', 'clone', 'signal',
  ]) {
    t.contain(enumerableProperties, toCheck)
  }
  for (const toCheck of [
    'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal',
  ]) {
    t.throws(() => req[toCheck] = 'abc')
  }
  t.end()
})

t.test('signal must be a signal', t => {
  t.throws(() => new Request('http://foo.com', { signal: {} }), TypeError)
  t.end()
})

t.test('should support wrapping Request instance', t => {
  const url = `${base}hello`

  const form = new FormData()
  form.append('a', '1')
  const { signal } = new AbortController()

  const r1 = new Request(url, {
    method: 'POST',
    follow: 1,
    body: form,
    signal,
    rejectUnauthorized: false,
  })
  const r2 = new Request(r1, {
    follow: 2,
  })

  t.equal(r2.url, url)
  t.equal(r2.method, 'POST')
  t.equal(r2.signal, signal)
  // note that we didn't clone the body
  t.equal(r2.body, form)
  t.equal(r1.follow, 1)
  t.equal(r2.follow, 2)
  t.equal(r1.counter, 0)
  t.equal(r2.counter, 0)
  t.same(Request.getNodeRequestOptions(r1), Request.getNodeRequestOptions(r2))
  t.end()
})

t.test('should override signal on derived Request instances', t => {
  const parentAbortController = new AbortController()
  const derivedAbortController = new AbortController()
  const parentRequest = new Request('http://localhost/test', {
    signal: parentAbortController.signal,
  })
  const derivedRequest = new Request(parentRequest, {
    signal: derivedAbortController.signal,
  })
  t.equal(parentRequest.signal, parentAbortController.signal)
  t.equal(derivedRequest.signal, derivedAbortController.signal)
  t.end()
})

t.test('should allow removing signal on derived Request instances', t => {
  const parentAbortController = new AbortController()
  const parentRequest = new Request('http://localhost/test', {
    signal: parentAbortController.signal,
  })
  const derivedRequest = new Request(parentRequest, {
    signal: null,
  })
  t.equal(parentRequest.signal, parentAbortController.signal)
  t.equal(derivedRequest.signal, null)
  t.end()
})

t.test('should throw error with GET/HEAD requests with body', t => {
  t.throws(() => new Request('http://localhost', { body: '' }), TypeError)
  t.throws(() => new Request('http://localhost', { body: 'a' }), TypeError)
  t.throws(() => new Request('http://localhost', { body: '', method: 'HEAD' }), TypeError)
  t.throws(() => new Request('http://localhost', { body: 'a', method: 'HEAD' }), TypeError)
  t.throws(() => new Request('http://localhost', { body: 'a', method: 'get' }), TypeError)
  t.throws(() => new Request('http://localhost', { body: 'a', method: 'head' }), TypeError)
  t.end()
})

t.test('should default to null as body', t => {
  const req = new Request(base)
  t.equal(req.body, null)
  return req.text().then(result => t.equal(result, ''))
})

t.test('should support parsing headers', t => {
  const url = base
  const req = new Request(url, {
    headers: {
      a: '1',
    },
  })
  t.equal(req.url, url)
  t.equal(req.headers.get('a'), '1')
  t.end()
})

t.test('should support arrayBuffer() method', async t => {
  const url = base
  var req = new Request(url, {
    method: 'POST',
    body: 'a=1',
  })
  t.equal(req.url, url)
  const result = await req.arrayBuffer()
  t.type(result, ArrayBuffer)
  const str = String.fromCharCode.apply(null, new Uint8Array(result))
  t.equal(str, 'a=1')
})

t.test('should support text() method', t => {
  const url = base
  const req = new Request(url, {
    method: 'POST',
    body: 'a=1',
  })
  t.equal(req.url, url)
  return req.text().then(result => t.equal(result, 'a=1'))
})

t.test('should support json() method', t => {
  const url = base
  const req = new Request(url, {
    method: 'POST',
    body: '{"a":1}',
  })
  t.equal(req.url, url)
  return req.json().then(result => t.equal(result.a, 1))
})

t.test('should support buffer() method', t => {
  const url = base
  const req = new Request(url, {
    method: 'POST',
    body: 'a=1',
  })
  t.equal(req.url, url)
  return req.buffer().then(result => t.equal(result.toString(), 'a=1'))
})

t.test('should support blob() method', async t => {
  const url = base
  var req = new Request(url, {
    method: 'POST',
    body: Buffer.from('a=1'),
  })
  t.equal(req.url, url)
  const result = await req.blob()
  t.type(result, Blob)
  t.equal(result.size, 3)
  t.equal(result.type, '')
})

t.test('should support clone() method', async t => {
  const url = base
  const r = new Minipass().end('a=1')
  r.pause()
  setTimeout(() => r.resume())
  const body = r.pipe(new Minipass())
  const agent = new http.Agent()
  const { signal } = new AbortController()
  const req = new Request(url, {
    body,
    method: 'POST',
    redirect: 'manual',
    headers: {
      b: '2',
    },
    follow: 3,
    compress: false,
    agent,
    signal,
  })
  const cl = req.clone()
  t.equal(cl.url, url)
  t.equal(cl.method, 'POST')
  t.equal(cl.redirect, 'manual')
  t.equal(cl.headers.get('b'), '2')
  t.equal(cl.follow, 3)
  t.equal(cl.compress, false)
  t.equal(cl.method, 'POST')
  t.equal(cl.counter, 0)
  t.equal(cl.agent, agent)
  t.equal(cl.signal, signal)
  // clone body shouldn't be the same body
  t.not(cl.body, body)
  const results = await Promise.all([cl.text(), req.text()])
  t.equal(results[0], 'a=1')
  t.equal(results[1], 'a=1')
})

t.test('should support ArrayBuffer as body', t => {
  const req = new Request('http://localhost', {
    method: 'POST',
    body: stringToArrayBuffer('a=1'),
  })
  return req.text().then(result => t.equal(result, 'a=1'))
})

t.test('should support Uint8Array as body', t => {
  const req = new Request('http://localhost', {
    method: 'POST',
    body: new Uint8Array(stringToArrayBuffer('a=1')),
  })
  return req.text().then(result => t.equal(result, 'a=1'))
})

t.test('should support DataView as body', t => {
  const req = new Request('http://localhost', {
    method: 'POST',
    body: new DataView(stringToArrayBuffer('a=1')),
  })
  return req.text().then(result => t.equal(result, 'a=1'))
})

t.test('should set rejectUnauthorized to true if NODE_TLS_REJECT_UNAUTHORIZED is not set', t => {
  const tlsRejectBefore = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = null
  const req = new Request('http://a.b')
  t.equal(Request.getNodeRequestOptions(req).rejectUnauthorized, true)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsRejectBefore
  t.end()
})

t.test('should set rejectUnauthorized to false if NODE_TLS_REJECT_UNAUTHORIZED is \'0\'', t => {
  const tlsRejectBefore = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  const req = new Request('http://a.b')
  t.equal(Request.getNodeRequestOptions(req).rejectUnauthorized, false)
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = tlsRejectBefore
  t.end()
})

t.test('get node request options', t => {
  t.match(Request.getNodeRequestOptions(new Request('http://a.b', {
    method: 'POST',
    headers: {
      accept: 'text/plain; q=1, *.*; q=0.8',
    },
    body: null,
    compress: true,
  })), {
    ...(new URL('http://a.b')),
    method: 'POST',
    headers: {
      'Content-Length': ['0'],
      'Accept-Encoding': ['gzip,deflate'],
      Connection: ['close'],
      'User-Agent': /^minipass-fetch\//,
    },
    agent: undefined,
  }, 'happy path')

  t.match(Request.getNodeRequestOptions(new Request('http://user:password@a.b')), {
    auth: 'user:password',
  }, 'sets both user and password')

  t.match(Request.getNodeRequestOptions(new Request('http://user:@a.b')), {
    auth: 'user:',
  }, 'sets just user')

  t.match(Request.getNodeRequestOptions(new Request('http://:password@a.b')), {
    auth: ':password',
  }, 'sets just password')

  t.match(Request.getNodeRequestOptions(new Request('http://a.b', {
    method: 'PATCH',
    headers: {
      accept: 'text/plain; q=1, *.*; q=0.8',
    },
    body: '123',
    compress: true,
  })), {
    ...(new URL('http://a.b')),
    method: 'PATCH',
    headers: {
      'Content-Length': ['3'],
      'Accept-Encoding': ['gzip,deflate'],
      Connection: ['close'],
      'User-Agent': /^minipass-fetch\//,
    },
    agent: undefined,
  }, 'happy path')

  t.match(Request.getNodeRequestOptions(new Request('http://a.b', {
    method: 'PATCH',
    headers: {
      accept: 'text/plain; q=1, *.*; q=0.8',
    },
    body: null,
    compress: true,
  })), {
    ...(new URL('http://a.b')),
    method: 'PATCH',
    headers: {
      'Content-Length': undefined,
      'Accept-Encoding': ['gzip,deflate'],
      Connection: ['close'],
      'User-Agent': /^minipass-fetch\//,
    },
    agent: undefined,
  }, 'happy path')

  t.match(Request.getNodeRequestOptions(new Request('http://x.y', {
    method: 'PATCH',
    headers: {
      'user-agent': 'abc',
      connection: 'whatevs',
    },
    body: 'xyz',
    compress: false,
  })), {
    path: '/',
    protocol: 'http:',
    hostname: 'x.y',
    method: 'PATCH',
    headers: {
      Accept: ['*/*'],
      'user-agent': ['abc'],
      connection: ['whatevs'],
      'Content-Length': ['3'],
    },
  })

  t.match(Request.getNodeRequestOptions(new Request('http://x.y', {
    method: 'PATCH',
    headers: {
      'user-agent': 'abc',
      connection: 'whatevs',
    },
    body: new Minipass().end('xyz'),
    compress: false,
  })), {
    path: '/',
    protocol: 'http:',
    hostname: 'x.y',
    method: 'PATCH',
    headers: {
      Accept: ['*/*'],
      'user-agent': ['abc'],
      connection: ['whatevs'],
      'Content-Length': undefined,
    },
  })

  t.match(Request.getNodeRequestOptions(new Request('http://x.y', {
    method: 'GET',
    family: 6,
  })), {
    path: '/',
    protocol: 'http:',
    hostname: 'x.y',
    method: 'GET',
    family: 6,
  })

  t.test('passes through search params', (t) => {
    const req = new Request('http://x.y?one=two&three=four')
    const options = Request.getNodeRequestOptions(req)
    t.match(options, {
      path: '/?one=two&three=four',
    })
    t.end()
  })

  t.test('function as agent', t => {
    let agentCalled = false
    const agent = () => {
      agentCalled = true
      return 420
    }

    Request.getNodeRequestOptions(new Request('http://a.b', { agent }), {
      method: 'GET',
      path: '/',
      protocol: 'http:',
      hostname: 'a.b',
      agent: 420,
    })

    t.equal(agentCalled, true)
    t.end()
  })

  t.throws(() => Request.getNodeRequestOptions(new Request('ok.html')), {
    code: 'ERR_INVALID_URL',
  })

  t.throws(() => Request.getNodeRequestOptions(new Request('xyz://ok.html')), {
    message: 'Only HTTP(S) protocols are supported',
  })

  t.throws(() => Request.getNodeRequestOptions(new Request('http://a.b', {
    method: 'POST',
    body: new (class extends Minipass {
      get destroy () {
        return undefined
      }
    })(),
    signal: new AbortController().signal,
  })), {
    message: 'Cancellation of streamed requests with AbortSignal is not supported',
  })

  t.end()
})
