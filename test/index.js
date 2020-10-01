'use strict'
const t = require('tap')
const TestServer = require('./fixtures/server.js')
const fetch = require('../lib/index.js')
const stringToArrayBuffer = require('string-to-arraybuffer')
const URLSearchParams_Polyfill = require('@ungap/url-search-params')
const { URL } = require('whatwg-url')
const { FetchError, Headers, Request, Response } = fetch
const FetchErrorOrig = require('../lib/fetch-error.js')
const HeadersOrig = require('../lib/headers.js')
const { createHeadersLenient } = HeadersOrig
const RequestOrig = require('../lib/request.js')
const ResponseOrig = require('../lib/response.js')
const Body = require('../lib/body.js')
const { getTotalBytes, extractContentType } = Body
const Blob = require('../lib/blob.js')
const zlib = require('minizlib')
const { lookup } = require('dns')
const supportToString = ({
  [Symbol.toStringTag]: 'z'
}).toString() === '[object z]'
const FormData = require('form-data')
const fs = require('fs')
const http = require('http')
const { parse: parseURL, URLSearchParams } = require('url')

const vm = require('vm')
const {
  ArrayBuffer: VMArrayBuffer,
  Uint8Array: VMUint8Array
} = vm.runInNewContext('this')

const { spawn } = require('child_process')
const path = require('path')

const Minipass = require('minipass')
const supportStreamDestroy = 'destroy' in Minipass.prototype

const { AbortController } = require('abortcontroller-polyfill/dist/abortcontroller')
const AbortController2 = require('abort-controller')

const local = new TestServer()
const base = `http://${local.hostname}:${local.port}/`

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

const streamToPromise = (stream, dataHandler) =>
  new Promise((resolve, reject) => {
    stream.on('data', (...args) =>
      Promise.resolve()
        .then(() => dataHandler(...args))
        .catch(reject))

    stream.on('end', resolve)
    stream.on('error', reject)
  })

t.test('start server', t => {
  local.start(t.end)
  t.parent.tearDown(() => local.stop())
})

t.test('return a promise', t => {
  const p = fetch(`${base}hello`)
  t.isa(p, Promise)
  t.equal(typeof p.then, 'function')
  t.end()
})

t.test('expose Headers, Response and Request constructors', t => {
  t.equal(FetchError, FetchErrorOrig)
  t.equal(Headers, HeadersOrig)
  t.equal(Response, ResponseOrig)
  t.equal(Request, RequestOrig)
  t.end()
})

t.test('support proper toString output', { skip: !supportToString }, t => {
  t.equal(new Headers().toString(), '[object Headers]')
  t.equal(new Response().toString(), '[object Response]')
  t.equal(new Request().toString(), '[object Request]')
  t.end()
})

t.test('reject with error if url is protocol relative', t =>
  t.rejects(fetch('//example.com/'), new TypeError(
    'Only absolute URLs are supported')))

t.test('reject if url is relative path', t =>
  t.rejects(fetch('/some/path'), new TypeError(
    'Only absolute URLs are supported')))

t.test('reject if protocol unsupported', t =>
  t.rejects(fetch('ftp://example.com/'), new TypeError(
    'Only HTTP(S) protocols are supported')))

t.test('reject with error on network failure', t =>
  t.rejects(fetch('http://localhost:50000/'), {
    name: 'FetchError',
    code: 'ECONNREFUSED',
    errno: 'ECONNREFUSED',
    type: 'system',
  }))

t.test('resolve into response', t =>
  fetch(`${base}hello`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => {
      t.equal(res.bodyUsed, true)
      t.equal(result, 'world')
    })
  }))

t.test('accept html response (like plain text)', t =>
  fetch(`${base}html`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/html')
    return res.text().then(result => {
      t.equal(res.bodyUsed, true)
      t.equal(result, '<html></html>')
    })
  }))

t.test('accept json response', t =>
  fetch(`${base}json`).then(res => {
    t.equal(res.headers.get('content-type'), 'application/json')
    return res.json().then(result => {
      t.equal(res.bodyUsed, true)
      t.strictSame(result, { name: 'value' })
    })
  }))

t.test('send request with custom hedaers', t =>
  fetch(`${base}inspect`, {
    headers: { 'x-custom-header': 'abc' }
  }).then(res => res.json()).then(res =>
    t.equal(res.headers['x-custom-header'], 'abc')))

t.test('accept headers instance', t =>
  fetch(`${base}inspect`, {
    headers: new Headers({ 'x-custom-header': 'abc' })
  }).then(res => res.json()).then(res =>
    t.equal(res.headers['x-custom-header'], 'abc')))

t.test('accept custom host header', t =>
  fetch(`${base}inspect`, {
    headers: {
      host: 'example.com'
    }
  }).then(res => res.json()).then(res =>
    t.equal(res.headers.host, 'example.com')))

t.test('accept custom HoSt header', t =>
  fetch(`${base}inspect`, {
    headers: {
      HoSt: 'example.com'
    }
  }).then(res => res.json()).then(res =>
    t.equal(res.headers.host, 'example.com')))

t.test('follow redirects', t => {
  const codes = [301, 302, 303, 307, 308, 'chain']
  t.plan(codes.length)
  codes.forEach(code => t.test(`${code}`, t =>
    fetch(`${base}redirect/${code}`).then(res => {
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      t.equal(res.ok, true)
    })))
})

t.test('follow POST request redirect with GET', t => {
  const codes = [301, 302]
  t.plan(codes.length)
  codes.forEach(code => t.test(`${code}`, t => {
    const url = `${base}redirect/${code}`
    const opts = {
      method: 'POST',
      body: 'a=1',
    }
    return fetch(url, opts).then(res => {
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      return res.json().then(result => {
        t.equal(result.method, 'GET')
        t.equal(result.body, '')
      })
    })
  }))
})

