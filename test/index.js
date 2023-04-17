'use strict'
const t = require('tap')
const TestServer = require('./fixtures/server.js')
const fetch = require('../lib/index.js')
const stringToArrayBuffer = require('string-to-arraybuffer')
const URLSearchParamsPolyfill = require('@ungap/url-search-params')
const { AbortError, FetchError, Headers, Request, Response } = fetch
const AbortErrorOrig = require('../lib/abort-error.js')
const FetchErrorOrig = require('../lib/fetch-error.js')
const HeadersOrig = require('../lib/headers.js')
const { createHeadersLenient } = HeadersOrig
const RequestOrig = require('../lib/request.js')
const ResponseOrig = require('../lib/response.js')
const Body = require('../lib/body.js')
const { getTotalBytes, extractContentType } = Body
const Blob = require('../lib/blob.js')
const realZlib = require('zlib')
const { lookup } = require('dns')
const { promisify } = require('util')
const supportToString = ({
  [Symbol.toStringTag]: 'z',
}).toString() === '[object z]'
const FormData = require('form-data')
const fs = require('fs')
const http = require('http')
// use of url.parse here is intentional and for coverage purposes
// eslint-disable-next-line node/no-deprecated-api
const { parse: parseURL, URLSearchParams } = require('url')
const nock = require('nock')

const vm = require('vm')
const {
  ArrayBuffer: VMArrayBuffer,
  Uint8Array: VMUint8Array,
} = vm.runInNewContext('this')

const { spawn } = require('child_process')
const path = require('path')

const { Minipass } = require('minipass')
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
  t.parent.teardown(() => local.stop())
})

t.test('return a promise', t => {
  const p = fetch(`${base}hello`)
  t.type(p, Promise)
  t.equal(typeof p.then, 'function')
  t.end()
})

t.test('expose AbortError, FetchError, Headers, Response and Request constructors', t => {
  t.equal(AbortError, AbortErrorOrig)
  t.equal(FetchError, FetchErrorOrig)
  t.equal(Headers, HeadersOrig)
  t.equal(Response, ResponseOrig)
  t.equal(Request, RequestOrig)
  t.end()
})

t.test('support proper toString output', { skip: !supportToString }, t => {
  t.equal(new Headers().toString(), '[object Headers]')
  t.equal(new Response().toString(), '[object Response]')
  t.equal(new Request('http://localhost:30000').toString(), '[object Request]')
  t.end()
})

t.test('reject with error if url is protocol relative', t =>
  t.rejects(fetch('//example.com/'), {
    code: 'ERR_INVALID_URL',
    name: 'TypeError',
  }))

t.test('reject if url is relative path', t =>
  t.rejects(fetch('/some/path'), {
    code: 'ERR_INVALID_URL',
    name: 'TypeError',
  }))

t.test('reject if protocol unsupported', t =>
  t.rejects(fetch('ftp://example.com/'), new TypeError(
    'Only HTTP(S) protocols are supported')))

t.test('reject with error on network failure', t =>
  t.rejects(fetch('http://localhost:55555/'), {
    name: 'FetchError',
    code: 'ECONNREFUSED',
    errno: 'ECONNREFUSED',
    type: 'system',
  }))

t.test('resolve into response', async t => {
  const res = await fetch(`${base}hello`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(res.bodyUsed, true)
  t.equal(result, 'world')
})

t.test('accept html response (like plain text)', async t => {
  const res = await fetch(`${base}html`)
  t.equal(res.headers.get('content-type'), 'text/html')
  const result = await res.text()
  t.equal(res.bodyUsed, true)
  t.equal(result, '<html></html>')
})

t.test('accept json response', async t => {
  const res = await fetch(`${base}json`)
  t.equal(res.headers.get('content-type'), 'application/json')
  const result = await res.json()
  t.equal(res.bodyUsed, true)
  t.strictSame(result, { name: 'value' })
})

t.test('send request with custom hedaers', async t => {
  const res = await fetch(`${base}inspect`, {
    headers: { 'x-custom-header': 'abc' },
  })
  const json = await res.json()
  t.equal(json.headers['x-custom-header'], 'abc')
})

t.test('accept headers instance', async t => {
  const res = await fetch(`${base}inspect`, {
    headers: new Headers({ 'x-custom-header': 'abc' }),
  })
  const json = await res.json()
  t.equal(json.headers['x-custom-header'], 'abc')
})

t.test('accept custom host header', async t => {
  const res = await fetch(`${base}inspect`, {
    headers: {
      host: 'example.com',
    },
  })
  const json = await res.json()
  t.equal(json.headers.host, 'example.com')
})

t.test('accept custom HoSt header', async t => {
  const res = await fetch(`${base}inspect`, {
    headers: {
      HoSt: 'example.com',
    },
  })
  const json = await res.json()
  t.equal(json.headers.host, 'example.com')
})

t.test('follow redirects', async t => {
  const codes = [301, 302, 303, 307, 308, 'chain']
  t.plan(codes.length)
  for (const code of codes) {
    t.test(code, async t => {
      const res = await fetch(`${base}redirect/${code}`)
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      t.equal(res.ok, true)
    })
  }
})

t.test('redirect to different host strips headers', async (t) => {
  nock.disableNetConnect()
  t.teardown(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })

  const first = nock('http://x.y', {
    reqheaders: {
      authorization: 'totally-authed-request',
      cookie: 'fake-cookie',
    },
  })
    .get('/')
    .reply(301, null, { location: 'http://a.b' })

  const second = nock('http://a.b', {
    badheaders: ['authorization', 'cookie'],
  })
    .get('/')
    .reply(200)

  const res = await fetch('http://x.y', {
    headers: {
      authorization: 'totally-authed-request',
      cookie: 'fake-cookie',
    },
  })
  await res.text() // drain the response stream

  t.ok(first.isDone(), 'initial request made')
  t.ok(second.isDone(), 'redirect followed')
  t.equal(res.status, 200)
  t.ok(res.ok)
})

