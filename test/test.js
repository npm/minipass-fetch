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

t.test('minipass-fetch', t => {
  t.test('return a promise', t => {
    const url = `${base}hello`
    const p = fetch(url)
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

  t.test('send request with custom hedaers', t => {
    const url = `${base}inspect`
    const opts = {
      headers: { 'x-custom-header': 'abc' }
    }
    return fetch(url, opts).then(res => res.json()).then(res =>
      t.equal(res.headers['x-custom-header'], 'abc'))
  })

  t.test('accept headers instance', t => {
    const url = `${base}inspect`
    const opts = {
      headers: new Headers({ 'x-custom-header': 'abc' })
    }
    return fetch(url, opts).then(res => res.json()).then(res =>
      t.equal(res.headers['x-custom-header'], 'abc'))
  })

  t.test('accept custom host header', t => {
    const url = `${base}inspect`
    const opts = {
      headers: {
        host: 'example.com'
      }
    }
    return fetch(url, opts).then(res => res.json()).then(res =>
      t.equal(res.headers.host, 'example.com'))
  })

  t.test('accept custom HoSt header', t => {
    const url = `${base}inspect`
    const opts = {
      headers: {
        HoSt: 'example.com'
      }
    }
    return fetch(url, opts).then(res => res.json()).then(res =>
      t.equal(res.headers.host, 'example.com'))
  })

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

  t.test('decompress brotli response', {
    todo: typeof zlib.BrotliDecompress !== 'function'
      ? 'Add brotli support to minizlib' : false
  }, t => fetch(url).then(res => {
    t.equal(res.headers.get('content-type'), 'text/plain')
    return res.text().then(result => t.equal(result, 'hello world'))
  }))

  t.test('handle no content response with brotli encoding', {
    todo: typeof zlib.BrotliDecompress !== 'function'
    ? 'Add brotli support to minizlib' : false
  }, t => fetch(`${base}no-content/brotli`).then(res => {
    t.equal(res.status, 204)
    t.equal(res.statusText, 'No Content')
    t.equal(res.headers.get('content-encoding'), 'br')
    t.equal(res.ok, true)
    return res.text().then(result => t.equal(result, 'string'))
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

  t.test('should still recognize URLSearchParams when extended', uspOpt, t => {
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
  t.test('should still recognize URLSearchParams when extended from polyfill', t => {
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

  t.test('should overwrite Content-Length if possible', t => {
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

  t.test('should reject decoding body twice', t => {
    const url = `${base}plain`
    return fetch(url).then(res => {
      t.equal(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        t.equal(res.bodyUsed, true)
        return t.rejects(res.text())
      })
    })
  })

  t.test('should support maximum response size, multiple chunk', t => {
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

  t.test('should support maximum response size, single chunk', t => {
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

  t.test('should not allow cloning a response after its been used', t => {
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

  t.test('should return all headers using raw()', t => {
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

  t.test('should send request with connection keep-alive if agent is provided', t => {
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

  t.test('should support fetch with Request instance', t => {
    const url = `${base}hello`
    const req = new Request(url)
    return fetch(req).then(res => {
      t.equal(res.url, url)
      t.equal(res.ok, true)
      t.equal(res.status, 200)
    })
  })

  t.test('should support fetch with Node.js URL object', t => {
    const url = `${base}hello`
    const urlObj = parseURL(url)
    const req = new Request(urlObj)
    return fetch(req).then(res => {
      t.equal(res.url, url)
      t.equal(res.ok, true)
      t.equal(res.status, 200)
    })
  })

  t.test('should support fetch with WHATWG URL object', t => {
    const url = `${base}hello`
    const urlObj = new URL(url)
    const req = new Request(urlObj)
    return fetch(req).then(res => {
      t.equal(res.url, url)
      t.equal(res.ok, true)
      t.equal(res.status, 200)
    })
  })

  t.test('should support reading blob as text', t => {
    return new Response(`hello`)
      .blob()
      .then(blob => blob.text())
      .then(body => {
        t.equal(body, 'hello')
      })
  })

  t.test('should support reading blob as arrayBuffer', t => {
    return new Response(`hello`)
      .blob()
      .then(blob => blob.arrayBuffer())
      .then(ab => {
        const str = String.fromCharCode.apply(null, new Uint8Array(ab))
        t.equal(str, 'hello')
      })
  })

  t.test('should support reading blob as stream', t => {
    return new Response(`hello`)
      .blob()
      .then(blob => streamToPromise(blob.stream(), data => {
        const str = data.toString()
        t.equal(str, 'hello')
      }))
  })

  t.test('should support blob round-trip', t => {
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

  t.test('should support overwrite Request instance', t => {
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

  t.test('should support arrayBuffer(), blob(), text(), json() and buffer() method in Body constructor', t => {
    const body = new Body('a=1')
    t.match(body.arrayBuffer, Function)
    t.match(body.blob, Function)
    t.match(body.text, Function)
    t.match(body.json, Function)
    t.match(body.buffer, Function)
    t.end()
  })

  t.test('should create custom FetchError', function funcName (t) {
    const systemError = new Error('system')
    systemError.code = 'ESOMEERROR'

    const err = new FetchError('test message', 'test-error', systemError)
    t.match(err, Error)
    t.match(err, FetchError)
    t.equal(err.name, 'FetchError')
    t.equal(err.message, 'test message')
    t.equal(err.type, 'test-error')
    t.equal(err.code, 'ESOMEERROR')
    t.equal(err.errno, 'ESOMEERROR')
    // reading the stack is quite slow (~30-50ms)
    t.match(err.stack, `${err.name}: ${err.message}`)
    t.match(err.stack, 'funcName')
    t.end()
  })

  t.test('should support https request', { timeout: 5000 }, t => {
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
  t.test('should reject if attempt to accumulate body stream throws', t => {
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

  t.end()
})

t.test('Headers', t => {
  t.test('should have attributes conforming to Web IDL', t => {
    const headers = new Headers()
    t.same(Object.getOwnPropertyNames(headers), [])
    const enumerableProperties = []
    for (const property in headers) {
      enumerableProperties.push(property)
    }
    t.same(enumerableProperties.sort(), [
      'append',
      'delete',
      'entries',
      'forEach',
      'get',
      'has',
      'keys',
      'set',
      'values',
    ])

    t.end()
  })

  t.test('iterating through all headers with forEach', t => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['b', '3'],
      ['a', '1'],
    ])

    const result = []
    headers.forEach((val, key) => {
      result.push([key, val])
    })

    t.same(result, [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4']
    ])

    t.end()
  })

  t.test('iteration', t => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['a', '1'],
    ])
    headers.append('b', '3')


    const result = []
    for (let pair of headers) {
      result.push(pair)
    }
    t.same(result, [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4'],
    ], 'iterating with for loop')

    t.same(Array.from(headers.entries()), [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4'],
    ], 'entries')

    t.same(Array.from(headers.keys()), ['a', 'b', 'c'], 'keys')

    t.same(Array.from(headers.values()), ['1', '2, 3', '4'], 'values')

    t.end()
  })

  t.test('reject illegal header', t => {
    const headers = new Headers()
    t.throws(() => new Headers({ 'He y': 'ok' }), TypeError)
    t.throws(() => new Headers({ 'Hé-y': 'ok' }), TypeError)
    t.throws(() => new Headers({ 'He-y': 'ăk' }), TypeError)
    t.throws(() => headers.append('Hé-y', 'ok'), TypeError)
    t.throws(() => headers.delete('Hé-y'), TypeError)
    t.throws(() => headers.get('Hé-y'), TypeError)
    t.throws(() => headers.has('Hé-y'), TypeError)
    t.throws(() => headers.set('Hé-y', 'ok'), TypeError)
    // should reject empty header
    t.throws(() => headers.append('', 'ok'), TypeError)

    // 'o k' is valid value but invalid name
    new Headers({ 'He-y': 'o k' })

    t.end()
  })

  t.test('should ignore unsupported attributes while reading headers', t => {
    class FakeHeader {}
    // prototypes are currently ignored
    // This might change in the future: #181
    FakeHeader.prototype.z = 'fake'

    const res = new FakeHeader
    res.a = 'string'
    res.b = ['1','2']
    res.c = ''
    res.d = []
    res.e = 1
    res.f = [1, 2]
    res.g = { a:1 }
    res.h = undefined
    res.i = null
    res.j = NaN
    res.k = true
    res.l = false
    res.m = Buffer.from('test')

    const h1 = new Headers(res)
    h1.set('n', [1, 2])
    h1.append('n', ['3', 4])

    const h1Raw = h1.raw()

    t.contain(h1Raw.a, 'string')
    t.contain(h1Raw.b, '1,2')
    t.contain(h1Raw.c, '')
    t.contain(h1Raw.d, '')
    t.contain(h1Raw.e, '1')
    t.contain(h1Raw.f, '1,2')
    t.contain(h1Raw.g, '[object Object]')
    t.contain(h1Raw.h, 'undefined')
    t.contain(h1Raw.i, 'null')
    t.contain(h1Raw.j, 'NaN')
    t.contain(h1Raw.k, 'true')
    t.contain(h1Raw.l, 'false')
    t.contain(h1Raw.m, 'test')
    t.contain(h1Raw.n, '1,2')
    t.contain(h1Raw.n, '3,4')

    t.equal(h1Raw.z, undefined)

    t.end()
  })

  t.test('should wrap headers', t => {
    const h1 = new Headers({ a: '1' })
    const h1Raw = h1.raw()

    const h2 = new Headers(h1)
    h2.set('b', '1')
    const h2Raw = h2.raw()

    const h3 = new Headers(h2)
    h3.append('a', '2')
    const h3Raw = h3.raw()

    t.contain(h1Raw.a, '1')
		t.notContain(h1Raw.a, '2')

    t.contain(h2Raw.a, '1')
		t.notContain(h2Raw.a, '2')
    t.contain(h2Raw.b, '1')

    t.contain(h3Raw.a, '1')
    t.contain(h3Raw.a, '2')
    t.contain(h3Raw.b, '1')

    t.end()
  })

  t.test('should accept headers as an iterable of tuples', t => {
    let headers

    headers = new Headers([
      ['a', '1'],
      ['b', '2'],
      ['a', '3']
    ])
    t.equal(headers.get('a'), '1, 3')
    t.equal(headers.get('b'), '2')

    headers = new Headers([
      new Set(['a', '1']),
      ['b', '2'],
      new Map([['a', null], ['3', null]]).keys()
    ])
    t.equal(headers.get('a'), '1, 3')
    t.equal(headers.get('b'), '2')

    headers = new Headers(new Map([
      ['a', '1'],
      ['b', '2']
    ]))
    t.equal(headers.get('a'), '1')
    t.equal(headers.get('b'), '2')
    t.end()
  })

  t.test('should throw a TypeError if non-tuple exists in a headers initializer', t => {
    t.throws(() => new Headers([ ['b', '2', 'huh?'] ]), TypeError)
    t.throws(() => new Headers([ 'b2' ]), TypeError)
    t.throws(() => new Headers('b2'), TypeError)
    t.throws(() => new Headers({ [Symbol.iterator]: 42 }), TypeError)
    t.end()
  })

  t.end()
})

t.test('Response', t => {
  t.test('should have attributes conforming to Web IDL', t => {
    const res = new Response()
    const enumerableProperties = []
    for (const property in res) {
      enumerableProperties.push(property)
    }
    for (const toCheck of [
      'body', 'bodyUsed', 'arrayBuffer', 'blob', 'json', 'text',
      'url', 'status', 'ok', 'redirected', 'statusText', 'headers', 'clone'
    ]) {
      t.contain(enumerableProperties, toCheck)
    }
    for (const toCheck of [
      'body', 'bodyUsed', 'url', 'status', 'ok', 'redirected', 'statusText',
      'headers'
    ]) {
      t.throws(() => res[toCheck] = 'abc')
    }
    t.end()
  })

  t.test('should support empty options', t => {
    const r = new Minipass().end('a=1')
    r.pause()
    setTimeout(() => r.resume())
    const res = new Response(r.pipe(new Minipass))
    return res.text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support parsing headers', t => {
    const res = new Response(null, {
      headers: {
        a: '1'
      }
    })
    t.equal(res.headers.get('a'), '1')
    t.end()
  })

  t.test('should support text() method', t =>
    new Response('a=1').text().then(result => t.equal(result, 'a=1')))

  t.test('should support json() method', t =>
    new Response('{"a":1}').json().then(result => t.equal(result.a, 1)))

  t.test('should support buffer() method', t =>
    new Response('a=1').buffer().then(result =>
      t.equal(result.toString(), 'a=1')))

  t.test('should support blob() method', t =>
    new Response('a=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      }
    }).blob().then(result => {
      t.isa(result, Blob)
      t.equal(result.size, 3)
      t.equal(result.type, 'text/plain')
    }))

  t.test('should support clone() method', t => {
    const r = new Minipass().end('a=1')
    r.pause()
    setTimeout(() => r.resume())
    const body = r.pipe(new Minipass())
    const res = new Response(body, {
      headers: {
        a: '1'
      },
      url: base,
      status: 346,
      statusText: 'production'
    })
    const cl = res.clone()
    t.equal(cl.headers.get('a'), '1')
    t.equal(cl.url, base)
    t.equal(cl.status, 346)
    t.equal(cl.statusText, 'production')
    t.equal(cl.ok, false)
    // clone body shouldn't be the same body
    t.notEqual(cl.body, body)
    return cl.text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support stream as body', t => {
    const r = new Minipass().end('a=1')
    r.pause()
    setTimeout(() => r.resume())
    const body = r.pipe(new Minipass())
    return new Response(body).text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support string as body', t =>
    new Response('a=1').text().then(result => t.equal(result, 'a=1')))

  t.test('should support buffer as body', t =>
    new Response(Buffer.from('a=1')).text().then(result =>
      t.equal(result, 'a=1')))

  t.test('should support ArrayBuffer as body', t =>
    new Response(stringToArrayBuffer('a=1')).text().then(result =>
      t.equal(result, 'a=1')))

  t.test('should support blob as body', t =>
    new Response(new Blob(['a=1'])).text().then(result =>
      t.equal(result, 'a=1')))

  t.test('should support Uint8Array as body', t =>
    new Response(new Uint8Array(stringToArrayBuffer('a=1'))).text()
      .then(result => t.equal(result, 'a=1')))

  t.test('should support DataView as body', t =>
    new Response(new DataView(stringToArrayBuffer('a=1'))).text()
      .then(result => t.equal(result, 'a=1')))

  t.test('should default to null as body', t => {
    const res = new Response()
    t.equal(res.body, null)

    return res.text().then(result => t.equal(result, ''))
  })

  t.test('should default to 200 as status code', t => {
    const res = new Response(null)
    t.equal(res.status, 200)
    t.end()
  })

  t.test('should default to empty string as url', t => {
    const res = new Response()
    t.equal(res.url, '')
    t.end()
  })

  t.end()
})

t.test('Request', t => {
  t.test('should have attributes conforming to Web IDL', t => {
    const req = new Request('https://github.com/')
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
    })
    const r2 = new Request(r1, {
      follow: 2
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
    t.end()
  })

  t.test('should override signal on derived Request instances', t => {
    const parentAbortController = new AbortController()
    const derivedAbortController = new AbortController()
    const parentRequest = new Request('test', {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: derivedAbortController.signal
    })
    t.equal(parentRequest.signal, parentAbortController.signal)
    t.equal(derivedRequest.signal, derivedAbortController.signal)
    t.end()
  })

  t.test('should allow removing signal on derived Request instances', t => {
    const parentAbortController = new AbortController()
    const parentRequest = new Request(`test`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: null
    })
    t.equal(parentRequest.signal, parentAbortController.signal)
    t.equal(derivedRequest.signal, null)
    t.end()
  })

  t.test('should throw error with GET/HEAD requests with body', t => {
    t.throws(() => new Request('.', { body: '' }), TypeError)
    t.throws(() => new Request('.', { body: 'a' }), TypeError)
    t.throws(() => new Request('.', { body: '', method: 'HEAD' }), TypeError)
    t.throws(() => new Request('.', { body: 'a', method: 'HEAD' }), TypeError)
    t.throws(() => new Request('.', { body: 'a', method: 'get' }), TypeError)
    t.throws(() => new Request('.', { body: 'a', method: 'head' }), TypeError)
    t.end()
  })

  t.test('should default to null as body', t => {
    const req = new Request('.')
    t.equal(req.body, null)
    return req.text().then(result => t.equal(result, ''))
  })

  t.test('should support parsing headers', t => {
    const url = base
    const req = new Request(url, {
      headers: {
        a: '1'
      }
    })
    t.equal(req.url, url)
    t.equal(req.headers.get('a'), '1')
    t.end()
  })

  t.test('should support arrayBuffer() method', t => {
    const url = base
    var req = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    t.equal(req.url, url)
    return req.arrayBuffer().then(function(result) {
      t.isa(result, ArrayBuffer)
      const str = String.fromCharCode.apply(null, new Uint8Array(result))
      t.equal(str, 'a=1')
    })
  })

  t.test('should support text() method', t => {
    const url = base
    const req = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    t.equal(req.url, url)
    return req.text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support json() method', t => {
    const url = base
    const req = new Request(url, {
      method: 'POST',
      body: '{"a":1}'
    })
    t.equal(req.url, url)
    return req.json().then(result => t.equal(result.a, 1))
  })

  t.test('should support buffer() method', t => {
    const url = base
    const req = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    t.equal(req.url, url)
    return req.buffer().then(result => t.equal(result.toString(), 'a=1'))
  })

  t.test('should support blob() method', t => {
    const url = base
    var req = new Request(url, {
      method: 'POST',
      body: Buffer.from('a=1')
    })
    t.equal(req.url, url)
    return req.blob().then(function(result) {
      t.isa(result, Blob)
      t.equal(result.size, 3)
      t.equal(result.type, '')
    })
  })

  t.test('should support arbitrary url', t => {
    const url = 'anything'
    const req = new Request(url)
    t.equal(req.url, 'anything')
    t.end()
  })

  t.test('should support clone() method', t => {
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
        b: '2'
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
    t.notEqual(cl.body, body)
    return Promise.all([cl.text(), req.text()]).then(results => {
      t.equal(results[0], 'a=1')
      t.equal(results[1], 'a=1')
    })
  })

  t.test('should support ArrayBuffer as body', t => {
    const req = new Request('', {
      method: 'POST',
      body: stringToArrayBuffer('a=1')
    })
    return req.text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support Uint8Array as body', t => {
    const req = new Request('', {
      method: 'POST',
      body: new Uint8Array(stringToArrayBuffer('a=1'))
    })
    return req.text().then(result => t.equal(result, 'a=1'))
  })

  t.test('should support DataView as body', t => {
    const req = new Request('', {
      method: 'POST',
      body: new DataView(stringToArrayBuffer('a=1'))
    })
    return req.text().then(result => t.equal(result, 'a=1'))
  })

  t.end()
})