t.test('follow PATCH request redirect with PATCH', t => {
  const codes = [301, 302, 307]
  t.plan(codes.length)
  codes.forEach(code => t.test(`${code}`, t => {
    const url = `${base}redirect/${code}`
    const opts = {
      method: 'PATCH',
      body: 'a=1',
    }
    return fetch(url, opts).then(res => {
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      return res.json().then(result => {
        t.equal(result.method, 'PATCH')
        t.equal(result.body, 'a=1')
      })
    })
  }))
})

t.test('no follow non-GET redirect if body is readable stream', t => {
  const url = `${base}redirect/307`
  const body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => body.resume(), 100)
  const opts = {
    method: 'PATCH',
    body,
  }
  return t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'unsupported-redirect',
  })
})


t.test('obey maximum redirect, reject case', t => {
  const url = `${base}redirect/chain`
  const opts = {
    follow: 1
  }
  return t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'max-redirect',
  })
})

t.test('obey redirect chain, resolve case', t => {
  const url = `${base}redirect/chain`
  const opts = {
    follow: 2
  }
  return fetch(url, opts).then(res => {
    t.equal(res.url, `${base}inspect`)
    t.equal(res.status, 200)
  })
})


t.test('allow not following redirect', t => {
  const url = `${base}redirect/301`
  const opts = {
    follow: 0
  }
  return t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'max-redirect',
  })
})

t.test('redirect mode, manual flag', t => {
  const url = `${base}redirect/301`
  const opts = {
    redirect: 'manual'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.url, url)
    t.equal(res.status, 301)
    t.equal(res.headers.get('location'), `${base}inspect`)
  })
})


t.test('redirect mode, error flag', t => {
  const url = `${base}redirect/301`
  const opts = {
    redirect: 'error'
  }
  return t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'no-redirect',
  })
})


t.test('redirect mode, manual flag when there is no redirect', t => {
  const url = `${base}hello`
  const opts = {
    redirect: 'manual'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.url, url)
    t.equal(res.status, 200)
    t.equal(res.headers.get('location'), null)
  })
})

t.test('redirect code 301 and keep existing headers', t => {
  const url = `${base}redirect/301`
  const opts = {
    headers: new Headers({ 'x-custom-header': 'abc' })
  }
  return fetch(url, opts).then(res => {
    t.equal(res.url, `${base}inspect`)
    return res.json()
  }).then(res => t.equal(res.headers['x-custom-header'], 'abc'))
})


t.test('treat broken redirect as ordinary response (follow)', t => {
  const url = `${base}redirect/no-location`
  return fetch(url).then(res => {
    t.equal(res.url, url)
    t.equal(res.status, 301)
    t.equal(res.headers.get('location'), null)
  })
})


t.test('treat broken redirect as ordinary response (manual)', t => {
  const url = `${base}redirect/no-location`
  const opts = {
    redirect: 'manual'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.url, url)
    t.equal(res.status, 301)
    t.equal(res.headers.get('location'), null)
  })
})

t.test('set redirected property on response when redirect', t =>
  fetch(`${base}redirect/301`).then(res => t.equal(res.redirected, true)))

t.test('no redirected property on response when not redirect', t =>
  fetch(`${base}hello`).then(res => t.equal(res.redirected, false)))

t.test('ignore invalid headers', t => {
  var headers = {
    'Invalid-Header ': 'abc\r\n',
    'Invalid-Header-Value': '\x07k\r\n',
    'Set-Cookie': ['\x07k\r\n', '\x07kk\r\n']
  }
  headers = createHeadersLenient(headers)
  t.equal(headers['Invalid-Header '], undefined)
  t.equal(headers['Invalid-Header-Value'], undefined)
  t.equal(headers['Set-Cookie'], undefined)
  t.end()
})


t.test('handle client-error response', t => {
  const url = `${base}error/400`
  return fetch(url).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    t.equal(res.status, 400)
    t.equal(res.statusText, 'Bad Request')
    t.equal(res.ok, false)
    return res.text().then(result => {
      t.equal(res.bodyUsed, true)
      t.equal(result, 'client error')
    })
  })
})


t.test('handle server-error response', t => {
  const url = `${base}error/500`
  return fetch(url).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    t.equal(res.status, 500)
    t.equal(res.statusText, 'Internal Server Error')
    t.equal(res.ok, false)
    return res.text().then(result => {
      t.equal(res.bodyUsed, true)
      t.equal(result, 'server error')
    })
  })
})

t.test('handle network-error response', t =>
  t.rejects(fetch(`${base}error/reset`), {
    name: 'FetchError',
    code: 'ECONNRESET',
  }))

t.test('handle DNS-error response', t =>
  t.rejects(fetch('http://domain.invalid'), {
    name: 'FetchError',
    code: 'ENOTFOUND',
  }))

t.test('reject invalid json response', t =>
  fetch(`${base}error/json`).then(res => {
    t.equal(res.headers.get('content-type'), 'application/json')
    return t.rejects(res.json(), {
      name: 'FetchError',
      type: 'invalid-json',
    })
  }))

t.test('reject invalid json response', t =>
  fetch(`${base}error/json`).then(res => {
    t.equal(res.headers.get('content-type'), 'application/json')
    return t.rejects(res.json(), {
      name: 'FetchError',
      type: 'invalid-json',
    })
  }))

t.test('handle no content response', t =>
  fetch(`${base}no-content`).then(res => {
    t.equal(res.status, 204)
    t.equal(res.statusText, 'No Content')
    t.equal(res.ok, true)
    return res.text().then(result => t.equal(result, ''))
  }))

t.test('reject parsing no content response as json', t =>
  fetch(`${base}no-content`).then(res => {
    t.equal(res.status, 204)
    t.equal(res.statusText, 'No Content')
    t.equal(res.ok, true)
    return t.rejects(res.json(), {
      name: 'FetchError',
      type: 'invalid-json'
    })
  }))