t.test('follow POST request redirect with GET', async t => {
  for (const code of [301, 302]) {
    t.test(code, async t => {
      const url = `${base}redirect/${code}`
      const opts = {
        method: 'POST',
        body: 'a=1',
      }
      const res = await fetch(url, opts)
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      const result = await res.json()
      t.equal(result.method, 'GET')
      t.equal(result.body, '')
    })
  }
})

t.test('follow PATCH request redirect with PATCH', async t => {
  const codes = [301, 302, 307]
  t.plan(codes.length)
  for (const code of codes) {
    t.test(code, async t => {
      const url = `${base}redirect/${code}`
      const opts = {
        method: 'PATCH',
        body: 'a=1',
      }
      const res = await fetch(url, opts)
      t.equal(res.url, `${base}inspect`)
      t.equal(res.status, 200)
      const result = await res.json()
      t.equal(result.method, 'PATCH')
      t.equal(result.body, 'a=1')
    })
  }
})

t.test('no follow non-GET redirect if body is readable stream', async t => {
  const url = `${base}redirect/307`
  const body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => body.resume(), 100)
  const opts = {
    method: 'PATCH',
    body,
  }
  await t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'unsupported-redirect',
  })
})

t.test('obey maximum redirect, reject case', async t => {
  const url = `${base}redirect/chain`
  const opts = {
    follow: 1,
  }
  await t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'max-redirect',
  })
})

t.test('obey redirect chain, resolve case', async t => {
  const url = `${base}redirect/chain`
  const opts = {
    follow: 2,
  }
  const res = await fetch(url, opts)
  t.equal(res.url, `${base}inspect`)
  t.equal(res.status, 200)
})

t.test('allow not following redirect', async t => {
  const url = `${base}redirect/301`
  const opts = {
    follow: 0,
  }
  await t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'max-redirect',
  })
})

t.test('redirect mode, manual flag', async t => {
  const url = `${base}redirect/301`
  const opts = {
    redirect: 'manual',
  }
  const res = await fetch(url, opts)
  t.equal(res.url, url)
  t.equal(res.status, 301)
  t.equal(res.headers.get('location'), `${base}inspect`)
})

t.test('redirect mode, error flag', async t => {
  const url = `${base}redirect/301`
  const opts = {
    redirect: 'error',
  }
  await t.rejects(fetch(url, opts), {
    name: 'FetchError',
    type: 'no-redirect',
  })
})

t.test('redirect mode, manual flag when there is no redirect', async t => {
  const url = `${base}hello`
  const opts = {
    redirect: 'manual',
  }
  const res = await fetch(url, opts)
  t.equal(res.url, url)
  t.equal(res.status, 200)
  t.equal(res.headers.get('location'), null)
})

t.test('redirect code 301 and keep existing headers', async t => {
  const url = `${base}redirect/301`
  const opts = {
    headers: new Headers({ 'x-custom-header': 'abc' }),
  }
  const res = await fetch(url, opts)
  t.equal(res.url, `${base}inspect`)
  const json = await res.json()
  t.equal(json.headers['x-custom-header'], 'abc')
})

t.test('treat broken redirect as ordinary response (follow)', async t => {
  const url = `${base}redirect/no-location`
  const res = await fetch(url)
  t.equal(res.url, url)
  t.equal(res.status, 301)
  t.equal(res.headers.get('location'), null)
})

t.test('treat broken redirect as ordinary response (manual)', async t => {
  const url = `${base}redirect/no-location`
  const opts = {
    redirect: 'manual',
  }
  const res = await fetch(url, opts)
  t.equal(res.url, url)
  t.equal(res.status, 301)
  t.equal(res.headers.get('location'), null)
})

t.test('should process an invalid redirect (manual)', async t => {
  const url = `${base}redirect/301/invalid`
  const options = {
    redirect: 'manual',
  }
  const res = await fetch(url, options)
  t.equal(res.url, url)
  t.equal(res.status, 301)
  t.equal(res.headers.get('location'), '//super:invalid:url%/')
})

