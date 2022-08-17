'use strict'
const t = require('tap')
const Response = require('../lib/response.js')
const stringToArrayBuffer = require('string-to-arraybuffer')
const Blob = require('../lib/blob.js')
const Minipass = require('minipass')
const base = `http://localhost:123456/`

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
  const res = new Response()
  t.equal(String(res), '[object Response]')
  const enumerableProperties = []
  for (const property in res) {
    enumerableProperties.push(property)
  }
  for (const toCheck of [
    'body', 'bodyUsed', 'arrayBuffer', 'blob', 'json', 'text',
    'url', 'status', 'ok', 'redirected', 'statusText', 'headers', 'clone',
  ]) {
    t.contain(enumerableProperties, toCheck)
  }
  for (const toCheck of [
    'body', 'bodyUsed', 'url', 'status', 'ok', 'redirected', 'statusText',
    'headers',
  ]) {
    t.throws(() => res[toCheck] = 'abc')
  }
  t.end()
})

t.test('should support empty options', t => {
  const r = new Minipass().end('a=1')
  r.pause()
  setTimeout(() => r.resume())
  const res = new Response(r.pipe(new Minipass()))
  return res.text().then(result => t.equal(result, 'a=1'))
})

t.test('should support parsing headers', t => {
  const res = new Response(null, {
    headers: {
      a: '1',
    },
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

t.test('should support blob() method', async t => {
  const result = await new Response('a=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
  }).blob()
  t.type(result, Blob)
  t.equal(result.size, 3)
  t.equal(result.type, 'text/plain')
})

t.test('should support clone() method', t => {
  const r = new Minipass().end('a=1')
  r.pause()
  setTimeout(() => r.resume())
  const body = r.pipe(new Minipass())
  const res = new Response(body, {
    headers: {
      a: '1',
    },
    url: base,
    status: 346,
    statusText: 'production',
  })
  const cl = res.clone()
  t.equal(cl.headers.get('a'), '1')
  t.equal(cl.url, base)
  t.equal(cl.status, 346)
  t.equal(cl.statusText, 'production')
  t.equal(cl.ok, false)
  // clone body shouldn't be the same body
  t.not(cl.body, body)
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

t.test('trailers in response option', async t => {
  const Headers = require('../lib/headers.js')
  const res = new Response(null, {
    trailer: Headers.createHeadersLenient({
      'X-Node-Fetch': 'hello world!',
    }),
  })
  const trailers = await res.trailer
  t.same(Array.from(trailers.keys()), ['x-node-fetch'])
  t.equal(trailers.get('x-node-fetch'), 'hello world!')
})