t.test('handle no content response with gzip encoding', t =>
  fetch(`${base}no-content/gzip`).then(res => {
    t.equal(res.status, 204)
    t.equal(res.statusText, 'No Content')
    t.equal(res.headers.get('content-encoding'), 'gzip')
    t.equal(res.ok, true)
    return res.text().then(result => t.equal(result, ''))
  }))

t.test('handle not modified response', t =>
  fetch(`${base}not-modified`).then(res => {
    t.equal(res.status, 304)
    t.equal(res.statusText, 'Not Modified')
    t.equal(res.ok, false)
    return res.text().then(result => t.equal(result, ''))
  }))

t.test('handle not modified response with gzip encoding', t =>
  fetch(`${base}not-modified/gzip`).then(res => {
    t.equal(res.status, 304)
    t.equal(res.statusText, 'Not Modified')
    t.equal(res.headers.get('content-encoding'), 'gzip')
    t.equal(res.ok, false)
    return res.text().then(result => t.equal(result, ''))
  }))

t.test('decompress gzip response', t =>
  fetch(`${base}gzip`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

t.test('decompress slightly invalid gzip response', t =>
  fetch(`${base}gzip-truncated`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

t.test('decompress deflate response', t =>
  fetch(`${base}deflate`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

t.test('decompress deflate raw response from old apache server', t =>
  fetch(`${base}deflate-raw`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

t.test('decompress brotli response', t =>
  fetch(`${base}brotli`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

t.test('handle no content response with brotli encoding', t =>
  fetch(`${base}no-content/brotli`).then(res => {
    t.equal(res.status, 204)
    t.equal(res.statusText, 'No Content')
    t.equal(res.headers.get('content-encoding'), 'br')
    t.equal(res.ok, true)
    return res.text().then(result => t.equal(result, ''))
  }))

t.test('skip decompression if unsupported', t =>
  fetch(`${base}sdch`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'fake sdch string'))
  }))

t.test('reject if response compression is invalid', t =>
  fetch(`${base}invalid-content-encoding`).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return t.rejects(res.text(), {
      name: 'FetchError',
      code: 'Z_DATA_ERROR',
    })
  }))

t.test('handle errors on the body stream even if it is not used', t => {
  fetch(`${base}invalid-content-encoding`)
    .then(res => t.equal(res.status, 200))
    // Wait a few ms to see if a uncaught error occurs
    .then(() => setTimeout(() => t.end(), 20))
})

t.test('collect handled errors on body stream, reject if used later', t => {
  const delay = value => new Promise(resolve =>
    setTimeout(() => resolve(value), 20))

  return fetch(`${base}invalid-content-encoding`).then(delay).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    t.rejects(res.text(), {
      name: 'FetchError',
      code: 'Z_DATA_ERROR',
    })
  })
})

t.test('allow disabling auto decompression', t =>
  fetch(`${base}gzip`, { compress: false }).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.notEqual(result, 'hello world'))
  }))

t.test('do not overwrite accept-encoding when auto decompression', t =>
  fetch(`${base}inspect`, {
    compress: true,
    headers: {
      'Accept-Encoding': 'gzip'
    }
  })
  .then(res => res.json())
  .then(res => t.equal(res.headers['accept-encoding'], 'gzip')))

t.test('allow custom timeout', t => {
  return t.rejects(fetch(`${base}timeout`, {timeout: 20}), {
    name: 'FetchError',
    type: 'request-timeout',
  })
})

t.test('allow custom timeout on response body', t => {
  return fetch(`${base}slow`, { timeout: 50 }).then(res => {
    t.equal(res.ok, true)
    return t.rejects(res.text(), {
      name: 'FetchError',
      type: 'body-timeout',
    })
  })
})

t.test('allow custom timeout on redirected requests', t =>
  t.rejects(fetch(`${base}redirect/slow-chain`, { timeout: 50 }), {
    name: 'FetchError',
    type: 'request-timeout',
  }))

t.test('clear internal timeout on fetch response', { timeout: 2000 }, t => {
  const args = ['-e', `require('./')('${base}hello', { timeout: 10000 })`]
  spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.equal(code, 0)
      t.equal(signal, null)
      t.end()
    })
})

t.test('clear internal timeout on fetch redirect', {timeout: 2000}, t => {
  const args = ['-e', `require('./')('${base}redirect/301', { timeout: 10000 })`]
  spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.equal(code, 0)
      t.equal(signal, null)
      t.end()
    })
})

t.test('clear internal timeout on fetch error', { timeout: 2000 }, t => {
  const args = ['-e', `require('./')('${base}error/reset', { timeout: 10000 })`]
  spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.equal(code, 0)
      t.equal(signal, null)
      t.end()
    })
})

t.test('request cancellation with signal', { timeout: 500 }, t => {
  const controller = new AbortController()
  const controller2 = new AbortController2()

  const fetches = [
    fetch(`${base}timeout`, { signal: controller.signal }),
    fetch(`${base}timeout`, { signal: controller2.signal }),
    fetch(
      `${base}timeout`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          body: JSON.stringify({ hello: 'world' })
        }
      }
    )
  ]
  setTimeout(() => {
    controller.abort()
    controller2.abort()
  }, 100)

  return Promise.all(fetches.map(fetched => t.rejects(fetched, {
    name: 'AbortError',
    type: 'aborted',
  })))
})

t.test('reject immediately if signal already aborted', t => {
  const url = `${base}timeout`
  const controller = new AbortController()
  const opts = {
    signal: controller.signal
  }
  controller.abort()
  const fetched = fetch(url, opts)
  return t.rejects(fetched, {
    name: 'AbortError',
    type: 'aborted',
  })
})