t.test('should throw an error on invalid redirect url', async t => {
  const url = `${base}redirect/301/invalid`
  await t.rejects(fetch(url), {
    name: 'FetchError',
    message: 'uri requested responds with an invalid redirect URL: //super:invalid:url%/',
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
    'Set-Cookie': ['\x07k\r\n', '\x07kk\r\n'],
  }
  headers = createHeadersLenient(headers)
  t.equal(headers['Invalid-Header '], undefined)
  t.equal(headers['Invalid-Header-Value'], undefined)
  t.equal(headers['Set-Cookie'], undefined)
  t.end()
})

t.test('handle client-error response', async t => {
  const url = `${base}error/400`
  const res = await fetch(url)
  t.equal(res.headers.get('content-type'), 'text/plain')
  t.equal(res.status, 400)
  t.equal(res.statusText, 'Bad Request')
  t.equal(res.ok, false)
  const result = await res.text()
  t.equal(res.bodyUsed, true)
  t.equal(result, 'client error')
})

t.test('handle server-error response', async t => {
  const url = `${base}error/500`
  const res = await fetch(url)
  t.equal(res.headers.get('content-type'), 'text/plain')
  t.equal(res.status, 500)
  t.equal(res.statusText, 'Internal Server Error')
  t.equal(res.ok, false)
  const result = await res.text()
  t.equal(res.bodyUsed, true)
  t.equal(result, 'server error')
})

t.test('handle network-error response', async t => {
  await t.rejects(fetch(`${base}error/reset`), {
    name: 'FetchError',
    code: 'ECONNRESET',
  })
})

t.test('handle DNS-error response', async t => {
  await t.rejects(fetch('http://domain.invalid'), {
    name: 'FetchError',
    // this error depends on the platform and dns server in use,
    // but it should be one of these two codes
    code: /^(ENOTFOUND|EAI_AGAIN)$/,
  })
})

t.test('reject invalid json response', async t => {
  const res = await fetch(`${base}error/json`)
  t.equal(res.headers.get('content-type'), 'application/json')
  await t.rejects(res.json(), {
    name: 'FetchError',
    type: 'invalid-json',
  })
})

t.test('reject invalid json response', async t => {
  const res = await fetch(`${base}error/json`)
  t.equal(res.headers.get('content-type'), 'application/json')
  await t.rejects(res.json(), {
    name: 'FetchError',
    type: 'invalid-json',
  })
})

t.test('handle no content response', async t => {
  const res = await fetch(`${base}no-content`)
  t.equal(res.status, 204)
  t.equal(res.statusText, 'No Content')
  t.equal(res.ok, true)
  const result = await res.text()
  t.equal(result, '')
})

t.test('reject parsing no content response as json', async t => {
  const res = await fetch(`${base}no-content`)
  t.equal(res.status, 204)
  t.equal(res.statusText, 'No Content')
  t.equal(res.ok, true)
  await t.rejects(res.json(), {
    name: 'FetchError',
    type: 'invalid-json',
  })
})

t.test('handle no content response with gzip encoding', async t => {
  const res = await fetch(`${base}no-content/gzip`)
  t.equal(res.status, 204)
  t.equal(res.statusText, 'No Content')
  t.equal(res.headers.get('content-encoding'), 'gzip')
  t.equal(res.ok, true)
  const result = await res.text()
  t.equal(result, '')
})

t.test('handle not modified response', async t => {
  const res = await fetch(`${base}not-modified`)
  t.equal(res.status, 304)
  t.equal(res.statusText, 'Not Modified')
  t.equal(res.ok, false)
  const result = await res.text()
  t.equal(result, '')
})

t.test('handle not modified response with gzip encoding', async t => {
  const res = await fetch(`${base}not-modified/gzip`)
  t.equal(res.status, 304)
  t.equal(res.statusText, 'Not Modified')
  t.equal(res.headers.get('content-encoding'), 'gzip')
  t.equal(res.ok, false)
  const result = await res.text()
  t.equal(result, '')
})

t.test('decompress gzip response', async t => {
  const res = await fetch(`${base}gzip`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'hello world')
})

t.test('decompress slightly invalid gzip response', async t => {
  const res = await fetch(`${base}gzip-truncated`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'hello world')
})

t.test('decompress deflate response', async t => {
  const res = await fetch(`${base}deflate`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'hello world')
})

t.test('decompress deflate raw response from old apache server', async t => {
  const res = await fetch(`${base}deflate-raw`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'hello world')
})

t.test('decompress brotli response', async t => {
  // if the node core zlib doesn't export brotli functions, we'll end up
  // rejecting the request with an error that comes from minizlib, assert
  // that here
  if (typeof realZlib.BrotliCompress !== 'function') {
    return t.rejects(fetch(`${base}brotli`), {
      message: 'Brotli is not supported in this version of Node.js',
    }, 'rejects the promise')
  }

  const res = await fetch(`${base}brotli`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'hello world')
})

t.test('handle no content response with brotli encoding', async t => {
  const res = await fetch(`${base}no-content/brotli`)
  t.equal(res.status, 204)
  t.equal(res.statusText, 'No Content')
  t.equal(res.headers.get('content-encoding'), 'br')
  t.equal(res.ok, true)
  const result = await res.text()
  t.equal(result, '')
})

t.test('skip decompression if unsupported', async t => {
  const res = await fetch(`${base}sdch`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  const result = await res.text()
  t.equal(result, 'fake sdch string')
})

t.test('reject if response compression is invalid', async t => {
  const res = await fetch(`${base}invalid-content-encoding`)
  t.equal(res.headers.get('content-type'), 'text/plain')
  await t.rejects(res.text(), {
    name: 'FetchError',
    code: 'Z_DATA_ERROR',
  })
})

t.test('handle errors on the body stream even if it is not used', async t => {
  const res = await fetch(`${base}invalid-content-encoding`)
  t.equal(res.status, 200)
  // Wait a few ms to see if a uncaught error occurs
  await promisify(setTimeout)(20)
})

t.test('collect handled errors on body stream, reject if used later', async t => {
  const delay = value => new Promise(resolve =>
    setTimeout(() => resolve(value), 20))

  const res = await fetch(`${base}invalid-content-encoding`).then(delay)
  const delayed = await delay(res)
  t.equal(delayed.headers.get('content-type'), 'text/plain')
  t.rejects(delayed.text(), {
    name: 'FetchError',
    code: 'Z_DATA_ERROR',
  })
})

t.test('allow disabling auto decompression', t =>
  fetch(`${base}gzip`, { compress: false }).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.not(result, 'hello world'))
  }))

t.test('do not overwrite accept-encoding when auto decompression', t =>
  fetch(`${base}inspect`, {
    compress: true,
    headers: {
      'Accept-Encoding': 'gzip',
    },
  })
    .then(res => res.json())
    .then(res => t.equal(res.headers['accept-encoding'], 'gzip')))