t.test('clear internal timeout when cancelled with AbortSignal', { timeout: 2000 }, t => {
  const script = `
const ACP = require('abortcontroller-polyfill/dist/cjs-ponyfill')
var AbortController = ACP.AbortController
var controller = new AbortController()
require('./')(
'${base}timeout',
{ signal: controller.signal, timeout: 10000 }
)
setTimeout(function () { controller.abort(); }, 20)
  `
  spawn('node', ['-e', script], { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.equal(code, 0)
      t.equal(signal, null)
      t.end()
    })
})

t.test('remove internal AbortSignal listener when request aborted', t => {
  const controller = new AbortController()
  const { signal } = controller
  const promise = fetch(
    `${base}timeout`,
    { signal }
  )
  const result = t.rejects(promise, { name: 'AbortError' })
    .then(() => t.equal(signal.listeners.abort.length, 0))
  controller.abort()
  return result
})

t.test('allow redirects to be aborted', t => {
  const abortController = new AbortController()
  const request = new Request(`${base}redirect/slow`, {
    signal: abortController.signal
  })
  setTimeout(() => abortController.abort(), 20)
  return t.rejects(fetch(request), { name: 'AbortError' })
})

t.test('llow redirected response body to be aborted', t => {
  const abortController = new AbortController()
  const request = new Request(`${base}redirect/slow-stream`, {
    signal: abortController.signal
  })
  return t.rejects(fetch(request).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    const result = res.text()
    abortController.abort()
    return result
  }), { name: 'AbortError' })
})

t.test('remove internal AbortSignal listener when req/res complete', t => {
  const controller = new AbortController()
  const { signal } = controller
  const fetchHtml = fetch(`${base}html`, { signal })
    .then(res => res.text())
  const fetchResponseError = fetch(`${base}error/reset`, { signal })
  const fetchRedirect = fetch(`${base}redirect/301`, { signal })
    .then(res => res.json())
  return Promise.all([
    t.resolves(fetchHtml.then(result => t.equal(result, '<html></html>'))),
    t.rejects(fetchResponseError),
    t.resolves(fetchRedirect),
  ]).then(() => t.equal(signal.listeners.abort.length, 0))
})

t.test('reject body with AbortError when aborted before read completely', t => {
  const controller = new AbortController()
  return fetch(`${base}slow`, { signal: controller.signal }).then(res => {
    const promise = res.text()
    controller.abort()
    return t.rejects(promise, { name: 'AbortError' })
  })
})

t.test('reject body methods immediately with AbortError when aborted before disturbed', t => {
  const controller = new AbortController()
  return fetch(`${base}slow`, { signal: controller.signal })
    .then(res => {
      controller.abort()
      return t.rejects(res.text(), { name: 'AbortError' })
    })
})

t.test('raise AbortError when aborted before stream is closed', t => {
  const controller = new AbortController()
  fetch(`${base}slow`, { signal: controller.signal })
    .then(res => {
      res.body.on('error', (err) => {
        t.match(err, { name: 'AbortError', code: 'FETCH_ABORT' })
        t.end()
      })
      controller.abort()
    })
})

t.test('cancel request body stream with AbortError when aborted', {
  skip: supportStreamDestroy ? false : 'stream.destroy not supported'
}, t => {
  const controller = new AbortController()
  const body = new Minipass({ objectMode: true })
  const promise = fetch(`${base}slow`, {
    signal: controller.signal,
    body,
    method: 'POST'
  })

  const result = Promise.all([
    new Promise((resolve, reject) => {
      body.on('error', (error) => {
        t.match(error, {name: 'AbortError'})
        resolve()
      })
    }),
    t.rejects(promise, {name: 'AbortError'}),
  ])

  controller.abort()

  return result
})

t.test('immediately reject when attempting to cancel and unsupported', t => {
  const controller = new AbortController()
  const body = new (class extends Minipass {
    get destroy () { return undefined }
  })({ objectMode: true })

  return t.rejects(fetch(`${base}slow`, {
    signal: controller.signal,
    body,
    method: 'POST',
  }), { message: 'not supported' })
})

t.test('throw TypeError if a signal is not AbortSignal', t =>
  Promise.all([
    t.rejects(fetch(`${base}inspect`, { signal: {} }), {
      name: 'TypeError',
      message: /AbortSignal/,
    }),
    t.rejects(fetch(`${base}inspect`, { signal: '' }), {
      name: 'TypeError',
      message: /AbortSignal/,
    }),
    t.rejects(fetch(`${base}inspect`, { signal: Object.create(null) }), {
      name: 'TypeError',
      message: /AbortSignal/,
    }),
  ]))

t.test('set default User-Agent', t =>
  fetch(`${base}inspect`).then(res => res.json()).then(res =>
    t.match(res.headers['user-agent'], /^minipass-fetch/)))

t.test('setting User-Agent', t =>
  fetch(`${base}inspect`, {
    headers: {
      'user-agent': 'faked'
    }
  }).then(res => res.json()).then(res =>
    t.equal(res.headers['user-agent'], 'faked')))

t.test('set default Accept header', t =>
  fetch(`${base}inspect`).then(res => res.json()).then(res =>
    t.equal(res.headers.accept, '*/*')))

t.test('allow setting Accept header', t =>
  fetch(`${base}inspect`, {
    headers: {
      'accept': 'application/json'
    }
  }).then(res => res.json()).then(res =>
    t.equal(res.headers.accept, 'application/json')))

t.test('allow POST request', t =>
  fetch(`${base}inspect`, { method: 'POST' })
  .then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '0')
  }))

t.test('POST request with string body', t =>
  fetch(`${base}inspect`, {
    method: 'POST',
    body: 'a=1'
  }).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], 'text/plain;charset=UTF-8')
    t.equal(res.headers['content-length'], '3')
  }))

t.test('POST request with buffer body', t =>
  fetch(`${base}inspect`, {
    method: 'POST',
    body: Buffer.from('a=1', 'utf-8')
  }).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '3')
  }))

t.test('allow POST request with ArrayBuffer body', t =>
  fetch(`${base}inspect`, {
    method: 'POST',
    body: stringToArrayBuffer('Hello, world!\n')
  }).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'Hello, world!\n')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '14')
  }))

t.test('POST request with ArrayBuffer body from VM context', t => {
  Buffer.from(new VMArrayBuffer())
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new VMUint8Array(Buffer.from('Hello, world!\n')).buffer,
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'Hello, world!\n')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '14')
  })
})

t.test('POST request with ArrayBufferView (Uint8Array) body', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Uint8Array(stringToArrayBuffer('Hello, world!\n')),
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'Hello, world!\n')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '14')
  })
})

t.test('POST request with ArrayBufferView (DataView) body', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new DataView(stringToArrayBuffer('Hello, world!\n'))
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'Hello, world!\n')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '14')
  })
})

t.test('POST with ArrayBufferView (Uint8Array) body from a VM context', t => {
  Buffer.from(new VMArrayBuffer())
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new VMUint8Array(Buffer.from('Hello, world!\n'))
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'Hello, world!\n')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '14')
  })
})

t.test('POST with ArrayBufferView (Uint8Array, offset, length) body', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Uint8Array(stringToArrayBuffer('Hello, world!\n'), 7, 6)
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'world!')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '6')
  })
})

t.test('POST with blob body without type', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Blob(['a=1'])
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], '3')
  })
})

t.test('POST with blob body with type', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Blob(['a=1'], {
      type: 'text/plain;charset=UTF-8'
    })
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], 'text/plain;charset=utf-8')
    t.equal(res.headers['content-length'], '3')
  })
})

t.test('POST with readable stream as body', t => {
  let body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => {
    body.resume()
  }, 100)

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: body.pipe(new Minipass())
  }
  return fetch(url, opts).then(res => res.json()).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], 'chunked')
    t.equal(res.headers['content-type'], undefined)
    t.equal(res.headers['content-length'], undefined)
  })
})

t.test('POST with form-data as body', t => {
  const form = new FormData()
  form.append('a','1')

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.match(res.headers['content-type'], /^multipart\/form-data;boundary=/)
    t.match(res.headers['content-length'], String)
    t.equal(res.body, 'a=1')
  })
})

t.test('POST with form-data using stream as body', t => {
  const form = new FormData()
  form.append('my_field', fs.createReadStream(path.join(__dirname, 'fixtures/dummy.txt')))

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form
  }

  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.match(res.headers['content-type'], /^multipart\/form-data;boundary=/)
    t.equal(res.headers['content-length'], undefined)
    t.match(res.body, 'my_field=')
  })
})

t.test('POST with form-data as body and custom headers', t => {
  const form = new FormData()
  form.append('a','1')

  const headers = form.getHeaders()
  headers['b'] = '2'

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form,
    headers
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.match(res.headers['content-type'], /multipart\/form-data; boundary=/)
    t.match(res.headers['content-length'], String)
    t.equal(res.headers.b, '2')
    t.equal(res.body, 'a=1')
  })
})

t.test('POST with object body', t => {
  const url = `${base}inspect`
  // note that fetch simply calls tostring on an object
  const opts = {
    method: 'POST',
    body: { a: 1 }
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, '[object Object]')
    t.equal(res.headers['content-type'], 'text/plain;charset=UTF-8')
    t.equal(res.headers['content-length'], '15')
  })
})

const uspOpt = {
  skip: typeof URLSearchParams === 'function' ? false
    : 'no URLSearchParams function'
}

t.test('constructing a Response with URLSearchParams as body should have a Content-Type', uspOpt, t => {
  const params = new URLSearchParams()
  const res = new Response(params)
  res.headers.get('Content-Type')
  t.equal(res.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
})

t.test('constructing a Request with URLSearchParams as body should have a Content-Type', uspOpt, t => {
  const params = new URLSearchParams()
  const req = new Request(base, { method: 'POST', body: params })
  t.equal(req.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
})

t.test('Reading a body with URLSearchParams should echo back the result', uspOpt, t => {
  const params = new URLSearchParams()
  params.append('a','1')
  return new Response(params).text().then(text => {
    t.equal(text, 'a=1')
  })
})

// Body should been cloned...
t.test('constructing a Request/Response with URLSearchParams and mutating it should not affected body', uspOpt, t => {
  const params = new URLSearchParams()
  const req = new Request(`${base}inspect`, { method: 'POST', body: params })
  params.append('a','1')
  return req.text().then(text => {
    t.equal(text, '')
  })
})

t.test('POST with URLSearchParams as body', uspOpt, t => {
  const params = new URLSearchParams()
  params.append('a','1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
    t.equal(res.headers['content-length'], '3')
    t.equal(res.body, 'a=1')
  })
})

t.test('recognize URLSearchParams when extended', uspOpt, t => {
  class CustomSearchParams extends URLSearchParams {}
  const params = new CustomSearchParams()
  params.append('a','1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
    t.equal(res.headers['content-length'], '3')
    t.equal(res.body, 'a=1')
  })
})

/* for 100% code coverage, checks for duck-typing-only detection
 * where both constructor.name and brand tests fail */
t.test('recognize URLSearchParams when extended from polyfill', t => {
  class CustomPolyfilledSearchParams extends URLSearchParams_Polyfill {}
  const params = new CustomPolyfilledSearchParams()
  params.append('a','1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
    t.equal(res.headers['content-length'], '3')
    t.equal(res.body, 'a=1')
  })
})

t.test('overwrite Content-Length if possible', t => {
  const url = `${base}inspect`
  // note that fetch simply calls tostring on an object
  const opts = {
    method: 'POST',
    headers: {
      'Content-Length': '1000'
    },
    body: 'a=1'
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'POST')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-type'], 'text/plain;charset=UTF-8')
    t.equal(res.headers['content-length'], '3')
  })
})