t.test('allow custom timeout', t => {
  return t.rejects(fetch(`${base}timeout`, { timeout: 20 }), {
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

t.test('clear internal timeout on fetch redirect', { timeout: 2000 }, t => {
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
  // note: promise rejections started setting exit status code in node 15
  const stderr = []
  spawn(process.execPath, args, { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.match(Buffer.concat(stderr).toString(), 'FetchError')
      t.equal(signal, null)
      t.end()
    })
    .stderr.on('data', c => stderr.push(c))
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
          body: JSON.stringify({ hello: 'world' }),
        },
      }
    ),
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
    signal: controller.signal,
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
  // note: promise rejections started setting exit status code in node 15
  const stderr = []
  spawn('node', ['-e', script], { cwd: path.resolve(__dirname, '..') })
    .on('close', (code, signal) => {
      t.match(Buffer.concat(stderr).toString(), 'AbortError')
      t.equal(signal, null)
      t.end()
    })
    .stderr.on('data', c => stderr.push(c))
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
    signal: abortController.signal,
  })
  setTimeout(() => abortController.abort(), 20)
  return t.rejects(fetch(request), { name: 'AbortError' })
})

t.test('allow redirected response body to be aborted', t => {
  const abortController = new AbortController()
  const request = new Request(`${base}redirect/slow-stream`, {
    signal: abortController.signal,
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

t.test('raise AbortError when aborted before stream is closed', async t => {
  t.plan(1)
  const controller = new AbortController()
  const res = await fetch(`${base}slow`, { signal: controller.signal })
  res.body.once('error', (err) => {
    t.match(err, { name: 'AbortError', code: 'FETCH_ABORT' })
  })
  controller.abort()
})

t.test('cancel request body stream with AbortError when aborted', {
  skip: supportStreamDestroy ? false : 'stream.destroy not supported',
}, t => {
  const controller = new AbortController()
  const body = new Minipass({ objectMode: true })
  const promise = fetch(`${base}slow`, {
    signal: controller.signal,
    body,
    method: 'POST',
  })

  const result = Promise.all([
    new Promise((resolve, reject) => {
      body.on('error', (error) => {
        t.match(error, { name: 'AbortError' })
        resolve()
      })
    }),
    t.rejects(promise, { name: 'AbortError' }),
  ])

  controller.abort()

  return result
})

t.test('immediately reject when attempting to cancel and unsupported', async t => {
  const controller = new AbortController()
  const body = new (class extends Minipass {
    get destroy () {
      return undefined
    }
  })({ objectMode: true })

  await t.rejects(fetch(`${base}slow`, {
    signal: controller.signal,
    body,
    method: 'POST',
  }), { message: 'not supported' })
})

t.test('throw TypeError if a signal is not AbortSignal', async t => {
  await t.rejects(fetch(`${base}inspect`, { signal: {} }), {
    name: 'TypeError',
    message: /AbortSignal/,
  })
  await t.rejects(fetch(`${base}inspect`, { signal: '' }), {
    name: 'TypeError',
    message: /AbortSignal/,
  })
  await t.rejects(fetch(`${base}inspect`, { signal: Object.create(null) }), {
    name: 'TypeError',
    message: /AbortSignal/,
  })
})

t.test('set default User-Agent', async t => {
  const res = await fetch(`${base}inspect`)
  const json = await res.json()
  t.match(json.headers['user-agent'], /^minipass-fetch/)
})

t.test('setting User-Agent', t =>
  fetch(`${base}inspect`, {
    headers: {
      'user-agent': 'faked',
    },
  }).then(res => res.json()).then(res =>
    t.equal(res.headers['user-agent'], 'faked')))

t.test('set default Accept header', async t => {
  const res = await fetch(`${base}inspect`)
  const json = await res.json()
  t.equal(json.headers.accept, '*/*')
})

t.test('allow setting Accept header', async t => {
  const res = await fetch(`${base}inspect`, {
    headers: {
      accept: 'application/json',
    },
  })
  const json = await res.json()
  t.equal(json.headers.accept, 'application/json')
})

t.test('allow POST request', async t => {
  const res = await fetch(`${base}inspect`, { method: 'POST' })
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '0')
})

t.test('POST request with string body', async t => {
  const res = await fetch(`${base}inspect`, {
    method: 'POST',
    body: 'a=1',
  })
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], 'text/plain;charset=UTF-8')
  t.equal(json.headers['content-length'], '3')
})

t.test('POST request with buffer body', async t => {
  const res = await fetch(`${base}inspect`, {
    method: 'POST',
    body: Buffer.from('a=1', 'utf-8'),
  })
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '3')
})

t.test('allow POST request with ArrayBuffer body', async t => {
  const res = await fetch(`${base}inspect`, {
    method: 'POST',
    body: stringToArrayBuffer('Hello, world!\n'),
  })
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'Hello, world!\n')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '14')
})

t.test('POST request with ArrayBuffer body from VM context', async t => {
  Buffer.from(new VMArrayBuffer())
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new VMUint8Array(Buffer.from('Hello, world!\n')).buffer,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'Hello, world!\n')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '14')
})

t.test('POST request with ArrayBufferView (Uint8Array) body', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Uint8Array(stringToArrayBuffer('Hello, world!\n')),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'Hello, world!\n')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '14')
})

t.test('POST request with ArrayBufferView (DataView) body', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new DataView(stringToArrayBuffer('Hello, world!\n')),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'Hello, world!\n')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '14')
})