t.test('PUT', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'PUT',
    body: 'a=1'
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'PUT')
    t.equal(res.body, 'a=1')
  })
})

t.test('DELETE', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'DELETE'
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'DELETE')
  })
})

t.test('DELETE with string body', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'DELETE',
    body: 'a=1'
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'DELETE')
    t.equal(res.body, 'a=1')
    t.equal(res.headers['transfer-encoding'], undefined)
    t.equal(res.headers['content-length'], '3')
  })
})

t.test('PATCH', t => {
  const url = `${base}inspect`
  const opts = {
    method: 'PATCH',
    body: 'a=1'
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.method, 'PATCH')
    t.equal(res.body, 'a=1')
  })
})

t.test('HEAD', t => {
  const url = `${base}hello`
  const opts = {
    method: 'HEAD'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.status, 200)
    t.equal(res.statusText, 'OK')
    t.equal(res.headers.get('content-type'), 'text/plain')
    t.match(res.body, Minipass)
    return res.text()
  }).then(text => {
    t.equal(text, '')
  })
})

t.test('HEAD with content-encoding header', t => {
  const url = `${base}error/404`
  const opts = {
    method: 'HEAD'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.status, 404)
    t.equal(res.headers.get('content-encoding'), 'gzip')
    return res.text()
  }).then(text => {
    t.equal(text, '')
  })
})

t.test('OPTIONS', t => {
  const url = `${base}options`
  const opts = {
    method: 'OPTIONS'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.status, 200)
    t.equal(res.statusText, 'OK')
    t.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS')
    t.match(res.body, Minipass)
  })
})

t.test('reject decoding body twice', t => {
  const url = `${base}plain`
  return fetch(url).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => {
      t.equal(res.bodyUsed, true)
      return t.rejects(res.text())
    })
  })
})

t.test('response trailers', t =>
  fetch(`${base}trailers`).then(res => {
    t.equal(res.status, 200)
    t.equal(res.statusText, 'OK')
    t.equal(res.headers.get('Trailer'), 'X-Node-Fetch')
    return res.trailer.then(trailers => {
      t.same(Array.from(trailers.keys()), ['x-node-fetch'])
      t.equal(trailers.get('x-node-fetch'), 'hello world!')
    })
  }))

t.test('maximum response size, multiple chunk', t => {
  const url = `${base}size/chunk`
  const opts = {
    size: 5
  }
  return fetch(url, opts).then(res => {
    t.equal(res.status, 200)
    t.equal(res.headers.get('content-type'), 'text/plain')
    return t.rejects(res.text(), {
      name: 'FetchError',
      type: 'max-size',
    })
  })
})

t.test('maximum response size, single chunk', t => {
  const url = `${base}size/long`
  const opts = {
    size: 5
  }
  return t.rejects(fetch(url, opts).then(res => {
    t.equal(res.status, 200)
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text()
  }), {
    name: 'FetchError',
    type: 'max-size',
  })
})

t.test('pipe response body as stream', t => {
  const url = `${base}hello`
  return fetch(url).then(res => {
    t.match(res.body, Minipass)
    return streamToPromise(res.body, chunk => {
      if (chunk === null) {
        return
      }
      t.equal(chunk.toString(), 'world')
    })
  })
})

t.test('clone a response, and use both as stream', t => {
  const url = `${base}hello`
  return fetch(url).then(res => {
    const r1 = res.clone()
    t.match(res.body, Minipass)
    t.match(r1.body, Minipass)
    const dataHandler = chunk => {
      if (chunk === null) {
        return
      }
      t.equal(chunk.toString(), 'world')
    }

    return Promise.all([
      streamToPromise(res.body, dataHandler),
      streamToPromise(r1.body, dataHandler)
    ])
  })
})

t.test('clone a json response and log it as text response', t => {
  const url = `${base}json`
  return fetch(url).then(res => {
    const r1 = res.clone()
    return Promise.all([res.json(), r1.text()]).then(results => {
      t.same(results[0], {name: 'value'})
      t.equal(results[1], '{"name":"value"}')
    })
  })
})

t.test('clone a json response, and then log it as text response', t => {
  const url = `${base}json`
  return fetch(url).then(res => {
    const r1 = res.clone()
    return res.json().then(result => {
      t.same(result, {name: 'value'})
      return r1.text().then(result => {
        t.equal(result, '{"name":"value"}')
      })
    })
  })
})

t.test('clone a json response, first log as text response, then return json object', t => {
  const url = `${base}json`
  return fetch(url).then(res => {
    const r1 = res.clone()
    return r1.text().then(result => {
      t.equal(result, '{"name":"value"}')
      return res.json().then(result => {
        t.same(result, {name: 'value'})
      })
    })
  })
})

t.test('do not allow cloning a response after its been used', t => {
  const url = `${base}hello`
  return fetch(url).then(res =>
    res.text().then(result => {
      t.throws(() => res.clone())
    })
  )
})

t.test('get all responses of a header', t => {
  const url = `${base}cookie`
  return fetch(url).then(res => {
    const expected = 'a=1, b=1'
    t.equal(res.headers.get('set-cookie'), expected)
    t.equal(res.headers.get('Set-Cookie'), expected)
  })
})

t.test('return all headers using raw()', t => {
  const url = `${base}cookie`
  return fetch(url).then(res => {
    const expected = [
      'a=1',
      'b=1'
    ]

    t.same(res.headers.raw()['set-cookie'], expected)
  })
})

t.test('delete header', t => {
  const url = `${base}cookie`
  return fetch(url).then(res => {
    res.headers.delete('set-cookie')
    t.equal(res.headers.get('set-cookie'), null)
  })
})