t.test('POST with ArrayBufferView (Uint8Array) body from a VM context', async t => {
  Buffer.from(new VMArrayBuffer())
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new VMUint8Array(Buffer.from('Hello, world!\n')),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'Hello, world!\n')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '14')
})

t.test('POST with ArrayBufferView (Uint8Array, offset, length) body', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Uint8Array(stringToArrayBuffer('Hello, world!\n'), 7, 6),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'world!')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '6')
})

t.test('POST with blob body without type', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Blob(['a=1']),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], '3')
})

t.test('POST with blob body with type', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: new Blob(['a=1'], {
      type: 'text/plain;charset=UTF-8',
    }),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], 'text/plain;charset=utf-8')
  t.equal(json.headers['content-length'], '3')
})

t.test('POST with readable stream as body', async t => {
  const body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => {
    body.resume()
  }, 100)

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: body.pipe(new Minipass()),
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], 'chunked')
  t.equal(json.headers['content-type'], undefined)
  t.equal(json.headers['content-length'], undefined)
})

t.test('POST with form-data as body', async t => {
  const form = new FormData()
  form.append('a', '1')

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.match(json.headers['content-type'], /^multipart\/form-data;boundary=/)
  t.match(json.headers['content-length'], String)
  t.equal(json.body, 'a=1')
})

t.test('POST with form-data using stream as body', async t => {
  t.teardown(() => {
    const root = path.dirname(__dirname)
    // parted's multipart form parser writes a temporary file to disk, this removes it
    fs.readdirSync(root).filter((file) => {
      return file.startsWith('dummy.') && file.endsWith('.txt')
    }).forEach((file) => {
      fs.unlinkSync(path.join(root, file))
    })
  })
  const form = new FormData()
  form.append('my_field', fs.createReadStream(path.join(__dirname, 'fixtures/dummy.txt')))

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form,
  }

  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.match(json.headers['content-type'], /^multipart\/form-data;boundary=/)
  t.equal(json.headers['content-length'], undefined)
  t.match(json.body, 'my_field=')
})

t.test('POST with form-data as body and custom headers', async t => {
  const form = new FormData()
  form.append('a', '1')

  const headers = form.getHeaders()
  headers.b = '2'

  const url = `${base}multipart`
  const opts = {
    method: 'POST',
    body: form,
    headers,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.match(json.headers['content-type'], /multipart\/form-data; boundary=/)
  t.match(json.headers['content-length'], String)
  t.equal(json.headers.b, '2')
  t.equal(json.body, 'a=1')
})

t.test('POST with object body', async t => {
  const url = `${base}inspect`
  // note that fetch simply calls tostring on an object
  const opts = {
    method: 'POST',
    body: { a: 1 },
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, '[object Object]')
  t.equal(json.headers['content-type'], 'text/plain;charset=UTF-8')
  t.equal(json.headers['content-length'], '15')
})

const uspOpt = {
  skip: typeof URLSearchParams === 'function' ? false
  : 'no URLSearchParams function',
}

t.test('constructing a Response with URLSearchParams as body has a Content-Type', uspOpt, t => {
  const params = new URLSearchParams()
  const res = new Response(params)
  res.headers.get('Content-Type')
  t.equal(res.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
})

t.test('constructing a Request with URLSearchParams as body has a Content-Type', uspOpt, t => {
  const params = new URLSearchParams()
  const req = new Request(base, { method: 'POST', body: params })
  t.equal(req.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
})

t.test('Reading a body with URLSearchParams should echo back the result', uspOpt, async t => {
  const params = new URLSearchParams()
  params.append('a', '1')
  const text = await new Response(params).text()
  t.equal(text, 'a=1')
})

// Body should been cloned...
// eslint-disable-next-line max-len
t.test('Request/Response with URLSearchParams and mutation should not affected body', uspOpt, async t => {
  const params = new URLSearchParams()
  const req = new Request(`${base}inspect`, { method: 'POST', body: params })
  params.append('a', '1')
  const text = await req.text()
  t.equal(text, '')
})

t.test('POST with URLSearchParams as body', uspOpt, async t => {
  const params = new URLSearchParams()
  params.append('a', '1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
  t.equal(json.headers['content-length'], '3')
  t.equal(json.body, 'a=1')
})

t.test('recognize URLSearchParams when extended', uspOpt, async t => {
  class CustomSearchParams extends URLSearchParams {}
  const params = new CustomSearchParams()
  params.append('a', '1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
  t.equal(json.headers['content-length'], '3')
  t.equal(json.body, 'a=1')
})

/* for 100% code coverage, checks for duck-typing-only detection
 * where both constructor.name and brand tests fail */
t.test('recognize URLSearchParams when extended from polyfill', async t => {
  class CustomPolyfilledSearchParams extends URLSearchParamsPolyfill {}
  const params = new CustomPolyfilledSearchParams()
  params.append('a', '1')

  const url = `${base}inspect`
  const opts = {
    method: 'POST',
    body: params,
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
  t.equal(json.headers['content-length'], '3')
  t.equal(json.body, 'a=1')
})

t.test('overwrite Content-Length if possible', async t => {
  const url = `${base}inspect`
  // note that fetch simply calls tostring on an object
  const opts = {
    method: 'POST',
    headers: {
      'Content-Length': '1000',
    },
    body: 'a=1',
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'POST')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-type'], 'text/plain;charset=UTF-8')
  t.equal(json.headers['content-length'], '3')
})

t.test('PUT', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'PUT',
    body: 'a=1',
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'PUT')
  t.equal(json.body, 'a=1')
})

t.test('DELETE', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'DELETE',
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'DELETE')
})

t.test('DELETE with string body', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'DELETE',
    body: 'a=1',
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'DELETE')
  t.equal(json.body, 'a=1')
  t.equal(json.headers['transfer-encoding'], undefined)
  t.equal(json.headers['content-length'], '3')
})