t.test('send request with connection keep-alive if agent is provided', t => {
  const url = `${base}inspect`
  const opts = {
    agent: new http.Agent({
      keepAlive: true
    })
  }
  return fetch(url, opts).then(res => {
    return res.json()
  }).then(res => {
    t.equal(res.headers['connection'], 'keep-alive')
  })
})

t.test('fetch with Request instance', t => {
  const url = `${base}hello`
  const req = new Request(url)
  return fetch(req).then(res => {
    t.equal(res.url, url)
    t.equal(res.ok, true)
    t.equal(res.status, 200)
  })
})

t.test('fetch with Node.js URL object', t => {
  const url = `${base}hello`
  const urlObj = parseURL(url)
  const req = new Request(urlObj)
  return fetch(req).then(res => {
    t.equal(res.url, url)
    t.equal(res.ok, true)
    t.equal(res.status, 200)
  })
})

t.test('fetch with WHATWG URL object', t => {
  const url = `${base}hello`
  const urlObj = new URL(url)
  const req = new Request(urlObj)
  return fetch(req).then(res => {
    t.equal(res.url, url)
    t.equal(res.ok, true)
    t.equal(res.status, 200)
  })
})

t.test('reading blob as text', t => {
  return new Response(`hello`)
    .blob()
    .then(blob => blob.text())
    .then(body => {
      t.equal(body, 'hello')
    })
})

t.test('reading blob as arrayBuffer', t => {
  return new Response(`hello`)
    .blob()
    .then(blob => blob.arrayBuffer())
    .then(ab => {
      const str = String.fromCharCode.apply(null, new Uint8Array(ab))
      t.equal(str, 'hello')
    })
})

t.test('reading blob as stream', t => {
  return new Response(`hello`)
    .blob()
    .then(blob => streamToPromise(blob.stream(), data => {
      const str = data.toString()
      t.equal(str, 'hello')
    }))
})

t.test('blob round-trip', t => {
  const url = `${base}hello`

  let length, type

  return fetch(url).then(res => res.blob()).then(blob => {
    const url = `${base}inspect`
    length = blob.size
    type = blob.type
    return fetch(url, {
      method: 'POST',
      body: blob
    })
  }).then(res => res.json()).then(({body, headers}) => {
    t.equal(body, 'world')
    t.equal(headers['content-type'], type)
    t.equal(headers['content-length'], String(length))
  })
})

t.test('overwrite Request instance', t => {
  const url = `${base}inspect`
  const req = new Request(url, {
    method: 'POST',
    headers: {
      a: '1'
    }
  })
  return fetch(req, {
    method: 'GET',
    headers: {
      a: '2'
    }
  }).then(res => {
    return res.json()
  }).then(body => {
    t.equal(body.method, 'GET')
    t.equal(body.headers.a, '2')
  })
})

t.test('arrayBuffer(), blob(), text(), json() and buffer() method in Body constructor', t => {
  const body = new Body('a=1')
  t.match(body.arrayBuffer, Function)
  t.match(body.blob, Function)
  t.match(body.text, Function)
  t.match(body.json, Function)
  t.match(body.buffer, Function)
  t.end()
})

t.test('https request', { timeout: 5000 }, t => {
  const url = 'https://github.com/'
  const opts = {
    method: 'HEAD'
  }
  return fetch(url, opts).then(res => {
    t.equal(res.status, 200)
    t.equal(res.ok, true)
  })
})

// issue #414
t.test('reject if attempt to accumulate body stream throws', t => {
  let body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => body.resume(), 100)
  const res = new Response(body.pipe(new Minipass()))
  const bufferConcat = Buffer.concat
  const restoreBufferConcat = () => Buffer.concat = bufferConcat
  Buffer.concat = () => { throw new Error('embedded error'); }

  const textPromise = res.text()
  // Ensure that `Buffer.concat` is always restored:
  textPromise.then(restoreBufferConcat, restoreBufferConcat)

  return t.rejects(textPromise, {
    name: 'FetchError',
    type: 'system',
    message: /embedded error/,
  })
})

t.test("supports supplying a lookup function to the agent", t => {
  const url = `${base}redirect/301`
  let called = 0
  function lookupSpy(hostname, options, callback) {
    called++
    return lookup(hostname, options, callback)
  }
  const agent = http.Agent({ lookup: lookupSpy })
  return fetch(url, { agent }).then(() => {
    t.equal(called, 2)
  })
})

t.test("supports supplying a famliy option to the agent", t => {
  const url = `${base}redirect/301`
  const families = []
  const family = Symbol('family')
  function lookupSpy(hostname, options, callback) {
    families.push(options.family)
    return lookup(hostname, {}, callback)
  }
  const agent = http.Agent({ lookup: lookupSpy, family })
  return fetch(url, { agent }).then(() => {
    t.same(families, [family, family])
  })
})

t.test('function supplying the agent', t => {
  const url = `${base}inspect`

  const agent = new http.Agent({
    keepAlive: true
  })

  let parsedURL

  return fetch(url, {
    agent: function(_parsedURL) {
      parsedURL = _parsedURL
      return agent
    }
  }).then(res => {
    return res.json()
  }).then(res => {
    // the agent provider should have been called
    t.equal(parsedURL.protocol, 'http:')
    // the agent we returned should have been used
    t.equal(res.headers['connection'], 'keep-alive')
  })
})