t.test('PATCH', async t => {
  const url = `${base}inspect`
  const opts = {
    method: 'PATCH',
    body: 'a=1',
  }
  const res = await fetch(url, opts)
  const json = await res.json()
  t.equal(json.method, 'PATCH')
  t.equal(json.body, 'a=1')
})

t.test('HEAD', async t => {
  const url = `${base}hello`
  const opts = {
    method: 'HEAD',
  }
  const res = await fetch(url, opts)
  t.equal(res.status, 200)
  t.equal(res.statusText, 'OK')
  t.equal(res.headers.get('content-type'), 'text/plain')
  t.match(res.body, Minipass)
  const text = await res.text()
  t.equal(text, '')
})

t.test('HEAD with content-encoding header', async t => {
  const url = `${base}error/404`
  const opts = {
    method: 'HEAD',
  }
  const res = await fetch(url, opts)
  t.equal(res.status, 404)
  t.equal(res.headers.get('content-encoding'), 'gzip')
  const text = await res.text()
  t.equal(text, '')
})

t.test('OPTIONS', async t => {
  const url = `${base}options`
  const opts = {
    method: 'OPTIONS',
  }
  const res = await fetch(url, opts)
  t.equal(res.status, 200)
  t.equal(res.statusText, 'OK')
  t.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS')
  t.match(res.body, Minipass)
})

t.test('reject decoding body twice', async t => {
  const url = `${base}plain`
  const res = await fetch(url)
  t.equal(res.headers.get('content-type'), 'text/plain')
  await res.text()
  t.equal(res.bodyUsed, true)
  t.rejects(res.text())
})

t.test('response trailers', async t => {
  const res = await fetch(`${base}trailers`)
  t.equal(res.status, 200)
  t.equal(res.statusText, 'OK')
  t.equal(res.headers.get('Trailer'), 'X-Node-Fetch')
  const trailers = await res.trailer
  t.same(Array.from(trailers.keys()), ['x-node-fetch'])
  t.equal(trailers.get('x-node-fetch'), 'hello world!')
})

t.test('maximum response size, multiple chunk', async t => {
  const url = `${base}size/chunk`
  const opts = {
    size: 5,
  }
  const res = await fetch(url, opts)
  t.equal(res.status, 200)
  t.equal(res.headers.get('content-type'), 'text/plain')
  await t.rejects(res.text(), {
    name: 'FetchError',
    type: 'max-size',
  })
})