t.test('calculate content length and extract content type', t => {
  const url = `${base}hello`
  const bodyContent = 'a=1'

  let streamBody = new Minipass()
  streamBody.pause()
  streamBody.end(bodyContent)
  setTimeout(() => streamBody.resume(), 100)
  streamBody = streamBody.pipe(new Minipass())

  const streamRequest = new Request(url, {
    method: 'POST',
    body: streamBody,
    size: 1024
  })

  let blobBody = new Blob([bodyContent], { type: 'text/plain' })
  const blobRequest = new Request(url, {
    method: 'POST',
    body: blobBody,
    size: 1024
  })

  let formBody = new FormData()
  formBody.append('a', '1')
  const formRequest = new Request(url, {
    method: 'POST',
    body: formBody,
    size: 1024
  })

  let bufferBody = Buffer.from(bodyContent)
  const bufferRequest = new Request(url, {
    method: 'POST',
    body: bufferBody,
    size: 1024
  })

  const stringRequest = new Request(url, {
    method: 'POST',
    body: bodyContent,
    size: 1024
  })

  const nullRequest = new Request(url, {
    method: 'GET',
    body: null,
    size: 1024
  })

  t.equal(getTotalBytes(streamRequest), null)
  t.equal(getTotalBytes(blobRequest), blobBody.size)
  t.notEqual(getTotalBytes(formRequest), null)
  t.equal(getTotalBytes(bufferRequest), bufferBody.length)
  t.equal(getTotalBytes(stringRequest), bodyContent.length)
  t.equal(getTotalBytes(nullRequest), 0)

  t.equal(extractContentType(streamBody), null)
  t.equal(extractContentType(blobBody), 'text/plain')
  t.match(extractContentType(formBody), /^multipart\/form-data/)
  t.equal(extractContentType(bufferBody), null)
  t.equal(extractContentType(bodyContent), 'text/plain;charset=UTF-8')
  t.equal(extractContentType(null), null)
  t.end()
})

t.test('with optional `encoding`', t => {
  t.test('only use UTF-8 decoding with text()', t =>
    fetch(`${base}encoding/euc-jp`).then(res => {
      t.equal(res.status, 200)
      return res.text().then(result =>
        t.equal(result, '<?xml version="1.0" encoding="EUC-JP"?><title>\ufffd\ufffd\ufffd\u0738\ufffd</title>'))
    }))

  t.test('encoding decode, xml dtd detect', t =>
    fetch(`${base}encoding/euc-jp`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result =>
        t.equal(result, '<?xml version="1.0" encoding="EUC-JP"?><title>日本語</title>'))
    }))

  t.test('encoding decode, content-type detect', t =>
    fetch(`${base}encoding/shift-jis`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result =>
        t.equal(result, '<div>日本語</div>'))
    }))

  t.test('encoding decode, html5 detect', t =>
    fetch(`${base}encoding/gbk`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result =>
        t.equal(result, '<meta charset="gbk"><div>中文</div>'))
    }))

  t.test('encoding decode, html4 detect', t =>
    fetch(`${base}encoding/gb2312`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result => {
        t.equal(result, '<meta http-equiv="Content-Type" content="text/html; charset=gb2312"><div>中文</div>')
      })
    }))

  t.test('encoding decode, html4 detect reverse http-equiv', t =>
    fetch(`${base}encoding/gb2312-reverse`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result => {
        t.equal(result, '<meta content="text/html; charset=gb2312" http-equiv="Content-Type"><div>中文</div>')
      })
    }))

  t.test('default to utf8 encoding', t =>
    fetch(`${base}encoding/utf8`).then(res => {
      t.equal(res.status, 200)
      t.equal(res.headers.get('content-type'), null)
      return res.textConverted().then(result => {
        t.equal(result, '中文')
      })
    }))

  t.test('uncommon content-type order, charset in front', t =>
    fetch(`${base}encoding/order1`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result => {
        t.equal(result, '中文')
      })
    }))

  t.test('uncommon content-type order, end with qs', t =>
    fetch(`${base}encoding/order2`).then(res => {
      t.equal(res.status, 200)
      return res.textConverted().then(result => {
        t.equal(result, '中文')
      })
    }))

  t.test('chunked encoding, html4 detect', t => {
    const url = `${base}encoding/chunked`
    return fetch(url).then(res => {
      t.equal(res.status, 200)
      const padding = 'a'.repeat(10)
      return res.textConverted().then(result => {
        t.equal(result, `${padding}<meta http-equiv="Content-Type" content="text/html; charset=Shift_JIS" /><div>日本語</div>`)
      })
    })
  })

  t.test('only do encoding detection up to 1024 bytes', t => {
    const url = `${base}encoding/invalid`
    return fetch(url).then(res => {
      t.equal(res.status, 200)
      const padding = 'a'.repeat(1200)
      return res.textConverted().then(result => {
        t.notEqual(result, `${padding}中文`)
      })
    })
  })

  t.end()
})

t.test('data uri', t => {
  const dataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs='

  const invalidDataUrl = 'data:@@@@'

  t.test('accept data uri', t =>
    fetch(dataUrl).then(r => {
      t.equal(r.status, 200)
      t.equal(r.headers.get('Content-Type'), 'image/gif')
      return r.buffer().then(b => t.isa(b, Buffer))
    }))

  t.test('reject invalid data uri', t =>
    t.rejects(fetch(invalidDataUrl), {
      message: 'invalid URL',
    }))

  t.end()
})

t.test('redirect changes host header', t =>
  fetch(`http://127.0.0.1:${local.port}/host-redirect`, {
    redirect: 'follow',
    headers: { host: 'foo' },
  })
  .then(r => r.text())
  .then(text => t.equal(text, `${base}host-redirect`)))

t.test('never apply backpressure to the underlying response stream', t => {
  const http = require('http')
  const { request } = http
  t.teardown(() => http.request = request)
  http.request = (...args) => {
    const req = request(...args)
    const { emit } = req
    req.emit = (ev, ...args) => {
      if (ev === 'response') {
        const res = args[0]
        res.pause = () => {
          throw new Error('should not pause the response')
        }
      }
      return emit.call(req, ev, ...args)
    }
    return req
  }

  const dest = new Minipass()
  return fetch(`${base}hello`)
    .then(res => {
      // read it a bit later, so we'll see if any backpressure happens.
      setTimeout(() => dest.read())
      return res.body.pipe(dest).promise()
    })
})