t.test('maximum response size, single chunk', t => {
  const url = `${base}size/long`
  const opts = {
    size: 5,
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

t.test('pipe response body as stream', async t => {
  t.plan(2)
  const url = `${base}hello`
  const res = await fetch(url)
  t.match(res.body, Minipass)
  await streamToPromise(res.body, chunk => {
    if (chunk === null) {
      return
    }
    t.equal(chunk.toString(), 'world')
  })
})

t.test('clone a response, and use both as stream', async t => {
  t.plan(4)
  const url = `${base}hello`
  const res = await fetch(url)
  const cloned = res.clone()
  t.match(res.body, Minipass)
  t.match(cloned.body, Minipass)
  const dataHandler = chunk => {
    if (chunk === null) {
      return
    }
    t.equal(chunk.toString(), 'world')
  }

  await Promise.all([
    streamToPromise(res.body, dataHandler),
    streamToPromise(cloned.body, dataHandler),
  ])
})

t.test('clone a json response and log it as text response', async t => {
  const url = `${base}json`
  const res = await fetch(url)
  const cloned = res.clone()
  const results = await Promise.all([res.json(), cloned.text()])
  t.same(results[0], { name: 'value' })
  t.equal(results[1], '{"name":"value"}')
})

t.test('clone a json response, and then log it as text response', async t => {
  const url = `${base}json`
  const res = await fetch(url)
  const cloned = res.clone()
  const jsonResult = await res.json()
  t.same(jsonResult, { name: 'value' })
  const textResult = await cloned.text()
  t.equal(textResult, '{"name":"value"}')
})

t.test('clone a json response, first log as text response, then return json object', async t => {
  const url = `${base}json`
  const res = await fetch(url)
  const cloned = res.clone()
  const textResult = await cloned.text()
  t.equal(textResult, '{"name":"value"}')
  const jsonResult = await res.json()
  t.same(jsonResult, { name: 'value' })
})

t.test('do not allow cloning a response after its been used', async t => {
  const url = `${base}hello`
  const res = await fetch(url)
  await res.text()
  t.throws(() => res.clone())
})

t.test('get all responses of a header', async t => {
  const url = `${base}cookie`
  const res = await fetch(url)
  const expected = 'a=1, b=1'
  t.equal(res.headers.get('set-cookie'), expected)
  t.equal(res.headers.get('Set-Cookie'), expected)
})

t.test('return all headers using raw()', async t => {
  const url = `${base}cookie`
  const res = await fetch(url)
  t.same(res.headers.raw()['set-cookie'], ['a=1', 'b=1'])
})

t.test('delete header', async t => {
  const url = `${base}cookie`
  const res = await fetch(url)
  res.headers.delete('set-cookie')
  t.equal(res.headers.get('set-cookie'), null)
})

t.test('send request with connection keep-alive if agent is provided', async t => {
  const url = `${base}inspect`
  const opts = {
    agent: new http.Agent({
      keepAlive: true,
    }),
  }
  const res = await fetch(url, opts)
  const body = await res.json()
  t.equal(body.headers.connection, 'keep-alive')
})

t.test('fetch with Request instance', async t => {
  const url = `${base}hello`
  const req = new Request(url)
  const res = await fetch(req)
  t.equal(res.url, url)
  t.equal(res.ok, true)
  t.equal(res.status, 200)
})

t.test('fetch with Node.js legacy URL object', async t => {
  const url = `${base}hello`
  const urlObj = parseURL(url)
  const req = new Request(urlObj)
  const res = await fetch(req)
  t.equal(res.url, url)
  t.equal(res.ok, true)
  t.equal(res.status, 200)
})

t.test('fetch with Node.js URL object', async t => {
  const url = `${base}hello`
  const urlObj = new URL(url)
  const req = new Request(urlObj)
  const res = await fetch(req)
  t.equal(res.url, url)
  t.equal(res.ok, true)
  t.equal(res.status, 200)
})

t.test('reading blob as text', async t => {
  const blob = await new Response(`hello`).blob()
  const body = await blob.text()
  t.equal(body, 'hello')
})

t.test('reading blob as arrayBuffer', async t => {
  const blob = await new Response(`hello`).blob()
  const ab = await blob.arrayBuffer()
  const str = String.fromCharCode.apply(null, new Uint8Array(ab))
  t.equal(str, 'hello')
})

t.test('reading blob as stream', t => {
  return new Response(`hello`)
    .blob()
    .then(blob => streamToPromise(blob.stream(), data => {
      const str = data.toString()
      t.equal(str, 'hello')
    }))
})

t.test('blob round-trip', async t => {
  const url = `${base}hello`

  const res = await fetch(url)
  const blob = await res.blob()
  const inspectUrl = `${base}inspect`
  const length = blob.size
  const type = blob.type
  const res2 = await fetch(inspectUrl, {
    method: 'POST',
    body: blob,
  })
  const { body, headers } = await res2.json()
  t.equal(body, 'world')
  t.equal(headers['content-type'], type)
  t.equal(headers['content-length'], String(length))
})

t.test('overwrite Request instance', async t => {
  const url = `${base}inspect`
  const req = new Request(url, {
    method: 'POST',
    headers: {
      a: '1',
    },
  })
  const res = await fetch(req, {
    method: 'GET',
    headers: {
      a: '2',
    },
  })
  const body = await res.json()
  t.equal(body.method, 'GET')
  t.equal(body.headers.a, '2')
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

t.test('https request', { timeout: 5000 }, async t => {
  const url = 'https://github.com/'
  const opts = {
    method: 'HEAD',
  }
  const res = await fetch(url, opts)
  t.equal(res.status, 200)
  t.equal(res.ok, true)
})

// issue #414
t.test('reject if attempt to accumulate body stream throws', async t => {
  const body = new Minipass()
  body.pause()
  body.end('a=1')
  setTimeout(() => body.resume(), 100)
  const res = new Response(body.pipe(new Minipass()))
  const bufferConcat = Buffer.concat
  Buffer.concat = () => {
    throw new Error('embedded error')
  }

  t.teardown(() => {
    Buffer.concat = bufferConcat
  })

  return t.rejects(res.text(), {
    name: 'FetchError',
    type: 'system',
    message: /embedded error/,
  })
})

t.test('supports supplying a lookup function to the agent', async t => {
  const url = `${base}redirect/301`
  let called = 0
  function lookupSpy (hostname, options, callback) {
    called++
    return lookup(hostname, options, callback)
  }
  const agent = http.Agent({ lookup: lookupSpy })
  await fetch(url, { agent })
  t.equal(called, 2)
})

t.test('supports supplying a famliy option to the agent', async t => {
  const url = `${base}redirect/301`
  const families = []
  const family = Symbol('family')
  function lookupSpy (hostname, options, callback) {
    families.push(options.family)
    return lookup(hostname, {}, callback)
  }
  const agent = http.Agent({ lookup: lookupSpy, family })
  await fetch(url, { agent })
  t.same(families, [family, family])
})

t.test('function supplying the agent', async t => {
  const url = `${base}inspect`

  const agent = new http.Agent({
    keepAlive: true,
  })

  let parsedURL

  const res = await fetch(url, {
    agent: function (_parsedURL) {
      parsedURL = _parsedURL
      return agent
    },
  })
  const body = await res.json()
  // the agent provider should have been called
  t.equal(parsedURL.protocol, 'http:')
  // the agent we returned should have been used
  t.equal(body.headers.connection, 'keep-alive')
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
    size: 1024,
  })

  const blobBody = new Blob([bodyContent], { type: 'text/plain' })
  const blobRequest = new Request(url, {
    method: 'POST',
    body: blobBody,
    size: 1024,
  })

  const formBody = new FormData()
  formBody.append('a', '1')
  const formRequest = new Request(url, {
    method: 'POST',
    body: formBody,
    size: 1024,
  })

  const bufferBody = Buffer.from(bodyContent)
  const bufferRequest = new Request(url, {
    method: 'POST',
    body: bufferBody,
    size: 1024,
  })

  const stringRequest = new Request(url, {
    method: 'POST',
    body: bodyContent,
    size: 1024,
  })

  const nullRequest = new Request(url, {
    method: 'GET',
    body: null,
    size: 1024,
  })

  t.equal(getTotalBytes(streamRequest), null)
  t.equal(getTotalBytes(blobRequest), blobBody.size)
  t.not(getTotalBytes(formRequest), null)
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
  t.test('only use UTF-8 decoding with text()', async t => {
    const res = await fetch(`${base}encoding/euc-jp`)
    t.equal(res.status, 200)
    const result = await res.text()
    t.equal(result, '<?xml version="1.0" encoding="EUC-JP"?>' +
      '<title>\ufffd\ufffd\ufffd\u0738\ufffd</title>')
  })

  t.test('encoding decode, xml dtd detect', async t => {
    const res = await fetch(`${base}encoding/euc-jp`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '<?xml version="1.0" encoding="EUC-JP"?><title>日本語</title>')
  })

  t.test('encoding decode, content-type detect', async t => {
    const res = await fetch(`${base}encoding/shift-jis`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '<div>日本語</div>')
  })

  t.test('encoding decode, html5 detect', async t => {
    const res = await fetch(`${base}encoding/gbk`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '<meta charset="gbk"><div>中文</div>')
  })

  t.test('encoding decode, html4 detect', async t => {
    const res = await fetch(`${base}encoding/gb2312`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '<meta http-equiv="Content-Type" content="text/html; charset=gb2312">' +
      '<div>中文</div>')
  })

  t.test('encoding decode, html4 detect reverse http-equiv', async t => {
    const res = await fetch(`${base}encoding/gb2312-reverse`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '<meta content="text/html; charset=gb2312" http-equiv="Content-Type">' +
      '<div>中文</div>')
  })

  t.test('default to utf8 encoding', async t => {
    const res = await fetch(`${base}encoding/utf8`)
    t.equal(res.status, 200)
    t.equal(res.headers.get('content-type'), null)
    const result = await res.textConverted()
    t.equal(result, '中文')
  })

  t.test('uncommon content-type order, charset in front', async t => {
    const res = await fetch(`${base}encoding/order1`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '中文')
  })

  t.test('uncommon content-type order, end with qs', async t => {
    const res = await fetch(`${base}encoding/order2`)
    t.equal(res.status, 200)
    const result = await res.textConverted()
    t.equal(result, '中文')
  })

  t.test('chunked encoding, html4 detect', async t => {
    const url = `${base}encoding/chunked`
    const res = await fetch(url)
    t.equal(res.status, 200)
    const padding = 'a'.repeat(10)
    const result = await res.textConverted()
    t.equal(result, `${padding}<meta http-equiv="Content-Type" content="text/html;` +
      ' charset=Shift_JIS" /><div>日本語</div>')
  })

  t.test('only do encoding detection up to 1024 bytes', async t => {
    const url = `${base}encoding/invalid`
    const res = await fetch(url)
    t.equal(res.status, 200)
    const padding = 'a'.repeat(1200)
    const result = await res.textConverted()
    t.not(result, `${padding}中文`)
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
      return r.buffer().then(b => t.type(b, Buffer))
    }))

  t.test('reject invalid data uri', t =>
    t.rejects(fetch(invalidDataUrl), {
      message: 'invalid data: URI',
    }))

  t.test('data uri not base64 encoded', t =>
    fetch('data:text/plain,hello, world!').then(r => {
      t.equal(r.status, 200)
      t.equal(r.headers.get('Content-Type'), 'text/plain')
      return r.buffer().then(b => t.equal(b.toString(), 'hello, world!'))
    }))

  t.test('data uri with no type specified', t =>
    fetch('data:,hello,%20world!').then(r => {
      t.equal(r.status, 200)
      t.equal(r.headers.get('Content-Type'), null)
      return r.buffer().then(b => t.equal(b.toString(), 'hello, world!'))
    }))

  t.test('search included, hash not included', t =>
    fetch('data:,hello?with=search#no%20hash').then(r => {
      t.equal(r.status, 200)
      t.equal(r.headers.get('Content-Type'), null)
      return r.buffer().then(b => t.equal(b.toString(), 'hello?with=search'))
    }))

  t.end()
})

t.test('aborting data uris', t => {
  const controllers = [AbortController, AbortController2]
  t.plan(controllers.length)
  const url = 'data:text/plain;base64,SGVsbG8sIFdvcmxkIQ=='
  controllers.forEach((Controller, idx) => {
    t.test(`controller ${idx}`, async t => {
      t.test('pre-abort', async t => {
        const controller = new Controller()
        controller.abort()
        t.rejects(fetch(url, { signal: controller.signal }), {
          message: 'The user aborted a request.',
        })
      })

      t.test('post-abort', async t => {
        const controller = new Controller()
        t.rejects(fetch(url, { signal: controller.signal }), {
          message: 'The user aborted a request.',
        })
        controller.abort()
      })

      t.test('cannot abort after first tick', t => {
        const controller = new Controller()
        const testPromise = t.resolves(fetch(url, { signal: controller.signal }))
        process.nextTick(() => {
          controller.abort()
        })
        return testPromise
      })
    })
  })
})

t.test('redirect changes host header', t =>
  fetch(`http://${local.hostname}:${local.port}/host-redirect`, {
    redirect: 'follow',
    headers: { host: 'foo' },
  })
    .then(r => r.text())
    .then(text => t.equal(text, `${base}host-redirect`)))

t.test('never apply backpressure to the underlying response stream', t => {
  const { request } = http
  t.teardown(() => http.request = request)
  http.request = (...args) => {
    const req = request(...args)
    const { emit } = req
    req.emit = (ev, ...emitArgs) => {
      if (ev === 'response') {
        const res = emitArgs[0]
        res.pause = () => {
          throw new Error('should not pause the response')
        }
      }
      return emit.call(req, ev, ...emitArgs)
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
